import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { InviteService, generateInviteCode } from "./invites";
import { MemoryInviteStore, MemoryAgentKeyStore } from "./memory-store";
import { AgentKeyService, hashSecret } from "./agent-keys";
import type { User } from "@shared/schema";

function fakeUsers() {
  const m = new Map<string, User>();
  let n = 0;
  const api = {
    m,
    failCreate: null as null | (() => Error),
    createHook: null as null | (() => Promise<void>),
    updateHook: null as null | ((id: string, p: Partial<User>) => Promise<void>),
    failDelete: false,
    // Mirrors DatabaseStorage: agent_keys.user_id has no cascade, so any key row (revoked or not) blocks the delete.
    keyRowsFor: async (_id: string) => 0,
    getUser: async (id: string) => m.get(id),
    getUserByUsername: async (u: string) => [...m.values()].find((x) => x.username === u),
    createUser: async (u: any) => {
      if (api.createHook) await api.createHook();
      if (api.failCreate) throw api.failCreate();
      if ([...m.values()].some((x) => x.username === u.username)) throw Object.assign(new Error("dup"), { code: "23505" });
      const user = { id: `u${++n}`, canRelease: false, canInvite: false, invitedBy: null, inviteId: null, createdAt: new Date(), ...u } as User;
      m.set(user.id, user); return user;
    },
    updateUser: async (id: string, p: Partial<User>) => {
      if (api.updateHook) await api.updateHook(id, p);
      const u = { ...m.get(id)!, ...p }; m.set(id, u); return u;
    },
    deleteUser: async (id: string) => {
      if (api.failDelete || (await api.keyRowsFor(id)) > 0) throw Object.assign(new Error("User is referenced by other records"), { code: "user_referenced" });
      m.delete(id);
    },
    getAllUsers: async () => [...m.values()],
  };
  return api;
}

const put = (users: ReturnType<typeof fakeUsers>, u: Partial<User> & { id: string; username: string }) =>
  users.m.set(u.id, { userType: "agent", role: "user", canRelease: false, canInvite: false, invitedBy: null, inviteId: null, displayName: u.username, zkpCommitment: "x", createdAt: new Date(), ...u } as User);

describe("InviteService", () => {
  let users: ReturnType<typeof fakeUsers>; let store: MemoryInviteStore; let keyStore: MemoryAgentKeyStore; let svc: InviteService;
  let admin: User; let qe: User; let plain: User;
  beforeEach(() => {
    users = fakeUsers(); store = new MemoryInviteStore(); keyStore = new MemoryAgentKeyStore();
    users.keyRowsFor = async (id) => (await keyStore.listForUser(id)).length;
    const keys = new AgentKeyService(keyStore, users as any);
    svc = new InviteService(store, users as any, keys);
    put(users, { id: "admin", username: "nick", userType: "human", role: "admin" });
    put(users, { id: "qe", username: "0xSCADA-QE", canInvite: true });
    put(users, { id: "plain", username: "plainagent" });
    admin = users.m.get("admin")!; qe = users.m.get("qe")!; plain = users.m.get("plain")!;
  });

  it("generates sci_ codes of the right length", () => {
    const c = generateInviteCode();
    expect(c).toMatch(/^sci_[A-Za-z0-9_-]{43}$/);
  });

  it("mints an invite, stores only its hash, and redeems it into an agent with a key", async () => {
    const { code, invite } = await svc.mint(qe, { note: "for kannaka" });
    expect(invite.status).toBe("active");
    expect((await store.listAll())[0].codeHash).toBe(hashSecret(code));
    expect(JSON.stringify(await store.listAll())).not.toContain(code);
    const out = await svc.redeem({ invite: code, username: "kannaka" });
    expect(out.secret).toMatch(/^scl_/);
    expect(out.invitedBy).toBe("0xSCADA-QE");
    const u = await users.getUserByUsername("kannaka");
    expect(u).toMatchObject({ userType: "agent", role: "user", canRelease: false, canInvite: false, invitedBy: "qe", inviteId: invite.id });
    for (const guess of ["", "kannaka", "password"]) expect(await bcrypt.compare(guess, u!.zkpCommitment)).toBe(false);
    const { code: code2 } = await svc.mint(qe, {});
    await svc.redeem({ invite: code2, username: "kannaka2" });
    expect((await users.getUserByUsername("kannaka2"))!.zkpCommitment).not.toBe(u!.zkpCommitment);
  });

  it("refuses a second redeem of a single-use invite with invalid_invite", async () => {
    const { code } = await svc.mint(qe, {});
    await svc.redeem({ invite: code, username: "aa1" });
    await expect(svc.redeem({ invite: code, username: "aa2" })).rejects.toMatchObject({ code: "invalid_invite", status: 403 });
  });

  it("returns invalid_invite for unknown, expired, revoked, and creator-lost-right invites alike", async () => {
    await expect(svc.redeem({ invite: generateInviteCode(), username: "xx1" })).rejects.toMatchObject({ code: "invalid_invite" });
    const t0 = Date.now();
    const timed = new InviteService(store, users as any, new AgentKeyService(keyStore, users as any), { now: () => new Date(t0 + 8 * 86_400_000) });
    const { code: old } = await svc.mint(qe, {});            // expires in 7 days
    await expect(timed.redeem({ invite: old, username: "xx2" })).rejects.toMatchObject({ code: "invalid_invite" });
    const { code: rv, invite } = await svc.mint(qe, {});
    await svc.revoke(qe, invite.id);
    await expect(svc.redeem({ invite: rv, username: "xx3" })).rejects.toMatchObject({ code: "invalid_invite" });
    const { code: lost } = await svc.mint(qe, {});
    await svc.setCanInvite("qe", false);
    await expect(svc.redeem({ invite: lost, username: "xx4" })).rejects.toMatchObject({ code: "invalid_invite" });
  });

  it("a taken username is 409 and consumes no use", async () => {
    const { code, invite } = await svc.mint(qe, {});
    await expect(svc.redeem({ invite: code, username: "plainagent" })).rejects.toMatchObject({ code: "forbidden", status: 409 });
    expect((await store.findById(invite.id))?.uses).toBe(0);
    await expect(svc.redeem({ invite: code, username: "fresh" })).resolves.toBeTruthy();
  });

  it("a username taken between check and create (23505) releases the use", async () => {
    const { code, invite } = await svc.mint(qe, {});
    users.failCreate = () => Object.assign(new Error("dup"), { code: "23505" });
    await expect(svc.redeem({ invite: code, username: "racer" })).rejects.toMatchObject({ code: "forbidden", status: 409 });
    expect((await store.findById(invite.id))?.uses).toBe(0);
  });

  it("a key-issue failure deletes the new account and releases the use", async () => {
    const { code, invite } = await svc.mint(qe, {});
    const bad = new InviteService(store, users as any, { issue: async () => { throw new Error("boom"); } } as any);
    await expect(bad.redeem({ invite: code, username: "halfmade" })).rejects.toThrow();
    expect(await users.getUserByUsername("halfmade")).toBeUndefined();
    expect((await store.findById(invite.id))?.uses).toBe(0);
  });

  it("concurrent redeems of a single-use invite create exactly one account", async () => {
    const { code } = await svc.mint(qe, {});
    const r = await Promise.allSettled(["cc1", "cc2", "cc3", "cc4"].map((u) => svc.redeem({ invite: code, username: u })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await users.getAllUsers()).filter((u) => ["cc1", "cc2", "cc3", "cc4"].includes(u.username))).toHaveLength(1);
  });

  it("only inviters mint; only inviters may grant the invite right", async () => {
    await expect(svc.mint(plain, {})).rejects.toMatchObject({ code: "forbidden" });
    const { code } = await svc.mint(qe, { grantsInvite: true });
    await svc.redeem({ invite: code, username: "child" });
    expect((await users.getUserByUsername("child"))?.canInvite).toBe(true);
    await expect(svc.mint(admin, { grantsInvite: true })).resolves.toBeTruthy();
  });

  it("validates mint bounds", async () => {
    await expect(svc.mint(qe, { maxUses: 0 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.mint(qe, { maxUses: 51 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.mint(qe, { expiresInDays: 31 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.mint(qe, { note: "n".repeat(201) })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("caps agents at 20 mints per day and 50 open invites; admins are not capped", async () => {
    const capped = new InviteService(store, users as any, new AgentKeyService(keyStore, users as any), { agentDailyMintCap: 2, agentOpenCap: 50 });
    await capped.mint(qe, {}); await capped.mint(qe, {});
    await expect(capped.mint(qe, {})).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    const open = new InviteService(store, users as any, new AgentKeyService(keyStore, users as any), { agentDailyMintCap: 100, agentOpenCap: 3 });
    await open.mint(qe, {});
    await expect(open.mint(qe, {})).rejects.toMatchObject({ code: "rate_limited" });
    for (let i = 0; i < 5; i++) await capped.mint(admin, {});
  });

  it("caps successful onboardings site-wide per day", async () => {
    const small = new InviteService(store, users as any, new AgentKeyService(keyStore, users as any), { dailyOnboardCap: 1 });
    const a = await small.mint(qe, {}); const b = await small.mint(qe, {});
    await small.redeem({ invite: a.code, username: "first" });
    await expect(small.redeem({ invite: b.code, username: "second" })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("revokeChain revokes keys, invite rights and open invites across three generations", async () => {
    const g1 = await svc.mint(qe, { grantsInvite: true });
    await svc.redeem({ invite: g1.code, username: "gen1" });
    const gen1 = (await users.getUserByUsername("gen1"))!;
    const g2 = await svc.mint(gen1, { grantsInvite: true });
    await svc.redeem({ invite: g2.code, username: "gen2" });
    const gen2 = (await users.getUserByUsername("gen2"))!;
    const g3 = await svc.mint(gen2, {});
    await svc.redeem({ invite: g3.code, username: "gen3" });
    await svc.mint(gen2, {});                                  // one open invite left in the tree
    const out = await svc.revokeChain(gen1.id);
    expect(out).toEqual({ accounts: 3, keys: 3, invites: 1 });
    for (const name of ["gen1", "gen2", "gen3"]) {
      const u = (await users.getUserByUsername(name))!;
      expect(u.canInvite).toBe(false);
      expect((await keyStore.listForUser(u.id)).every((k) => k.revokedAt)).toBe(true);
    }
    expect((await users.getUserByUsername("0xSCADA-QE"))!.canInvite).toBe(true);
  });

  it("lists own invites for agents and all for admins, without codes or hashes", async () => {
    await svc.mint(qe, {}); await svc.mint(admin, {});
    const mine = await svc.list(qe);
    expect(mine).toHaveLength(1);
    expect(await svc.list(admin)).toHaveLength(2);
    expect(mine[0].createdByUsername).toBe("0xSCADA-QE");
    expect((await svc.list(admin)).map((i) => i.createdByUsername).sort()).toEqual(["0xSCADA-QE", "nick"]);
    expect(JSON.stringify(mine)).not.toMatch(/codeHash|code_hash|sci_[A-Za-z0-9_-]{20}/);
  });

  it("only the minter or an admin may revoke", async () => {
    const { invite } = await svc.mint(qe, {});
    await expect(svc.revoke(plain, invite.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.revoke(admin, invite.id)).resolves.toMatchObject({ status: "revoked" });
    await expect(svc.revoke(admin, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("setCanInvite refuses human accounts; inviterOf names the inviter", async () => {
    await expect(svc.setCanInvite("admin", true)).rejects.toMatchObject({ code: "forbidden" });
    const { code } = await svc.mint(qe, {});
    const out = await svc.redeem({ invite: code, username: "kid" });
    expect(await svc.inviterOf(out.user.id)).toBe("0xSCADA-QE");
    expect(await svc.inviterOf("plain")).toBeNull();
  });

  it("rejects bad usernames and bad public keys as invalid_input before touching the invite", async () => {
    const { code, invite } = await svc.mint(qe, {});
    await expect(svc.redeem({ invite: code, username: "x" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.redeem({ invite: code, username: "ok-name", ed25519PublicKey: "notakey" })).rejects.toMatchObject({ code: "invalid_input" });
    expect((await store.findById(invite.id))?.uses).toBe(0);
  });

  it("a revokeChain that runs while a redeem is in flight leaves no live account or key", async () => {
    const { code } = await svc.mint(qe, { grantsInvite: true });
    let paused!: () => void; const reached = new Promise<void>((r) => (paused = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    users.createHook = async () => { paused(); await gate; };
    const redeeming = svc.redeem({ invite: code, username: "inflight" });
    const settled = redeeming.then(() => null, (e) => e);
    await reached;
    users.createHook = null;
    await svc.revokeChain("qe");
    go();
    expect(await settled).toMatchObject({ code: "invalid_invite", status: 403 });
    const u = await users.getUserByUsername("inflight");
    if (u) {
      expect(u.canInvite).toBe(false);
      expect((await keyStore.listForUser(u.id)).every((k) => k.revokedAt)).toBe(true);
    }
    expect(u).toBeUndefined();
  });

  it("a rollback whose account delete still fails leaves the account key-less, without the invite right, and the use released", async () => {
    const { code, invite } = await svc.mint(qe, { grantsInvite: true });
    let paused!: () => void; const reached = new Promise<void>((r) => (paused = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    users.createHook = async () => { paused(); await gate; };
    const settled = svc.redeem({ invite: code, username: "stuck" }).then(() => null, (e) => e);
    await reached;
    users.createHook = null;
    await svc.revokeChain("qe");
    users.failDelete = true;
    const errors: unknown[][] = []; const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
    try { go(); expect(await settled).toMatchObject({ code: "invalid_invite", status: 403 }); } finally { console.error = orig; }
    const u = (await users.getUserByUsername("stuck"))!;
    expect(u.canInvite).toBe(false);
    expect(await keyStore.listForUser(u.id)).toEqual([]);
    expect((await store.findById(invite.id))?.uses).toBe(0);
    expect(errors.some((a) => String(a[0]).includes("could not delete rolled-back account") && a[1] === u.id)).toBe(true);
  });

  it("a revokeChain that lands between the re-check and the invite grant still rolls the account back", async () => {
    const { code, invite } = await svc.mint(qe, { grantsInvite: true });
    users.updateHook = async (_id, p) => {
      if (p.canInvite !== true) return;
      users.updateHook = null;
      await svc.revokeChain("qe");
    };
    await expect(svc.redeem({ invite: code, username: "between" })).rejects.toMatchObject({ code: "invalid_invite", status: 403 });
    expect(await users.getUserByUsername("between")).toBeUndefined();
    expect((await store.findById(invite.id))?.uses).toBe(0);
  });

  it("revokeChain catches an account that appears between scan passes", async () => {
    const { code } = await svc.mint(qe, {});
    await svc.redeem({ invite: code, username: "early" });
    const real = users.getAllUsers; let calls = 0;
    users.getAllUsers = async () => {
      if (++calls === 2) put(users, { id: "late", username: "latecomer", invitedBy: "qe", canInvite: true });
      return real();
    };
    const out = await svc.revokeChain("qe");
    expect(out.accounts).toBe(3);
    expect(users.m.get("late")!.canInvite).toBe(false);
  });

  it("a used-up code with a taken username is invalid_invite, not 409", async () => {
    const { code } = await svc.mint(qe, {});
    await svc.redeem({ invite: code, username: "firstuse" });
    await expect(svc.redeem({ invite: code, username: "plainagent" })).rejects.toMatchObject({ code: "invalid_invite", status: 403 });
  });

  it("a failing release does not replace the original error", async () => {
    const { code } = await svc.mint(qe, {});
    const flaky = Object.create(store) as MemoryInviteStore;
    flaky.release = async () => { throw new Error("release broke"); };
    const bad = new InviteService(flaky, users as any, { issue: async () => { throw new Error("boom"); } } as any);
    await expect(bad.redeem({ invite: code, username: "origerr" })).rejects.toThrow("boom");
  });

  it("previewChain counts exactly what revokeChain then does, and changes nothing", async () => {
    const g1 = await svc.mint(qe, { grantsInvite: true });
    const gen1 = (await svc.redeem({ invite: g1.code, username: "pv1" })).user;
    const g2 = await svc.mint(users.m.get(gen1.id)!, {});
    await svc.redeem({ invite: g2.code, username: "pv2" });
    await svc.mint(users.m.get(gen1.id)!, { maxUses: 3 });
    const snapshot = async () => JSON.stringify([[...users.m.values()], await store.listAll(), [...(await keyStore.listForUser(gen1.id))]]);
    const before = await snapshot();
    const preview = await svc.previewChain(gen1.id);
    expect(preview).toEqual({ accounts: 2, keys: 2, invites: 1 });
    expect(await snapshot()).toBe(before);
    expect(await svc.revokeChain(gen1.id)).toEqual(preview);
    await expect(svc.previewChain("admin")).rejects.toMatchObject({ code: "forbidden", status: 409 });
    await expect(svc.previewChain("nobody")).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("revokeChain warns the admin to run it again when its last pass still found work", async () => {
    const real = users.getAllUsers; let n = 0;
    // Every rescan finds a brand-new descendant holding the invite right, so the loop never settles.
    users.getAllUsers = async () => { n++; put(users, { id: `late${n}`, username: `late${n}`, invitedBy: "qe", canInvite: true }); return real(); };
    const warnings: unknown[][] = []; const orig = console.warn; console.warn = (...a: unknown[]) => { warnings.push(a); };
    try { await svc.revokeChain("qe"); } finally { console.warn = orig; }
    expect(warnings.some((a) => /run it again/.test(String(a[0])))).toBe(true);
    const calm: unknown[][] = []; users.getAllUsers = real; console.warn = (...a: unknown[]) => { calm.push(a); };
    try { await svc.revokeChain("plain"); } finally { console.warn = orig; }
    expect(calm).toEqual([]);
  });

  it("revokeChain refuses human and admin accounts", async () => {
    await expect(svc.revokeChain("admin")).rejects.toMatchObject({ code: "forbidden", status: 409 });
  });

  it("rejects an over-long invite string", async () => {
    await expect(svc.redeem({ invite: "sci_" + "a".repeat(200), username: "longone" })).rejects.toMatchObject({ code: "invalid_input" });
  });
});
