import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { User } from "@shared/schema";
import { serve } from "../test-utils/serve";
import { createLedgerInviteRouter } from "./ledger-invites";
import { InviteService } from "../services/ledger/invites";
import { MemoryInviteStore, MemoryAgentKeyStore } from "../services/ledger/memory-store";
import { AgentKeyService } from "../services/ledger/agent-keys";
import { guardMutations } from "../middleware/auth";
import { apiLogger } from "../middleware/api-logger";
import { onboardIpLimiter } from "../services/ledger/rate-limits";

function fakeUsers() {
  const m = new Map<string, User>();
  let n = 0;
  return {
    m,
    getUser: async (id: string) => m.get(id),
    getUserByUsername: async (u: string) => [...m.values()].find((x) => x.username === u),
    createUser: async (u: any) => { const user = { id: `u${++n}`, canRelease: false, canInvite: false, invitedBy: null, inviteId: null, createdAt: new Date(), ...u } as User; m.set(user.id, user); return user; },
    updateUser: async (id: string, p: Partial<User>) => { const u = { ...m.get(id)!, ...p }; m.set(id, u); return u; },
    deleteUser: async (id: string) => { m.delete(id); },
    getAllUsers: async () => [...m.values()],
  };
}
const put = (users: ReturnType<typeof fakeUsers>, u: Partial<User> & { id: string; username: string }) =>
  users.m.set(u.id, { userType: "agent", role: "user", canRelease: false, canInvite: false, invitedBy: null, inviteId: null, displayName: u.username, zkpCommitment: "x", createdAt: new Date(), ...u } as User);

let srv: { base: string; close(): Promise<void> };
let users: ReturnType<typeof fakeUsers>;
let svc: InviteService;
let lines: string[];

beforeEach(async () => {
  delete process.env.LEDGER_ONBOARD_LIMIT_PER_HOUR;
  lines = [];
  users = fakeUsers();
  svc = new InviteService(new MemoryInviteStore(), users as any, new AgentKeyService(new MemoryAgentKeyStore(), users as any));
  put(users, { id: "qe", username: "qe", canInvite: true });
  put(users, { id: "plain", username: "plain" });
  put(users, { id: "other", username: "other", canInvite: true });
  const app = express();
  app.use(express.json());
  app.use(apiLogger((l) => lines.push(l)));
  app.use((req, _res, next) => { const who = req.header("x-test-user"); if (who) (req as any).user = users.m.get(who); next(); });
  app.use(guardMutations);
  app.use("/api/ledger", createLedgerInviteRouter(svc, { onboard: onboardIpLimiter() }));
  // Stands in for the public ledger router, which is mounted after the invite router in routes.ts.
  app.get("/api/ledger/records", (_req, res) => { res.json([]); });
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const call = (method: string, path: string, body?: unknown, who?: string) =>
  fetch(srv.base + path, {
    method,
    headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const mintAs = async (who: string, body: unknown = {}) => (await (await call("POST", "/api/ledger/invites", body, who)).json()) as any;

describe("invite routes", () => {
  it("anonymous POST /api/ledger/onboard reaches the handler (guardMutations exemption)", async () => {
    const { code } = await mintAs("qe");
    const res = await call("POST", "/api/ledger/onboard", { invite: code, username: "kannaka" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.secret).toMatch(/^scl_/);
    expect(body.key.id).toBeTruthy();
    expect(body.setup.baseUrl).toBeTruthy();
    expect(body.invitedBy).toBe("qe");
    // The exemption is exactly one path: other anonymous mutations are still refused by the guard.
    expect((await call("POST", "/api/ledger/invites", {})).status).toBe(401);
    expect((await call("POST", "/api/ledger/onboard/extra", {})).status).toBe(401);
  });

  it("onboard with a bad invite is 403 {error:'invalid_invite'}", async () => {
    const res = await call("POST", "/api/ledger/onboard", { invite: "sci_nope", username: "kannaka" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("invalid_invite");
    expect(await users.getUserByUsername("kannaka")).toBeUndefined();
  });

  it("onboard counts failures toward the per-IP limit: the 11th attempt in an hour is 429 rate_limited", async () => {
    const { code } = await mintAs("qe");
    for (let i = 0; i < 10; i++) {
      expect((await call("POST", "/api/ledger/onboard", { invite: "sci_bad" + i, username: "probe" + i })).status).toBe(403);
    }
    const res = await call("POST", "/api/ledger/onboard", { invite: code, username: "late" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
    // The valid invite was not consumed by the throttled attempt.
    const list = await (await call("GET", "/api/ledger/invites", undefined, "qe")).json();
    expect(list[0].uses).toBe(0);
    expect(await users.getUserByUsername("late")).toBeUndefined();
  });

  it("never logs onboard or mint response bodies or request invite codes", async () => {
    const minted = await mintAs("qe", { note: "for kannaka" });
    const onboarded = await (await call("POST", "/api/ledger/onboard", { invite: minted.code, username: "kannaka" })).json();
    expect(onboarded.secret).toMatch(/^scl_/);
    // A second, failing onboard: its 403 line must be redacted too.
    await call("POST", "/api/ledger/onboard", { invite: minted.code, username: "second" });
    await new Promise((r) => setTimeout(r, 50));
    const mintLine = lines.find((l) => l.startsWith("POST /api/ledger/invites"));
    const onboardLines = lines.filter((l) => l.startsWith("POST /api/ledger/onboard"));
    expect(mintLine).toBeDefined();
    expect(onboardLines).toHaveLength(2);
    expect(mintLine).toContain("[redacted");
    for (const l of onboardLines) expect(l).toContain("[redacted");
    const all = lines.join("\n");
    expect(all).not.toContain(minted.code);
    expect(all).not.toContain(minted.code.slice(4, 24));
    expect(all).not.toContain(onboarded.secret);
    expect(all).not.toMatch(/sci_[A-Za-z0-9_-]{20,}/);
    expect(all).not.toMatch(/scl_[A-Za-z0-9_-]{20,}/);
  });

  it("POST /api/ledger/invites requires a signed-in caller; a non-inviter gets 403 forbidden; an inviter gets 201 {invite, code, redeemUrl}", async () => {
    expect((await call("POST", "/api/ledger/invites", {})).status).toBe(401);
    const denied = await call("POST", "/api/ledger/invites", {}, "plain");
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("forbidden");
    const ok = await call("POST", "/api/ledger/invites", { note: "hi", maxUses: 3, expiresInDays: 2 }, "qe");
    expect(ok.status).toBe(201);
    const body = await ok.json();
    expect(body.code).toMatch(/^sci_[A-Za-z0-9_-]{43}$/);
    expect(body.redeemUrl.endsWith("/ledger/agent-guide#invite")).toBe(true);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(body.invite).toMatchObject({ note: "hi", maxUses: 3, uses: 0, status: "active", createdBy: "qe" });
    const bad = await call("POST", "/api/ledger/invites", { maxUses: 99 }, "qe");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_input");
  });

  it("marks only the invite routes private, no-store; public ledger reads that pass through keep their caching", async () => {
    const { code, invite } = await mintAs("qe");
    const onboard = await call("POST", "/api/ledger/onboard", { invite: code, username: "cachecheck" });
    expect(onboard.headers.get("cache-control")).toBe("private, no-store");
    const failed = await call("POST", "/api/ledger/onboard", { invite: "sci_nope", username: "cachecheck2" });
    expect(failed.headers.get("cache-control")).toBe("private, no-store");
    expect((await call("GET", "/api/ledger/invites", undefined, "qe")).headers.get("cache-control")).toBe("private, no-store");
    expect((await call("DELETE", `/api/ledger/invites/${invite.id}`, undefined, "qe")).headers.get("cache-control")).toBe("private, no-store");
    const pub = await call("GET", "/api/ledger/records");
    expect(pub.status).toBe(200);
    expect(pub.headers.get("cache-control")).not.toBe("private, no-store");
  });

  it("an admin's GET /api/ledger/invites lists invites minted by others", async () => {
    put(users, { id: "root", username: "root", userType: "human", role: "admin" });
    const a = await mintAs("qe");
    const b = await mintAs("other");
    const list = await (await call("GET", "/api/ledger/invites", undefined, "root")).json();
    expect(list.map((i: any) => i.id).sort()).toEqual([a.invite.id, b.invite.id].sort());
    expect(Object.fromEntries(list.map((i: any) => [i.id, i.createdByUsername]))).toEqual({ [a.invite.id]: "qe", [b.invite.id]: "other" });
    expect(JSON.stringify(list)).not.toContain(a.code);
    expect(JSON.stringify(list)).not.toMatch(/codeHash|code_hash/);
  });

  it("GET /api/ledger/invites lists own invites without codes; DELETE revokes own, 403 for others", async () => {
    const mine = await mintAs("qe");
    const theirs = await mintAs("other");
    expect((await call("GET", "/api/ledger/invites")).status).toBe(401);
    const list = await (await call("GET", "/api/ledger/invites", undefined, "qe")).json();
    expect(list.map((i: any) => i.id)).toEqual([mine.invite.id]);
    expect(JSON.stringify(list)).not.toContain(mine.code);
    expect(list[0]).not.toHaveProperty("codeHash");
    const forbidden = await call("DELETE", `/api/ledger/invites/${theirs.invite.id}`, undefined, "qe");
    expect(forbidden.status).toBe(403);
    const revoked = await call("DELETE", `/api/ledger/invites/${mine.invite.id}`, undefined, "qe");
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).status).toBe("revoked");
    // The revoked code no longer redeems; the other invite stays active.
    expect((await call("POST", "/api/ledger/onboard", { invite: mine.code, username: "late" })).status).toBe(403);
    const still = await (await call("GET", "/api/ledger/invites", undefined, "other")).json();
    expect(still[0].status).toBe("active");
  });
});
