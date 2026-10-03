# Agent Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents onboard themselves on research.spacechild.love by redeeming an invite minted by an admin or by a trusted agent, and receive their own key without any person seeing the secret.

**Architecture:** A new `ledger_invites` table plus three `users` columns. An `InviteStore` (memory and Drizzle, one shared contract test) and an `InviteService` (mint, list, revoke, redeem, revoke-chain). The routes:
- a public `POST /api/ledger/onboard`;
- invite routes under `/api/ledger` for keys and sessions;
- two admin routes;
- two MCP tools;
- UI on `/admin/agents` and `/agents/:username`, plus a guide section.

**Tech Stack:** Express, Drizzle 0.39 on Postgres (PGlite in tests), zod 3.25, Vitest 4, React with wouter 3 and TanStack Query, express-rate-limit.

**Spec:** `docs/superpowers/specs/2026-10-03-agent-invites-design.md` (approved 2026-10-03). Parent spec: `docs/superpowers/specs/2026-10-03-research-ledger-design.md`.

## Global Constraints

- Invite codes: `sci_` + 32 random bytes base64url (43 chars). Stored only as sha256 hex (`code_hash`), with an 8-char `prefix` for display. Never logged.
- Defaults and bounds:

| Setting | Default | Bounds |
|---|---|---|
| `max_uses` | 1 | 1-50 |
| `expiresInDays` | 7 | 1-30 |
| `note` | none | up to 200 chars |

- Every invite failure on redeem returns HTTP 403 `{error:"invalid_invite"}`: unknown, used up, expired, revoked, or creator no longer allowed. `invalid_invite` joins the reason-code list (`LEDGER_ERROR_CODES` in `server/services/ledger/types.ts`).
- Redeem creates only `userType:"agent"`, `role:"user"`, `canRelease:false` accounts with an unusable password: `bcrypt.hash(randomBytes(32).toString("hex"), 12)`.
- Username rule (same as Add agent): trim, 3-64, `/^[A-Za-z0-9][A-Za-z0-9_.-]*$/`. displayName 2-120, default = username.
- A creator may invite when it exists and (`role === "admin"` or `canInvite`). `grantsInvite` may be set only by a creator who may invite. The right passes down and never widens.
- Agent caps: at most 20 invites minted per rolling 24 h, and at most 50 unexpired, unrevoked, not used-up invites held. Over a cap: `rate_limited` (429).
- Onboard limits:
  - 10 attempts per IP per hour, counting failures (429 `rate_limited`).
  - 200 successful onboardings per rolling 24 h site-wide (429 `rate_limited`).
- Agent keys never reach `/api/admin/*` (existing `isAgentKeyPath` rule stays). Agents mint under `/api/ledger/invites` only.
- Revoke chain:
  - revokes all active keys of the user and all agents descended through `invited_by`;
  - sets `canInvite:false` on all of them;
  - revokes their unexpired invites.
  - It never touches ledger records.
- Response bodies of `POST /api/ledger/onboard` and `POST /api/ledger/invites` are never logged.
- Atomicity ruling: users live in `IStorage`, outside the ledger store's transaction, so redeem is claim-then-compensate. The order:
  1. Validate and reject a taken username before claiming.
  2. Claim the invite with an atomic conditional increment.
  3. Create the user. On error, release the claim.
  4. Issue the key. On error, delete the user and release the claim.

  The observable behaviour equals the spec's single transaction: a failed redeem consumes no use.
- Repo rules:
  - Preserve each file's existing line endings (many are CRLF).
  - Lockfile changes only via `npx -y npm@10.9.2 install`.
  - Commits use `git commit -s` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - No deploy, no db:push against real databases, no contact with research.spacechild.love.

## Review Focus

1. **Single-use race.** Two redeems of a single-use invite at once must produce exactly one account. Pinned in Task 1 (PGlite contract: concurrent `claim`) and Task 2 (service).
2. **Username taken after claim.** Another request takes the username between check and create (unique violation 23505). The use must be released and the result is 409 `forbidden`. Pinned in Task 2.
3. **Anonymous POST to `/api/ledger/onboard`.** It must reach the handler; the existing `guardMutations` currently rejects anonymous mutations under `/api/ledger`. Pinned in Task 3.
4. **Invite code in logs.** The code appears in the mint response and the request body of onboard; neither may be logged. Pinned in Task 3.
5. **Agent without `canInvite` calling `ledger_invite` over MCP.** It must get `forbidden`, the same as HTTP. Pinned in Task 4.

---

### Task 1: Invite schema and InviteStore (memory, Drizzle, contract)

**Files:**
- Modify: `shared/schema.ts` (users: `canInvite`, `invitedBy`, `inviteId`)
- Modify: `shared/ledger-schema.ts` (table `ledgerInvites`, types `LedgerInvite`, `NewLedgerInvite`)
- Modify: `server/services/ledger/types.ts` (interface `InviteStore`; add `"invalid_invite"` to `LEDGER_ERROR_CODES`)
- Modify: `server/services/ledger/memory-store.ts` (class `MemoryInviteStore`)
- Modify: `server/services/ledger/drizzle-store.ts` (class `DrizzleInviteStore`)
- Create: `server/services/ledger/invite-store-contract.ts` (function `describeInviteStoreContract`)
- Create: `server/services/ledger/invite-store.test.ts`

**Interfaces:**
- Consumes: `makePgliteDb` from `server/services/ledger/pglite-harness.ts` (read it first; it builds every table from the Drizzle schema, so new tables appear automatically); `users` table.
- Produces:

```ts
// shared/ledger-schema.ts
export const ledgerInvites = pgTable("ledger_invites", {
  id: varchar("id").primaryKey(),                       // ULID from server/services/ledger/ulid.ts
  codeHash: text("code_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  note: text("note"),
  grantsInvite: boolean("grants_invite").notNull().default(false),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type LedgerInvite = typeof ledgerInvites.$inferSelect;
export type NewLedgerInvite = typeof ledgerInvites.$inferInsert;

// shared/schema.ts, inside the users table
canInvite: boolean("can_invite").notNull().default(false),
invitedBy: varchar("invited_by"),   // users.id of the inviter; no FK constraint (self-reference kept simple)
inviteId: varchar("invite_id"),     // ledger_invites.id

// server/services/ledger/types.ts
export interface InviteStore {
  insert(i: NewLedgerInvite): Promise<LedgerInvite>;
  findByHash(codeHash: string): Promise<LedgerInvite | undefined>;
  findById(id: string): Promise<LedgerInvite | undefined>;
  /** Atomically increments uses when the invite is unrevoked, unexpired at `now`, and uses < maxUses. Returns the updated row, or undefined. */
  claim(codeHash: string, now: Date): Promise<LedgerInvite | undefined>;
  /** Compensation: decrements uses by one (never below 0). */
  release(id: string): Promise<void>;
  revoke(id: string, at: Date): Promise<LedgerInvite | undefined>;
  /** Revokes every still-open invite (unrevoked, expiresAt > at, uses < maxUses) created by any of these users; returns how many were revoked. */
  revokeAllByCreators(userIds: string[], at: Date): Promise<number>;
  listByCreator(userId: string): Promise<LedgerInvite[]>;   // newest first
  listAll(): Promise<LedgerInvite[]>;                        // newest first
  countMintedSince(userId: string, since: Date): Promise<number>;
  /** Unrevoked, expiresAt > now, uses < maxUses. */
  countOpen(userId: string, now: Date): Promise<number>;
}
```

- [ ] **Step 1: Write the contract and the failing test**

Create `server/services/ledger/invite-store-contract.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { InviteStore } from "./types";

export type InviteFixture = { store: InviteStore; creatorId: string; otherCreatorId: string };

const H = (n: number) => n.toString(16).padStart(64, "0");
const later = (ms: number) => new Date(Date.now() + ms);

export function describeInviteStoreContract(label: string, make: () => Promise<InviteFixture>): void {
  describe(`InviteStore contract: ${label}`, () => {
    let f: InviteFixture;
    beforeEach(async () => { f = await make(); });

    const mk = (n: number, over: Record<string, unknown> = {}) => f.store.insert({
      id: `01J9INV${String(n).padStart(19, "0")}`, codeHash: H(n), prefix: `sci_${n}`.slice(0, 8),
      createdBy: f.creatorId, maxUses: 1, uses: 0, expiresAt: later(86_400_000), ...over,
    } as any);

    it("claims an open invite once, then refuses", async () => {
      await mk(1);
      expect((await f.store.claim(H(1), new Date()))?.uses).toBe(1);
      expect(await f.store.claim(H(1), new Date())).toBeUndefined();
    });

    it("refuses expired and revoked invites and unknown hashes", async () => {
      await mk(2, { expiresAt: new Date(Date.now() - 1000) });
      await mk(3);
      await f.store.revoke("01J9INV0000000000000000003", new Date());
      expect(await f.store.claim(H(2), new Date())).toBeUndefined();
      expect(await f.store.claim(H(3), new Date())).toBeUndefined();
      expect(await f.store.claim(H(99), new Date())).toBeUndefined();
    });

    it("release gives a use back and never goes below zero", async () => {
      await mk(4);
      const c = await f.store.claim(H(4), new Date());
      await f.store.release(c!.id);
      await f.store.release(c!.id);
      expect((await f.store.findById(c!.id))?.uses).toBe(0);
      expect((await f.store.claim(H(4), new Date()))?.uses).toBe(1);
    });

    it("multi-use invites allow exactly maxUses claims", async () => {
      await mk(5, { maxUses: 3 });
      const got = [];
      for (let i = 0; i < 5; i++) got.push(await f.store.claim(H(5), new Date()));
      expect(got.filter(Boolean)).toHaveLength(3);
    });

    it("concurrent claims of a single-use invite succeed exactly once", async () => {
      await mk(6);
      const results = await Promise.all(Array.from({ length: 8 }, () => f.store.claim(H(6), new Date())));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("lists, counts and bulk-revokes by creator", async () => {
      await mk(7); await mk(8, { maxUses: 2 }); await mk(9, { createdBy: f.otherCreatorId });
      expect((await f.store.listByCreator(f.creatorId)).map((i) => i.codeHash).sort()).toEqual([H(7), H(8)]);
      expect(await f.store.listAll()).toHaveLength(3);
      expect(await f.store.countMintedSince(f.creatorId, new Date(Date.now() - 60_000))).toBe(2);
      expect(await f.store.countOpen(f.creatorId, new Date())).toBe(2);
      expect(await f.store.revokeAllByCreators([f.creatorId], new Date())).toBe(2);
      expect(await f.store.countOpen(f.creatorId, new Date())).toBe(0);
      expect(await f.store.countOpen(f.otherCreatorId, new Date())).toBe(1);
    });
  });
}
```

Create `server/services/ledger/invite-store.test.ts`:

```ts
import { describeInviteStoreContract } from "./invite-store-contract";
import { MemoryInviteStore } from "./memory-store";
import { DrizzleInviteStore } from "./drizzle-store";
import { makePgliteDb } from "./pglite-harness";
import { users } from "@shared/schema";

describeInviteStoreContract("memory", async () => ({ store: new MemoryInviteStore(), creatorId: "u-creator", otherCreatorId: "u-other" }));

describeInviteStoreContract("drizzle on PGlite", async () => {
  const db = await makePgliteDb();
  for (const id of ["u-creator", "u-other"]) {
    await db.insert(users).values({ id, username: id, displayName: id, zkpCommitment: "x", userType: "agent" } as any);
  }
  return { store: new DrizzleInviteStore(db), creatorId: "u-creator", otherCreatorId: "u-other" };
});
```

Check `makePgliteDb`'s real export name and signature in `pglite-harness.ts`, and match the style `drizzle-store.test.ts` uses.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/services/ledger/invite-store.test.ts`
Expected: FAIL, `MemoryInviteStore` / `DrizzleInviteStore` / `ledgerInvites` not exported.

- [ ] **Step 3: Implement**

Add the schema exactly as in Interfaces. Add `"invalid_invite"` to the end of `LEDGER_ERROR_CODES`. Add `InviteStore` to `types.ts`.

`MemoryInviteStore` keeps a `Map<string, LedgerInvite>`. `insert` fills defaults: `note:null`, `grantsInvite:false`, `uses:0`, `revokedAt:null`, `createdAt:new Date()`. `claim` checks and increments synchronously, with no `await` between the check and the write, so concurrent calls are safe.

`DrizzleInviteStore` follows `DrizzleAgentKeyStore`'s style. The atomic claim:

```ts
async claim(codeHash: string, now: Date) {
  const rows = await this.db.update(ledgerInvites)
    .set({ uses: sql`${ledgerInvites.uses} + 1` })
    .where(and(
      eq(ledgerInvites.codeHash, codeHash),
      isNull(ledgerInvites.revokedAt),
      gt(ledgerInvites.expiresAt, now),
      lt(ledgerInvites.uses, ledgerInvites.maxUses),
    ))
    .returning();
  return rows[0];
}
async release(id: string) {
  await this.db.update(ledgerInvites)
    .set({ uses: sql`greatest(${ledgerInvites.uses} - 1, 0)` })
    .where(eq(ledgerInvites.id, id));
}
```

`countOpen` uses `isNull(revokedAt)`, `gt(expiresAt, now)` and `lt(uses, maxUses)`. `revokeAllByCreators` returns `0` for an empty array without querying. It uses the same open condition as `countOpen` (`isNull(revokedAt)`, `gt(expiresAt, at)`, `lt(uses, maxUses)`) plus `inArray(createdBy, ids)`, and returns `.returning()` length. Used-up and expired invites are left alone, because the spec revokes "unredeemed invites".

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run server/services/ledger/invite-store.test.ts && npx tsc --noEmit`
Expected: PASS (12 tests: 6 per store), tsc clean. Then run the whole suite: `npx vitest run`. Expected: all previous tests still pass. `shared/ledger-schema.test.ts` may assert the table list; update that assertion to include `ledger_invites` if it fails.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts shared/ledger-schema.ts server/services/ledger/types.ts server/services/ledger/memory-store.ts server/services/ledger/drizzle-store.ts server/services/ledger/invite-store-contract.ts server/services/ledger/invite-store.test.ts shared/ledger-schema.test.ts
git commit -s -m "ledger: invites table, users can_invite/invited_by, InviteStore (memory + drizzle + contract)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: InviteService (mint, list, revoke, redeem, revoke-chain)

**Files:**
- Create: `server/services/ledger/invites.ts`
- Create: `server/services/ledger/invites.test.ts`
- Modify: `server/services/ledger/index.ts` (export `inviteStore`, `invites`)

**Interfaces:**
- Consumes: `InviteStore`, `LedgerError` (Task 1 / existing); `AgentKeyService` (`issue`, `list`, `revoke`) and `hashSecret`, `isValidEd25519PublicKey` from `server/services/ledger/agent-keys.ts`; `ulid` from `server/services/ledger/ulid.ts` (check its real export name); `siteUrl` from `server/lib/site-url.ts`.
- Produces:

```ts
export const INVITE_PREFIX = "sci_";
export function generateInviteCode(): string;            // "sci_" + randomBytes(32).toString("base64url")
export type PublicInvite = {
  id: string; prefix: string; note: string | null; grantsInvite: boolean; maxUses: number; uses: number;
  expiresAt: string; revokedAt: string | null; createdAt: string; createdBy: string;
  status: "active" | "used_up" | "expired" | "revoked";
};
export interface InviteUsers {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(u: InsertUser): Promise<User>;
  updateUser(id: string, u: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
}
export const usernameSchema: z.ZodType<string>;          // the Global Constraints rule, same messages as ledger-admin.ts addAgentSchema
export class InviteService {
  constructor(store: InviteStore, users: InviteUsers, keys: AgentKeyService, opts?: { now?: () => Date; dailyOnboardCap?: number; agentDailyMintCap?: number; agentOpenCap?: number });
  mayInvite(u: User | undefined): boolean;                // exists && (role === "admin" || canInvite)
  mint(actor: User, input: { note?: string; maxUses?: number; expiresInDays?: number; grantsInvite?: boolean }): Promise<{ invite: PublicInvite; code: string; redeemUrl: string }>;
  list(actor: User): Promise<PublicInvite[]>;             // admin: all; otherwise own
  revoke(actor: User, id: string): Promise<PublicInvite>; // minter or admin; else forbidden; unknown -> not_found
  redeem(input: { invite: string; username: string; displayName?: string; ed25519PublicKey?: string }): Promise<{
    user: { id: string; username: string; displayName: string }; invitedBy: string;
    key: { id: string; name: string; prefix: string; hasEd25519: boolean }; secret: string;
    setup: { baseUrl: string; keyId: string; quickstartUrl: string };
  }>;
  setCanInvite(userId: string, canInvite: boolean): Promise<User>;    // refuses human accounts with forbidden
  revokeChain(userId: string): Promise<{ accounts: number; keys: number; invites: number }>;
  inviterOf(userId: string): Promise<string | null>;     // inviter's username, or null
}
```

Errors are `LedgerError`:
- `invalid_input` 400 for bad mint or redeem input.
- `forbidden` 403 for a caller who may not mint, or who sets `grantsInvite` without being allowed.
- `forbidden` 409 for a taken username or a human account in `setCanInvite`.
- `invalid_invite` 403 for every redeem invite failure.
- `rate_limited` 429 for caps.
- `not_found` 404.

- [ ] **Step 1: Write the failing tests**

Create `server/services/ledger/invites.test.ts`:

```ts
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
    getUser: async (id: string) => m.get(id),
    getUserByUsername: async (u: string) => [...m.values()].find((x) => x.username === u),
    createUser: async (u: any) => {
      if (api.failCreate) throw api.failCreate();
      if ([...m.values()].some((x) => x.username === u.username)) throw Object.assign(new Error("dup"), { code: "23505" });
      const user = { id: `u${++n}`, canRelease: false, canInvite: false, invitedBy: null, inviteId: null, createdAt: new Date(), ...u } as User;
      m.set(user.id, user); return user;
    },
    updateUser: async (id: string, p: Partial<User>) => { const u = { ...m.get(id)!, ...p }; m.set(id, u); return u; },
    deleteUser: async (id: string) => { m.delete(id); },
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
    expect(await bcrypt.compare("", u!.zkpCommitment)).toBe(false);
  });

  it("refuses a second redeem of a single-use invite with invalid_invite", async () => {
    const { code } = await svc.mint(qe, {});
    await svc.redeem({ invite: code, username: "a1" });
    await expect(svc.redeem({ invite: code, username: "a2" })).rejects.toMatchObject({ code: "invalid_invite", status: 403 });
  });

  it("returns invalid_invite for unknown, expired, revoked, and creator-lost-right invites alike", async () => {
    await expect(svc.redeem({ invite: generateInviteCode(), username: "x1" })).rejects.toMatchObject({ code: "invalid_invite" });
    const t0 = Date.now();
    const timed = new InviteService(store, users as any, new AgentKeyService(keyStore, users as any), { now: () => new Date(t0 + 8 * 86_400_000) });
    const { code: old } = await svc.mint(qe, {});            // expires in 7 days
    await expect(timed.redeem({ invite: old, username: "x2" })).rejects.toMatchObject({ code: "invalid_invite" });
    const { code: rv, invite } = await svc.mint(qe, {});
    await svc.revoke(qe, invite.id);
    await expect(svc.redeem({ invite: rv, username: "x3" })).rejects.toMatchObject({ code: "invalid_invite" });
    const { code: lost } = await svc.mint(qe, {});
    await svc.setCanInvite("qe", false);
    await expect(svc.redeem({ invite: lost, username: "x4" })).rejects.toMatchObject({ code: "invalid_invite" });
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
    const r = await Promise.allSettled(["c1", "c2", "c3", "c4"].map((u) => svc.redeem({ invite: code, username: u })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await users.getAllUsers()).filter((u) => ["c1", "c2", "c3", "c4"].includes(u.username))).toHaveLength(1);
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
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run server/services/ledger/invites.test.ts`
Expected: FAIL, cannot resolve `./invites`.

- [ ] **Step 3: Implement `server/services/ledger/invites.ts`**

```ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { InsertUser, User } from "@shared/schema";
import type { LedgerInvite } from "@shared/ledger-schema";
import { LedgerError, type InviteStore } from "./types";
import { hashSecret, isValidEd25519PublicKey, type AgentKeyService } from "./agent-keys";
import { ulid } from "./ulid";
import { siteUrl } from "../../lib/site-url";

export const INVITE_PREFIX = "sci_";
const DAY = 86_400_000;

export function generateInviteCode(): string {
  return INVITE_PREFIX + randomBytes(32).toString("base64url");
}

export const usernameSchema = z.string().trim()
  .min(3, "The name must be 3-64 characters").max(64, "The name must be 3-64 characters")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "The name may use letters, digits, '_', '.' and '-', and must start with a letter or digit");

const mintSchema = z.object({
  note: z.string().trim().max(200, "The note must be at most 200 characters").optional(),
  maxUses: z.number().int().min(1, "Uses must be 1-50").max(50, "Uses must be 1-50").optional(),
  expiresInDays: z.number().int().min(1, "Expiry must be 1-30 days").max(30, "Expiry must be 1-30 days").optional(),
  grantsInvite: z.boolean().optional(),
});

const redeemSchema = z.object({
  invite: z.string().min(1),
  username: usernameSchema,
  displayName: z.string().trim().min(2, "Display name must be 2-120 characters").max(120, "Display name must be 2-120 characters").optional(),
  ed25519PublicKey: z.string().trim().optional().transform((v) => v || undefined)
    .refine((v) => v === undefined || isValidEd25519PublicKey(v), "The NATS signing public key must be a 32-byte key in base64"),
});

export type PublicInvite = {
  id: string; prefix: string; note: string | null; grantsInvite: boolean; maxUses: number; uses: number;
  expiresAt: string; revokedAt: string | null; createdAt: string; createdBy: string;
  status: "active" | "used_up" | "expired" | "revoked";
};

export interface InviteUsers {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(u: InsertUser): Promise<User>;
  updateUser(id: string, u: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export class InviteService {
  private readonly now: () => Date;
  private readonly dailyOnboardCap: number;
  private readonly agentDailyMintCap: number;
  private readonly agentOpenCap: number;

  constructor(
    private readonly store: InviteStore,
    private readonly users: InviteUsers,
    private readonly keys: AgentKeyService,
    opts: { now?: () => Date; dailyOnboardCap?: number; agentDailyMintCap?: number; agentOpenCap?: number } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.dailyOnboardCap = opts.dailyOnboardCap ?? 200;
    this.agentDailyMintCap = opts.agentDailyMintCap ?? 20;
    this.agentOpenCap = opts.agentOpenCap ?? 50;
  }

  mayInvite(u: User | undefined): boolean {
    return Boolean(u && (u.role === "admin" || u.canInvite));
  }

  private toPublic(i: LedgerInvite): PublicInvite {
    const now = this.now().getTime();
    const status: PublicInvite["status"] = i.revokedAt ? "revoked"
      : new Date(i.expiresAt).getTime() <= now ? "expired"
      : i.uses >= i.maxUses ? "used_up" : "active";
    return {
      id: i.id, prefix: i.prefix, note: i.note ?? null, grantsInvite: i.grantsInvite, maxUses: i.maxUses, uses: i.uses,
      expiresAt: iso(i.expiresAt)!, revokedAt: iso(i.revokedAt), createdAt: iso(i.createdAt)!, createdBy: i.createdBy, status,
    };
  }

  async mint(actor: User, input: { note?: string; maxUses?: number; expiresInDays?: number; grantsInvite?: boolean }) {
    const fresh = await this.users.getUser(actor.id);
    if (!this.mayInvite(fresh)) throw new LedgerError("forbidden", 403, "this account may not create invites");
    const parsed = mintSchema.safeParse(input ?? {});
    if (!parsed.success) throw new LedgerError("invalid_input", 400, parsed.error.issues[0]?.message);
    const { note, maxUses = 1, expiresInDays = 7, grantsInvite = false } = parsed.data;
    const now = this.now();
    if (fresh!.role !== "admin") {
      if (await this.store.countMintedSince(fresh!.id, new Date(now.getTime() - DAY)) >= this.agentDailyMintCap) {
        throw new LedgerError("rate_limited", 429, "daily invite limit reached");
      }
      if (await this.store.countOpen(fresh!.id, now) >= this.agentOpenCap) {
        throw new LedgerError("rate_limited", 429, "too many open invites; revoke some first");
      }
    }
    const code = generateInviteCode();
    const row = await this.store.insert({
      id: ulid(), codeHash: hashSecret(code), prefix: code.slice(0, 8), createdBy: fresh!.id, note: note || null,
      grantsInvite, maxUses, uses: 0, expiresAt: new Date(now.getTime() + expiresInDays * DAY),
    } as any);
    return { invite: this.toPublic(row), code, redeemUrl: `${siteUrl()}/ledger/agent-guide#invite` };
  }

  async list(actor: User) {
    const rows = actor.role === "admin" ? await this.store.listAll() : await this.store.listByCreator(actor.id);
    return rows.map((r) => this.toPublic(r));
  }

  async revoke(actor: User, id: string) {
    const row = await this.store.findById(id);
    if (!row) throw new LedgerError("not_found", 404, "no such invite");
    if (actor.role !== "admin" && row.createdBy !== actor.id) throw new LedgerError("forbidden", 403, "only the minter or an admin may revoke this invite");
    return this.toPublic((await this.store.revoke(id, this.now())) ?? row);
  }

  async redeem(input: { invite: string; username: string; displayName?: string; ed25519PublicKey?: string }) {
    const parsed = redeemSchema.safeParse(input ?? {});
    if (!parsed.success) throw new LedgerError("invalid_input", 400, parsed.error.issues[0]?.message);
    const { invite, username, displayName, ed25519PublicKey } = parsed.data;
    const now = this.now();
    const invalid = () => new LedgerError("invalid_invite", 403, "this invite is not valid");

    const found = await this.store.findByHash(hashSecret(invite));
    if (!found) throw invalid();
    const creator = await this.users.getUser(found.createdBy);
    if (!this.mayInvite(creator)) throw invalid();
    if (await this.users.getUserByUsername(username)) throw new LedgerError("forbidden", 409, `${username} is already taken`);
    const since = new Date(now.getTime() - DAY);
    const onboardedToday = (await this.users.getAllUsers()).filter((u) => u.inviteId && new Date(u.createdAt).getTime() >= since.getTime()).length;
    if (onboardedToday >= this.dailyOnboardCap) throw new LedgerError("rate_limited", 429, "daily onboarding limit reached; try again later");

    const claimed = await this.store.claim(found.codeHash, now);
    if (!claimed) throw invalid();

    let user: User;
    try {
      user = await this.users.createUser({
        username, displayName: displayName ?? username, userType: "agent", role: "user", canRelease: false,
        canInvite: claimed.grantsInvite, invitedBy: claimed.createdBy, inviteId: claimed.id,
        zkpCommitment: await bcrypt.hash(randomBytes(32).toString("hex"), 12), bio: null, researchInterests: [],
      } as InsertUser);
    } catch (e) {
      await this.store.release(claimed.id);
      if ((e as { code?: string })?.code === "23505") throw new LedgerError("forbidden", 409, `${username} is already taken`);
      throw e;
    }
    let issued;
    try {
      issued = await this.keys.issue(user.id, "default", ed25519PublicKey ?? null);
    } catch (e) {
      await this.users.deleteUser(user.id).catch((d) => console.error("[ledger] could not roll back onboarded account", user.id, d));
      await this.store.release(claimed.id);
      throw e;
    }
    const { key, secret } = issued;
    return {
      user: { id: user.id, username: user.username, displayName: user.displayName },
      invitedBy: creator!.username,
      key: { id: key.id, name: key.name, prefix: key.prefix, hasEd25519: Boolean(key.ed25519PublicKey) },
      secret,
      setup: { baseUrl: siteUrl(), keyId: key.id, quickstartUrl: `${siteUrl()}/ledger/agent-guide` },
    };
  }

  async setCanInvite(userId: string, canInvite: boolean) {
    const u = await this.users.getUser(userId);
    if (!u) throw new LedgerError("not_found", 404, "no such user");
    if (u.userType !== "agent") throw new LedgerError("forbidden", 409, "only agent accounts carry the invite right; admins can always invite");
    return this.users.updateUser(userId, { canInvite });
  }

  async revokeChain(userId: string) {
    const all = await this.users.getAllUsers();
    if (!all.some((u) => u.id === userId)) throw new LedgerError("not_found", 404, "no such user");
    const chain = new Set<string>([userId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const u of all) if (u.invitedBy && chain.has(u.invitedBy) && !chain.has(u.id)) { chain.add(u.id); grew = true; }
    }
    let keys = 0;
    for (const id of chain) {
      for (const k of await this.keys.list(id)) if (!k.revokedAt) { await this.keys.revoke(k.id); keys++; }
      const u = all.find((x) => x.id === id)!;
      if (u.canInvite) await this.users.updateUser(id, { canInvite: false });
    }
    const invites = await this.store.revokeAllByCreators([...chain], this.now());
    return { accounts: chain.size, keys, invites };
  }

  async inviterOf(userId: string) {
    const u = await this.users.getUser(userId);
    if (!u?.invitedBy) return null;
    return (await this.users.getUser(u.invitedBy))?.username ?? null;
  }
}
```

The single-use concurrency test passes because `claim` is atomic; the losers get `invalid_invite`. If `ulid`'s export has another name, adapt the import.

The three-generation test expects `invites: 1`. In that chain (gen1, gen2, gen3), g2 and g3 are used up, and only gen2's last invite is still open. `revokeAllByCreators` revokes open invites only (Task 1). g1 was minted by qe, which is outside the chain.

In `server/services/ledger/index.ts` add:

```ts
export const inviteStore = new DrizzleInviteStore(db);
export const invites = new InviteService(inviteStore, storage, agentKeys);
```

Check that `storage` (IStorage) has `getAllUsers` and `deleteUser`; the Add agent work already relies on both.

- [ ] **Step 4: Run tests, typecheck, suite**

Run: `npx vitest run server/services/ledger/invites.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS, tsc clean, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add server/services/ledger/invites.ts server/services/ledger/invites.test.ts server/services/ledger/index.ts server/services/ledger/drizzle-store.ts server/services/ledger/memory-store.ts server/services/ledger/invite-store-contract.ts
git commit -s -m "ledger: InviteService (mint, list, revoke, redeem with compensation, revoke-chain)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: HTTP routes, onboarding limits, logging, guard exemption

**Files:**
- Create: `server/routes/ledger-invites.ts`
- Create: `server/routes/ledger-invites.test.ts`
- Modify: `server/routes.ts` (mount the invite router on `/api/ledger` before the existing ledger router)
- Modify: `server/routes/ledger-admin.ts` (`POST /users/:id/can-invite`, `POST /users/:id/revoke-chain`; Add agent accepts `canInvite`)
- Modify: `server/middleware/auth.ts` (`PUBLIC_MUTATION_PATHS` gains `/^\/api\/ledger\/onboard$/`)
- Modify: `server/middleware/api-logger.ts` (never log bodies for `POST /api/ledger/onboard` and `POST /api/ledger/invites`)
- Modify: `server/services/ledger/rate-limits.ts` (`onboardIpLimiter()`)
- Modify: `server/routes/ledger.ts` (`GET /api/ledger/agents/:username` adds `invitedBy`)
- Modify: `shared/ledger-public.ts` (`AgentProfile.invitedBy: string | null`)

**Interfaces:**
- Consumes: `InviteService` and its errors (Task 2); `requireLedgerAuth`, `requireLedgerAdmin`, `sendLedgerError` from `server/routes/ledger.ts`; `limitFromEnv` from `rate-limits.ts`.
- Produces:
  - `createLedgerInviteRouter(svc: InviteService, limits?: { onboard?: RequestHandler }): Router` serving `POST /onboard`, `POST /invites`, `GET /invites` and `DELETE /invites/:id`.
  - `onboardIpLimiter(): RequestHandler`: 10 per hour per IP, env `LEDGER_ONBOARD_LIMIT_PER_HOUR`, counts every attempt, 429 JSON `{error:"rate_limited", message}`.
  - Admin routes `POST /api/admin/users/:id/can-invite` with body `{canInvite: boolean}`, returning the sanitized user, and `POST /api/admin/users/:id/revoke-chain`, returning `{accounts, keys, invites}`.
  - `AgentProfile.invitedBy`.

- [ ] **Step 1: Write the failing tests**

Create `server/routes/ledger-invites.test.ts`. Read `server/routes/ledger.test.ts` and `server/test-utils/serve.ts` first and reuse their app-building style: express app, `express.json()`, a stub that sets `req.user` from a test header, and `serve()`. Required tests:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { serve } from "../test-utils/serve";
import { createLedgerInviteRouter } from "./ledger-invites";
import { InviteService } from "../services/ledger/invites";
import { MemoryInviteStore, MemoryAgentKeyStore } from "../services/ledger/memory-store";
import { AgentKeyService } from "../services/ledger/agent-keys";
import { guardMutations } from "../middleware/auth";
import { apiLogger } from "../middleware/api-logger";
import { onboardIpLimiter } from "../services/ledger/rate-limits";

// Build: users fake as in invites.test.ts (copy the fakeUsers/put helpers here; do not import test files).
// App order mirrors server/index.ts: express.json(), apiLogger(write => lines.push(write)), a test-only middleware
// that sets req.user = users.m.get(req.header("x-test-user")), guardMutations, then
// app.use("/api/ledger", createLedgerInviteRouter(svc, { onboard: onboardIpLimiter() })).

describe("invite routes", () => {
  it("anonymous POST /api/ledger/onboard reaches the handler (guardMutations exemption)", async () => {
    // mint via the service, POST {invite, username} with no x-test-user -> 201 with secret, key.id, setup.baseUrl
  });
  it("onboard with a bad invite is 403 {error:'invalid_invite'}", async () => {});
  it("onboard counts failures toward the per-IP limit: the 11th attempt in an hour is 429 rate_limited", async () => {
    // process.env.LEDGER_ONBOARD_LIMIT_PER_HOUR unset -> 10; send 10 bad invites (403) then the 11th -> 429
  });
  it("never logs onboard or mint response bodies or request invite codes", async () => {
    // after a successful mint (as qe) and onboard, assert no logged line contains the code, the secret, or 'sci_' / 'scl_' followed by 20+ chars
  });
  it("POST /api/ledger/invites requires a signed-in caller; a non-inviter gets 403 forbidden; an inviter gets 201 {invite, code, redeemUrl}", async () => {});
  it("GET /api/ledger/invites lists own invites without codes; DELETE revokes own, 403 for others", async () => {});
});
```

Fill in each test body with real requests and assertions as described in its comment. Each must fail if its behaviour is removed. Use `fetch(base + path, {method, headers:{"content-type":"application/json", "x-test-user": "qe"}, body: JSON.stringify(...)})`.

Add to `server/routes/ledger-admin.test.ts`, following that file's existing setup:
- `POST /api/admin/users/:id/can-invite` with `{canInvite:true}` on an agent returns 200 and the user has `canInvite` true. On a human it returns 409 `forbidden`. A non-admin gets the existing admin-guard rejection.
- `POST /api/admin/users/:id/revoke-chain` returns `{accounts, keys, invites}` numbers.
- `POST /api/admin/agents` with `{username, canInvite:true}` creates an agent with `canInvite` true.
- An scl_ agent key on `/api/admin/users/:id/can-invite` gets 403 forbidden. That comes from the existing `isAgentKeyPath` rule; add one assertion through the real `agentKeyAuth` if the file already builds with it, or leave it to `agent-key-scope.test.ts` if that is where the rule is tested. In the second case, add a `can-invite` path case there.

Add to `server/routes/ledger.test.ts`: `GET /api/ledger/agents/:username` includes `invitedBy` (null for an agent with no inviter).

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run server/routes/ledger-invites.test.ts server/routes/ledger-admin.test.ts server/routes/ledger.test.ts`
Expected: FAIL (module missing, routes missing).

- [ ] **Step 3: Implement**

`server/routes/ledger-invites.ts`:

```ts
import { Router, type RequestHandler } from "express";
import type { InviteService } from "../services/ledger/invites";
import { requireLedgerAuth, sendLedgerError } from "./ledger";

export function createLedgerInviteRouter(svc: InviteService, limits: { onboard?: RequestHandler } = {}): Router {
  const r = Router();
  const pass: RequestHandler = (_req, _res, next) => next();

  r.post("/onboard", limits.onboard ?? pass, async (req, res) => {
    try { res.status(201).json(await svc.redeem(req.body ?? {})); } catch (e) { sendLedgerError(res, e, req); }
  });
  r.post("/invites", requireLedgerAuth, async (req, res) => {
    try {
      const b = req.body ?? {};
      res.status(201).json(await svc.mint(req.user as any, {
        note: b.note, maxUses: b.maxUses, expiresInDays: b.expiresInDays, grantsInvite: b.grantsInvite,
      }));
    } catch (e) { sendLedgerError(res, e, req); }
  });
  r.get("/invites", requireLedgerAuth, async (req, res) => {
    try { res.json(await svc.list(req.user as any)); } catch (e) { sendLedgerError(res, e, req); }
  });
  r.delete("/invites/:id", requireLedgerAuth, async (req, res) => {
    try { res.json(await svc.revoke(req.user as any, req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });
  return r;
}
```

Check `requireLedgerAuth` and `sendLedgerError`'s real signatures in `server/routes/ledger.ts` and match them. `sendLedgerError` must map `LedgerError` status and code; `invalid_invite` flows through because it is now in `LEDGER_ERROR_CODES`.

`rate-limits.ts`:

```ts
export function onboardIpLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limitFromEnv("LEDGER_ONBOARD_LIMIT_PER_HOUR", 10),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: "rate_limited", message: "too many onboarding attempts from this address; try again later" }); },
  });
}
```

Match the existing limiter style in that file: import names, option names, and key generator if one is used for IPs.

`auth.ts`: add `/^\/api\/ledger\/onboard$/` to `PUBLIC_MUTATION_PATHS`.

`api-logger.ts`: extend the never-log route rule so `POST /api/ledger/onboard` and `POST /api/ledger/invites` (with an optional trailing slash) never log bodies. The existing constant is `KEY_ISSUE_ROUTE`; add a second regex or widen it, keeping the existing routes.

`server/routes.ts`: import `createLedgerInviteRouter`, `invites` and `onboardIpLimiter`. Add `app.use("/api/ledger", createLedgerInviteRouter(invites, { onboard: onboardIpLimiter() }));` on the line before the existing `app.use("/api/ledger", createLedgerRouter(...))`. Pass `invites` into `createLedgerAdminRouter` and `createLedgerRouter` as needed for the next two changes.

`ledger-admin.ts`:
- **Dependency:** `createLedgerAdminRouter(deps)` gains `invites: InviteService` in `deps`. Update its callers: `server/routes.ts` and the test file.
- **Can-invite route:** `r.post("/users/:id/can-invite", …)` calls `deps.invites.setCanInvite(req.params.id, req.body?.canInvite === true)` and returns `sanitizeUser(user)`.
- **Revoke-chain route:** `r.post("/users/:id/revoke-chain", …)` returns `await deps.invites.revokeChain(req.params.id)`.
- **Add agent:** `addAgentSchema` gains `canInvite: z.boolean().optional()`. When it is true, the created (or existing agent) user is updated with `{ canInvite: true }` before responding, and the response's `user` includes `canInvite`.
- **Agent list:** `GET /agents` rows gain `canInvite: Boolean(u.canInvite)` and `invitedBy` (inviter username or null; build a `Map` of id to username from the same `getAllUsers()` result).

`ledger.ts` agent profile route: add `invitedBy`. The router needs a way to look it up: give `createLedgerRouter` an optional third parameter `extras?: { inviterOf?: (username: string) => Promise<string | null> }`. The route sets `invitedBy: extras?.inviterOf ? await extras.inviterOf(username) : null`. In `routes.ts`, pass `inviterOf: async (name) => { const u = await storage.getUserByUsername(name); return u ? invites.inviterOf(u.id) : null; }`. Add `invitedBy: string | null` to `AgentProfile` in `shared/ledger-public.ts`.

- [ ] **Step 4: Run tests, typecheck, suite, build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add server/routes/ledger-invites.ts server/routes/ledger-invites.test.ts server/routes.ts server/routes/ledger-admin.ts server/routes/ledger-admin.test.ts server/routes/ledger.ts server/routes/ledger.test.ts server/middleware/auth.ts server/middleware/api-logger.ts server/services/ledger/rate-limits.ts shared/ledger-public.ts
git commit -s -m "ledger: invite and onboarding routes, admin can-invite and revoke-chain, onboarding limits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: MCP tools `ledger_invite` and `ledger_invites`

**Files:**
- Modify: `server/mcp-ledger-tools.ts`
- Modify: `server/mcp-ledger-tools.test.ts`
- Modify: `server/mcp-http.ts`, `server/mcp-server.ts` and `server/websocket.ts`, only as needed to pass the invite service and the authenticated `User` through to the tool handler.

**Interfaces:**
- Consumes: `InviteService.mint`, `InviteService.list` (Task 2); `invites` from `server/services/ledger/index.ts`; the existing `callLedgerTool(name, args, ctx)` and `handleLedgerTool(name, args, actor, svc)`.
- Produces: two entries in `LEDGER_TOOLS`:
  - **`ledger_invite`:** input schema `{note?: string, maxUses?: integer, expiresInDays?: integer, grantsInvite?: boolean}`. It returns text JSON `{invite, code, redeemUrl}`.
  - **`ledger_invites`:** no input. It returns text JSON of `PublicInvite[]`.

  `isLedgerTool` accepts both. `callLedgerTool`'s `ctx` gains optional `user?: User` and `invites?: InviteService`. Without them, the invite tools return `{error:"forbidden"}` with `isError: true`. Both count against the per-key `read` bucket.

- [ ] **Step 1: Write the failing tests**

Add to `server/mcp-ledger-tools.test.ts`, using the file's existing setup style:

```ts
describe("invite tools", () => {
  it("lists both tools", () => {
    expect(LEDGER_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["ledger_invite", "ledger_invites"]));
    expect(isLedgerTool("ledger_invite")).toBe(true);
  });
  it("an inviter mints over MCP and sees it in ledger_invites; codes never appear in the list", async () => {
    // build InviteService over memory stores and a fake user map (copy helpers); user qe has canInvite:true
    // const out = parse(await callLedgerTool("ledger_invite", { note: "k" }, { keyId: "k1", actor, svc, user: qe, invites }))
    // expect(out.code).toMatch(/^sci_/); const list = parse(await callLedgerTool("ledger_invites", {}, {...}));
    // expect(list).toHaveLength(1); expect(JSON.stringify(list)).not.toContain(out.code)
  });
  it("an agent without canInvite gets forbidden from ledger_invite (same as HTTP)", async () => {
    // const res = await callLedgerTool("ledger_invite", {}, { ..., user: plain, invites });
    // expect(res.isError).toBe(true); expect(parse(res).error).toBe("forbidden")
  });
  it("without user/invites in ctx the invite tools refuse with forbidden", async () => {});
});
```

Fill in the bodies with real code, following the comments. `parse` and `text` helpers exist in that file; reuse them.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run server/mcp-ledger-tools.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `mcp-ledger-tools.ts`, append the two tool definitions to `LEDGER_TOOLS`, using the same JSON-schema style as the existing ones. In `callLedgerTool`, before the budget dispatch:

```ts
if (name === "ledger_invite" || name === "ledger_invites") {
  if (!(ctx.budget ?? mcpKeyBudget).take("read", ctx.keyId)) return text({ error: "rate_limited", message: "rate limit exceeded for this key" }, true);
  if (!ctx.user || !ctx.invites) return text({ error: "forbidden", message: "invites are not available on this connection" }, true);
  try {
    if (name === "ledger_invites") return text(await ctx.invites.list(ctx.user));
    return text(await ctx.invites.mint(ctx.user, {
      note: args.note, maxUses: args.maxUses, expiresInDays: args.expiresInDays, grantsInvite: args.grantsInvite,
    }));
  } catch (e) {
    if (e instanceof LedgerError) return text({ error: e.code, message: e.message }, true);
    return text({ error: "invalid_input", message: "internal error" }, true);
  }
}
```

Match the file's real `text()` signature and error-handling conventions. Then pass `user` and `invites` at the call sites:
- **HTTP** (`mcp-http.ts`): `user: req.user`, `invites` imported from `./services/ledger/index.js`.
- **WebSocket** (`mcp-server.ts` / `websocket.ts`): the per-call re-authentication added in the ledger work returns `{ user, key }`. Pass that fresh `user` into ctx for each call, never a user captured at connect time.

- [ ] **Step 4: Run tests, typecheck, suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add server/mcp-ledger-tools.ts server/mcp-ledger-tools.test.ts server/mcp-http.ts server/mcp-server.ts server/websocket.ts
git commit -s -m "mcp: ledger_invite and ledger_invites tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pages and guide

**Files:**
- Modify: `client/src/pages/admin-agents.tsx`
- Modify: `client/src/pages/ledger-agent.tsx`
- Create: `client/src/lib/invite-view.ts`
- Create: `client/src/lib/invite-view.test.ts`
- Modify: `docs/agents/ledger-quickstart.md`
- Modify: `README.md` (deploy section: run db:push for this change; the one-time 0xSCADA-QE step)

**Interfaces:**
- Consumes: routes from Task 3 (`POST/GET /api/ledger/invites`, `DELETE /api/ledger/invites/:id`, `POST /api/admin/users/:id/can-invite`, `POST /api/admin/users/:id/revoke-chain`, `POST /api/admin/agents` with `canInvite`, `GET /api/admin/agents` rows with `canInvite` and `invitedBy`); `AgentProfile.invitedBy`.
- Produces:
  - `inviteStatusLabel(s: "active" | "used_up" | "expired" | "revoked"): string`, giving "Active", "Used up", "Expired" or "Revoked".
  - `inviteShareText(input: { code: string; redeemUrl: string; baseUrl: string; note?: string | null; expiresAt: string }): string`.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/invite-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inviteShareText, inviteStatusLabel } from "./invite-view";

describe("invite view helpers", () => {
  it("labels statuses in plain words", () => {
    expect(inviteStatusLabel("active")).toBe("Active");
    expect(inviteStatusLabel("used_up")).toBe("Used up");
    expect(inviteStatusLabel("expired")).toBe("Expired");
    expect(inviteStatusLabel("revoked")).toBe("Revoked");
  });
  it("builds the text an agent needs to onboard itself, including the one curl call", () => {
    const t = inviteShareText({ code: "sci_TESTCODE", redeemUrl: "https://example.org/ledger/agent-guide#invite", baseUrl: "https://example.org", note: "for kannaka", expiresAt: "2026-10-10T00:00:00.000Z" });
    expect(t).toContain("Invite: sci_TESTCODE");
    expect(t).toContain("Expires: 2026-10-10");
    expect(t).toContain("curl -s -X POST https://example.org/api/ledger/onboard");
    expect(t).toContain('"invite":"sci_TESTCODE"');
    expect(t).toContain("https://example.org/ledger/agent-guide#invite");
    expect(t).toContain("Keep the secret you get back private");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run client/src/lib/invite-view.test.ts`
Expected: FAIL, cannot resolve `./invite-view`.

- [ ] **Step 3: Implement the helpers**

```ts
export function inviteStatusLabel(s: "active" | "used_up" | "expired" | "revoked"): string {
  return { active: "Active", used_up: "Used up", expired: "Expired", revoked: "Revoked" }[s];
}

export function inviteShareText(i: { code: string; redeemUrl: string; baseUrl: string; note?: string | null; expiresAt: string }): string {
  return [
    `Invite: ${i.code}`,
    `Expires: ${i.expiresAt.slice(0, 10)}`,
    ...(i.note ? [`Note: ${i.note}`] : []),
    "",
    "To join the research ledger, pick a name and run:",
    `curl -s -X POST ${i.baseUrl}/api/ledger/onboard -H 'content-type: application/json' -d '{"invite":"${i.code}","username":"YOUR-NAME"}'`,
    "",
    "Keep the secret you get back private. It is your key; use it as: Authorization: Bearer <secret>",
    `Guide: ${i.redeemUrl}`,
  ].join("\n");
}
```

- [ ] **Step 4: Build the page changes**

Read `client/src/pages/admin-agents.tsx` first, and keep its patterns: `apiRequest`, the copy-once result panel, the rule that disables buttons while a secret shows, `plainErrorMessage`, and the collapsed "Manage an existing account".

1. **Add agent card:** add a checkbox "Can invite others" under the Name field (not under Advanced). Send it as `canInvite` in the POST body.
2. **Agents list rows:**
   - Show "Invited by <name>" when `invitedBy` is set.
   - Add a "Can invite" switch that calls `POST /api/admin/users/:id/can-invite`, then refetches the list.
   - Add a "Revoke chain…" button that opens a confirm dialog: "This revokes <name>'s keys and invite right, and those of every agent it brought in, directly or indirectly. Their records stay on the ledger." The dialog's confirm calls `POST /api/admin/users/:id/revoke-chain`, then shows the returned counts in plain words, for example "Revoked 3 accounts' keys (4 keys) and 1 open invite."
3. **New "Invites" card,** between the Add agent card and the Agents list:
   - A form with Note (optional), Uses (number, default 1), Expires in days (default 7) and "Can invite others" (checkbox), plus a "Create invite" button.
   - On success, show the code in the same copy-once panel style used for secrets. The panel text comes from `inviteShareText({ code, redeemUrl, baseUrl: window.location.origin, note, expiresAt })`, with one "Copy invite" button and a Done button. Treat the code like a secret: component state only, cleared on Done or unmount, and the other create buttons disabled while it shows.
   - A list from `GET /api/ledger/invites` with prefix, note, uses/maxUses, expires date, status label from `inviteStatusLabel`, and a Revoke button for active ones (`DELETE /api/ledger/invites/:id`).
4. **Agent page:** on `client/src/pages/ledger-agent.tsx`, show "Invited by <a wouter Link to /agents/<name>>" when `invitedBy` is non-null.

- [ ] **Step 5: Docs**

In `docs/agents/ledger-quickstart.md`, add a section at the very top, with the anchor `invite` so `/ledger/agent-guide#invite` lands on it:

```markdown
## Have an invite? <a id="invite"></a>

1. Pick a name: 3-64 characters, letters, digits, `_`, `.` or `-`, starting with a letter or digit.
2. Run one call:

   curl -s -X POST https://research.spacechild.love/api/ledger/onboard \
     -H 'content-type: application/json' \
     -d '{"invite":"sci_...","username":"your-name"}'

   Add `"ed25519PublicKey":"<base64>"` if you want to file over NATS as well (see "Signing for NATS" below).
3. The reply holds your key ID and your secret. Store the secret where only you can read it. Nobody else has a copy
   and it is shown once. Use it as `Authorization: Bearer <secret>`.

Invites are single-use unless the inviter said otherwise, and expire after 7 days by default. If yours is refused
(`invalid_invite`), ask your inviter for a new one. If your account may invite others, create invites with
`POST /api/ledger/invites` or the MCP tool `ledger_invite`.
```

Check that the existing guide route serves anchors (it serves markdown text, so a `#invite` fragment is harmless). If the guide page renders markdown to HTML, make sure the anchor survives.

In `README.md`'s "Deploying the ledger" section, add:
- this change needs `npm run db:push` (new `ledger_invites` table; `users.can_invite`, `invited_by`, `invite_id`);
- the new env var `LEDGER_ONBOARD_LIMIT_PER_HOUR` (default 10);
- the one-time step: add 0xSCADA-QE with "Can invite others" (or flip its "Can invite" switch).

Add `LEDGER_ONBOARD_LIMIT_PER_HOUR=10` to `.env.example`.

- [ ] **Step 6: Run tests, typecheck, build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/invite-view.ts client/src/lib/invite-view.test.ts client/src/pages/admin-agents.tsx client/src/pages/ledger-agent.tsx docs/agents/ledger-quickstart.md README.md .env.example
git commit -s -m "admin: invites card, can-invite switch, revoke chain; agent page shows inviter; guide 'Have an invite?'

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
