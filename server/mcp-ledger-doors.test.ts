import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";

const papers = vi.hoisted(() => [
  { id: "pub-1", title: "Published", abstract: "a", status: "published", contributors: [] as { userId: string }[] },
  { id: "draft-1", title: "Draft", abstract: "secret", status: "draft", contributors: [{ userId: "legacy-author" }] },
]);

vi.mock("./storage.js", () => ({
  storage: {
    getAllPapers: async () => papers,
    getPublishedPapers: async () => papers.filter((p) => p.status === "published"),
    getPaperWithContributors: async (id: string) => papers.find((p) => p.id === id),
    getPapersByUserId: async () => [],
  },
}));
vi.mock("./services/task-dispatcher.js", () => ({ taskDispatcher: {} }));
vi.mock("./mcp-loop-tools.js", () => ({ LOOP_TOOLS: [], handleLoopTool: async () => ({ content: [] }) }));
vi.mock("./services/agent-auth.js", () => ({
  validateMcpToken: (t: string) =>
    t === "legacy-ok" ? { agentId: "legacy-agent", paperId: "pub-1" }
      : t === "legacy-author" ? { agentId: "legacy-author", paperId: "draft-1" }
        : null,
  updateAgentStatus: async () => {},
}));
vi.mock("./services/ledger/index.js", async () => {
  const { MemoryAgentKeyStore, MemoryInviteStore, MemoryLedgerStore } = await import("./services/ledger/memory-store");
  const { AgentKeyService } = await import("./services/ledger/agent-keys");
  const { LedgerService } = await import("./services/ledger/service");
  const { InviteService } = await import("./services/ledger/invites");
  const users = new Map<string, any>();
  const ledgerStore = new MemoryLedgerStore();
  const keyService = new AgentKeyService(new MemoryAgentKeyStore(), { getUser: async (id: string) => users.get(id) });
  return {
    users,
    ledgerStore,
    agentKeys: keyService,
    invites: new InviteService(new MemoryInviteStore(), { getUser: async (id: string) => users.get(id) } as any, keyService),
    ledgerService: new LedgerService(ledgerStore),
  };
});

import { agentKeyAuth } from "./services/ledger/agent-keys";
import { KeyBudget } from "./services/ledger/rate-limits";
import { registerMcpHttpRoutes } from "./mcp-http";
import { redactUrl, setupMcpWebSocketServer } from "./websocket";

let fx: any;
let seq = 0;
async function newAgent(role = "user") {
  const id = `agent-${++seq}`;
  const user = { id, username: `agent${seq}`, userType: "agent", role, canRelease: false };
  fx.users.set(id, user);
  fx.ledgerStore.addUser(user);
  const issued = await fx.agentKeys.issue(id, "k");
  return { user, key: issued.key, secret: issued.secret as string };
}

const rpc = (method: string, params: any, id = 1) => ({ jsonrpc: "2.0", id, method, params });
const call = (name: string, args: any) => rpc("tools/call", { name, arguments: args });
const parse = (r: any) => JSON.parse(r.content[0].text);

beforeEach(async () => {
  fx = await import("./services/ledger/index.js");
});
afterEach(() => {
  delete process.env.LEDGER_FILE_LIMIT_PER_HOUR;
  delete process.env.LEDGER_READ_LIMIT_PER_MINUTE;
  vi.restoreAllMocks();
});

describe("MCP over HTTP: ledger tools", () => {
  let server: http.Server;
  let base: string;
  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // a signed-in human session, as passport would set it
      if (req.headers["x-test-session"]) (req as any).user = { id: "human-1", username: "nick", userType: "human", role: "user" };
      next();
    });
    app.use(agentKeyAuth(fx.agentKeys));
    registerMcpHttpRoutes(app);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise((r) => server.close(r));
  });

  const post = (body: any, headers: Record<string, string> = {}) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("refuses ledger_file with no credential, a legacy token or a human session", async () => {
    for (const headers of [{}, { authorization: "Bearer legacy-ok" }, { "x-test-session": "1" }]) {
      const res = await post(call("ledger_file", { kind: "note", title: "x" }), headers);
      expect(res.status).toBe(401);
    }
  });

  it("rejects unknown, revoked and admin-owned keys with their reason codes", async () => {
    const unknown = await post(call("ledger_file", { kind: "note", title: "x" }), { authorization: "Bearer scl_nope" });
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).error).toBe("unknown_key");

    const a = await newAgent();
    await fx.agentKeys.revoke(a.key.id);
    const revoked = await post(call("ledger_file", { kind: "note", title: "x" }), { authorization: `Bearer ${a.secret}` });
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).error).toBe("revoked_key");

    const b = await newAgent();
    fx.users.set(b.user.id, { ...b.user, role: "admin" });
    const admin = await post(call("ledger_file", { kind: "note", title: "x" }), { authorization: `Bearer ${b.secret}` });
    expect(admin.status).toBe(401);
    expect((await admin.json()).error).toBe("forbidden");
  });

  it("files, and the agent sees its own held record through ledger_list and ledger_get", async () => {
    const a = await newAgent();
    const h = { authorization: `Bearer ${a.secret}` };
    const filed = parse((await (await post(call("ledger_file", { kind: "note", title: "held one", held: true }), h)).json()).result);
    expect(filed.created).toBe(true);
    expect(filed.record.filedVia).toBe("mcp");
    const list = parse((await (await post(call("ledger_list", {}), h)).json()).result);
    expect(list.map((r: any) => r.id)).toContain(filed.record.id);
    const got = parse((await (await post(call("ledger_get", { id: filed.record.id }), h)).json()).result);
    expect(got.record.held).toBe(true);
  });

  it("ledger_invite reaches the service with the authenticated user over HTTP", async () => {
    const a = await newAgent();
    const h = { authorization: `Bearer ${a.secret}` };
    const spy = vi.spyOn(fx.invites, "mint");
    const denied = (await (await post(call("ledger_invite", {}), h)).json()).result;
    expect(denied.isError).toBe(true);
    expect(parse(denied).error).toBe("forbidden");
    fx.users.set(a.user.id, { ...a.user, canInvite: true });
    const minted = parse((await (await post(call("ledger_invite", { note: "http" }), h)).json()).result);
    expect(minted.code).toMatch(/^sci_/);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ id: a.user.id }), expect.objectContaining({ note: "http" }));
    const list = parse((await (await post(call("ledger_invites", {}), h)).json()).result);
    expect(list.map((i: any) => i.id)).toEqual([minted.invite.id]);
  });

  it("enforces the per-key filing budget with rate_limited", async () => {
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "2";
    const a = await newAgent();
    const h = { authorization: `Bearer ${a.secret}` };
    for (const n of [1, 2]) {
      const ok = (await (await post(call("ledger_file", { kind: "note", title: `n${n}` }), h)).json()).result;
      expect(ok.isError).toBeUndefined();
    }
    const over = (await (await post(call("ledger_file", { kind: "note", title: "n3" }), h)).json()).result;
    expect(over.isError).toBe(true);
    expect(parse(over).error).toBe("rate_limited");
    // reads have their own budget
    expect((await (await post(call("ledger_list", {}), h)).json()).result.isError).toBeUndefined();
  });

  it("returns a generic error for non-ledger failures, never database text", async () => {
    const a = await newAgent();
    vi.spyOn(fx.ledgerService, "file").mockRejectedValue(new Error("relation ledger_records SECRETDBTEXT"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(call("ledger_file", { kind: "note", title: "x" }), { authorization: `Bearer ${a.secret}` });
    const text = await res.text();
    expect(text).not.toContain("SECRETDBTEXT");
    expect(JSON.parse(text).error.code).toBe(-32603);
  });

  it("lists published papers only", async () => {
    const res = await (await post(rpc("resources/list", {}))).json();
    expect(res.result.resources.map((r: any) => r.uri)).toEqual(["paper://pub-1"]);
  });
});

describe("MCP over WebSocket", () => {
  let server: http.Server;
  let port: number;
  let budget: KeyBudget;
  const open: WebSocket[] = [];
  beforeEach(async () => {
    server = http.createServer();
    budget = new KeyBudget();
    setupMcpWebSocketServer(server, { budget });
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(async () => {
    for (const w of open.splice(0)) w.terminate();
    await new Promise((r) => server.close(r));
  });

  async function connect(token: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/mcp?token=${encodeURIComponent(token)}`);
    open.push(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    let n = 0;
    const send = (method: string, params: any) =>
      new Promise<any>((resolve) => {
        const id = ++n;
        const onMsg = (d: Buffer) => {
          const m = JSON.parse(d.toString());
          if (m.id === id) {
            ws.off("message", onMsg);
            resolve(m);
          }
        };
        ws.on("message", onMsg);
        ws.send(JSON.stringify(rpc(method, params, id)));
      });
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    ws.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    return { ws, send, tool: (name: string, args: any = {}) => send("tools/call", { name, arguments: args }) };
  }
  function rejected(token: string) {
    return new Promise<{ status: number; body: string }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/mcp?token=${encodeURIComponent(token)}`);
      ws.on("unexpected-response", (_req, res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      });
      ws.on("error", () => {});
    });
  }

  it("rejects missing, unknown, revoked and admin-owned scl_ keys with reason codes", async () => {
    expect((await rejected("")).status).toBe(401);
    expect(JSON.parse((await rejected("scl_nope")).body).error).toBe("unknown_key");
    const a = await newAgent();
    await fx.agentKeys.revoke(a.key.id);
    expect(JSON.parse((await rejected(a.secret)).body).error).toBe("revoked_key");
    const b = await newAgent();
    fx.users.set(b.user.id, { ...b.user, role: "admin" });
    const r = await rejected(b.secret);
    expect(r.status).toBe(401);
    expect(JSON.parse(r.body).error).toBe("forbidden");
    expect((await rejected("legacy-bad")).status).toBe(401);
  });

  it("files and reads (including its own held record) over an scl_ connection", async () => {
    const a = await newAgent();
    const c = await connect(a.secret);
    const filed = parse((await c.tool("ledger_file", { kind: "note", title: "ws", held: true })).result);
    expect(filed.record.filedVia).toBe("mcp");
    const list = parse((await c.tool("ledger_list", {})).result);
    expect(list.map((r: any) => r.id)).toContain(filed.record.id);
    const tools = (await c.send("tools/list", {})).result.tools.map((t: any) => t.name);
    expect(tools).toEqual(["ledger_file", "ledger_review", "ledger_list", "ledger_get", "ledger_campaigns", "ledger_invite", "ledger_invites"]);
  });

  it("ledger_invite uses the freshly re-authenticated user on every call, not the connect-time one", async () => {
    const a = await newAgent();
    fx.users.set(a.user.id, { ...a.user, canInvite: true });
    const c = await connect(a.secret);
    const spy = vi.spyOn(fx.invites, "mint");
    const minted = parse((await c.tool("ledger_invite", { note: "ws" })).result);
    expect(minted.code).toMatch(/^sci_/);
    const later = { ...fx.users.get(a.user.id), displayName: "changed-after-connect" };
    fx.users.set(a.user.id, later);
    await c.tool("ledger_invite", {});
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining({ id: a.user.id }));
    expect(spy.mock.calls[1][0]).toBe(later);
    // losing the right applies on the very next call of the same socket
    fx.users.set(a.user.id, { ...later, canInvite: false });
    const res = (await c.tool("ledger_invite", {})).result;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("forbidden");
    expect(parse((await c.tool("ledger_invites")).result)).toHaveLength(2);
  });

  it("applies revocation and owner changes on the next call of an open socket", async () => {
    const a = await newAgent();
    const c = await connect(a.secret);
    expect((await c.tool("ledger_list")).result.isError).toBeUndefined();
    await fx.agentKeys.revoke(a.key.id);
    const after = (await c.tool("ledger_file", { kind: "note", title: "late" })).result;
    expect(after.isError).toBe(true);
    expect(parse(after).error).toBe("revoked_key");

    const b = await newAgent();
    const c2 = await connect(b.secret);
    fx.users.set(b.user.id, { ...b.user, role: "admin" });
    expect(parse((await c2.tool("ledger_list")).result).error).toBe("forbidden");
  });

  it("rate limits ledger calls per key (rate_limited)", async () => {
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "1";
    const a = await newAgent();
    const c = await connect(a.secret);
    expect((await c.tool("ledger_file", { kind: "note", title: "1" })).result.isError).toBeUndefined();
    const over = (await c.tool("ledger_file", { kind: "note", title: "2" })).result;
    expect(parse(over).error).toBe("rate_limited");
  });

  it("an scl_ key reaches ledger tools only, and the legacy token never reaches them", async () => {
    const a = await newAgent();
    const c = await connect(a.secret);
    expect((await c.tool("search_papers", { query: "x" })).error?.message).toMatch(/ledger tools only/);
    expect((await c.send("resources/list", {})).error?.message).toMatch(/ledger tools only/);
    const legacy = await connect("legacy-ok");
    expect((await legacy.tool("ledger_list")).error?.message).toMatch(/scl_ agent key/);
  });

  it("does not list or read draft papers for a non-contributor", async () => {
    const legacy = await connect("legacy-ok");
    const list = await legacy.send("resources/list", {});
    expect(list.result.resources.map((r: any) => r.uri)).toEqual(["paper://pub-1"]);
    expect((await legacy.send("resources/read", { uri: "paper://draft-1" })).error?.message).toMatch(/not found/i);
    expect((await legacy.send("resources/read", { uri: "paper://pub-1" })).result.contents[0].text).toContain("Published");
    const author = await connect("legacy-author");
    expect((await author.send("resources/read", { uri: "paper://draft-1" })).result.contents[0].text).toContain("Draft");
  });
});

describe("upgrade hardening", () => {
  it("redacts tokens and scl_ values from logged URLs", () => {
    const secret = "scl_AbC-123_xyz";
    for (const u of [`/mcp?token=${secret}`, `/mcp?a=1&token=${secret}&b=2`, `/mcp?x=${secret}`]) {
      const out = redactUrl(u);
      expect(out).not.toContain(secret);
      expect(out).not.toContain("AbC-123");
    }
    expect(redactUrl("/mcp?a=1&token=legacy.hmac.value&b=2")).toBe("/mcp?a=1&token=[redacted]&b=2");
  });

  it("survives a socket error while the key lookup is still pending", async () => {
    const httpServer = new EventEmitter() as any;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const keys: any = {
      authenticate: async () => {
        await gate;
        return { ok: false, error: "unknown_key" };
      },
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
    setupMcpWebSocketServer(httpServer, { keys });
    const socket: any = new EventEmitter();
    socket.write = vi.fn();
    socket.destroy = vi.fn();
    httpServer.emit("upgrade", { url: "/mcp?token=scl_x", headers: { host: "h" } }, socket, Buffer.alloc(0));
    expect(() => socket.emit("error", new Error("ECONNRESET"))).not.toThrow();
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.destroy).toHaveBeenCalled();
  });
});

describe("KeyBudget", () => {
  it("resets after its window and keeps keys apart", () => {
    process.env.LEDGER_READ_LIMIT_PER_MINUTE = "1";
    let t = 0;
    const b = new KeyBudget(() => t);
    expect(b.take("read", "k1")).toBe(true);
    expect(b.take("read", "k1")).toBe(false);
    expect(b.take("read", "k2")).toBe(true);
    t = 61_000;
    expect(b.take("read", "k1")).toBe(true);
  });
});
