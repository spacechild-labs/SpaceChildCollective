import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { AgentKeyService } from "../services/ledger/agent-keys";
import { MemoryAgentKeyStore } from "../services/ledger/memory-store";
import { createLedgerAdminRouter } from "./ledger-admin";
import { serve } from "../test-utils/serve";

let users: Map<string, any>;
let srv: { base: string; close(): Promise<void> };

beforeEach(async () => {
  users = new Map([
    ["u-q", { id: "u-q", username: "qe", userType: "human", role: "user", canRelease: true, zkpCommitment: "secret" }],
    ["u-a2", { id: "u-a2", username: "root2", userType: "human", role: "admin", canRelease: false }],
    ["u-bad", { id: "u-bad", username: "badagent", userType: "agent", role: "admin", canRelease: false }],
    ["u-n", { id: "u-n", username: "nick", userType: "human", role: "admin", canRelease: true }],
  ]);
  const userStore = {
    getUser: async (id: string) => users.get(id),
    updateUser: async (id: string, u: any) => { const next = { ...users.get(id), ...u }; users.set(id, next); return next; },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const who = req.header("x-test-user") ?? "u-n"; (req as any).user = who === "anon" ? undefined : users.get(who); next(); });
  app.use("/api/admin", createLedgerAdminRouter({ keys: new AgentKeyService(new MemoryAgentKeyStore(), userStore), users: userStore }));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const call = (method: string, path: string, body?: unknown, who?: string) =>
  fetch(`${srv.base}/api/admin${path}`, { method, headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("ledger admin routes", () => {
  it("promoting to agent clears can_release and never leaks the commitment", async () => {
    const res = await call("POST", "/users/u-q/promote-agent");
    const body = await res.json();
    expect(body).toMatchObject({ userType: "agent", canRelease: false });
    expect(body).not.toHaveProperty("zkpCommitment");
    expect(users.get("u-q").canRelease).toBe(false);
  });

  it("refuses to make an agent a releaser", async () => {
    await call("POST", "/users/u-q/promote-agent");
    const res = await call("POST", "/users/u-q/releaser", { canRelease: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("agents_cannot_release");
  });

  it("refuses to promote yourself", async () => {
    expect((await call("POST", "/users/u-n/promote-agent")).status).toBe(400);
  });

  it("issues, lists and revokes keys; the secret is shown once", async () => {
    await call("POST", "/users/u-q/promote-agent");
    const issued = await call("POST", "/users/u-q/keys", { name: "qe-laptop" });
    expect(issued.status).toBe(201);
    const { key, secret } = await issued.json();
    expect(secret).toMatch(/^scl_/);
    const list = await (await call("GET", "/users/u-q/keys")).json();
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(list[0]).not.toHaveProperty("keyHash");
    const revoked = await (await call("DELETE", `/keys/${key.id}`)).json();
    expect(revoked.revokedAt).toBeTruthy();
  });

  it("never lets an admin-role account become or stay an agent key holder", async () => {
    const promote = await call("POST", "/users/u-a2/promote-agent");
    expect(promote.status).toBe(409);
    expect((await promote.json()).error).toBe("forbidden");
    expect(users.get("u-a2").userType).toBe("human");
    // Even a pre-existing admin-role agent cannot be issued a key.
    const issue = await call("POST", "/users/u-bad/keys", { name: "x" });
    expect(issue.status).toBe(409);
  });

  it("does not echo anything but the key and secret on issue", async () => {
    await call("POST", "/users/u-q/promote-agent");
    const body = await (await call("POST", "/users/u-q/keys", { name: "k" })).json();
    expect(Object.keys(body).sort()).toEqual(["key", "secret"]);
    expect(body.key).not.toHaveProperty("keyHash");
  });

  it("rejects anonymous and non-admin callers with the listed reason code", async () => {
    const anon = await call("GET", "/users/u-q/keys", undefined, "anon");
    expect(anon.status).toBe(401);
    expect((await anon.json()).error).toBe("forbidden");
    const member = await call("POST", "/users/u-q/promote-agent", undefined, "u-q");
    expect(member.status).toBe(403);
    expect((await member.json()).error).toBe("forbidden");
    expect(users.get("u-q").userType).toBe("human");
  });
});
