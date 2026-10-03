import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { AgentKeyService, agentKeyAuth, hashSecret } from "./agent-keys";
import { MemoryAgentKeyStore } from "./memory-store";
import { ledgerFileLimiter, limitFromEnv } from "./rate-limits";

const users = new Map<string, any>([
  ["agent-1", { id: "agent-1", username: "kannaka", userType: "agent", role: "user" }],
  ["human-1", { id: "human-1", username: "nick", userType: "human", role: "admin" }],
]);
const lookup = { getUser: async (id: string) => users.get(id) };
const PUBKEY = Buffer.alloc(32, 7).toString("base64");

async function serve(app: express.Express) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

describe("agent keys", () => {
  afterEach(() => { delete process.env.LEDGER_FILE_LIMIT_PER_HOUR; });

  it("issues a secret once and stores only its hash", async () => {
    const store = new MemoryAgentKeyStore();
    const svc = new AgentKeyService(store, lookup);
    const { key, secret } = await svc.issue("agent-1", "kannaka-debain2", PUBKEY);
    expect(secret).toMatch(/^scl_[A-Za-z0-9_-]{43}$/);
    expect(key).not.toHaveProperty("keyHash");
    expect(key.prefix).toBe(secret.slice(0, 12));
    const stored = await store.findById(key.id);
    expect(stored!.keyHash).toBe(hashSecret(secret));
    expect(stored!.keyHash).not.toContain(secret);
  });

  it("refuses keys for non-agents and bad public keys", async () => {
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    await expect(svc.issue("human-1", "x")).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.issue("agent-1", "x", "not-base64-32-bytes")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.issue("nobody", "x")).rejects.toMatchObject({ code: "not_found" });
  });

  it("authenticates, and a revoked key fails on its very next use", async () => {
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    const { key, secret } = await svc.issue("agent-1", "k");
    expect(await svc.authenticate(secret)).toMatchObject({ ok: true, user: { id: "agent-1" } });
    await svc.revoke(key.id);
    expect(await svc.authenticate(secret)).toEqual({ ok: false, error: "revoked_key" });
    expect(await svc.authenticate("scl_nope")).toEqual({ ok: false, error: "unknown_key" });
  });

  it("a key stops working when its account is no longer an agent", async () => {
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    const { secret } = await svc.issue("agent-1", "k");
    users.set("agent-1", { ...users.get("agent-1"), userType: "human" });
    try {
      expect(await svc.authenticate(secret)).toEqual({ ok: false, error: "revoked_key" });
    } finally {
      users.set("agent-1", { ...users.get("agent-1"), userType: "agent" });
    }
  });

  it("the middleware sets req.user for a valid key, 401s a bad scl_ key, and ignores other bearers", async () => {
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    const { secret } = await svc.issue("agent-1", "k");
    const app = express();
    app.use(agentKeyAuth(svc));
    app.get("/api/ledger/who", (req, res) => res.json({ user: req.user?.username ?? null, key: Boolean(req.agentKey) }));
    const { base, close } = await serve(app);
    try {
      expect(await (await fetch(`${base}/api/ledger/who`, { headers: { authorization: `Bearer ${secret}` } })).json()).toEqual({ user: "kannaka", key: true });
      const bad = await fetch(`${base}/api/ledger/who`, { headers: { authorization: "Bearer scl_wrong" } });
      expect(bad.status).toBe(401);
      expect(await bad.json()).toEqual({ error: "unknown_key" });
      expect(await (await fetch(`${base}/api/ledger/who`, { headers: { authorization: "Bearer legacy.hmac-token" } })).json()).toEqual({ user: null, key: false });
      expect(await (await fetch(`${base}/api/ledger/who`)).json()).toEqual({ user: null, key: false });
    } finally {
      await close();
    }
  });

  it("rate-limits filings per key with reason rate_limited", async () => {
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "2";
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    const { secret } = await svc.issue("agent-1", "k");
    const app = express();
    app.use(agentKeyAuth(svc));
    app.post("/api/ledger/file", ledgerFileLimiter(), (_req, res) => res.json({ ok: true }));
    const { base, close } = await serve(app);
    try {
      const post = () => fetch(`${base}/api/ledger/file`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
      expect((await post()).status).toBe(200);
      expect((await post()).status).toBe(200);
      const third = await post();
      expect(third.status).toBe(429);
      expect(await third.json()).toEqual({ error: "rate_limited" });
    } finally {
      await close();
    }
  });
});

describe("agent key hardening", () => {
  afterEach(() => { delete process.env.LEDGER_FILE_LIMIT_PER_HOUR; users.set("agent-1", { id: "agent-1", username: "kannaka", userType: "agent", role: "user" }); });

  it("any scl_-shaped credential authenticates or gets 401, never anonymous", async () => {
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    const { secret } = await svc.issue("agent-1", "k");
    const app = express();
    app.use(agentKeyAuth(svc));
    app.get("/api/ledger/who", (req, res) => res.json({ user: req.user?.username ?? null }));
    const srv = await serve(app);
    try {
      const get = (auth: string) => fetch(`${srv.base}/api/ledger/who`, { headers: { authorization: auth } });
      expect((await get("bearer scl_bad")).status).toBe(401);
      expect((await get("BEARER   SCL_bad")).status).toBe(401);
      expect((await get("Bearer  scl_bad extra")).status).toBe(401);
      const ok = await get(`bearer   ${secret}`);
      expect(ok.status).toBe(200);
      expect((await ok.json()).user).toBe("kannaka");
      expect((await get("Bearer legacy-token")).status).toBe(200); // non-scl tokens still pass through
    } finally { await srv.close(); }
  });

  it("an admin-role account cannot authenticate or be issued a key", async () => {
    const svc = new AgentKeyService(new MemoryAgentKeyStore(), lookup);
    const { secret } = await svc.issue("agent-1", "k");
    users.set("agent-1", { ...users.get("agent-1"), role: "admin" });
    expect(await svc.authenticate(secret)).toEqual({ ok: false, error: "forbidden" });
    const app = express();
    app.use(agentKeyAuth(svc));
    app.get("/api/ledger/who", (_req, res) => res.json({ anonymous: true }));
    const srv = await serve(app);
    try {
      const res = await fetch(`${srv.base}/api/ledger/who`, { headers: { authorization: `Bearer ${secret}` } });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "forbidden" });
    } finally { await srv.close(); }
    await expect(svc.issue("agent-1", "k2")).rejects.toMatchObject({ code: "forbidden", status: 409 });
  });

  it("a non-numeric, zero or negative env limit falls back to the default", () => {
    for (const bad of ["abc", "0", "-5", "", "Infinity", "NaN"]) {
      process.env.LEDGER_FILE_LIMIT_PER_HOUR = bad;
      expect(limitFromEnv("LEDGER_FILE_LIMIT_PER_HOUR", 60), bad).toBe(60);
    }
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "7";
    expect(limitFromEnv("LEDGER_FILE_LIMIT_PER_HOUR", 60)).toBe(7);
  });
});
