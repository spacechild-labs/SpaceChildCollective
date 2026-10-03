import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { MemoryLedgerStore } from "../services/ledger/memory-store";
import { LedgerService } from "../services/ledger/service";
import { createLedgerRouter } from "./ledger";
import { serve } from "../test-utils/serve";

const people: Record<string, any> = {
  kannaka: { id: "u-k", username: "kannaka", userType: "agent", role: "user", canRelease: false },
  nick: { id: "u-n", username: "nick", userType: "human", role: "admin", canRelease: true },
};

let srv: { base: string; close(): Promise<void> };
beforeEach(async () => {
  const store = new MemoryLedgerStore(Object.values(people));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.header("x-test-user");
    if (who) (req as any).user = people[who];
    if (req.header("x-test-key")) (req as any).agentKey = { id: "k-1", name: "desktop", prefix: "scl_AbCdEfGh", userId: "u-k", keyHash: "SECRET", ed25519PublicKey: "pub" };
    next();
  });
  app.use("/api/ledger", createLedgerRouter(new LedgerService(store)));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const call = (method: string, path: string, who?: string, body?: unknown) =>
  fetch(`${srv.base}/api/ledger${path}`, {
    method,
    headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("ledger HTTP API", () => {
  it("GET /me tells an agent key its own id, and nothing secret", async () => {
    const res = await fetch(`${srv.base}/api/ledger/me`, { headers: { "x-test-user": "kannaka", "x-test-key": "1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ keyId: "k-1", name: "desktop", prefix: "scl_AbCdEfGh", userId: "u-k", username: "kannaka", hasEd25519: true });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("GET /me refuses a session user without a key, and anonymous callers", async () => {
    const session = await call("GET", "/me", "kannaka");
    expect(session.status).toBe(403);
    expect((await session.json()).error).toBe("forbidden");
    const anon = await call("GET", "/me");
    expect(anon.status).toBe(401);
    expect((await anon.json()).error).toBe("forbidden");
  });

  it("files, retries idempotently, and reads back", async () => {
    const first = await call("POST", "/records", "kannaka", { kind: "result", title: "r", clientRef: "a1" });
    expect(first.status).toBe(201);
    const { record } = await first.json();
    const retry = await call("POST", "/records", "kannaka", { kind: "result", title: "r", clientRef: "a1" });
    expect(retry.status).toBe(200);
    expect((await retry.json()).record.id).toBe(record.id);
    const view = await (await call("GET", `/records/${record.id}`)).json();
    expect(view.record.contentHash).toBe(record.contentHash);
  });

  it("refuses anonymous filing", async () => {
    expect((await call("POST", "/records", undefined, { kind: "result", title: "r" })).status).toBe(401);
  });

  it("returns reason codes", async () => {
    const res = await call("POST", "/records", "kannaka", { kind: "result", title: "r", campaignId: "no-such" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_campaign");
    const bad = await call("GET", "/records?kind=bogus");
    expect((await bad.json()).error).toBe("invalid_input");
  });

  it("never shows a held record on any public route", async () => {
    await call("POST", "/campaigns", "kannaka", { id: "heesch-leader", title: "Heesch" });
    const { record } = await (await call("POST", "/records", "kannaka", {
      kind: "result", title: "HELD-SECRET", campaignId: "heesch-leader", held: true,
    })).json();
    const publicPaths = ["/records", `/records/${record.id}`, "/campaigns", "/campaigns/heesch-leader", "/agents/kannaka"];
    for (const p of publicPaths) {
      const res = await call("GET", p);
      expect(await res.text(), p).not.toContain("HELD-SECRET");
    }
    expect((await call("GET", `/records/${record.id}`)).status).toBe(404);
    expect(await (await call("GET", `/records/${record.id}`, "kannaka")).text()).toContain("HELD-SECRET");
  });

  it("agents cannot release; a human releaser can; the queue is releaser-only", async () => {
    const { record } = await (await call("POST", "/records", "kannaka", { kind: "result", title: "r", held: true })).json();
    const byAgent = await call("POST", `/records/${record.id}/release`, "kannaka", {});
    expect(byAgent.status).toBe(403);
    expect((await byAgent.json()).error).toBe("agents_cannot_release");
    expect((await call("GET", "/releases", "kannaka")).status).toBe(403);
    expect((await (await call("GET", "/releases", "nick")).json())).toHaveLength(1);
    const ok = await call("POST", `/records/${record.id}/release`, "nick", { note: "go" });
    expect(ok.status).toBe(200);
    expect((await call("GET", `/records/${record.id}`)).status).toBe(200);
  });

  it("serves campaigns and agent profiles with 404s for unknown ids", async () => {
    expect((await call("POST", "/campaigns", "kannaka", { id: "brain-e3", title: "E3" })).status).toBe(201);
    expect((await (await call("GET", "/campaigns")).json()).map((c: any) => c.id)).toEqual(["brain-e3"]);
    expect((await call("GET", "/campaigns/nope")).status).toBe(404);
    expect((await call("GET", "/agents/nobody")).status).toBe(404);
  });

  it("agent profiles carry invitedBy: null when nobody invited the agent", async () => {
    const body = await (await call("GET", "/agents/kannaka")).json();
    expect(body.username).toBe("kannaka");
    expect(body).toHaveProperty("invitedBy", null);
  });

  it("agent profiles carry the inviter's username when the router is given the lookup", async () => {
    const app = express();
    app.use("/api/ledger", createLedgerRouter(new LedgerService(new MemoryLedgerStore(Object.values(people))), {}, {
      inviterOf: async (name) => (name === "kannaka" ? "0xSCADA-QE" : null),
    }));
    const s = await serve(app);
    try {
      expect((await (await fetch(s.base + "/api/ledger/agents/kannaka")).json()).invitedBy).toBe("0xSCADA-QE");
      expect((await (await fetch(s.base + "/api/ledger/agents/nick")).json()).invitedBy).toBeNull();
    } finally { await s.close(); }
  });

  it("anonymous writes return the forbidden reason code", async () => {
    for (const [m, p] of [["POST", "/records"], ["POST", "/campaigns"], ["POST", "/records/x/release"], ["GET", "/releases"]] as const) {
      const res = await call(m, p, undefined, m === "POST" ? {} : undefined);
      expect(res.status, p).toBe(401);
      expect((await res.json()).error, p).toBe("forbidden");
    }
  });

  it("treats empty, negative, zero and huge ?limit= sanely", async () => {
    for (let i = 0; i < 3; i++) await call("POST", "/records", "kannaka", { kind: "note", title: "n" + i });
    const n = async (q: string) => (await (await call("GET", "/records" + q)).json()).length;
    expect(await n("?limit=")).toBe(3); // empty -> default, not 1
    expect(await n("?limit=abc")).toBe(3);
    expect(await n("?limit=-5")).toBe(1);
    expect(await n("?limit=0")).toBe(1);
    expect(await n("?limit=2")).toBe(2);
    expect(await n("?limit=99999")).toBe(3);
  });
  it("records backfill provenance only for agent keys that ask for it", async () => {
    const post = (headers: Record<string, string>, title: string) => fetch(`${srv.base}/api/ledger/records`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ kind: "result", title }),
    });
    const withKey = await post({ "x-test-user": "kannaka", "x-test-key": "1", "x-ledger-backfill": "1" }, "old");
    expect((await withKey.json()).record.filedVia).toBe("backfill");
    const keyNoHeader = await post({ "x-test-user": "kannaka", "x-test-key": "1" }, "plain");
    expect((await keyNoHeader.json()).record.filedVia).toBe("api");
    const session = await post({ "x-test-user": "nick", "x-ledger-backfill": "1" }, "web");
    expect((await session.json()).record.filedVia).toBe("web");
  });
});

describe("caching of signed-in ledger reads (M8)", () => {
  it("marks every response to a signed-in viewer private, no-store, and leaves anonymous ones alone", async () => {
    const held = await call("POST", "/records", "kannaka", { kind: "result", title: "HELD-CACHE", held: true });
    const { id } = await held.json();
    for (const path of ["/records", `/records/${id}`, "/campaigns", "/agents/kannaka"]) {
      const member = await call("GET", path, "nick");
      expect(member.headers.get("cache-control"), path).toBe("private, no-store");
      const anon = await call("GET", path);
      expect(anon.headers.get("cache-control") ?? "", path).not.toContain("private");
    }
    expect(held.headers.get("cache-control")).toBe("private, no-store");
  });
});
