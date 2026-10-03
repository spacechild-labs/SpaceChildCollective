import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { AgentKeyService } from "../services/ledger/agent-keys";
import { MemoryAgentKeyStore, MemoryInviteStore } from "../services/ledger/memory-store";
import { InviteService } from "../services/ledger/invites";
import { createLedgerAdminRouter } from "./ledger-admin";
import { isValidEd25519PublicKey } from "../services/ledger/agent-keys";
import { serve } from "../test-utils/serve";

let users: Map<string, any>;
let failIssue = false;
let createFailsWith: Error | null = null;
let deleted: string[] = [];
let srv: { base: string; close(): Promise<void> };

beforeEach(async () => {
  users = new Map([
    ["u-q", { id: "u-q", username: "qe", userType: "human", role: "user", canRelease: true, zkpCommitment: "secret" }],
    ["u-h", { id: "u-h", username: "alice", userType: "human", role: "user", canRelease: false, zkpCommitment: "h" }],
    ["u-a2", { id: "u-a2", username: "root2", userType: "human", role: "admin", canRelease: false }],
    ["u-bad", { id: "u-bad", username: "badagent", userType: "agent", role: "admin", canRelease: false }],
    ["u-n", { id: "u-n", username: "nick", userType: "human", role: "admin", canRelease: true }],
  ]);
  const userStore = {
    getUser: async (id: string) => users.get(id),
    updateUser: async (id: string, u: any) => { const next = { ...users.get(id), ...u }; users.set(id, next); return next; },
    getUserByUsername: async (name: string) => [...users.values()].find((u) => u.username === name),
    createUser: async (u: any) => { if (createFailsWith) throw createFailsWith; const row = { id: `u-new-${users.size}`, bio: null, ...u }; users.set(row.id, row); return row; },
    deleteUser: async (id: string) => { deleted.push(id); users.delete(id); },
    getAllUsers: async () => [...users.values()],
  };
  failIssue = false;
  createFailsWith = null;
  deleted = [];
  const keys = new AgentKeyService(new MemoryAgentKeyStore(), userStore);
  const realIssue = keys.issue.bind(keys);
  keys.issue = (async (...a: Parameters<typeof realIssue>) => { if (failIssue) throw new Error("boom"); return realIssue(...a); }) as typeof keys.issue;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const who = req.header("x-test-user") ?? "u-n"; (req as any).user = who === "anon" ? undefined : users.get(who); next(); });
  const inviteStore = new MemoryInviteStore();
  app.use("/api/admin", createLedgerAdminRouter({ keys, users: userStore, invites: new InviteService(inviteStore, userStore as any, keys) }));
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

const PUB = Buffer.alloc(32, 7).toString("base64");
const byName = (name: string) => [...users.values()].find((u) => u.username === name);

describe("POST /agents (one-step add agent)", () => {
  it("creates an agent account with an unusable password and issues a key (201)", async () => {
    expect(isValidEd25519PublicKey(PUB)).toBe(true);
    const res = await call("POST", "/agents", { username: "  kannaka2 ", ed25519PublicKey: PUB });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(body.user).toMatchObject({ username: "kannaka2", displayName: "kannaka2" });
    expect(body.key).toMatchObject({ name: "default", hasEd25519: true });
    expect(body.secret).toMatch(/^scl_/);
    expect(body.setup).toMatchObject({ keyId: body.key.id, baseUrl: expect.stringMatching(/^https?:\/\//), quickstartUrl: `${body.setup.baseUrl}/ledger/agent-guide` });
    const row = users.get(body.user.id);
    expect(row).toMatchObject({ userType: "agent", role: "user", canRelease: false });
    expect(row.zkpCommitment).toMatch(/^\$2[aby]\$/);
    // The commitment is a hash of random bytes: it never appears in the response and matches no obvious guess.
    expect(JSON.stringify(body)).not.toContain(row.zkpCommitment);
    expect(await bcrypt.compare("", row.zkpCommitment)).toBe(false);
    expect(await bcrypt.compare("kannaka2", row.zkpCommitment)).toBe(false);
    const list = await (await call("GET", `/users/${body.user.id}/keys`)).json();
    expect(list).toHaveLength(1);
  });

  it("uses displayName and keyName when given", async () => {
    const body = await (await call("POST", "/agents", { username: "ag-1", displayName: "Agent One", keyName: "laptop" })).json();
    expect(body.user.displayName).toBe("Agent One");
    expect(body.key).toMatchObject({ name: "laptop", hasEd25519: false });
  });

  it("issues an additional key for an existing agent (200) without creating a user", async () => {
    const first = await (await call("POST", "/agents", { username: "ag-2" })).json();
    const size = users.size;
    const res = await call("POST", "/agents", { username: "ag-2", keyName: "second" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(false);
    expect(body.user.id).toBe(first.user.id);
    expect(body.secret).not.toBe(first.secret);
    expect(users.size).toBe(size);
    expect(await (await call("GET", `/users/${first.user.id}/keys`)).json()).toHaveLength(2);
  });

  it("names an additional key key-<n> when no name is given", async () => {
    await call("POST", "/agents", { username: "ag-3" });
    const second = await (await call("POST", "/agents", { username: "ag-3" })).json();
    expect(second.key.name).toBe("key-2");
    const third = await (await call("POST", "/agents", { username: "ag-3" })).json();
    expect(third.key.name).toBe("key-3");
    expect((await (await call("POST", "/agents", { username: "ag-3", keyName: "mine" })).json()).key.name).toBe("mine");
  });

  it("answers 409 when another request created the username first (unique violation)", async () => {
    createFailsWith = Object.assign(new Error("duplicate key"), { code: "23505" });
    const res = await call("POST", "/agents", { username: "racer" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "forbidden", message: "racer was just created by another request; try again" });
  });

  it("refuses a human or admin account with 409 and changes nothing", async () => {
    for (const name of ["alice", "root2", "badagent", "nick"]) {
      const before = JSON.stringify(byName(name));
      const res = await call("POST", "/agents", { username: name });
      expect(res.status, name).toBe(409);
      expect(await res.json()).toEqual({ error: "forbidden", message: `${name} is a human/admin account; agent keys can only belong to agent accounts` });
      expect(JSON.stringify(byName(name))).toBe(before);
    }
  });

  it("rejects bad input with invalid_input", async () => {
    const bad = [{}, { username: "ab" }, { username: "-bad" }, { username: "has space" }, { username: "x".repeat(65) },
      { username: "okname", displayName: "x" }, { username: "okname", keyName: "k".repeat(65) }, { username: "okname", ed25519PublicKey: "nope" }];
    for (const body of bad) {
      const res = await call("POST", "/agents", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      const j = await res.json();
      expect(j.error).toBe("invalid_input");
      expect(typeof j.message).toBe("string");
    }
    expect(byName("okname")).toBeUndefined();
  });

  it("deletes a newly created user when issuing the key fails", async () => {
    failIssue = true;
    const res = await call("POST", "/agents", { username: "doomed" });
    expect(res.status).toBe(500);
    expect(byName("doomed")).toBeUndefined();
    expect(deleted).toHaveLength(1);
  });

  it("does not delete an existing agent when issuing an extra key fails", async () => {
    await call("POST", "/agents", { username: "keeper" });
    failIssue = true;
    expect((await call("POST", "/agents", { username: "keeper" })).status).toBe(500);
    expect(byName("keeper")).toBeDefined();
    expect(deleted).toHaveLength(0);
  });

  it("is admin-only", async () => {
    expect((await call("POST", "/agents", { username: "sneaky" }, "anon")).status).toBe(401);
    expect((await call("POST", "/agents", { username: "sneaky" }, "u-q")).status).toBe(403);
    expect(byName("sneaky")).toBeUndefined();
  });
});

describe("GET /agents", () => {
  it("lists agent accounts by username with key counts and no secrets", async () => {
    await call("POST", "/agents", { username: "zed" });
    const a = await (await call("POST", "/agents", { username: "alpha" })).json();
    const second = await (await call("POST", "/agents", { username: "alpha", keyName: "two" })).json();
    await call("DELETE", `/keys/${second.key.id}`);
    const res = await call("GET", "/agents");
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((x: any) => x.username)).toEqual(["alpha", "zed"]);
    expect(list[0]).toEqual({ id: a.user.id, username: "alpha", displayName: "alpha", canRelease: false, canInvite: false, invitedBy: null, activeKeys: 1, lastUsedAt: null });
    expect(list[1].activeKeys).toBe(1);
    expect(JSON.stringify(list)).not.toMatch(/zkpCommitment|keyHash|scl_|\$2[aby]\$/);
  });

  it("is admin-only", async () => {
    expect((await call("GET", "/agents", undefined, "anon")).status).toBe(401);
    expect((await call("GET", "/agents", undefined, "u-q")).status).toBe(403);
  });
});

describe("invite administration", () => {
  const promote = (id: string) => call("POST", `/users/${id}/promote-agent`);

  it("can-invite sets the right on an agent and returns the sanitized user", async () => {
    await promote("u-q");
    const res = await call("POST", "/users/u-q/can-invite", { canInvite: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "u-q", canInvite: true });
    expect(body).not.toHaveProperty("zkpCommitment");
    expect(users.get("u-q").canInvite).toBe(true);
    // Anything other than a literal true clears it.
    expect((await (await call("POST", "/users/u-q/can-invite", { canInvite: "yes" })).json()).canInvite).toBe(false);
    expect(users.get("u-q").canInvite).toBe(false);
  });

  it("can-invite refuses a human with 409 forbidden and an unknown user with 404", async () => {
    const human = await call("POST", "/users/u-h/can-invite", { canInvite: true });
    expect(human.status).toBe(409);
    expect((await human.json()).error).toBe("forbidden");
    expect(users.get("u-h").canInvite).toBeFalsy();
    expect((await call("POST", "/users/nobody/can-invite", { canInvite: true })).status).toBe(404);
  });

  it("can-invite and revoke-chain are admin-only", async () => {
    await promote("u-q");
    for (const p of ["/users/u-q/can-invite", "/users/u-q/revoke-chain"]) {
      expect((await call("POST", p, { canInvite: true }, "anon")).status).toBe(401);
      const plain = await call("POST", p, { canInvite: true }, "u-h");
      expect(plain.status).toBe(403);
      expect((await plain.json()).error).toBe("forbidden");
    }
    expect(users.get("u-q").canInvite).toBeFalsy();
  });

  it("revoke-chain returns numeric {accounts, keys, invites} and cuts the whole descent", async () => {
    await promote("u-q");
    await call("POST", "/users/u-q/can-invite", { canInvite: true });
    await call("POST", "/users/u-q/keys", { name: "k1" });
    users.set("u-kid", { id: "u-kid", username: "kid", userType: "agent", role: "user", canRelease: false, canInvite: true, invitedBy: "u-q" });
    await call("POST", "/users/u-kid/keys", { name: "k2" });
    const res = await call("POST", "/users/u-q/revoke-chain");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accounts: 2, keys: 2, invites: 0 });
    expect(users.get("u-q").canInvite).toBe(false);
    expect(users.get("u-kid").canInvite).toBe(false);
    const keys = await (await call("GET", "/users/u-kid/keys")).json();
    expect(keys.every((k: any) => k.revokedAt)).toBe(true);
    // A human account has no chain to revoke.
    expect((await call("POST", "/users/u-h/revoke-chain")).status).toBe(409);
  });

  it("add agent with canInvite:true creates the agent with the right; without it the right is false", async () => {
    const res = await call("POST", "/agents", { username: "inviter", canInvite: true });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.canInvite).toBe(true);
    expect(users.get(body.user.id).canInvite).toBe(true);
    const plain = await (await call("POST", "/agents", { username: "plainagent" })).json();
    expect(plain.user.canInvite).toBe(false);
    // On an existing agent the flag grants the right too.
    const again = await (await call("POST", "/agents", { username: "plainagent", canInvite: true })).json();
    expect(again.created).toBe(false);
    expect(again.user.canInvite).toBe(true);
    expect(users.get(plain.user.id).canInvite).toBe(true);
    expect((await call("POST", "/agents", { username: "badflag", canInvite: "yes" })).status).toBe(400);
  });

  it("agent list shows canInvite and the inviter's username", async () => {
    await promote("u-q");
    users.set("u-kid", { id: "u-kid", username: "kid", userType: "agent", role: "user", canRelease: false, canInvite: true, invitedBy: "u-q" });
    const list = await (await call("GET", "/agents")).json();
    const kid = list.find((x: any) => x.username === "kid");
    expect(kid).toMatchObject({ canInvite: true, invitedBy: "qe" });
    expect(list.find((x: any) => x.username === "qe")).toMatchObject({ canInvite: false, invitedBy: null });
  });
});
