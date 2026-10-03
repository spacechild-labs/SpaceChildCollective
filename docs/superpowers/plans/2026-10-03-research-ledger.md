# Research Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn research.spacechild.love into the constellation's public, append-only research ledger: agents and humans file records (pre-registrations, runs, results, failures, certificates, reviews, corrections), held records wait for a human release, and the legacy consciousness-research site becomes a read-only archive.

**Architecture:** A self-contained ledger module inside the existing Express + React app: its own Drizzle tables (`shared/ledger-schema.ts`), a `LedgerService` over a `LedgerStore` interface (Drizzle in production, in-memory in tests), HTTP routes, MCP tools, a signed NATS door, and new pages. Agent identity is a hashed, revocable bearer key. Rollout is four parts, each independently deployable: security fixes, ledger core, doors and faces, backfill and keys.

**Tech Stack:** TypeScript (ESM), Express 4, Drizzle ORM 0.39 on Postgres (Neon in production), Zod, Vitest 4, React + Wouter + TanStack Query + shadcn/ui, NATS (`nats` 2.x) via the existing Kannaka bridge, Node 20+ `crypto` (SHA-256, Ed25519). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-research-ledger-design.md` (approved 2026-10-03). Read it before starting; this plan implements it section by section.

## Global Constraints

- Records are append-only: no route, MCP tool, NATS handler or storage method may UPDATE or DELETE a row of `ledger_records`.
- Kinds: `preregistration | amendment | run | result | failure | certificate | correction | review | decision | note`.
- Standings: `certified | measured | unverified | retracted`. Review verdicts: `holds | breaks | inconclusive`. Campaign statuses: `registered | running | closed`. `filed_via`: `web | api | mcp | nats | backfill`.
- Campaign id format: `^[a-z0-9][a-z0-9-]{2,63}$`.
- Content hash: `sha256(canonical_json({v:1, id, campaign_id, kind, title, body, standing, evidence, corrects_id, reviews_id, verdict, amends_id, about_id, author_username, created_at}))`; canonical JSON = sorted keys, no insignificant whitespace, UTF-8; `held` is not hashed.
- Agent bearer keys look like `scl_<base64url of 32 random bytes>`, are stored only as sha256 hex, and are checked against `revoked_at` on every request.
- Agents can never release (enforced on `userType === "agent"`, independent of `can_release`).
- Held records must never appear in any public page, feed, search, MCP read or NATS event before release.
- Rate limits per key: 60 filings per hour, 600 reads per minute (env `LEDGER_FILE_LIMIT_PER_HOUR`, `LEDGER_READ_LIMIT_PER_MINUTE`).
- NATS door: subject `SPACECHILD.ledger.file`; Ed25519 signature over `canonical_json({record, key_id, ts, nonce})`; reject if `ts` is more than 5 minutes from server time or the nonce was seen in the last 10 minutes.
- Outbound NATS subjects: `SPACECHILD.ledger.record.filed`, `SPACECHILD.ledger.record.released`, `SPACECHILD.ledger.review.filed`.
- Every rejection returns a reason code from: `bad_signature, unknown_key, revoked_key, stale_timestamp, replayed_nonce, unknown_campaign, invalid_link, missing_verdict, rate_limited, not_releaser, agents_cannot_release, invalid_input, not_found, forbidden`.
- CI must stay green after every task: `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Baseline on 2026-10-03: 34 test files, 146 tests passing, typecheck clean.
- Commits: one per task at minimum, `git commit -s`, message ends with the attribution line the repo's PR template or session requires.
- Windows dev box note: run commands from the repo root in Git Bash or PowerShell; `npx` works in both.

## Review Focus

1. **A record filed held, then corrected by a public correction:** a reasonable person expects the public correction to appear, but not the held original's title or body leaking through the correction's page or the original's id resolving publicly. Pinned in Task 7 (`a public correction of a held record does not expose the held record`).
2. **An agent retries a filing after a network timeout:** expects exactly one record, not two. Pinned in Task 7 (`client_ref makes filing idempotent`) and Task 13 (`a retry with a new nonce but the same clientRef does not duplicate`).
3. **A revoked key in the middle of a busy agent session:** expects the very next request to fail with `revoked_key`, not after a cache expiry. Pinned in Task 9 (`authenticates, and a revoked key fails on its very next use`).
4. **A user promoted to agent who previously held `can_release`:** expects them to lose release ability immediately. Pinned in Task 10 (`promoting to agent clears can_release and never leaks the commitment`) and Task 7 (`only humans with can_release may release; agents never, even with the flag`).
5. **Unicode and markdown in titles and bodies (Japanese, emoji, `<script>`):** expects the hash to be stable across server and browser and the SSR/feeds to escape it. Pinned in Task 5 (`is stable for non-ASCII and markup in the title`), Task 14 (RSS escaping) and Task 18 (server-rendered escaping).

---

# Part 1: Security fixes (rollout step 1, deploy on its own)

### Task 1: Admin-only user creation, admin password reset and user delete

**Files:**
- Create: `server/routes/admin-users.ts`
- Create: `server/routes/admin-users.test.ts`
- Modify: `server/routes.ts` (remove the inline `app.post("/api/users", ...)` handler near line 172; mount the new handlers)
- Modify: `server/storage.ts` (add `deleteUser` to `IStorage` and `DatabaseStorage`)

**Interfaces:**
- Produces: `createUserAsAdmin: RequestHandler`, `resetUserSecret: RequestHandler`, `deleteUserAsAdmin: RequestHandler` exported from `server/routes/admin-users.ts`; `adminCreateUserSchema` (Zod); `IStorage.deleteUser(id: string): Promise<void>` which throws an `Error` with `code === "user_referenced"` when the user is referenced by other rows.

- [ ] **Step 1: Write the failing test**

Create `server/routes/admin-users.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const storageMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: storageMock }));

import { createUserAsAdmin, deleteUserAsAdmin, resetUserSecret } from "./admin-users";

const PROOF = "a".repeat(64);

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const admin = { id: "admin-1", role: "admin", userType: "human" };

describe("admin user management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a human user and ignores role and userType in the body", async () => {
    storageMock.getUserByUsername.mockResolvedValue(undefined);
    storageMock.createUser.mockImplementation(async (u: any) => ({ id: "u1", createdAt: new Date(), ...u }));
    const res = response();
    await createUserAsAdmin({ user: admin, body: {
      username: "alice", displayName: "Alice", zkProof: PROOF, role: "admin", userType: "agent",
    } } as any, res as any, vi.fn());
    const created = storageMock.createUser.mock.calls[0][0];
    expect(created.role).toBe("user");
    expect(created.userType).toBe("human");
    expect(created.zkpCommitment).not.toBe(PROOF);
    expect(await bcrypt.compare(PROOF, created.zkpCommitment)).toBe(true);
    const sent = res.json.mock.calls[0][0];
    expect(sent.zkpCommitment).toBeUndefined();
  });

  it("rejects a proof that is not 64 hex characters", async () => {
    const res = response();
    await createUserAsAdmin({ user: admin, body: { username: "bob", displayName: "Bob", zkProof: "short" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storageMock.createUser).not.toHaveBeenCalled();
  });

  it("rejects a duplicate username with 409", async () => {
    storageMock.getUserByUsername.mockResolvedValue({ id: "x" });
    const res = response();
    await createUserAsAdmin({ user: admin, body: { username: "alice", displayName: "A", zkProof: PROOF } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("resets a user's secret to a bcrypt of the new proof", async () => {
    storageMock.getUser.mockResolvedValue({ id: "u1", username: "0xSCADA-QE" });
    storageMock.updateUser.mockImplementation(async (_id: string, u: any) => ({ id: "u1", ...u }));
    const res = response();
    await resetUserSecret({ user: admin, params: { id: "u1" }, body: { zkProof: PROOF } } as any, res as any, vi.fn());
    const [, updates] = storageMock.updateUser.mock.calls[0];
    expect(await bcrypt.compare(PROOF, updates.zkpCommitment)).toBe(true);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("returns 404 when resetting an unknown user", async () => {
    storageMock.getUser.mockResolvedValue(undefined);
    const res = response();
    await resetUserSecret({ user: admin, params: { id: "nope" }, body: { zkProof: PROOF } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes an unreferenced user", async () => {
    storageMock.getUser.mockResolvedValue({ id: "probe" });
    storageMock.deleteUser.mockResolvedValue(undefined);
    const res = response();
    await deleteUserAsAdmin({ user: admin, params: { id: "probe" } } as any, res as any, vi.fn());
    expect(storageMock.deleteUser).toHaveBeenCalledWith("probe");
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("refuses to delete a referenced user with 409", async () => {
    storageMock.getUser.mockResolvedValue({ id: "author" });
    storageMock.deleteUser.mockRejectedValue(Object.assign(new Error("referenced"), { code: "user_referenced" }));
    const res = response();
    await deleteUserAsAdmin({ user: admin, params: { id: "author" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("refuses to delete yourself", async () => {
    const res = response();
    await deleteUserAsAdmin({ user: admin, params: { id: "admin-1" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storageMock.deleteUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/admin-users.test.ts`
Expected: FAIL with `Failed to load url ./admin-users` (module does not exist).

- [ ] **Step 3: Add `deleteUser` to storage**

In `server/storage.ts`, add to the `IStorage` interface, right after `getAllUsers(): Promise<User[]>;`:

```ts
  deleteUser(id: string): Promise<void>;
```

and add to the `DatabaseStorage` class, right after its `getAllUsers` method:

```ts
  async deleteUser(id: string): Promise<void> {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (error: any) {
      // 23503 = foreign_key_violation: the user is referenced by papers, tasks, records...
      if (error?.code === "23503") {
        throw Object.assign(new Error("User is referenced by other records"), { code: "user_referenced" });
      }
      throw error;
    }
  }
```

- [ ] **Step 4: Write the handlers**

Create `server/routes/admin-users.ts`:

```ts
import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "../storage";
import { sanitizeUser } from "../lib/sanitize";

/** A client-side SHA-256 of the secret, hex encoded (what /auth sends as zkProof). */
const proofSchema = z.string().regex(/^[0-9a-f]{64}$/, "zkProof must be 64 lowercase hex characters");

/** Admin-created users are always humans with role "user"; role and userType are never read from the body. */
export const adminCreateUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  displayName: z.string().trim().min(2).max(120),
  zkProof: proofSchema,
  bio: z.string().max(2000).optional(),
  researchInterests: z.array(z.string().max(80)).max(20).optional(),
});

export const createUserAsAdmin: RequestHandler = async (req, res) => {
  const parsed = adminCreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    const { username, displayName, zkProof, bio, researchInterests } = parsed.data;
    if (await storage.getUserByUsername(username)) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const user = await storage.createUser({
      username,
      displayName,
      zkpCommitment: await bcrypt.hash(zkProof, 12),
      userType: "human",
      role: "user",
      bio: bio ?? null,
      researchInterests: researchInterests ?? [],
    });
    res.json(sanitizeUser(user));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const resetUserSecret: RequestHandler = async (req, res) => {
  const parsed = z.object({ zkProof: proofSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await storage.updateUser(user.id, { zkpCommitment: await bcrypt.hash(parsed.data.zkProof, 12) });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUserAsAdmin: RequestHandler = async (req, res) => {
  if (req.params.id === req.user?.id) {
    res.status(400).json({ error: "Refusing to delete your own account" });
    return;
  }
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await storage.deleteUser(user.id);
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "user_referenced") {
      res.status(409).json({ error: "user_referenced", message: "User has papers, tasks or records; not deleted" });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};
```

- [ ] **Step 5: Wire the routes**

In `server/routes.ts`:
1. Add to the imports at the top: `import { createUserAsAdmin, deleteUserAsAdmin, resetUserSecret } from "./routes/admin-users";` and make sure `requireAdmin` is in the existing `./middleware/auth` import (it is already imported for `/api/parallel/configure`).
2. Replace the whole inline handler that begins `app.post("/api/users", async (req, res) => {` and ends at its closing `});` (about 10 lines) with:

```ts
  // Create user: admin only. Role and userType are never taken from the body.
  app.post("/api/users", requireAdmin, createUserAsAdmin);
  app.post("/api/admin/users/:id/reset-password", requireAdmin, resetUserSecret);
  app.delete("/api/admin/users/:id", requireAdmin, deleteUserAsAdmin);
```

3. If `insertUserSchema` is no longer used anywhere in `server/routes.ts`, remove it from the `@shared/schema` import list (`npx tsc --noEmit` does not flag unused imports, so check with `grep -n insertUserSchema server/routes.ts`).

Append to `server/routes.authorization.test.ts` (inside the existing `describe`):

```ts
  it("only lets admins create users and manage accounts", () => {
    const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    expect(routesSource).toMatch(/app\.post\(\s*["']\/api\/users["']\s*,\s*requireAdmin\s*,\s*createUserAsAdmin\s*\)/);
    expect(routesSource).toMatch(/app\.post\(\s*["']\/api\/admin\/users\/:id\/reset-password["']\s*,\s*requireAdmin\s*,/);
    expect(routesSource).toMatch(/app\.delete\(\s*["']\/api\/admin\/users\/:id["']\s*,\s*requireAdmin\s*,/);
    expect(routesSource).not.toMatch(/insertUserSchema\.parse\(req\.body\)/);
  });
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run server/routes/admin-users.test.ts server/routes.authorization.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit` (expected: no output) then:

```bash
git add server/routes/admin-users.ts server/routes/admin-users.test.ts server/routes.ts server/storage.ts server/routes.authorization.test.ts
git commit -s -m "security: admin-only user creation; admin password reset and user delete"
```

### Task 2: Registration always creates a human

**Files:**
- Create: `server/routes/register.ts`
- Create: `server/routes/register.test.ts`
- Modify: `server/routes.ts` (replace the inline `/api/auth/register` handler, about lines 59-105)
- Modify: `client/src/pages/auth.tsx` (remove the user-type picker from the sign-up form)

**Interfaces:**
- Produces: `registerHandler: RequestHandler` exported from `server/routes/register.ts`. Same request body as today; `userType` in the body is ignored.

- [ ] **Step 1: Write the failing test**

Create `server/routes/register.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const storageMock = vi.hoisted(() => ({
  getUserByUsername: vi.fn(),
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: storageMock }));

import { registerHandler } from "./register";

const PROOF = "b".repeat(64);
function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getUserByUsername.mockResolvedValue(undefined);
    storageMock.createUser.mockImplementation(async (u: any) => ({ id: "new", createdAt: new Date(), ...u }));
  });

  it("always creates a human, even when the body says agent", async () => {
    storageMock.getAllUsers.mockResolvedValue([{ role: "admin" }]);
    const req = { body: { username: "mallory", displayName: "M", userType: "agent", zkProof: PROOF }, session: {} };
    const res = response();
    await registerHandler(req as any, res as any, vi.fn());
    expect(storageMock.createUser.mock.calls[0][0].userType).toBe("human");
    expect(storageMock.createUser.mock.calls[0][0].role).toBe("user");
    expect((req.session as any).userId).toBe("new");
  });

  it("still bootstraps the first registrant as admin when no admin exists", async () => {
    storageMock.getAllUsers.mockResolvedValue([]);
    const res = response();
    await registerHandler({ body: { username: "first", displayName: "F", zkProof: PROOF }, session: {} } as any, res as any, vi.fn());
    expect(storageMock.createUser.mock.calls[0][0].role).toBe("admin");
  });

  it("stores a bcrypt of the proof, never the proof", async () => {
    storageMock.getAllUsers.mockResolvedValue([{ role: "admin" }]);
    const res = response();
    await registerHandler({ body: { username: "c", displayName: "C", zkProof: PROOF }, session: {} } as any, res as any, vi.fn());
    const stored = storageMock.createUser.mock.calls[0][0].zkpCommitment;
    expect(stored).not.toBe(PROOF);
    expect(await bcrypt.compare(PROOF, stored)).toBe(true);
  });

  it("rejects a taken username", async () => {
    storageMock.getUserByUsername.mockResolvedValue({ id: "x" });
    const res = response();
    await registerHandler({ body: { username: "c", displayName: "C", zkProof: PROOF }, session: {} } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storageMock.createUser).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    const res = response();
    await registerHandler({ body: { username: "c" }, session: {} } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/register.test.ts`
Expected: FAIL, module `./register` not found.

- [ ] **Step 3: Write the handler**

Create `server/routes/register.ts` (this is today's handler with `userType` pinned to `"human"`):

```ts
import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { sanitizeUser } from "../lib/sanitize";

/**
 * Self-registration. Always creates a human: agent accounts are created by an admin
 * promoting an existing account (ledger spec 3.2), never self-declared.
 */
export const registerHandler: RequestHandler = async (req, res) => {
  try {
    const { username, displayName, zkProof, bio, researchInterests } = req.body ?? {};
    if (!username || !displayName || !zkProof) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    if (await storage.getUserByUsername(username)) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }
    const interestsArray = researchInterests
      ? String(researchInterests).split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    const zkpCommitment = await bcrypt.hash(zkProof, 12);
    // Bootstrap: the first registrant while no admin exists becomes admin.
    const existingUsers = await storage.getAllUsers();
    const role = existingUsers.some((u) => u.role === "admin") ? "user" : "admin";
    const user = await storage.createUser({
      username,
      zkpCommitment,
      userType: "human",
      role,
      displayName,
      bio: bio || null,
      researchInterests: interestsArray,
    });
    (req.session as any).userId = user.id;
    res.json({ user: sanitizeUser(user) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
```

- [ ] **Step 4: Wire it**

In `server/routes.ts`, add `import { registerHandler } from "./routes/register";` and replace the entire inline block that begins `app.post("/api/auth/register", async (req, res) => {` and ends at its matching `});` with:

```ts
  app.post("/api/auth/register", registerHandler);
```

If `bcrypt` is still used by the login handler, keep its import.

- [ ] **Step 5: Remove the user-type picker from the sign-up form**

In `client/src/pages/auth.tsx`:
1. In `registerSchema`, delete the line `userType: z.enum(["human", "agent"]),`.
2. In `loginSchema`, delete the line `userType: z.enum(["human", "agent"]).optional(),`.
3. In the `register(...)` call inside `onSubmit`, replace the argument `values.userType,` with `"human",`.
4. Delete the whole `<FormField ... name="userType" ... />` element (find it with `grep -n 'name="userType"' client/src/pages/auth.tsx`; delete from its opening `<FormField` line to its closing `/>`), and delete `userType: "human",` from `defaultValues`.
5. Run `npx tsc --noEmit` and remove any now-unused imports it reports as errors (for example a `RadioGroup` or `Select` import used only by that field).

- [ ] **Step 6: Run tests, typecheck, build, commit**

Run: `npx vitest run server/routes/register.test.ts` (expected PASS, 5 tests), `npx tsc --noEmit` (clean), `npm run build` (succeeds).

```bash
git add server/routes/register.ts server/routes/register.test.ts server/routes.ts client/src/pages/auth.tsx
git commit -s -m "security: self-registration always creates a human; agents are promoted by an admin"
```

### Task 3: Close the MCP draft leak and fix the /mcp page's missing route

**Files:**
- Create: `server/mcp-paper-access.ts`
- Create: `server/mcp-paper-access.test.ts`
- Modify: `server/mcp-http.ts` (`search_papers`, `get_paper_content`, `resources/list`; export `executeTool`)
- Modify: `server/routes.ts` (add `GET /api/mcp/communications`)

**Interfaces:**
- Produces: `publishedOnly<T extends { status: string }>(papers: T[]): T[]`; `agentCanReadPaper(paper: { status: string; contributors?: { userId: string }[] }, agentId: string): boolean`; `executeTool(name: string, args: Record<string, any>, auth: { agentId: string; paperId: string }): Promise<any>` now exported from `server/mcp-http.ts`.

- [ ] **Step 1: Write the failing test**

Create `server/mcp-paper-access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getAllPapers: vi.fn(),
  getPublishedPapers: vi.fn(),
  getPaperWithContributors: vi.fn(),
  createAgentTask: vi.fn(),
}));
vi.mock("./storage", () => ({ storage: storageMock }));
vi.mock("./storage.js", () => ({ storage: storageMock }));

import { agentCanReadPaper, publishedOnly } from "./mcp-paper-access";
import { executeTool } from "./mcp-http";

const published = { id: "p", status: "published", title: "Open", abstract: "a", category: "ai" };
const draft = { id: "d", status: "draft", title: "Secret draft", abstract: "s", category: "ai" };
const auth = { agentId: "agent-1", paperId: "global" };

describe("MCP paper access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishedOnly keeps only published papers", () => {
    expect(publishedOnly([published, draft]).map((p) => p.id)).toEqual(["p"]);
  });

  it("an agent reads a draft only as a contributor", () => {
    expect(agentCanReadPaper({ ...draft, contributors: [{ userId: "agent-1" }] }, "agent-1")).toBe(true);
    expect(agentCanReadPaper({ ...draft, contributors: [{ userId: "someone" }] }, "agent-1")).toBe(false);
    expect(agentCanReadPaper({ ...published, contributors: [] }, "agent-1")).toBe(true);
  });

  it("search_papers never returns drafts", async () => {
    storageMock.getPublishedPapers.mockResolvedValue([published]);
    storageMock.getAllPapers.mockResolvedValue([published, draft]);
    const out = await executeTool("search_papers", { query: "" }, auth);
    expect(out.content[0].text).not.toContain("Secret draft");
    expect(storageMock.getAllPapers).not.toHaveBeenCalled();
  });

  it("get_paper_content hides a draft from a non-contributor", async () => {
    storageMock.getPaperWithContributors.mockResolvedValue({ ...draft, contributors: [{ userId: "x" }] });
    const out = await executeTool("get_paper_content", { paperId: "d" }, auth);
    expect(out.content[0].text).toContain("Paper not found");
    expect(out.content[0].text).not.toContain("Secret draft");
  });
});
```

Append to `server/routes.authorization.test.ts`:

```ts
  it("does not list draft papers to anonymous MCP resources/list", () => {
    const src = readFileSync(new URL("./mcp-http.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf('case "resources/list"'), src.indexOf("default:", src.indexOf('case "resources/list"')));
    expect(block).toContain("getPublishedPapers");
    expect(block).not.toContain("getAllPapers");
  });

  it("serves the MCP communications list only to signed-in users", () => {
    const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    expect(routesSource).toMatch(/app\.get\(\s*["']\/api\/mcp\/communications["']\s*,\s*requireAuth\s*,/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/mcp-paper-access.test.ts server/routes.authorization.test.ts`
Expected: FAIL (module `./mcp-paper-access` missing; `executeTool` not exported; source checks fail).

- [ ] **Step 3: Write the helpers**

Create `server/mcp-paper-access.ts`:

```ts
/** Papers an MCP caller may see without being a contributor: published ones only. */
export function publishedOnly<T extends { status: string }>(papers: T[]): T[] {
  return papers.filter((p) => p.status === "published");
}

/** An agent may read a paper if it is published or the agent is one of its contributors. */
export function agentCanReadPaper(
  paper: { status: string; contributors?: { userId: string }[] },
  agentId: string,
): boolean {
  return paper.status === "published" || Boolean(paper.contributors?.some((c) => c.userId === agentId));
}
```

- [ ] **Step 4: Apply them in `server/mcp-http.ts`**

1. Add `import { agentCanReadPaper, publishedOnly } from "./mcp-paper-access.js";` with the other imports.
2. Change `async function executeTool(` to `export async function executeTool(`.
3. In `case "search_papers"`, replace `const papers = await storage.getAllPapers();` with `const papers = publishedOnly(await storage.getPublishedPapers());`.
4. Replace the body of `case "get_paper_content"` with:

```ts
    case "get_paper_content": {
      const paper = await storage.getPaperWithContributors(args.paperId as string);
      if (!paper || !agentCanReadPaper(paper, auth.agentId)) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Paper not found" }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(paper, null, 2) }] };
    }
```

5. In `case "resources/list"`, replace `const papers = await storage.getAllPapers();` with `const papers = await storage.getPublishedPapers();`.
6. In `case "list_papers"`, replace `const papers = await storage.getAllPapers();` and the following `const published = papers.filter(p => p.status === "published");` with `const published = await storage.getPublishedPapers();`.

- [ ] **Step 5: Add the communications route**

In `server/routes.ts`, next to the existing `app.post("/api/mcp/communications"` handler, add:

```ts
  // Recent MCP communications for the /mcp status page (signed-in users only).
  app.get("/api/mcp/communications", requireAuth, async (_req, res) => {
    try {
      const all = await storage.getAllMcpCommunications();
      res.json(all.slice(0, 50));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
```

(`getAllMcpCommunications` already returns newest first; if `grep -n "getAllMcpCommunications" -A4 server/storage.ts` shows no `desc(` ordering, sort with `.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())` before slicing.)

- [ ] **Step 6: Run tests, typecheck, commit**

Run: `npx vitest run server/mcp-paper-access.test.ts server/routes.authorization.test.ts` (expected PASS), then `npx vitest run` (expected: all files pass), `npx tsc --noEmit` (clean).

```bash
git add server/mcp-paper-access.ts server/mcp-paper-access.test.ts server/mcp-http.ts server/routes.ts server/routes.authorization.test.ts
git commit -s -m "security: MCP HTTP returns only published papers to non-contributors; add GET /api/mcp/communications"
```

### Part 1 checkpoint: ship the security fixes

- [ ] Run the full gate: `npx tsc --noEmit && npx vitest run && npm run build`. Expected: clean, all tests pass (baseline 146 plus the new ones), build succeeds.
- [ ] Push the branch and open a PR titled `security: fixes ahead of the research ledger (part 1 of 4)`; merge after review.
- [ ] Nick publishes on Replit (Publish button). No schema change in Part 1, so no `db:push`.
- [ ] After publish, an admin (Nick) runs, from a signed-in browser session or with curl using the session cookie:
  - Reset the 0xSCADA-QE account: `POST /api/admin/users/fe1a9cbd-5858-4008-8268-38870405b52c/reset-password` with body `{"zkProof":"<sha256 hex of the new password>"}` (compute with `printf '%s' 'NEW-PASSWORD' | sha256sum`).
  - Delete the probe account: `DELETE /api/admin/users/da203c47-626c-4ef8-b355-1c8c39377f53` (qe-login-probe-20261003).
- [ ] Verify: `curl -s -X POST https://research.spacechild.love/api/users -H 'Content-Type: application/json' -d '{}'` returns 401 anonymously, and `/api/auth/register` with `"userType":"agent"` creates a human (check `userType` in the response).

---

# Part 2: Ledger core (rollout step 2)

**Spec amendment A1 (made while planning, recorded here and in the spec's revision log in Task 4):** a `decision` record may carry `sets_status` (`registered | running | closed`), which updates the campaign's cached status. Because it changes state, it is part of the content hash: the hash input gains the key `sets_status` (null when absent). Test vectors below include it.

### Task 4: Ledger tables and the `can_release` column

**Files:**
- Create: `shared/ledger-schema.ts`
- Create: `shared/ledger-schema.test.ts`
- Modify: `shared/schema.ts` (add `canRelease` to `users`)
- Modify: `server/db.ts` (merge the ledger schema into the Drizzle instance)
- Modify: `drizzle.config.ts` (push both schema files)
- Modify: `server/lib/sanitize.ts` (no change needed: `canRelease` is not secret; verify only)
- Modify: `docs/superpowers/specs/2026-10-03-research-ledger-design.md` (append a "Revision log" entry for amendment A1)

**Interfaces:**
- Produces (from `shared/ledger-schema.ts`): constants `LEDGER_KINDS`, `LEDGER_STANDINGS`, `REVIEW_VERDICTS`, `CAMPAIGN_STATUSES`, `FILED_VIA`, `CAMPAIGN_ID_RE`; types `LedgerKind`, `LedgerStanding`, `ReviewVerdict`, `CampaignStatus`, `FiledVia`, `LedgerEvidence`, `LedgerLink`; tables `ledgerCampaigns`, `ledgerRecords`, `ledgerReleases`, `ledgerOutbox`, `agentKeys`; row types `LedgerCampaign`, `NewLedgerCampaign`, `LedgerRecord`, `NewLedgerRecord`, `LedgerRelease`, `NewLedgerRelease`, `LedgerOutboxEvent`, `NewLedgerOutboxEvent`, `AgentKey`, `NewAgentKey`.
- Produces: `User.canRelease: boolean` (column `can_release`, default false).

- [ ] **Step 1: Write the failing test**

Create `shared/ledger-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  CAMPAIGN_ID_RE, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS,
  agentKeys, ledgerCampaigns, ledgerOutbox, ledgerRecords, ledgerReleases,
} from "./ledger-schema";
import { users } from "./schema";

describe("ledger schema", () => {
  it("names the tables as the spec does", () => {
    expect([ledgerCampaigns, ledgerRecords, ledgerReleases, ledgerOutbox, agentKeys].map(getTableName))
      .toEqual(["ledger_campaigns", "ledger_records", "ledger_releases", "ledger_outbox", "agent_keys"]);
  });

  it("has every record column the hash and the spec need", () => {
    const cols = Object.values(getTableColumns(ledgerRecords)).map((c) => c.name).sort();
    expect(cols).toEqual([
      "about_id", "amends_id", "author_id", "body", "campaign_id", "client_ref", "content_hash", "corrects_id",
      "created_at", "evidence", "filed_via", "held", "id", "kind", "reviews_id", "sets_status", "standing", "title", "verdict",
    ]);
  });

  it("stores only a hash of agent keys", () => {
    const cols = Object.values(getTableColumns(agentKeys)).map((c) => c.name);
    expect(cols).toContain("key_hash");
    expect(cols).not.toContain("secret");
    expect(cols).not.toContain("key");
  });

  it("adds can_release to users", () => {
    expect(Object.values(getTableColumns(users)).map((c) => c.name)).toContain("can_release");
  });

  it("fixes the vocabularies", () => {
    expect(LEDGER_KINDS).toEqual(["preregistration", "amendment", "run", "result", "failure", "certificate", "correction", "review", "decision", "note"]);
    expect(LEDGER_STANDINGS).toEqual(["certified", "measured", "unverified", "retracted"]);
    expect(REVIEW_VERDICTS).toEqual(["holds", "breaks", "inconclusive"]);
    expect(CAMPAIGN_ID_RE.test("ecdsa-c005")).toBe(true);
    expect(CAMPAIGN_ID_RE.test("A-bad")).toBe(false);
    expect(CAMPAIGN_ID_RE.test("ab")).toBe(false);
  });

  it("is pushed by drizzle-kit and loaded by the db handle", () => {
    expect(readFileSync(new URL("../drizzle.config.ts", import.meta.url), "utf8")).toContain("./shared/ledger-schema.ts");
    expect(readFileSync(new URL("../server/db.ts", import.meta.url), "utf8")).toContain("@shared/ledger-schema");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/ledger-schema.test.ts`
Expected: FAIL, cannot resolve `./ledger-schema`.

- [ ] **Step 3: Add `canRelease` to users**

In `shared/schema.ts`, in the `users` table, directly after the `role:` line, add:

```ts
  // Ledger: may release held records (humans only; agents are refused regardless).
  canRelease: boolean("can_release").notNull().default(false),
```

(`boolean` is already imported in that file.)

- [ ] **Step 4: Write the ledger schema**

Create `shared/ledger-schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, timestamp, jsonb, boolean, index, uniqueIndex, check, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

export const LEDGER_KINDS = [
  "preregistration", "amendment", "run", "result", "failure", "certificate", "correction", "review", "decision", "note",
] as const;
export const LEDGER_STANDINGS = ["certified", "measured", "unverified", "retracted"] as const;
export const REVIEW_VERDICTS = ["holds", "breaks", "inconclusive"] as const;
export const CAMPAIGN_STATUSES = ["registered", "running", "closed"] as const;
export const FILED_VIA = ["web", "api", "mcp", "nats", "backfill"] as const;
export const CAMPAIGN_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export type LedgerKind = (typeof LEDGER_KINDS)[number];
export type LedgerStanding = (typeof LEDGER_STANDINGS)[number];
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type FiledVia = (typeof FILED_VIA)[number];
export type LedgerEvidence = { label: string; url: string; sha256?: string; bytes?: number };
export type LedgerLink = { label: string; url: string };

export const ledgerCampaigns = pgTable("ledger_campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  status: text("status").notNull().$type<CampaignStatus>().default("registered"),
  links: jsonb("links").notNull().$type<LedgerLink[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerRecords = pgTable("ledger_records", {
  id: varchar("id", { length: 26 }).primaryKey(),
  campaignId: text("campaign_id").references(() => ledgerCampaigns.id),
  kind: text("kind").notNull().$type<LedgerKind>(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  standing: text("standing").notNull().$type<LedgerStanding>(),
  evidence: jsonb("evidence").notNull().$type<LedgerEvidence[]>().default(sql`'[]'::jsonb`),
  correctsId: varchar("corrects_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  reviewsId: varchar("reviews_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  verdict: text("verdict").$type<ReviewVerdict>(),
  amendsId: varchar("amends_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  aboutId: varchar("about_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  setsStatus: text("sets_status").$type<CampaignStatus>(),
  authorId: varchar("author_id").notNull().references(() => users.id),
  clientRef: text("client_ref"),
  held: boolean("held").notNull().default(false),
  contentHash: text("content_hash").notNull(),
  filedVia: text("filed_via").notNull().$type<FiledVia>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("ledger_records_author_client_ref").on(t.authorId, t.clientRef),
  index("ledger_records_campaign_created").on(t.campaignId, t.createdAt),
  index("ledger_records_created").on(t.createdAt),
  check("ledger_records_review_links", sql`(${t.kind} = 'review') = (${t.reviewsId} is not null and ${t.verdict} is not null)`),
  check("ledger_records_correction_link", sql`(${t.kind} = 'correction') = (${t.correctsId} is not null)`),
  check("ledger_records_amendment_link", sql`(${t.kind} = 'amendment') = (${t.amendsId} is not null)`),
  check("ledger_records_about_on_notes", sql`${t.aboutId} is null or ${t.kind} = 'note'`),
  check("ledger_records_sets_status_on_decisions", sql`${t.setsStatus} is null or ${t.kind} = 'decision'`),
]);

export const ledgerReleases = pgTable("ledger_releases", {
  recordId: varchar("record_id", { length: 26 }).primaryKey().references(() => ledgerRecords.id),
  releasedBy: varchar("released_by").notNull().references(() => users.id),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  note: text("note"),
});

/** Events to publish on NATS, written in the same transaction as the record (spec section 6). */
export const ledgerOutbox = pgTable("ledger_outbox", {
  id: varchar("id", { length: 26 }).primaryKey(),
  subject: text("subject").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [index("ledger_outbox_unpublished").on(t.publishedAt, t.createdAt)]);

export const agentKeys = pgTable("agent_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  ed25519PublicKey: text("ed25519_public_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type LedgerCampaign = typeof ledgerCampaigns.$inferSelect;
export type NewLedgerCampaign = typeof ledgerCampaigns.$inferInsert;
export type LedgerRecord = typeof ledgerRecords.$inferSelect;
export type NewLedgerRecord = typeof ledgerRecords.$inferInsert;
export type LedgerRelease = typeof ledgerReleases.$inferSelect;
export type NewLedgerRelease = typeof ledgerReleases.$inferInsert;
export type LedgerOutboxEvent = typeof ledgerOutbox.$inferSelect;
export type NewLedgerOutboxEvent = typeof ledgerOutbox.$inferInsert;
export type AgentKey = typeof agentKeys.$inferSelect;
export type NewAgentKey = typeof agentKeys.$inferInsert;
```

- [ ] **Step 5: Load and push the ledger schema**

In `server/db.ts`, change the first import and both `drizzle(...)` calls so the ledger tables are part of the schema:

```ts
import * as baseSchema from "@shared/schema";
import * as ledgerSchema from "@shared/ledger-schema";

const schema = { ...baseSchema, ...ledgerSchema };
```

(keep the rest of the file; the existing `drizzle(pool, { schema })` and `drizzle({ client: pool, schema })` calls now receive the merged object).

In `drizzle.config.ts`, change `schema: "./shared/schema.ts",` to:

```ts
  schema: ["./shared/schema.ts", "./shared/ledger-schema.ts"],
```

- [ ] **Step 6: Record the amendment in the spec**

Append to `docs/superpowers/specs/2026-10-03-research-ledger-design.md`:

```markdown

## 11. Revision log
- 2026-10-03, amendment A1 (made while writing the implementation plan): a `decision` record may carry `sets_status`
  (`registered | running | closed`), which updates the campaign's cached status. It is part of the content hash: the
  hash input gains the key `sets_status` (null when absent). Only the campaign owner or an admin may file a decision
  that sets status.
```

- [ ] **Step 7: Run tests, typecheck, commit**

Run: `npx vitest run shared/ledger-schema.test.ts` (expected PASS, 6 tests), `npx vitest run` (all pass), `npx tsc --noEmit` (clean).

```bash
git add shared/ledger-schema.ts shared/ledger-schema.test.ts shared/schema.ts server/db.ts drizzle.config.ts docs/superpowers/specs/2026-10-03-research-ledger-design.md
git commit -s -m "ledger: tables (campaigns, records, releases, outbox, agent keys) and users.can_release"
```

### Task 5: Canonical JSON, content hash, record validation, ULIDs

**Files:**
- Create: `shared/ledger-hash.ts`
- Create: `shared/ledger-hash.test.ts`
- Create: `shared/ledger-validate.ts`
- Create: `shared/ledger-validate.test.ts`
- Create: `server/services/ledger/ulid.ts`
- Create: `server/services/ledger/ulid.test.ts`

**Interfaces:**
- Produces (from `shared/ledger-hash.ts`, usable in Node and the browser): `canonicalJson(value: unknown): string`; `sha256Hex(text: string): Promise<string>`; `interface HashableRecord { id: string; campaignId: string | null; kind: LedgerKind; title: string; body: string; standing: LedgerStanding; evidence: LedgerEvidence[]; correctsId: string | null; reviewsId: string | null; verdict: ReviewVerdict | null; amendsId: string | null; aboutId: string | null; setsStatus: CampaignStatus | null; authorUsername: string; createdAt: string }`; `hashInput(r: HashableRecord): Record<string, unknown>`; `recordContentHash(r: HashableRecord): Promise<string>`.
- Produces (from `shared/ledger-validate.ts`): `recordInputSchema` (Zod) and `type RecordInput = z.infer<typeof recordInputSchema>`; `campaignInputSchema` and `type CampaignInput`; `LEDGER_RULE_CODES = ["invalid_link", "missing_verdict"] as const`.
- Produces (from `server/services/ledger/ulid.ts`): `ulid(now?: number, rand?: (n: number) => Uint8Array): string`.

- [ ] **Step 1: Write the failing tests**

Create `shared/ledger-hash.test.ts` (the expected hashes were computed on 2026-10-03 with exactly the functions in Step 3):

```ts
import { describe, expect, it } from "vitest";
import { canonicalJson, recordContentHash, sha256Hex, type HashableRecord } from "./ledger-hash";

const fixture: HashableRecord = {
  id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2",
  campaignId: "heesch-leader-optimality",
  kind: "certificate",
  title: "f=4 plain, D<=3 at R>=255: UNSAT",
  body: "Proof checked by cake_lpr.",
  standing: "certified",
  evidence: [{ label: "CNF", url: "https://example.org/f4.cnf", sha256: "37202fa52ba8ead950e8dae9591b7fe84b4ebd17a49676eb1482e751828ef4cb" }],
  correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null, setsStatus: null,
  authorUsername: "0xSCADA-QE",
  createdAt: "2026-10-03T00:00:00.000Z",
};

describe("canonical JSON", () => {
  it("sorts keys at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: { z: "é", y: 2 } }))
      .toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":"é"}}');
  });
  it("drops undefined object values", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it("refuses non-finite numbers", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe("content hash", () => {
  it("sha256Hex matches the standard vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes the fixture to the registered value", async () => {
    expect(await recordContentHash(fixture)).toBe("39cd9f99a07c584ec2838e6ff2f2e1b35375f82f7bc15e38e6f2bed006019629");
  });
  it("changes when one character of the title changes", async () => {
    expect(await recordContentHash({ ...fixture, title: fixture.title + "." }))
      .toBe("43cd85958e24464530d37d5269a39ac275f8a26db3920173a3013f79d86f524c");
  });
  it("is stable for non-ASCII and markup in the title", async () => {
    expect(await recordContentHash({
      ...fixture, id: "01J9Z3K8Q2A7B5C4D6E8F0G1H3", kind: "note", campaignId: null, evidence: [],
      title: "白い紙 🌙 <script>alert(1)</script>", body: "二つの机。", standing: "unverified",
    })).toBe("744f1ae457bcc1bde7098523781a2d8314549b412f94f11df7453040a5175731");
  });
});
```

Create `shared/ledger-validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { campaignInputSchema, recordInputSchema } from "./ledger-validate";

const ID = "01J9Z3K8Q2A7B5C4D6E8F0G1H2";
const messages = (input: unknown) => {
  const r = recordInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("record input", () => {
  it("accepts a minimal result and fills defaults", () => {
    const r = recordInputSchema.parse({ kind: "result", title: "It held" });
    expect(r).toMatchObject({ kind: "result", body: "", standing: "unverified", evidence: [], held: false });
  });
  it("requires reviewsId and verdict on a review", () => {
    expect(messages({ kind: "review", title: "r", verdict: "holds" })).toContain("invalid_link");
    expect(messages({ kind: "review", title: "r", reviewsId: ID })).toContain("missing_verdict");
    expect(messages({ kind: "review", title: "r", reviewsId: ID, verdict: "holds" })).toEqual([]);
  });
  it("forbids a verdict or reviewsId on a non-review", () => {
    expect(messages({ kind: "result", title: "r", verdict: "holds" })).toContain("invalid_link");
    expect(messages({ kind: "result", title: "r", reviewsId: ID })).toContain("invalid_link");
  });
  it("requires correctsId exactly on corrections and amendsId exactly on amendments", () => {
    expect(messages({ kind: "correction", title: "c" })).toContain("invalid_link");
    expect(messages({ kind: "note", title: "n", correctsId: ID })).toContain("invalid_link");
    expect(messages({ kind: "amendment", title: "a" })).toContain("invalid_link");
    expect(messages({ kind: "correction", title: "c", correctsId: ID })).toEqual([]);
  });
  it("allows aboutId only on notes and setsStatus only on decisions", () => {
    expect(messages({ kind: "note", title: "n", aboutId: ID })).toEqual([]);
    expect(messages({ kind: "result", title: "r", aboutId: ID })).toContain("invalid_link");
    expect(messages({ kind: "decision", title: "d", setsStatus: "closed" })).toEqual([]);
    expect(messages({ kind: "result", title: "r", setsStatus: "closed" })).toContain("invalid_link");
  });
  it("rejects a malformed evidence hash and a bad campaign id", () => {
    expect(messages({ kind: "result", title: "r", evidence: [{ label: "x", url: "https://a.b", sha256: "XYZ" }] }).length).toBeGreaterThan(0);
    expect(messages({ kind: "result", title: "r", campaignId: "Bad Id" }).length).toBeGreaterThan(0);
  });
  it("rejects an empty title", () => {
    expect(messages({ kind: "result", title: "   " }).length).toBeGreaterThan(0);
  });
});

describe("campaign input", () => {
  it("validates id, title and links", () => {
    expect(campaignInputSchema.parse({ id: "ecdsa-c007", title: "c007" })).toMatchObject({ summary: "", links: [] });
    expect(campaignInputSchema.safeParse({ id: "x", title: "t" }).success).toBe(false);
  });
});
```

Create `server/services/ledger/ulid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ulid } from "./ulid";

describe("ulid", () => {
  it("is 26 Crockford characters", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it("encodes time in the first 10 characters", () => {
    expect(ulid(1, () => new Uint8Array(16))).toBe("0000000001" + "0".repeat(16));
  });
  it("sorts by time", () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a < b).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/ledger-hash.test.ts shared/ledger-validate.test.ts server/services/ledger/ulid.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the hash module**

Create `shared/ledger-hash.ts`:

```ts
import type { CampaignStatus, LedgerEvidence, LedgerKind, LedgerStanding, ReviewVerdict } from "./ledger-schema";

/** Sorted keys, no insignificant whitespace, undefined object values dropped. Same output in Node and browsers. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error("canonicalJson: undefined is not serializable");
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalJson(v)).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

/** SHA-256 hex via Web Crypto (global `crypto` in Node 20+ and every browser). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface HashableRecord {
  id: string;
  campaignId: string | null;
  kind: LedgerKind;
  title: string;
  body: string;
  standing: LedgerStanding;
  evidence: LedgerEvidence[];
  correctsId: string | null;
  reviewsId: string | null;
  verdict: ReviewVerdict | null;
  amendsId: string | null;
  aboutId: string | null;
  setsStatus: CampaignStatus | null;
  authorUsername: string;
  /** ISO 8601 with milliseconds, e.g. 2026-10-03T00:00:00.000Z */
  createdAt: string;
}

/** The exact object that is hashed (spec 2.3 plus amendment A1). `held` is deliberately absent. */
export function hashInput(r: HashableRecord): Record<string, unknown> {
  return {
    v: 1,
    id: r.id,
    campaign_id: r.campaignId ?? null,
    kind: r.kind,
    title: r.title,
    body: r.body,
    standing: r.standing,
    evidence: r.evidence,
    corrects_id: r.correctsId ?? null,
    reviews_id: r.reviewsId ?? null,
    verdict: r.verdict ?? null,
    amends_id: r.amendsId ?? null,
    about_id: r.aboutId ?? null,
    sets_status: r.setsStatus ?? null,
    author_username: r.authorUsername,
    created_at: r.createdAt,
  };
}

export async function recordContentHash(r: HashableRecord): Promise<string> {
  return sha256Hex(canonicalJson(hashInput(r)));
}
```

- [ ] **Step 4: Write the validation module**

Create `shared/ledger-validate.ts`:

```ts
import { z } from "zod";
import {
  CAMPAIGN_ID_RE, CAMPAIGN_STATUSES, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS,
} from "./ledger-schema";

export const LEDGER_RULE_CODES = ["invalid_link", "missing_verdict"] as const;

const recordId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "record ids are 26-character ULIDs");

export const evidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex characters").optional(),
  bytes: z.number().int().nonnegative().optional(),
}).strict();

export const recordInputSchema = z.object({
  campaignId: z.string().regex(CAMPAIGN_ID_RE).nullable().optional(),
  kind: z.enum(LEDGER_KINDS),
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100_000).default(""),
  standing: z.enum(LEDGER_STANDINGS).default("unverified"),
  evidence: z.array(evidenceSchema).max(100).default([]),
  correctsId: recordId.nullable().optional(),
  reviewsId: recordId.nullable().optional(),
  verdict: z.enum(REVIEW_VERDICTS).nullable().optional(),
  amendsId: recordId.nullable().optional(),
  aboutId: recordId.nullable().optional(),
  setsStatus: z.enum(CAMPAIGN_STATUSES).nullable().optional(),
  clientRef: z.string().trim().min(1).max(200).nullable().optional(),
  held: z.boolean().default(false),
}).strict().superRefine((r, ctx) => {
  const bad = (message: (typeof LEDGER_RULE_CODES)[number], path: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
  if (r.kind === "review") {
    if (!r.reviewsId) bad("invalid_link", "reviewsId");
    if (!r.verdict) bad("missing_verdict", "verdict");
  } else {
    if (r.reviewsId) bad("invalid_link", "reviewsId");
    if (r.verdict) bad("invalid_link", "verdict");
  }
  if ((r.kind === "correction") !== Boolean(r.correctsId)) bad("invalid_link", "correctsId");
  if ((r.kind === "amendment") !== Boolean(r.amendsId)) bad("invalid_link", "amendsId");
  if (r.aboutId && r.kind !== "note") bad("invalid_link", "aboutId");
  if (r.setsStatus && r.kind !== "decision") bad("invalid_link", "setsStatus");
});
export type RecordInput = z.infer<typeof recordInputSchema>;

export const campaignInputSchema = z.object({
  id: z.string().regex(CAMPAIGN_ID_RE),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  links: z.array(z.object({ label: z.string().trim().min(1).max(200), url: z.string().url().max(2000) }).strict()).max(50).default([]),
}).strict();
export type CampaignInput = z.infer<typeof campaignInputSchema>;
```

- [ ] **Step 5: Write the ULID generator**

Create `server/services/ledger/ulid.ts`:

```ts
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/** 10 characters of millisecond time + 16 random characters; lexicographic order = time order. */
export function ulid(now: number = Date.now(), rand: (n: number) => Uint8Array = (n) => randomBytes(n)): string {
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = rand(16);
  let random = "";
  for (let i = 0; i < 16; i++) random += ALPHABET[bytes[i] % 32];
  return time + random;
}
```

- [ ] **Step 6: Run tests, typecheck, commit**

Run: `npx vitest run shared/ledger-hash.test.ts shared/ledger-validate.test.ts server/services/ledger/ulid.test.ts`
Expected: PASS (7 + 8 + 3 tests). Then `npx tsc --noEmit` (clean).

```bash
git add shared/ledger-hash.ts shared/ledger-hash.test.ts shared/ledger-validate.ts shared/ledger-validate.test.ts server/services/ledger/ulid.ts server/services/ledger/ulid.test.ts
git commit -s -m "ledger: canonical JSON, content hash with registered vectors, input validation, ULIDs"
```

### Task 6: The `LedgerStore` interface, the in-memory store, and a shared store contract

**Files:**
- Create: `shared/ledger-public.ts` (the wire shapes the API returns; the client imports these too)
- Create: `server/services/ledger/types.ts`
- Create: `server/services/ledger/memory-store.ts`
- Create: `server/services/ledger/store-contract.ts` (a reusable test suite, not itself a `*.test.ts`)
- Create: `server/services/ledger/memory-store.test.ts`

**Interfaces:**
- Consumes: row types from `@shared/ledger-schema` (Task 4); `ulid` (Task 5).
- Produces (from `shared/ledger-public.ts`): `PublicRecord`, `RecordView`, `AuthorStats`, `AgentProfile`.
- Produces (from `types.ts`): `Actor`, `StoredRecord`, `RecordFilter`, `Visibility`, `NewOutboxEvent`, `AuthorStats`, `LedgerStore`, `AgentKeyStore`, `LEDGER_ERROR_CODES`, `LedgerErrorCode`, `LedgerError`, `DEFAULT_LIST_LIMIT = 50`, `MAX_LIST_LIMIT = 200`.
- Produces: `MemoryLedgerStore` (constructor `(users?: Array<{ id: string; username: string }>)`, plus `addUser(u)`), `MemoryAgentKeyStore`; `describeLedgerStoreContract(label: string, make: () => Promise<ContractFixture>)` where `ContractFixture = { store: LedgerStore; alice: { id: string; username: string }; bob: { id: string; username: string } }`.

- [ ] **Step 1: Write the types**

Create `shared/ledger-public.ts`:

```ts
import type { CampaignStatus, FiledVia, LedgerEvidence, LedgerKind, LedgerStanding, ReviewVerdict } from "./ledger-schema";

/** A record as the API, MCP tools, feeds and pages see it. Never carries clientRef or authorId. */
export interface PublicRecord {
  id: string;
  campaignId: string | null;
  kind: LedgerKind;
  title: string;
  body: string;
  standing: LedgerStanding;
  evidence: LedgerEvidence[];
  correctsId: string | null;
  reviewsId: string | null;
  verdict: ReviewVerdict | null;
  amendsId: string | null;
  aboutId: string | null;
  setsStatus: CampaignStatus | null;
  authorUsername: string;
  held: boolean;
  released: boolean;
  contentHash: string;
  filedVia: FiledVia;
  createdAt: string;
}

export interface RecordView {
  record: PublicRecord;
  corrections: PublicRecord[];
  reviews: PublicRecord[];
  notes: PublicRecord[];
  amendments: PublicRecord[];
}

export interface AuthorStats { filed: number; reviewsGiven: number; reviewsReceived: number; corrected: number; retracted: number }

export interface AgentProfile { username: string; stats: AuthorStats; records: PublicRecord[] }
```

Create `server/services/ledger/types.ts`:

```ts
import type {
  AgentKey, CampaignStatus, LedgerCampaign, LedgerKind, LedgerOutboxEvent, LedgerRecord, LedgerRelease,
  LedgerStanding, NewAgentKey, NewLedgerCampaign, NewLedgerRecord, NewLedgerRelease,
} from "@shared/ledger-schema";
import type { AuthorStats } from "@shared/ledger-public";

export interface Actor {
  id: string;
  username: string;
  userType: "human" | "agent";
  role: "user" | "admin";
  canRelease: boolean;
}

export type StoredRecord = LedgerRecord & { authorUsername: string; released: boolean };

export interface RecordFilter {
  campaignId?: string;
  kind?: LedgerKind;
  standing?: LedgerStanding;
  authorId?: string;
  before?: Date;
  limit?: number;
}

/** includeHeld=false returns only records that are not held, or held and released. Decided in the store. */
export interface Visibility { includeHeld: boolean }

export interface NewOutboxEvent { subject: string; payload: Record<string, unknown> }

export type { AuthorStats };

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export interface LedgerStore {
  getCampaign(id: string): Promise<LedgerCampaign | undefined>;
  listCampaigns(): Promise<LedgerCampaign[]>;
  /** Throws an Error with code "duplicate" if the id exists. */
  insertCampaign(c: NewLedgerCampaign): Promise<LedgerCampaign>;
  setCampaignStatus(id: string, status: CampaignStatus): Promise<void>;
  findUserByUsername(username: string): Promise<{ id: string; username: string } | undefined>;
  getRecord(id: string, vis: Visibility): Promise<StoredRecord | undefined>;
  findByClientRef(authorId: string, clientRef: string): Promise<StoredRecord | undefined>;
  /** Newest first. */
  listRecords(filter: RecordFilter, vis: Visibility): Promise<StoredRecord[]>;
  /** Records whose corrects/reviews/amends/about link points at recordId, oldest first. */
  listLinkedTo(recordId: string, vis: Visibility): Promise<StoredRecord[]>;
  /** One transaction: the record and its outbox events commit together or not at all.
   *  Throws an Error with code "duplicate_client_ref" on an (author, clientRef) collision. */
  insertRecord(record: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord>;
  getRelease(recordId: string): Promise<LedgerRelease | undefined>;
  /** One transaction: the release and its outbox events. */
  insertRelease(release: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease>;
  listUnreleasedHeld(): Promise<StoredRecord[]>;
  listUnpublishedEvents(limit: number): Promise<LedgerOutboxEvent[]>;
  markEventPublished(id: string, at: Date): Promise<void>;
  authorStats(authorId: string, vis: Visibility): Promise<AuthorStats>;
}

export interface AgentKeyStore {
  insert(k: NewAgentKey): Promise<AgentKey>;
  findByHash(keyHash: string): Promise<AgentKey | undefined>;
  findById(id: string): Promise<AgentKey | undefined>;
  listForUser(userId: string): Promise<AgentKey[]>;
  revoke(id: string, at: Date): Promise<AgentKey | undefined>;
  touch(id: string, at: Date): Promise<void>;
}

export const LEDGER_ERROR_CODES = [
  "bad_signature", "unknown_key", "revoked_key", "stale_timestamp", "replayed_nonce", "unknown_campaign",
  "invalid_link", "missing_verdict", "rate_limited", "not_releaser", "agents_cannot_release", "invalid_input",
  "not_found", "forbidden",
] as const;
export type LedgerErrorCode = (typeof LEDGER_ERROR_CODES)[number];

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode, readonly status: number, message?: string) {
    super(message ?? code);
    this.name = "LedgerError";
  }
}
```

- [ ] **Step 2: Write the contract suite and the failing memory-store test**

Create `server/services/ledger/store-contract.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { NewLedgerRecord } from "@shared/ledger-schema";
import type { LedgerStore } from "./types";
import { ulid } from "./ulid";

export interface ContractFixture {
  store: LedgerStore;
  alice: { id: string; username: string };
  bob: { id: string; username: string };
}

let clock = Date.UTC(2026, 9, 3);
function rec(authorId: string, over: Partial<NewLedgerRecord> = {}): NewLedgerRecord {
  clock += 1000;
  return {
    id: ulid(clock), kind: "result", title: "t", body: "", standing: "unverified", evidence: [],
    authorId, held: false, contentHash: "0".repeat(64), filedVia: "api", createdAt: new Date(clock), ...over,
  };
}

/** Behaviour every LedgerStore must have. Run against the memory store always, Drizzle when a test DB is set. */
export function describeLedgerStoreContract(label: string, make: () => Promise<ContractFixture>): void {
  describe(`LedgerStore contract: ${label}`, () => {
    let f: ContractFixture;
    beforeEach(async () => { f = await make(); });

    it("hides a held record from public reads until it is released", async () => {
      const held = await f.store.insertRecord(rec(f.alice.id, { held: true }), []);
      expect(await f.store.getRecord(held.id, { includeHeld: false })).toBeUndefined();
      expect((await f.store.listRecords({}, { includeHeld: false })).map((r) => r.id)).not.toContain(held.id);
      expect((await f.store.getRecord(held.id, { includeHeld: true }))?.id).toBe(held.id);
      await f.store.insertRelease({ recordId: held.id, releasedBy: f.bob.id, releasedAt: new Date(), note: null }, []);
      const after = await f.store.getRecord(held.id, { includeHeld: false });
      expect(after?.released).toBe(true);
    });

    it("returns author usernames and lists newest first with filters and a cursor", async () => {
      const a = await f.store.insertRecord(rec(f.alice.id, { kind: "run" }), []);
      const b = await f.store.insertRecord(rec(f.bob.id, { kind: "failure" }), []);
      const all = await f.store.listRecords({}, { includeHeld: false });
      expect(all.map((r) => r.id).slice(0, 2)).toEqual([b.id, a.id]);
      expect(all[0].authorUsername).toBe(f.bob.username);
      expect((await f.store.listRecords({ kind: "run" }, { includeHeld: false })).map((r) => r.id)).toEqual([a.id]);
      expect((await f.store.listRecords({ authorId: f.alice.id }, { includeHeld: false })).map((r) => r.id)).toEqual([a.id]);
      expect((await f.store.listRecords({ before: b.createdAt }, { includeHeld: false })).map((r) => r.id)).toEqual([a.id]);
      expect(await f.store.listRecords({ limit: 1 }, { includeHeld: false })).toHaveLength(1);
    });

    it("finds linked records and respects visibility on them", async () => {
      const base = await f.store.insertRecord(rec(f.alice.id), []);
      const pub = await f.store.insertRecord(rec(f.bob.id, { kind: "review", reviewsId: base.id, verdict: "holds" }), []);
      const heldNote = await f.store.insertRecord(rec(f.bob.id, { kind: "note", aboutId: base.id, held: true }), []);
      expect((await f.store.listLinkedTo(base.id, { includeHeld: false })).map((r) => r.id)).toEqual([pub.id]);
      expect((await f.store.listLinkedTo(base.id, { includeHeld: true })).map((r) => r.id)).toEqual([pub.id, heldNote.id]);
    });

    it("enforces one record per (author, clientRef) and finds it", async () => {
      const first = await f.store.insertRecord(rec(f.alice.id, { clientRef: "x-1" }), []);
      await expect(f.store.insertRecord(rec(f.alice.id, { clientRef: "x-1" }), [])).rejects.toMatchObject({ code: "duplicate_client_ref" });
      expect((await f.store.findByClientRef(f.alice.id, "x-1"))?.id).toBe(first.id);
      await expect(f.store.insertRecord(rec(f.bob.id, { clientRef: "x-1" }), [])).resolves.toBeTruthy();
    });

    it("writes outbox events with the record and marks them published", async () => {
      await f.store.insertRecord(rec(f.alice.id), [{ subject: "SPACECHILD.ledger.record.filed", payload: { a: 1 } }]);
      const events = await f.store.listUnpublishedEvents(10);
      expect(events.map((e) => e.subject)).toContain("SPACECHILD.ledger.record.filed");
      await f.store.markEventPublished(events[0].id, new Date());
      expect((await f.store.listUnpublishedEvents(10)).map((e) => e.id)).not.toContain(events[0].id);
    });

    it("rolls back the outbox when the record insert fails", async () => {
      await f.store.insertRecord(rec(f.alice.id, { clientRef: "dup" }), []);
      const before = (await f.store.listUnpublishedEvents(100)).length;
      await expect(f.store.insertRecord(rec(f.alice.id, { clientRef: "dup" }), [{ subject: "s", payload: {} }])).rejects.toBeTruthy();
      expect((await f.store.listUnpublishedEvents(100)).length).toBe(before);
    });

    it("lists unreleased held records and computes author stats", async () => {
      const held = await f.store.insertRecord(rec(f.alice.id, { held: true }), []);
      const mine = await f.store.insertRecord(rec(f.alice.id, { standing: "retracted" }), []);
      await f.store.insertRecord(rec(f.bob.id, { kind: "review", reviewsId: mine.id, verdict: "breaks" }), []);
      await f.store.insertRecord(rec(f.bob.id, { kind: "correction", correctsId: mine.id }), []);
      expect((await f.store.listUnreleasedHeld()).map((r) => r.id)).toEqual([held.id]);
      expect(await f.store.authorStats(f.alice.id, { includeHeld: false }))
        .toEqual({ filed: 1, reviewsGiven: 0, reviewsReceived: 1, corrected: 1, retracted: 1 });
      expect((await f.store.authorStats(f.alice.id, { includeHeld: true })).filed).toBe(2);
    });

    it("rejects a duplicate campaign id and updates status", async () => {
      await f.store.insertCampaign({ id: "ecdsa-c007", title: "c007", ownerId: f.alice.id });
      await expect(f.store.insertCampaign({ id: "ecdsa-c007", title: "again", ownerId: f.alice.id })).rejects.toMatchObject({ code: "duplicate" });
      await f.store.setCampaignStatus("ecdsa-c007", "running");
      expect((await f.store.getCampaign("ecdsa-c007"))?.status).toBe("running");
      expect((await f.store.findUserByUsername(f.alice.username))?.id).toBe(f.alice.id);
    });
  });
}
```

Create `server/services/ledger/memory-store.test.ts`:

```ts
import { describeLedgerStoreContract } from "./store-contract";
import { MemoryLedgerStore } from "./memory-store";

describeLedgerStoreContract("memory", async () => {
  const alice = { id: "u-alice", username: "alice" };
  const bob = { id: "u-bob", username: "bob" };
  return { store: new MemoryLedgerStore([alice, bob]), alice, bob };
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/services/ledger/memory-store.test.ts`
Expected: FAIL, cannot resolve `./memory-store`.

- [ ] **Step 4: Write the memory stores**

Create `server/services/ledger/memory-store.ts`:

```ts
import type {
  AgentKey, CampaignStatus, LedgerCampaign, LedgerOutboxEvent, LedgerRecord, LedgerRelease, NewAgentKey,
  NewLedgerCampaign, NewLedgerRecord, NewLedgerRelease,
} from "@shared/ledger-schema";
import { randomUUID } from "node:crypto";
import type {
  AgentKeyStore, AuthorStats, LedgerStore, NewOutboxEvent, RecordFilter, StoredRecord, Visibility,
} from "./types";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "./types";
import { ulid } from "./ulid";

const LINK_FIELDS = ["correctsId", "reviewsId", "amendsId", "aboutId"] as const;

function newestFirst(a: LedgerRecord, b: LedgerRecord): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
}

/** Test and local-dev implementation of LedgerStore. Same visibility rules as the Drizzle store. */
export class MemoryLedgerStore implements LedgerStore {
  private campaigns = new Map<string, LedgerCampaign>();
  private records = new Map<string, LedgerRecord>();
  private releases = new Map<string, LedgerRelease>();
  private outbox: LedgerOutboxEvent[] = [];
  private users = new Map<string, { id: string; username: string }>();

  constructor(users: Array<{ id: string; username: string }> = []) {
    for (const u of users) this.addUser(u);
  }

  addUser(u: { id: string; username: string }): void {
    this.users.set(u.id, u);
  }

  private stored(r: LedgerRecord): StoredRecord {
    return { ...r, authorUsername: this.users.get(r.authorId)?.username ?? "unknown", released: this.releases.has(r.id) };
  }

  private visible(r: LedgerRecord, vis: Visibility): boolean {
    return vis.includeHeld || !r.held || this.releases.has(r.id);
  }

  async getCampaign(id: string) { return this.campaigns.get(id); }

  async listCampaigns() {
    return [...this.campaigns.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async insertCampaign(c: NewLedgerCampaign): Promise<LedgerCampaign> {
    if (this.campaigns.has(c.id)) throw Object.assign(new Error("campaign exists"), { code: "duplicate" });
    const row: LedgerCampaign = {
      id: c.id, title: c.title, summary: c.summary ?? "", ownerId: c.ownerId,
      status: (c.status ?? "registered") as CampaignStatus, links: c.links ?? [], createdAt: c.createdAt ?? new Date(),
    };
    this.campaigns.set(row.id, row);
    return row;
  }

  async setCampaignStatus(id: string, status: CampaignStatus) {
    const c = this.campaigns.get(id);
    if (c) this.campaigns.set(id, { ...c, status });
  }

  async findUserByUsername(username: string) {
    return [...this.users.values()].find((u) => u.username === username);
  }

  async getRecord(id: string, vis: Visibility) {
    const r = this.records.get(id);
    return r && this.visible(r, vis) ? this.stored(r) : undefined;
  }

  async findByClientRef(authorId: string, clientRef: string) {
    const r = [...this.records.values()].find((x) => x.authorId === authorId && x.clientRef === clientRef);
    return r ? this.stored(r) : undefined;
  }

  async listRecords(filter: RecordFilter, vis: Visibility) {
    const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    return [...this.records.values()]
      .filter((r) => this.visible(r, vis))
      .filter((r) => !filter.campaignId || r.campaignId === filter.campaignId)
      .filter((r) => !filter.kind || r.kind === filter.kind)
      .filter((r) => !filter.standing || r.standing === filter.standing)
      .filter((r) => !filter.authorId || r.authorId === filter.authorId)
      .filter((r) => !filter.before || r.createdAt.getTime() < filter.before.getTime())
      .sort(newestFirst)
      .slice(0, limit)
      .map((r) => this.stored(r));
  }

  async listLinkedTo(recordId: string, vis: Visibility) {
    return [...this.records.values()]
      .filter((r) => LINK_FIELDS.some((f) => r[f] === recordId))
      .filter((r) => this.visible(r, vis))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => this.stored(r));
  }

  async insertRecord(n: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord> {
    if (n.clientRef && [...this.records.values()].some((r) => r.authorId === n.authorId && r.clientRef === n.clientRef)) {
      throw Object.assign(new Error("duplicate client_ref"), { code: "duplicate_client_ref" });
    }
    const row: LedgerRecord = {
      id: n.id, campaignId: n.campaignId ?? null, kind: n.kind, title: n.title, body: n.body ?? "",
      standing: n.standing, evidence: n.evidence ?? [], correctsId: n.correctsId ?? null, reviewsId: n.reviewsId ?? null,
      verdict: n.verdict ?? null, amendsId: n.amendsId ?? null, aboutId: n.aboutId ?? null, setsStatus: n.setsStatus ?? null,
      authorId: n.authorId, clientRef: n.clientRef ?? null, held: n.held ?? false, contentHash: n.contentHash,
      filedVia: n.filedVia, createdAt: n.createdAt,
    };
    this.records.set(row.id, row);
    for (const e of events) this.outbox.push({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: row.createdAt, publishedAt: null });
    return this.stored(row);
  }

  async getRelease(recordId: string) { return this.releases.get(recordId); }

  async insertRelease(n: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease> {
    if (this.releases.has(n.recordId)) throw Object.assign(new Error("already released"), { code: "duplicate" });
    const row: LedgerRelease = { recordId: n.recordId, releasedBy: n.releasedBy, releasedAt: n.releasedAt, note: n.note ?? null };
    this.releases.set(row.recordId, row);
    for (const e of events) this.outbox.push({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: row.releasedAt, publishedAt: null });
    return row;
  }

  async listUnreleasedHeld() {
    return [...this.records.values()].filter((r) => r.held && !this.releases.has(r.id)).sort(newestFirst).map((r) => this.stored(r));
  }

  async listUnpublishedEvents(limit: number) {
    return this.outbox.filter((e) => !e.publishedAt).slice(0, limit);
  }

  async markEventPublished(id: string, at: Date) {
    const e = this.outbox.find((x) => x.id === id);
    if (e) e.publishedAt = at;
  }

  async authorStats(authorId: string, vis: Visibility): Promise<AuthorStats> {
    const all = [...this.records.values()].filter((r) => this.visible(r, vis));
    const mine = all.filter((r) => r.authorId === authorId);
    const mineIds = new Set(mine.map((r) => r.id));
    return {
      filed: mine.length,
      reviewsGiven: mine.filter((r) => r.kind === "review").length,
      reviewsReceived: all.filter((r) => r.kind === "review" && r.reviewsId && mineIds.has(r.reviewsId)).length,
      corrected: new Set(all.filter((r) => r.kind === "correction" && r.correctsId && mineIds.has(r.correctsId)).map((r) => r.correctsId)).size,
      retracted: mine.filter((r) => r.standing === "retracted").length,
    };
  }
}

export class MemoryAgentKeyStore implements AgentKeyStore {
  private keys = new Map<string, AgentKey>();

  async insert(k: NewAgentKey): Promise<AgentKey> {
    const row: AgentKey = {
      id: k.id ?? randomUUID(), userId: k.userId, name: k.name, prefix: k.prefix, keyHash: k.keyHash,
      ed25519PublicKey: k.ed25519PublicKey ?? null, createdAt: k.createdAt ?? new Date(),
      lastUsedAt: k.lastUsedAt ?? null, revokedAt: k.revokedAt ?? null,
    };
    this.keys.set(row.id, row);
    return row;
  }
  async findByHash(keyHash: string) { return [...this.keys.values()].find((k) => k.keyHash === keyHash); }
  async findById(id: string) { return this.keys.get(id); }
  async listForUser(userId: string) { return [...this.keys.values()].filter((k) => k.userId === userId); }
  async revoke(id: string, at: Date) {
    const k = this.keys.get(id);
    if (!k) return undefined;
    const row = { ...k, revokedAt: k.revokedAt ?? at };
    this.keys.set(id, row);
    return row;
  }
  async touch(id: string, at: Date) {
    const k = this.keys.get(id);
    if (k) this.keys.set(id, { ...k, lastUsedAt: at });
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run server/services/ledger/memory-store.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` (clean).

```bash
git add shared/ledger-public.ts server/services/ledger/types.ts server/services/ledger/memory-store.ts server/services/ledger/store-contract.ts server/services/ledger/memory-store.test.ts
git commit -s -m "ledger: store interface, in-memory store, and a shared store contract suite"
```

### Task 7: `LedgerService`: filing, release, reads, campaigns, agent profiles

**Files:**
- Create: `server/services/ledger/service.ts`
- Create: `server/services/ledger/service.test.ts`

**Interfaces:**
- Consumes: `LedgerStore`, `Actor`, `LedgerError`, `StoredRecord` (Task 6); `recordInputSchema`, `campaignInputSchema` (Task 5); `recordContentHash` (Task 5); `ulid` (Task 5).
- Produces: `class LedgerService` with constructor `(store: LedgerStore, opts?: { now?: () => Date; newId?: () => string; baseUrl?: string })` and methods:
  - `file(actor: Actor, input: unknown, via: FiledVia): Promise<{ record: PublicRecord; created: boolean }>`
  - `release(actor: Actor, recordId: string, note?: string | null): Promise<PublicRecord>`
  - `getRecordView(viewer: Actor | null, id: string): Promise<RecordView | null>`
  - `listRecords(viewer: Actor | null, q: { campaignId?: string; kind?: string; standing?: string; author?: string; before?: string; limit?: number }): Promise<PublicRecord[]>`
  - `createCampaign(actor: Actor, input: unknown): Promise<LedgerCampaign>`
  - `listCampaigns(): Promise<LedgerCampaign[]>`
  - `getCampaignView(viewer: Actor | null, id: string): Promise<{ campaign: LedgerCampaign; records: PublicRecord[] } | null>`
  - `agentProfile(viewer: Actor | null, username: string): Promise<AgentProfile | null>`
  - `pendingReleases(actor: Actor): Promise<PublicRecord[]>`
- Consumes types from `shared/ledger-public.ts` (Task 6): `PublicRecord` (every record field except `clientRef` and `authorId`, plus `authorUsername`, `released`, and `createdAt` as an ISO string), `RecordView = { record: PublicRecord; corrections: PublicRecord[]; reviews: PublicRecord[]; notes: PublicRecord[]; amendments: PublicRecord[] }`, `AgentProfile = { username: string; stats: AuthorStats; records: PublicRecord[] }`, `AuthorStats`; and (in `service.ts`) `toPublicRecord(r: StoredRecord): PublicRecord`, `actorFromUser(u: { id: string; username: string; userType: string; role: string; canRelease?: boolean | null }): Actor`.
- Outbox subjects written: `SPACECHILD.ledger.record.filed` (every public filing), `SPACECHILD.ledger.review.filed` (public reviews, in addition), `SPACECHILD.ledger.record.released` (on release; a released review also gets `review.filed`). Payload: `{ id, campaign_id, kind, standing, author, url, content_hash }`.

- [ ] **Step 1: Write the failing test**

Create `server/services/ledger/service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import type { Actor } from "./types";
import { recordContentHash } from "@shared/ledger-hash";

const alice: Actor = { id: "u-alice", username: "alice", userType: "agent", role: "user", canRelease: false };
const bob: Actor = { id: "u-bob", username: "bob", userType: "agent", role: "user", canRelease: false };
const nick: Actor = { id: "u-nick", username: "nick", userType: "human", role: "admin", canRelease: true };
const sneaky: Actor = { ...alice, id: "u-sneaky", username: "sneaky", canRelease: true }; // an agent with the flag set

let store: MemoryLedgerStore;
let svc: LedgerService;
let t = Date.UTC(2026, 9, 3, 12);
let n = 0;

beforeEach(() => {
  store = new MemoryLedgerStore([alice, bob, nick, sneaky]);
  t = Date.UTC(2026, 9, 3, 12);
  n = 0;
  svc = new LedgerService(store, {
    now: () => new Date((t += 1000)),
    newId: () => `01J9Z3K8Q2A7B5C4D6E8F0G${String(++n).padStart(3, "0")}`,
    baseUrl: "https://research.example",
  });
});

describe("filing", () => {
  it("files a public record with a correct content hash and an outbox event", async () => {
    const { record, created } = await svc.file(alice, { kind: "result", title: "It held", body: "b" }, "api");
    expect(created).toBe(true);
    expect(record.contentHash).toBe(await recordContentHash({ ...record, createdAt: record.createdAt }));
    const events = await store.listUnpublishedEvents(10);
    expect(events.map((e) => e.subject)).toEqual(["SPACECHILD.ledger.record.filed"]);
    expect(events[0].payload).toMatchObject({ id: record.id, url: `https://research.example/records/${record.id}`, author: "alice" });
    expect(record).not.toHaveProperty("clientRef");
  });

  it("client_ref makes filing idempotent", async () => {
    const first = await svc.file(alice, { kind: "run", title: "r", clientRef: "c005-s1" }, "api");
    const again = await svc.file(alice, { kind: "run", title: "r (retry)", clientRef: "c005-s1" }, "api");
    expect(again.created).toBe(false);
    expect(again.record.id).toBe(first.record.id);
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(1);
  });

  it("maps rule violations to reason codes", async () => {
    await expect(svc.file(alice, { kind: "review", title: "r", reviewsId: "01J9Z3K8Q2A7B5C4D6E8F0G999" }, "api"))
      .rejects.toMatchObject({ code: "missing_verdict", status: 400 });
    await expect(svc.file(alice, { kind: "result", title: "r", campaignId: "no-such-campaign" }, "api"))
      .rejects.toMatchObject({ code: "unknown_campaign" });
    await expect(svc.file(alice, { kind: "correction", title: "c", correctsId: "01J9Z3K8Q2A7B5C4D6E8F0G999" }, "api"))
      .rejects.toMatchObject({ code: "invalid_link" });
    await expect(svc.file(alice, { kind: "result" }, "api")).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("an amendment must amend a pre-registration or an amendment", async () => {
    const result = await svc.file(alice, { kind: "result", title: "r" }, "api");
    await expect(svc.file(alice, { kind: "amendment", title: "a", amendsId: result.record.id }, "api"))
      .rejects.toMatchObject({ code: "invalid_link" });
    const pre = await svc.file(alice, { kind: "preregistration", title: "p" }, "api");
    await expect(svc.file(alice, { kind: "amendment", title: "a", amendsId: pre.record.id }, "api")).resolves.toBeTruthy();
  });

  it("a held record is not announced and not publicly readable", async () => {
    const { record } = await svc.file(alice, { kind: "result", title: "secret", held: true }, "api");
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
    expect(await svc.getRecordView(null, record.id)).toBeNull();
    expect((await svc.getRecordView(bob, record.id))?.record.id).toBe(record.id);
    expect((await svc.listRecords(null, {})).map((r) => r.id)).not.toContain(record.id);
  });

  it("a public correction of a held record does not expose the held record", async () => {
    const held = await svc.file(alice, { kind: "result", title: "secret title", body: "secret body", held: true }, "api");
    const corr = await svc.file(alice, { kind: "correction", title: "fix", correctsId: held.record.id }, "api");
    const view = await svc.getRecordView(null, corr.record.id);
    expect(JSON.stringify(view)).not.toContain("secret title");
    expect(JSON.stringify(view)).not.toContain("secret body");
    expect(await svc.getRecordView(null, held.record.id)).toBeNull();
  });

  it("only the campaign owner or an admin may file a status-setting decision", async () => {
    await svc.createCampaign(alice, { id: "ecdsa-c007", title: "c007" });
    await expect(svc.file(bob, { kind: "decision", title: "close", campaignId: "ecdsa-c007", setsStatus: "closed" }, "api"))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
    await svc.file(alice, { kind: "decision", title: "start", campaignId: "ecdsa-c007", setsStatus: "running" }, "api");
    expect((await store.getCampaign("ecdsa-c007"))?.status).toBe("running");
    await svc.file(nick, { kind: "decision", title: "close", campaignId: "ecdsa-c007", setsStatus: "closed" }, "web");
    expect((await store.getCampaign("ecdsa-c007"))?.status).toBe("closed");
  });

  it("a held status-setting decision changes status only on release", async () => {
    await svc.createCampaign(alice, { id: "brain-e3", title: "E3" });
    const d = await svc.file(alice, { kind: "decision", title: "close", campaignId: "brain-e3", setsStatus: "closed", held: true }, "api");
    expect((await store.getCampaign("brain-e3"))?.status).toBe("registered");
    await svc.release(nick, d.record.id);
    expect((await store.getCampaign("brain-e3"))?.status).toBe("closed");
  });
});

describe("release", () => {
  it("only humans with can_release may release; agents never, even with the flag", async () => {
    const { record } = await svc.file(alice, { kind: "result", title: "r", held: true }, "api");
    await expect(svc.release(bob, record.id)).rejects.toMatchObject({ code: "agents_cannot_release", status: 403 });
    await expect(svc.release(sneaky, record.id)).rejects.toMatchObject({ code: "agents_cannot_release" });
    const human: Actor = { id: "u-h", username: "h", userType: "human", role: "user", canRelease: false };
    await expect(svc.release(human, record.id)).rejects.toMatchObject({ code: "not_releaser" });
    const released = await svc.release(nick, record.id, "ok to publish");
    expect(released.released).toBe(true);
    expect((await store.listUnpublishedEvents(10)).map((e) => e.subject)).toEqual(["SPACECHILD.ledger.record.released"]);
  });

  it("releasing twice is idempotent and releasing a public record is invalid", async () => {
    const held = await svc.file(alice, { kind: "result", title: "r", held: true }, "api");
    await svc.release(nick, held.record.id);
    await expect(svc.release(nick, held.record.id)).resolves.toMatchObject({ id: held.record.id, released: true });
    const pub = await svc.file(alice, { kind: "result", title: "p" }, "api");
    await expect(svc.release(nick, pub.record.id)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.release(nick, "01J9Z3K8Q2A7B5C4D6E8F0G999")).rejects.toMatchObject({ code: "not_found" });
  });

  it("a public review also announces review.filed; a held review announces it on release", async () => {
    const base = await svc.file(alice, { kind: "result", title: "r" }, "api");
    await svc.file(bob, { kind: "review", title: "holds", reviewsId: base.record.id, verdict: "holds" }, "api");
    const subjects = (await store.listUnpublishedEvents(10)).map((e) => e.subject);
    expect(subjects).toEqual(["SPACECHILD.ledger.record.filed", "SPACECHILD.ledger.record.filed", "SPACECHILD.ledger.review.filed"]);
    const heldReview = await svc.file(bob, { kind: "review", title: "breaks", reviewsId: base.record.id, verdict: "breaks", held: true }, "api");
    await svc.release(nick, heldReview.record.id);
    const after = (await store.listUnpublishedEvents(20)).map((e) => e.subject).slice(3);
    expect(after).toEqual(["SPACECHILD.ledger.record.released", "SPACECHILD.ledger.review.filed"]);
  });

  it("pending releases are visible only to releasers", async () => {
    await svc.file(alice, { kind: "result", title: "r", held: true }, "api");
    await expect(svc.pendingReleases(bob)).rejects.toMatchObject({ code: "agents_cannot_release" });
    expect(await svc.pendingReleases(nick)).toHaveLength(1);
  });
});

describe("reads", () => {
  it("a record view stacks corrections, reviews, notes and amendments", async () => {
    const pre = await svc.file(alice, { kind: "preregistration", title: "p" }, "api");
    await svc.file(alice, { kind: "amendment", title: "a", amendsId: pre.record.id }, "api");
    await svc.file(bob, { kind: "review", title: "rv", reviewsId: pre.record.id, verdict: "inconclusive" }, "api");
    await svc.file(alice, { kind: "correction", title: "c", correctsId: pre.record.id }, "api");
    await svc.file(bob, { kind: "note", title: "n", aboutId: pre.record.id }, "api");
    const view = await svc.getRecordView(null, pre.record.id);
    expect([view!.amendments.length, view!.reviews.length, view!.corrections.length, view!.notes.length]).toEqual([1, 1, 1, 1]);
  });

  it("lists by author username and campaign; an unknown author lists nothing", async () => {
    await svc.createCampaign(alice, { id: "heesch-leader", title: "Heesch" });
    await svc.file(alice, { kind: "result", title: "a", campaignId: "heesch-leader" }, "api");
    await svc.file(bob, { kind: "result", title: "b" }, "api");
    expect((await svc.listRecords(null, { author: "alice" })).map((r) => r.title)).toEqual(["a"]);
    expect((await svc.listRecords(null, { campaignId: "heesch-leader" })).map((r) => r.title)).toEqual(["a"]);
    expect(await svc.listRecords(null, { author: "nobody" })).toEqual([]);
    await expect(svc.listRecords(null, { kind: "nonsense" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("builds an agent profile with stats", async () => {
    const r = await svc.file(alice, { kind: "result", title: "a" }, "api");
    await svc.file(bob, { kind: "review", title: "rv", reviewsId: r.record.id, verdict: "breaks" }, "api");
    const p = await svc.agentProfile(null, "alice");
    expect(p?.stats).toMatchObject({ filed: 1, reviewsReceived: 1 });
    expect(await svc.agentProfile(null, "nobody")).toBeNull();
  });

  it("refuses a duplicate campaign id", async () => {
    await svc.createCampaign(alice, { id: "brain-e3", title: "E3" });
    await expect(svc.createCampaign(bob, { id: "brain-e3", title: "x" })).rejects.toMatchObject({ code: "invalid_input", status: 409 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/ledger/service.test.ts`
Expected: FAIL, cannot resolve `./service`.

- [ ] **Step 3: Write the service**


Create `server/services/ledger/service.ts`:

```ts
import type { FiledVia, LedgerCampaign } from "@shared/ledger-schema";
import { LEDGER_KINDS, LEDGER_STANDINGS } from "@shared/ledger-schema";
import { recordContentHash } from "@shared/ledger-hash";
import { campaignInputSchema, recordInputSchema } from "@shared/ledger-validate";
import { ulid } from "./ulid";
import type { Actor, LedgerStore, NewOutboxEvent, StoredRecord } from "./types";
import { LedgerError } from "./types";

export const SUBJECT_FILED = "SPACECHILD.ledger.record.filed";
export const SUBJECT_RELEASED = "SPACECHILD.ledger.record.released";
export const SUBJECT_REVIEW = "SPACECHILD.ledger.review.filed";

import type { AgentProfile, PublicRecord, RecordView } from "@shared/ledger-public";
export type { AgentProfile, PublicRecord, RecordView };

export function toPublicRecord(r: StoredRecord): PublicRecord {
  return {
    id: r.id, campaignId: r.campaignId, kind: r.kind, title: r.title, body: r.body, standing: r.standing,
    evidence: r.evidence, correctsId: r.correctsId, reviewsId: r.reviewsId, verdict: r.verdict, amendsId: r.amendsId,
    aboutId: r.aboutId, setsStatus: r.setsStatus, authorUsername: r.authorUsername, held: r.held, released: r.released,
    contentHash: r.contentHash, filedVia: r.filedVia, createdAt: r.createdAt.toISOString(),
  };
}

export function actorFromUser(u: { id: string; username: string; userType: string; role: string; canRelease?: boolean | null }): Actor {
  return {
    id: u.id,
    username: u.username,
    userType: u.userType === "agent" ? "agent" : "human",
    role: u.role === "admin" ? "admin" : "user",
    canRelease: Boolean(u.canRelease),
  };
}

function inputError(error: { issues: Array<{ message: string }>; flatten: () => unknown }): LedgerError {
  const msgs = error.issues.map((i) => i.message);
  const code = msgs.includes("missing_verdict") ? "missing_verdict" : msgs.includes("invalid_link") ? "invalid_link" : "invalid_input";
  return new LedgerError(code, 400, JSON.stringify(error.flatten()));
}

export class LedgerService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly baseUrl: string;

  constructor(private readonly store: LedgerStore, opts: { now?: () => Date; newId?: () => string; baseUrl?: string } = {}) {
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? (() => ulid());
    this.baseUrl = (opts.baseUrl ?? "https://research.spacechild.love").replace(/\/+$/, "");
  }

  private eventPayload(r: StoredRecord): Record<string, unknown> {
    return {
      id: r.id, campaign_id: r.campaignId, kind: r.kind, standing: r.standing, author: r.authorUsername,
      url: `${this.baseUrl}/records/${r.id}`, content_hash: r.contentHash,
    };
  }

  private async canSetStatus(actor: Actor, campaignId: string): Promise<boolean> {
    if (actor.role === "admin") return true;
    const c = await this.store.getCampaign(campaignId);
    return Boolean(c && c.ownerId === actor.id);
  }

  async file(actor: Actor, input: unknown, via: FiledVia): Promise<{ record: PublicRecord; created: boolean }> {
    const parsed = recordInputSchema.safeParse(input);
    if (!parsed.success) throw inputError(parsed.error);
    const r = parsed.data;

    if (r.clientRef) {
      const prior = await this.store.findByClientRef(actor.id, r.clientRef);
      if (prior) return { record: toPublicRecord(prior), created: false };
    }
    if (r.campaignId && !(await this.store.getCampaign(r.campaignId))) {
      throw new LedgerError("unknown_campaign", 400, `campaign ${r.campaignId} does not exist`);
    }
    for (const linkId of [r.correctsId, r.reviewsId, r.amendsId, r.aboutId]) {
      if (!linkId) continue;
      // Filers are members, who may see held records, so links may point at held records.
      if (!(await this.store.getRecord(linkId, { includeHeld: true }))) {
        throw new LedgerError("invalid_link", 400, `linked record ${linkId} not found`);
      }
    }
    if (r.kind === "amendment") {
      const target = await this.store.getRecord(r.amendsId!, { includeHeld: true });
      if (target && target.kind !== "preregistration" && target.kind !== "amendment") {
        throw new LedgerError("invalid_link", 400, "an amendment must amend a pre-registration or an amendment");
      }
    }
    if (r.setsStatus) {
      if (!r.campaignId) throw new LedgerError("invalid_link", 400, "sets_status needs a campaign");
      if (!(await this.canSetStatus(actor, r.campaignId))) {
        throw new LedgerError("forbidden", 403, "only the campaign owner or an admin may set its status");
      }
    }

    const createdAt = this.now();
    const id = this.newId();
    const fields = {
      id,
      campaignId: r.campaignId ?? null,
      kind: r.kind,
      title: r.title,
      body: r.body,
      standing: r.standing,
      evidence: r.evidence,
      correctsId: r.correctsId ?? null,
      reviewsId: r.reviewsId ?? null,
      verdict: r.verdict ?? null,
      amendsId: r.amendsId ?? null,
      aboutId: r.aboutId ?? null,
      setsStatus: r.setsStatus ?? null,
    };
    const contentHash = await recordContentHash({ ...fields, authorUsername: actor.username, createdAt: createdAt.toISOString() });
    const preview: StoredRecord = {
      ...fields, authorId: actor.id, clientRef: r.clientRef ?? null, held: r.held, contentHash, filedVia: via,
      createdAt, authorUsername: actor.username, released: false,
    };
    const events: NewOutboxEvent[] = r.held ? [] : [{ subject: SUBJECT_FILED, payload: this.eventPayload(preview) }];
    if (!r.held && r.kind === "review") events.push({ subject: SUBJECT_REVIEW, payload: this.eventPayload(preview) });

    let stored: StoredRecord;
    try {
      stored = await this.store.insertRecord(
        { ...fields, authorId: actor.id, clientRef: r.clientRef ?? null, held: r.held, contentHash, filedVia: via, createdAt },
        events,
      );
    } catch (error: any) {
      if (error?.code === "duplicate_client_ref" && r.clientRef) {
        const prior = await this.store.findByClientRef(actor.id, r.clientRef);
        if (prior) return { record: toPublicRecord(prior), created: false };
      }
      throw error;
    }
    if (!r.held && r.setsStatus && r.campaignId) await this.store.setCampaignStatus(r.campaignId, r.setsStatus);
    return { record: toPublicRecord(stored), created: true };
  }

  private assertReleaser(actor: Actor): void {
    if (actor.userType === "agent") throw new LedgerError("agents_cannot_release", 403);
    if (!actor.canRelease) throw new LedgerError("not_releaser", 403);
  }

  async release(actor: Actor, recordId: string, note: string | null = null): Promise<PublicRecord> {
    this.assertReleaser(actor);
    const record = await this.store.getRecord(recordId, { includeHeld: true });
    if (!record) throw new LedgerError("not_found", 404);
    if (!record.held) throw new LedgerError("invalid_input", 400, "record is not held");
    if (!record.released) {
      const events: NewOutboxEvent[] = [{ subject: SUBJECT_RELEASED, payload: this.eventPayload(record) }];
      if (record.kind === "review") events.push({ subject: SUBJECT_REVIEW, payload: this.eventPayload(record) });
      try {
        await this.store.insertRelease({ recordId, releasedBy: actor.id, releasedAt: this.now(), note }, events);
      } catch (error: any) {
        if (error?.code !== "duplicate") throw error; // a concurrent release won; fall through to the re-read
      }
      if (record.setsStatus && record.campaignId) await this.store.setCampaignStatus(record.campaignId, record.setsStatus);
    }
    const after = await this.store.getRecord(recordId, { includeHeld: true });
    return toPublicRecord(after!);
  }

  async getRecordView(viewer: Actor | null, id: string): Promise<RecordView | null> {
    const vis = { includeHeld: viewer !== null };
    const record = await this.store.getRecord(id, vis);
    if (!record) return null;
    const linked = await this.store.listLinkedTo(id, vis);
    const pick = (f: (r: StoredRecord) => boolean) => linked.filter(f).map(toPublicRecord);
    return {
      record: toPublicRecord(record),
      corrections: pick((r) => r.correctsId === id),
      reviews: pick((r) => r.reviewsId === id),
      notes: pick((r) => r.aboutId === id),
      amendments: pick((r) => r.amendsId === id),
    };
  }

  async listRecords(
    viewer: Actor | null,
    q: { campaignId?: string; kind?: string; standing?: string; author?: string; before?: string; limit?: number },
  ): Promise<PublicRecord[]> {
    if (q.kind && !(LEDGER_KINDS as readonly string[]).includes(q.kind)) throw new LedgerError("invalid_input", 400, "unknown kind");
    if (q.standing && !(LEDGER_STANDINGS as readonly string[]).includes(q.standing)) throw new LedgerError("invalid_input", 400, "unknown standing");
    let authorId: string | undefined;
    if (q.author) {
      const u = await this.store.findUserByUsername(q.author);
      if (!u) return [];
      authorId = u.id;
    }
    const before = q.before ? new Date(q.before) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new LedgerError("invalid_input", 400, "before must be an ISO date");
    const rows = await this.store.listRecords(
      { campaignId: q.campaignId, kind: q.kind as any, standing: q.standing as any, authorId, before, limit: q.limit },
      { includeHeld: viewer !== null },
    );
    return rows.map(toPublicRecord);
  }

  async createCampaign(actor: Actor, input: unknown): Promise<LedgerCampaign> {
    const parsed = campaignInputSchema.safeParse(input);
    if (!parsed.success) throw inputError(parsed.error);
    try {
      return await this.store.insertCampaign({ ...parsed.data, ownerId: actor.id, status: "registered", createdAt: this.now() });
    } catch (error: any) {
      if (error?.code === "duplicate") throw new LedgerError("invalid_input", 409, "campaign id already exists");
      throw error;
    }
  }

  listCampaigns(): Promise<LedgerCampaign[]> {
    return this.store.listCampaigns();
  }

  async getCampaignView(viewer: Actor | null, id: string): Promise<{ campaign: LedgerCampaign; records: PublicRecord[] } | null> {
    const campaign = await this.store.getCampaign(id);
    if (!campaign) return null;
    const records = await this.store.listRecords({ campaignId: id, limit: 200 }, { includeHeld: viewer !== null });
    return { campaign, records: records.map(toPublicRecord) };
  }

  async agentProfile(viewer: Actor | null, username: string): Promise<AgentProfile | null> {
    const u = await this.store.findUserByUsername(username);
    if (!u) return null;
    const vis = { includeHeld: viewer !== null };
    const [stats, records] = await Promise.all([
      this.store.authorStats(u.id, vis),
      this.store.listRecords({ authorId: u.id, limit: 100 }, vis),
    ]);
    return { username: u.username, stats, records: records.map(toPublicRecord) };
  }

  async pendingReleases(actor: Actor): Promise<PublicRecord[]> {
    this.assertReleaser(actor);
    return (await this.store.listUnreleasedHeld()).map(toPublicRecord);
  }
}
```

Note on the correction test: the correction's own view contains `correctsId` (an id string) but never the held record's title or body, and the held id resolves to `null` for anonymous viewers. That is the behaviour Review Focus item 1 asks for.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/services/ledger/service.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Mutation check (do not commit the mutation)**

Temporarily change `if (actor.userType === "agent") throw new LedgerError("agents_cannot_release", 403);` to `if (false) throw ...`, run `npx vitest run server/services/ledger/service.test.ts`, confirm at least one test FAILS, then restore the line (copy the file aside first; do not use `git checkout --` on an uncommitted file). Repeat for the `includeHeld: viewer !== null` argument in `getRecordView` (change to `includeHeld: true`), confirm a failure, restore.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` (clean), `npx vitest run server/services/ledger` (all pass).

```bash
git add server/services/ledger/service.ts server/services/ledger/service.test.ts
git commit -s -m "ledger: service with filing rules, idempotency, release by humans only, and visibility-filtered reads"
```

### Task 8: The Drizzle (Postgres) store

**Files:**
- Create: `server/services/ledger/drizzle-store.ts`
- Create: `server/services/ledger/drizzle-store.test.ts`

**Interfaces:**
- Consumes: `LedgerStore`, `AgentKeyStore`, `StoredRecord` and friends (Task 6); tables (Task 4); `ulid` (Task 5).
- Produces: `class DrizzleLedgerStore implements LedgerStore` and `class DrizzleAgentKeyStore implements AgentKeyStore`, both with constructor `(db: any)` taking the Drizzle instance exported by `server/db.ts`.

The contract suite from Task 6 is the test. It runs against a real Postgres only when `LEDGER_TEST_DATABASE_URL` is set, and refuses any URL whose database name does not contain `test`, because the suite truncates the ledger tables.

- [ ] **Step 1: Write the test**

Create `server/services/ledger/drizzle-store.test.ts`:

```ts
import { describe, it } from "vitest";
import { describeLedgerStoreContract } from "./store-contract";

const url = process.env.LEDGER_TEST_DATABASE_URL;

if (!url) {
  describe("DrizzleLedgerStore (contract)", () => {
    it.skip("set LEDGER_TEST_DATABASE_URL to a throwaway Postgres whose db name contains 'test'", () => {});
  });
} else {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) throw new Error(`refusing to run destructive store tests against database "${dbName}"`);
  describeLedgerStoreContract("drizzle", async () => {
    const pg = (await import("pg")).default;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const baseSchema = await import("@shared/schema");
    const ledgerSchema = await import("@shared/ledger-schema");
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzle(pool, { schema: { ...baseSchema, ...ledgerSchema } });
    await pool.query("TRUNCATE ledger_outbox, ledger_releases, ledger_records, ledger_campaigns, agent_keys");
    await pool.query("DELETE FROM users WHERE username IN ('contract-alice', 'contract-bob')");
    const mk = async (username: string) => {
      const { rows } = await pool.query(
        "INSERT INTO users (username, zkp_commitment, user_type, display_name) VALUES ($1, 'x', 'agent', $1) RETURNING id, username",
        [username],
      );
      return rows[0] as { id: string; username: string };
    };
    const alice = await mk("contract-alice");
    const bob = await mk("contract-bob");
    const { DrizzleLedgerStore } = await import("./drizzle-store");
    return { store: new DrizzleLedgerStore(db), alice, bob };
  });
}
```

- [ ] **Step 2: Run it (skips without a test database)**

Run: `npx vitest run server/services/ledger/drizzle-store.test.ts`
Expected without the env var: 1 skipped. If you have a local Postgres: create a database named `spacechild_ledger_test`, then `DATABASE_URL=postgresql://localhost:5432/spacechild_ledger_test npm run db:push` and `LEDGER_TEST_DATABASE_URL=postgresql://localhost:5432/spacechild_ledger_test npx vitest run server/services/ledger/drizzle-store.test.ts`. Expected before Step 3: FAIL, cannot resolve `./drizzle-store`.

- [ ] **Step 3: Write the store**

Create `server/services/ledger/drizzle-store.ts`:

```ts
import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  agentKeys, ledgerCampaigns, ledgerOutbox, ledgerRecords, ledgerReleases,
  type AgentKey, type CampaignStatus, type LedgerCampaign, type LedgerRelease, type NewAgentKey,
  type NewLedgerCampaign, type NewLedgerRecord, type NewLedgerRelease,
} from "@shared/ledger-schema";
import type {
  AgentKeyStore, AuthorStats, LedgerStore, NewOutboxEvent, RecordFilter, StoredRecord, Visibility,
} from "./types";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "./types";
import { ulid } from "./ulid";

const recordColumns = {
  ...getTableColumns(ledgerRecords),
  authorUsername: users.username,
  releaseRecordId: ledgerReleases.recordId,
};

type Row = typeof ledgerRecords.$inferSelect & { authorUsername: string; releaseRecordId: string | null };

function pgError(e: any): { code?: string; constraint?: string } {
  return { code: e?.code ?? e?.cause?.code, constraint: e?.constraint ?? e?.cause?.constraint };
}

function toStored(row: Row): StoredRecord {
  const { releaseRecordId, ...rest } = row;
  return { ...rest, released: releaseRecordId !== null };
}

export class DrizzleLedgerStore implements LedgerStore {
  constructor(private readonly db: any) {}

  private select(executor: any = this.db) {
    return executor
      .select(recordColumns)
      .from(ledgerRecords)
      .innerJoin(users, eq(users.id, ledgerRecords.authorId))
      .leftJoin(ledgerReleases, eq(ledgerReleases.recordId, ledgerRecords.id));
  }

  /** The single place the public visibility rule lives for Postgres. */
  private visible(vis: Visibility): SQL | undefined {
    return vis.includeHeld ? undefined : or(eq(ledgerRecords.held, false), isNotNull(ledgerReleases.recordId));
  }

  async getCampaign(id: string) {
    const [c] = await this.db.select().from(ledgerCampaigns).where(eq(ledgerCampaigns.id, id));
    return c as LedgerCampaign | undefined;
  }

  async listCampaigns() {
    return (await this.db.select().from(ledgerCampaigns).orderBy(desc(ledgerCampaigns.createdAt))) as LedgerCampaign[];
  }

  async insertCampaign(c: NewLedgerCampaign) {
    try {
      const [row] = await this.db.insert(ledgerCampaigns).values(c).returning();
      return row as LedgerCampaign;
    } catch (e) {
      if (pgError(e).code === "23505") throw Object.assign(new Error("campaign exists"), { code: "duplicate" });
      throw e;
    }
  }

  async setCampaignStatus(id: string, status: CampaignStatus) {
    await this.db.update(ledgerCampaigns).set({ status }).where(eq(ledgerCampaigns.id, id));
  }

  async findUserByUsername(username: string) {
    const [u] = await this.db.select({ id: users.id, username: users.username }).from(users).where(eq(users.username, username));
    return u as { id: string; username: string } | undefined;
  }

  async getRecord(id: string, vis: Visibility) {
    const [row] = await this.select().where(and(eq(ledgerRecords.id, id), this.visible(vis)));
    return row ? toStored(row) : undefined;
  }

  async findByClientRef(authorId: string, clientRef: string) {
    const [row] = await this.select().where(and(eq(ledgerRecords.authorId, authorId), eq(ledgerRecords.clientRef, clientRef)));
    return row ? toStored(row) : undefined;
  }

  async listRecords(f: RecordFilter, vis: Visibility) {
    const limit = Math.min(Math.max(Number.isFinite(f.limit) ? (f.limit as number) : DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const conds = [
      this.visible(vis),
      f.campaignId ? eq(ledgerRecords.campaignId, f.campaignId) : undefined,
      f.kind ? eq(ledgerRecords.kind, f.kind) : undefined,
      f.standing ? eq(ledgerRecords.standing, f.standing) : undefined,
      f.authorId ? eq(ledgerRecords.authorId, f.authorId) : undefined,
      f.before ? lt(ledgerRecords.createdAt, f.before) : undefined,
    ];
    const rows = await this.select().where(and(...conds)).orderBy(desc(ledgerRecords.createdAt), desc(ledgerRecords.id)).limit(limit);
    return (rows as Row[]).map(toStored);
  }

  async listLinkedTo(recordId: string, vis: Visibility) {
    const linked = or(
      eq(ledgerRecords.correctsId, recordId), eq(ledgerRecords.reviewsId, recordId),
      eq(ledgerRecords.amendsId, recordId), eq(ledgerRecords.aboutId, recordId),
    );
    const rows = await this.select().where(and(linked, this.visible(vis))).orderBy(asc(ledgerRecords.createdAt));
    return (rows as Row[]).map(toStored);
  }

  async insertRecord(n: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord> {
    try {
      return await this.db.transaction(async (tx: any) => {
        await tx.insert(ledgerRecords).values(n);
        if (events.length) {
          await tx.insert(ledgerOutbox).values(events.map((e) => ({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: n.createdAt })));
        }
        const [row] = await this.select(tx).where(eq(ledgerRecords.id, n.id));
        return toStored(row);
      });
    } catch (e) {
      const { code, constraint } = pgError(e);
      if (code === "23505" && String(constraint ?? "").includes("client_ref")) {
        throw Object.assign(new Error("duplicate client_ref"), { code: "duplicate_client_ref" });
      }
      throw e;
    }
  }

  async getRelease(recordId: string) {
    const [r] = await this.db.select().from(ledgerReleases).where(eq(ledgerReleases.recordId, recordId));
    return r as LedgerRelease | undefined;
  }

  async insertRelease(n: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease> {
    try {
      return await this.db.transaction(async (tx: any) => {
        const [row] = await tx.insert(ledgerReleases).values(n).returning();
        if (events.length) {
          await tx.insert(ledgerOutbox).values(events.map((e) => ({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: n.releasedAt })));
        }
        return row as LedgerRelease;
      });
    } catch (e) {
      if (pgError(e).code === "23505") throw Object.assign(new Error("already released"), { code: "duplicate" });
      throw e;
    }
  }

  async listUnreleasedHeld() {
    const rows = await this.select().where(and(eq(ledgerRecords.held, true), isNull(ledgerReleases.recordId))).orderBy(desc(ledgerRecords.createdAt));
    return (rows as Row[]).map(toStored);
  }

  async listUnpublishedEvents(limit: number) {
    return this.db.select().from(ledgerOutbox).where(isNull(ledgerOutbox.publishedAt)).orderBy(asc(ledgerOutbox.createdAt), asc(ledgerOutbox.id)).limit(limit);
  }

  async markEventPublished(id: string, at: Date) {
    await this.db.update(ledgerOutbox).set({ publishedAt: at }).where(eq(ledgerOutbox.id, id));
  }

  async authorStats(authorId: string, vis: Visibility): Promise<AuthorStats> {
    const mine = (await this.select().where(and(eq(ledgerRecords.authorId, authorId), this.visible(vis)))) as Row[];
    const ids = mine.map((r) => r.id);
    const about = ids.length
      ? ((await this.select().where(and(
          or(inArray(ledgerRecords.reviewsId, ids), inArray(ledgerRecords.correctsId, ids)),
          this.visible(vis),
        ))) as Row[])
      : [];
    return {
      filed: mine.length,
      reviewsGiven: mine.filter((r) => r.kind === "review").length,
      reviewsReceived: about.filter((r) => r.kind === "review").length,
      corrected: new Set(about.filter((r) => r.kind === "correction").map((r) => r.correctsId)).size,
      retracted: mine.filter((r) => r.standing === "retracted").length,
    };
  }
}

export class DrizzleAgentKeyStore implements AgentKeyStore {
  constructor(private readonly db: any) {}

  async insert(k: NewAgentKey) {
    const [row] = await this.db.insert(agentKeys).values(k).returning();
    return row as AgentKey;
  }
  async findByHash(keyHash: string) {
    const [row] = await this.db.select().from(agentKeys).where(eq(agentKeys.keyHash, keyHash));
    return row as AgentKey | undefined;
  }
  async findById(id: string) {
    const [row] = await this.db.select().from(agentKeys).where(eq(agentKeys.id, id));
    return row as AgentKey | undefined;
  }
  async listForUser(userId: string) {
    return (await this.db.select().from(agentKeys).where(eq(agentKeys.userId, userId)).orderBy(desc(agentKeys.createdAt))) as AgentKey[];
  }
  async revoke(id: string, at: Date) {
    const [row] = await this.db.update(agentKeys).set({ revokedAt: at }).where(and(eq(agentKeys.id, id), isNull(agentKeys.revokedAt))).returning();
    return (row as AgentKey | undefined) ?? (await this.findById(id));
  }
  async touch(id: string, at: Date) {
    await this.db.update(agentKeys).set({ lastUsedAt: at }).where(eq(agentKeys.id, id));
  }
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run server/services/ledger/drizzle-store.test.ts` (1 skipped without a DB; 8 passing with one), `npx tsc --noEmit` (clean).

```bash
git add server/services/ledger/drizzle-store.ts server/services/ledger/drizzle-store.test.ts
git commit -s -m "ledger: Postgres store implementing the store contract (visibility rule in one place, outbox in the same transaction)"
```

### Task 9: Agent keys: issue, authenticate, revoke, bearer middleware, rate limits

**Files:**
- Create: `server/services/ledger/agent-keys.ts`
- Create: `server/services/ledger/agent-keys.test.ts`
- Create: `server/services/ledger/rate-limits.ts`
- Create: `server/services/ledger/index.ts` (the production composition root)
- Modify: `server/index.ts` (mount `agentKeyAuth` between `loadUser` and `guardMutations`)

**Interfaces:**
- Consumes: `AgentKeyStore`, `LedgerError` (Task 6); `DrizzleLedgerStore`, `DrizzleAgentKeyStore` (Task 8); `LedgerService` (Task 7).
- Produces: `KEY_PREFIX = "scl_"`, `generateSecret(): string`, `hashSecret(secret: string): string`, `isValidEd25519PublicKey(b64: string): boolean`, `type PublicAgentKey = Omit<AgentKey, "keyHash">`, `class AgentKeyService` with `(store: AgentKeyStore, users: { getUser(id: string): Promise<User | undefined> }, now?: () => Date)` and methods `issue(userId, name, ed25519PublicKey?)` → `{ key: PublicAgentKey; secret: string }`, `authenticate(secret)` → `{ ok: true; user: User; key: AgentKey } | { ok: false; error: "unknown_key" | "revoked_key" }`, `getKey(id)` → `AgentKey | undefined`, `userFor(key)` → `User | undefined`, `list(userId)` → `PublicAgentKey[]`, `revoke(id)` → `PublicAgentKey`; `agentKeyAuth(keys: AgentKeyService): RequestHandler`; `Express.Request.agentKey?: AgentKey`; `ledgerFileLimiter(): RequestHandler`, `ledgerReadLimiter(): RequestHandler`; and from `index.ts`: `ledgerStore`, `agentKeyStore`, `ledgerService`, `agentKeys`.

- [ ] **Step 1: Write the failing test**

Create `server/services/ledger/agent-keys.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { AgentKeyService, agentKeyAuth, hashSecret } from "./agent-keys";
import { MemoryAgentKeyStore } from "./memory-store";
import { ledgerFileLimiter } from "./rate-limits";

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
    app.get("/who", (req, res) => res.json({ user: req.user?.username ?? null, key: Boolean(req.agentKey) }));
    const { base, close } = await serve(app);
    try {
      expect(await (await fetch(`${base}/who`, { headers: { authorization: `Bearer ${secret}` } })).json()).toEqual({ user: "kannaka", key: true });
      const bad = await fetch(`${base}/who`, { headers: { authorization: "Bearer scl_wrong" } });
      expect(bad.status).toBe(401);
      expect(await bad.json()).toEqual({ error: "unknown_key" });
      expect(await (await fetch(`${base}/who`, { headers: { authorization: "Bearer legacy.hmac-token" } })).json()).toEqual({ user: null, key: false });
      expect(await (await fetch(`${base}/who`)).json()).toEqual({ user: null, key: false });
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
    app.post("/file", ledgerFileLimiter(), (_req, res) => res.json({ ok: true }));
    const { base, close } = await serve(app);
    try {
      const post = () => fetch(`${base}/file`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/ledger/agent-keys.test.ts`
Expected: FAIL, cannot resolve `./agent-keys`.

- [ ] **Step 3: Write the key service and middleware**

Create `server/services/ledger/agent-keys.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import type { User } from "@shared/schema";
import type { AgentKey } from "@shared/ledger-schema";
import type { AgentKeyStore } from "./types";
import { LedgerError } from "./types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      agentKey?: AgentKey;
    }
  }
}

export const KEY_PREFIX = "scl_";
export type PublicAgentKey = Omit<AgentKey, "keyHash">;

export function generateSecret(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** A raw 32-byte Ed25519 public key, standard base64 (44 characters with padding). */
export function isValidEd25519PublicKey(b64: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(b64) && Buffer.from(b64, "base64").length === 32;
}

function publicKey(k: AgentKey): PublicAgentKey {
  const { keyHash: _h, ...rest } = k;
  return rest;
}

export class AgentKeyService {
  constructor(
    private readonly store: AgentKeyStore,
    private readonly users: { getUser(id: string): Promise<User | undefined> },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(userId: string, name: string, ed25519PublicKey?: string | null): Promise<{ key: PublicAgentKey; secret: string }> {
    const user = await this.users.getUser(userId);
    if (!user) throw new LedgerError("not_found", 404, "user not found");
    if (user.userType !== "agent") throw new LedgerError("forbidden", 400, "keys are issued to agent accounts only");
    const cleanName = String(name ?? "").trim();
    if (!cleanName || cleanName.length > 80) throw new LedgerError("invalid_input", 400, "name must be 1-80 characters");
    if (ed25519PublicKey && !isValidEd25519PublicKey(ed25519PublicKey)) {
      throw new LedgerError("invalid_input", 400, "ed25519PublicKey must be a raw 32-byte key in base64");
    }
    const secret = generateSecret();
    const key = await this.store.insert({
      userId, name: cleanName, prefix: secret.slice(0, 12), keyHash: hashSecret(secret),
      ed25519PublicKey: ed25519PublicKey ?? null, createdAt: this.now(),
    });
    return { key: publicKey(key), secret };
  }

  async authenticate(secret: string): Promise<{ ok: true; user: User; key: AgentKey } | { ok: false; error: "unknown_key" | "revoked_key" }> {
    if (!secret.startsWith(KEY_PREFIX)) return { ok: false, error: "unknown_key" };
    const key = await this.store.findByHash(hashSecret(secret));
    if (!key) return { ok: false, error: "unknown_key" };
    if (key.revokedAt) return { ok: false, error: "revoked_key" };
    const user = await this.users.getUser(key.userId);
    // A key stops working the moment its account is no longer an agent.
    if (!user || user.userType !== "agent") return { ok: false, error: "revoked_key" };
    void this.store.touch(key.id, this.now()).catch(() => { /* best effort */ });
    return { ok: true, user, key };
  }

  getKey(id: string): Promise<AgentKey | undefined> {
    return this.store.findById(id);
  }

  userFor(key: AgentKey): Promise<User | undefined> {
    return this.users.getUser(key.userId);
  }

  async list(userId: string): Promise<PublicAgentKey[]> {
    return (await this.store.listForUser(userId)).map(publicKey);
  }

  async revoke(id: string): Promise<PublicAgentKey> {
    const k = await this.store.revoke(id, this.now());
    if (!k) throw new LedgerError("not_found", 404, "key not found");
    return publicKey(k);
  }
}

/** Bearer `scl_...` -> req.user + req.agentKey. Other Authorization headers (legacy MCP tokens) pass untouched. */
export function agentKeyAuth(keys: AgentKeyService): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(`Bearer ${KEY_PREFIX}`)) return next();
    try {
      const result = await keys.authenticate(header.slice("Bearer ".length).trim());
      if (!result.ok) {
        res.status(401).json({ error: result.error });
        return;
      }
      req.user = result.user;
      req.agentKey = result.key;
      next();
    } catch (error) {
      next(error);
    }
  };
}
```

Create `server/services/ledger/rate-limits.ts`:

```ts
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";

const keyFor = (req: Request) => req.agentKey?.id ?? req.user?.id ?? ipKeyGenerator(req.ip ?? "");

/** Spec 3.2: 60 filings per hour per key (env LEDGER_FILE_LIMIT_PER_HOUR). */
export function ledgerFileLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.LEDGER_FILE_LIMIT_PER_HOUR ?? 60),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (_req, res) => { res.status(429).json({ error: "rate_limited" }); },
  });
}

/** Spec 3.2: 600 reads per minute per key or IP (env LEDGER_READ_LIMIT_PER_MINUTE). */
export function ledgerReadLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.LEDGER_READ_LIMIT_PER_MINUTE ?? 600),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (_req, res) => { res.status(429).json({ error: "rate_limited" }); },
  });
}
```

Create `server/services/ledger/index.ts`:

```ts
// Production wiring. Tests never import this file (it opens the real database handle).
import { db } from "../../db";
import { storage } from "../../storage";
import { siteUrl } from "../../lib/site-url";
import { DrizzleAgentKeyStore, DrizzleLedgerStore } from "./drizzle-store";
import { LedgerService } from "./service";
import { AgentKeyService } from "./agent-keys";

export const ledgerStore = new DrizzleLedgerStore(db);
export const agentKeyStore = new DrizzleAgentKeyStore(db);
export const ledgerService = new LedgerService(ledgerStore, { baseUrl: siteUrl() });
export const agentKeys = new AgentKeyService(agentKeyStore, storage);
```

- [ ] **Step 4: Mount the middleware**

In `server/index.ts`, add `import { agentKeyAuth } from "./services/ledger/agent-keys";` and `import { agentKeys } from "./services/ledger";`, then change

```ts
app.use(loadUser);
app.use(guardMutations);
```

to

```ts
app.use(loadUser);
// Ledger agents authenticate with `Authorization: Bearer scl_...` (spec 3.2). Must run before guardMutations.
app.use(agentKeyAuth(agentKeys));
app.use(guardMutations);
```

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npx vitest run server/services/ledger/agent-keys.test.ts` (expected PASS, 6 tests), `npx tsc --noEmit` (clean), `npm run build` (succeeds).

```bash
git add server/services/ledger/agent-keys.ts server/services/ledger/agent-keys.test.ts server/services/ledger/rate-limits.ts server/services/ledger/index.ts server/index.ts
git commit -s -m "ledger: hashed revocable agent keys, bearer middleware, per-key rate limits"
```

### Task 10: HTTP API and admin routes

**Files:**
- Create: `server/routes/ledger.ts`
- Create: `server/routes/ledger.test.ts`
- Create: `server/routes/ledger-admin.ts`
- Create: `server/routes/ledger-admin.test.ts`
- Create: `server/test-utils/serve.ts`
- Modify: `server/routes.ts` (mount both routers)

**Interfaces:**
- Consumes: `LedgerService`, `actorFromUser` (Task 7); `AgentKeyService`, `ledgerFileLimiter`, `ledgerReadLimiter`, `ledgerService`, `agentKeys` (Task 9); `requireAuth`, `requireAdmin` (`server/middleware/auth.ts`); `sanitizeUser` (`server/lib/sanitize.ts`).
- Produces: `createLedgerRouter(svc: LedgerService, limits?: { file?: RequestHandler; read?: RequestHandler }): Router` mounted at `/api/ledger`; `sendLedgerError(res: Response, error: unknown): void`; `createLedgerAdminRouter(deps: { keys: AgentKeyService; users: { getUser(id: string): Promise<User | undefined>; updateUser(id: string, u: Partial<User>): Promise<User> } }): Router` mounted at `/api/admin` behind `requireAdmin`; `serve(app)` test helper returning `{ base: string; close(): Promise<void> }`.
- Routes: `GET /api/ledger/records`, `GET /api/ledger/records/:id`, `POST /api/ledger/records`, `POST /api/ledger/records/:id/release`, `GET /api/ledger/campaigns`, `GET /api/ledger/campaigns/:id`, `POST /api/ledger/campaigns`, `GET /api/ledger/agents/:username`, `GET /api/ledger/releases`; `POST /api/admin/users/:id/promote-agent`, `POST /api/admin/users/:id/releaser`, `GET /api/admin/users/:id/keys`, `POST /api/admin/users/:id/keys`, `DELETE /api/admin/keys/:id`.

- [ ] **Step 1: Write the test helper and the failing tests**

Create `server/test-utils/serve.ts`:

```ts
import type { Express } from "express";
import type { AddressInfo } from "node:net";

/** Start an Express app on an ephemeral port for fetch-based route tests. */
export async function serve(app: Express): Promise<{ base: string; close(): Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
```

Create `server/routes/ledger.test.ts`:

```ts
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
});
```

Create `server/routes/ledger-admin.test.ts`:

```ts
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
    ["u-n", { id: "u-n", username: "nick", userType: "human", role: "admin", canRelease: true }],
  ]);
  const userStore = {
    getUser: async (id: string) => users.get(id),
    updateUser: async (id: string, u: any) => { const next = { ...users.get(id), ...u }; users.set(id, next); return next; },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = users.get("u-n"); next(); });
  app.use("/api/admin", createLedgerAdminRouter({ keys: new AgentKeyService(new MemoryAgentKeyStore(), userStore), users: userStore }));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${srv.base}/api/admin${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/ledger.test.ts server/routes/ledger-admin.test.ts`
Expected: FAIL, cannot resolve `./ledger` and `./ledger-admin`.

- [ ] **Step 3: Write the routers**

Create `server/routes/ledger.ts`:

```ts
import { Router, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { LedgerError } from "../services/ledger/types";
import { actorFromUser, type LedgerService } from "../services/ledger/service";

const passthrough: RequestHandler = (_req, _res, next) => next();

/** Spec 6: every rejection returns a reason and is logged with the route and key prefix. */
export function sendLedgerError(res: Response, error: unknown, req?: Request): void {
  const where = req ? `${req.method} ${req.originalUrl ?? req.path} key=${req.agentKey?.prefix ?? "-"} user=${req.user?.username ?? "-"}` : "";
  if (error instanceof LedgerError) {
    console.warn(`[ledger] rejected ${error.code} ${where}`);
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error(`[ledger] failed ${where}`, error);
  res.status(500).json({ error: "internal_error" });
}

const str = (v: unknown) => (typeof v === "string" && v.length ? v : undefined);
const viewer = (req: Request) => (req.user ? actorFromUser(req.user as any) : null);
const actor = (req: Request) => actorFromUser(req.user as any);

export function createLedgerRouter(svc: LedgerService, limits: { file?: RequestHandler; read?: RequestHandler } = {}): Router {
  const r = Router();
  const file = limits.file ?? passthrough;
  const read = limits.read ?? passthrough;

  r.get("/records", read, async (req, res) => {
    try {
      const limit = Number(req.query.limit);
      res.json(await svc.listRecords(viewer(req), {
        campaignId: str(req.query.campaign), kind: str(req.query.kind), standing: str(req.query.standing),
        author: str(req.query.author), before: str(req.query.before), limit: Number.isFinite(limit) ? limit : undefined,
      }));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/records/:id", read, async (req, res) => {
    try {
      const view = await svc.getRecordView(viewer(req), req.params.id);
      if (!view) { res.status(404).json({ error: "not_found" }); return; }
      res.json(view);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/records", requireAuth, file, async (req, res) => {
    try {
      const { record, created } = await svc.file(actor(req), req.body, req.agentKey ? "api" : "web");
      res.status(created ? 201 : 200).json({ record, created });
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/records/:id/release", requireAuth, async (req, res) => {
    try {
      const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 2000) : null;
      res.json({ record: await svc.release(actor(req), req.params.id, note) });
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/campaigns", read, async (req, res) => {
    try { res.json(await svc.listCampaigns()); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/campaigns/:id", read, async (req, res) => {
    try {
      const view = await svc.getCampaignView(viewer(req), req.params.id);
      if (!view) { res.status(404).json({ error: "not_found" }); return; }
      res.json(view);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/campaigns", requireAuth, file, async (req, res) => {
    try { res.status(201).json(await svc.createCampaign(actor(req), req.body)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/agents/:username", read, async (req, res) => {
    try {
      const profile = await svc.agentProfile(viewer(req), req.params.username);
      if (!profile) { res.status(404).json({ error: "not_found" }); return; }
      res.json(profile);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/releases", requireAuth, async (req, res) => {
    try { res.json(await svc.pendingReleases(actor(req))); } catch (e) { sendLedgerError(res, e, req); }
  });

  return r;
}
```

Create `server/routes/ledger-admin.ts`:

```ts
import { Router } from "express";
import type { User } from "@shared/schema";
import { sanitizeUser } from "../lib/sanitize";
import type { AgentKeyService } from "../services/ledger/agent-keys";
import { sendLedgerError } from "./ledger";

export function createLedgerAdminRouter(deps: {
  keys: AgentKeyService;
  users: { getUser(id: string): Promise<User | undefined>; updateUser(id: string, u: Partial<User>): Promise<User> };
}): Router {
  const r = Router();

  r.post("/users/:id/promote-agent", async (req, res) => {
    try {
      if (req.params.id === req.user?.id) { res.status(400).json({ error: "invalid_input", message: "cannot promote yourself" }); return; }
      const user = await deps.users.getUser(req.params.id);
      if (!user) { res.status(404).json({ error: "not_found" }); return; }
      // An agent may never release, so promotion clears the flag in the same write.
      res.json(sanitizeUser(await deps.users.updateUser(user.id, { userType: "agent", canRelease: false })));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/releaser", async (req, res) => {
    try {
      const user = await deps.users.getUser(req.params.id);
      if (!user) { res.status(404).json({ error: "not_found" }); return; }
      const canRelease = req.body?.canRelease === true;
      if (canRelease && user.userType === "agent") { res.status(400).json({ error: "agents_cannot_release" }); return; }
      res.json(sanitizeUser(await deps.users.updateUser(user.id, { canRelease })));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/users/:id/keys", async (req, res) => {
    try { res.json(await deps.keys.list(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/keys", async (req, res) => {
    try {
      res.status(201).json(await deps.keys.issue(req.params.id, String(req.body?.name ?? ""), req.body?.ed25519PublicKey ?? null));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.delete("/keys/:id", async (req, res) => {
    try { res.json(await deps.keys.revoke(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  return r;
}
```

- [ ] **Step 4: Mount them**

In `server/routes.ts`, add imports:

```ts
import { createLedgerRouter } from "./routes/ledger";
import { createLedgerAdminRouter } from "./routes/ledger-admin";
import { agentKeys, ledgerService } from "./services/ledger";
import { ledgerFileLimiter, ledgerReadLimiter } from "./services/ledger/rate-limits";
```

and inside `registerRoutes`, directly after the Part 1 admin routes (`app.delete("/api/admin/users/:id", ...)`), add:

```ts
  // ===== Research ledger (spec docs/superpowers/specs/2026-10-03-research-ledger-design.md) =====
  app.use("/api/ledger", createLedgerRouter(ledgerService, { file: ledgerFileLimiter(), read: ledgerReadLimiter() }));
  app.use("/api/admin", requireAdmin, createLedgerAdminRouter({ keys: agentKeys, users: storage }));
```

- [ ] **Step 5: Run tests, mutation check, typecheck, commit**

Run: `npx vitest run server/routes/ledger.test.ts server/routes/ledger-admin.test.ts` (expected PASS, 6 + 4 tests).
Mutation: in `server/services/ledger/memory-store.ts` change `return vis.includeHeld || !r.held || this.releases.has(r.id);` to `return true;`, run `npx vitest run server/routes/ledger.test.ts`, confirm `never shows a held record on any public route` FAILS, restore the line from a copy you made first.
Then `npx vitest run` (all pass), `npx tsc --noEmit` (clean), `npm run build`.

```bash
git add server/routes/ledger.ts server/routes/ledger.test.ts server/routes/ledger-admin.ts server/routes/ledger-admin.test.ts server/test-utils/serve.ts server/routes.ts
git commit -s -m "ledger: HTTP API and admin routes (promote agent, releaser, keys)"
```

### Task 11: MCP ledger tools over HTTP and WebSocket

**Files:**
- Create: `server/mcp-ledger-tools.ts`
- Create: `server/mcp-ledger-tools.test.ts`
- Modify: `server/mcp-http.ts` (list the tools; route `ledger_*` calls through the agent key)
- Modify: `server/mcp-server.ts` (accept an optional ledger actor; list and dispatch the tools)
- Modify: `server/websocket.ts` (accept `scl_` keys on the `/mcp` upgrade)

**Interfaces:**
- Consumes: `LedgerService`, `actorFromUser` (Task 7); `LedgerError` (Task 6); `agentKeys`, `ledgerService` (Task 9).
- Produces: `LEDGER_TOOLS` (array of MCP tool definitions named `ledger_file`, `ledger_review`, `ledger_list`, `ledger_get`, `ledger_campaigns`), `isLedgerTool(name: string): boolean`, `handleLedgerTool(name: string, args: Record<string, any>, actor: Actor, svc: LedgerService): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>`; `createMcpServer(authedAgentId: string, ledgerActor?: Actor)`.

- [ ] **Step 1: Write the failing test**

Create `server/mcp-ledger-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryLedgerStore } from "./services/ledger/memory-store";
import { LedgerService } from "./services/ledger/service";
import { LEDGER_TOOLS, handleLedgerTool, isLedgerTool } from "./mcp-ledger-tools";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
const parse = (r: any) => JSON.parse(r.content[0].text);

describe("MCP ledger tools", () => {
  it("declares five tools", () => {
    expect(LEDGER_TOOLS.map((t) => t.name)).toEqual(["ledger_file", "ledger_review", "ledger_list", "ledger_get", "ledger_campaigns"]);
    expect(isLedgerTool("ledger_get")).toBe(true);
    expect(isLedgerTool("search_papers")).toBe(false);
  });

  it("files, reviews, lists and gets", async () => {
    const svc = new LedgerService(new MemoryLedgerStore([agent]));
    const filed = parse(await handleLedgerTool("ledger_file", { kind: "result", title: "r", clientRef: "m1" }, agent, svc));
    expect(filed.created).toBe(true);
    const review = parse(await handleLedgerTool("ledger_review", { reviewsId: filed.record.id, verdict: "holds", title: "ok" }, agent, svc));
    expect(review.record.kind).toBe("review");
    expect(review.record.filedVia).toBe("mcp");
    expect(parse(await handleLedgerTool("ledger_list", {}, agent, svc))).toHaveLength(2);
    expect(parse(await handleLedgerTool("ledger_get", { id: filed.record.id }, agent, svc)).reviews).toHaveLength(1);
  });

  it("returns reason codes as tool errors, not exceptions", async () => {
    const svc = new LedgerService(new MemoryLedgerStore([agent]));
    const res = await handleLedgerTool("ledger_get", { id: "01J9Z3K8Q2A7B5C4D6E8F0G999" }, agent, svc);
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("not_found");
    const bad = await handleLedgerTool("ledger_review", { title: "x" }, agent, svc);
    expect(bad.isError).toBe(true);
  });

  it("is wired into both transports and requires an scl_ key over HTTP", () => {
    const http = readFileSync(new URL("./mcp-http.ts", import.meta.url), "utf8");
    expect(http).toContain("...LEDGER_TOOLS");
    expect(http).toMatch(/isLedgerTool\(name\)[\s\S]{0,300}req\.agentKey/);
    const ws = readFileSync(new URL("./mcp-server.ts", import.meta.url), "utf8");
    expect(ws).toContain("...LEDGER_TOOLS");
    expect(ws).toMatch(/isLedgerTool\(name\)/);
    expect(readFileSync(new URL("./websocket.ts", import.meta.url), "utf8")).toContain('startsWith("scl_")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/mcp-ledger-tools.test.ts`
Expected: FAIL, cannot resolve `./mcp-ledger-tools`.

- [ ] **Step 3: Write the tools module**

Create `server/mcp-ledger-tools.ts`:

```ts
import { CAMPAIGN_STATUSES, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS } from "@shared/ledger-schema";
import type { LedgerService } from "./services/ledger/service";
import type { Actor } from "./services/ledger/types";
import { LedgerError } from "./services/ledger/types";

const evidence = {
  type: "array",
  description: "Pointers to the evidence: [{label, url, sha256?, bytes?}]. Give sha256 only for a file you have seen.",
  items: {
    type: "object",
    properties: { label: { type: "string" }, url: { type: "string" }, sha256: { type: "string" }, bytes: { type: "integer" } },
    required: ["label", "url"],
  },
};
const common = {
  title: { type: "string" },
  body: { type: "string", description: "Markdown" },
  standing: { type: "string", enum: [...LEDGER_STANDINGS] },
  evidence,
  clientRef: { type: "string", description: "Your idempotency key; retries with the same value return the original record" },
  held: { type: "boolean", description: "If true, visible to signed-in members only until a human releases it" },
};

export const LEDGER_TOOLS = [
  {
    name: "ledger_file",
    description: "File an append-only record in the research ledger (pre-registration, run, result, failure, certificate, correction, decision or note). Public unless held=true. Returns the stored record with id and content_hash.",
    inputSchema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: LEDGER_KINDS.filter((k) => k !== "review") },
        campaignId: { type: "string" },
        correctsId: { type: "string", description: "Required for kind=correction" },
        amendsId: { type: "string", description: "Required for kind=amendment" },
        aboutId: { type: "string", description: "For kind=note: the record this comments on" },
        setsStatus: { type: "string", enum: [...CAMPAIGN_STATUSES], description: "kind=decision only; campaign owner or admin" },
        ...common,
      },
      required: ["kind", "title"],
    },
  },
  {
    name: "ledger_review",
    description: "Review another ledger record: verdict holds, breaks or inconclusive.",
    inputSchema: {
      type: "object" as const,
      properties: { reviewsId: { type: "string" }, verdict: { type: "string", enum: [...REVIEW_VERDICTS] }, ...common },
      required: ["reviewsId", "verdict", "title"],
    },
  },
  {
    name: "ledger_list",
    description: "List ledger records, newest first. Filters: campaignId, kind, standing, author (username), before (ISO date), limit (max 200).",
    inputSchema: {
      type: "object" as const,
      properties: {
        campaignId: { type: "string" }, kind: { type: "string", enum: [...LEDGER_KINDS] },
        standing: { type: "string", enum: [...LEDGER_STANDINGS] }, author: { type: "string" },
        before: { type: "string" }, limit: { type: "integer" },
      },
    },
  },
  {
    name: "ledger_get",
    description: "Get one record with its corrections, reviews, notes and amendments.",
    inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "ledger_campaigns",
    description: "List campaigns, or with id, get one campaign and its records.",
    inputSchema: { type: "object" as const, properties: { id: { type: "string" } } },
  },
];

export function isLedgerTool(name: string): boolean {
  return LEDGER_TOOLS.some((t) => t.name === name);
}

const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export async function handleLedgerTool(name: string, args: Record<string, any>, actor: Actor, svc: LedgerService) {
  try {
    switch (name) {
      case "ledger_file": {
        if (args.kind === "review") throw new LedgerError("invalid_input", 400, "use ledger_review for reviews");
        return text(await svc.file(actor, args, "mcp"));
      }
      case "ledger_review":
        return text(await svc.file(actor, { ...args, kind: "review" }, "mcp"));
      case "ledger_list":
        return text(await svc.listRecords(actor, args));
      case "ledger_get": {
        const view = await svc.getRecordView(actor, String(args.id ?? ""));
        if (!view) throw new LedgerError("not_found", 404);
        return text(view);
      }
      case "ledger_campaigns": {
        if (args.id) {
          const view = await svc.getCampaignView(actor, String(args.id));
          if (!view) throw new LedgerError("not_found", 404);
          return text(view);
        }
        return text(await svc.listCampaigns());
      }
      default:
        throw new LedgerError("invalid_input", 400, `unknown ledger tool ${name}`);
    }
  } catch (error) {
    if (error instanceof LedgerError) return text({ error: error.code, message: error.message }, true);
    throw error;
  }
}
```

- [ ] **Step 4: Wire the HTTP transport**

In `server/mcp-http.ts`:
1. Add imports:

```ts
import { LEDGER_TOOLS, handleLedgerTool, isLedgerTool } from "./mcp-ledger-tools.js";
import { ledgerService } from "./services/ledger/index.js";
import { actorFromUser } from "./services/ledger/service.js";
```

2. In the `TOOLS` array, after `...LOOP_TOOLS,` add `...LEDGER_TOOLS,`.
3. Replace the start of `case "tools/call": {` up to and including the `if (!name) { ... }` check with:

```ts
        case "tools/call": {
          if (sessionId) res.setHeader("Mcp-Session-Id", sessionId);
          const { name, arguments: args } = params || {};
          if (!name) {
            return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } });
          }
          // Ledger tools authenticate with an scl_ agent key only (spec 3.2), never the legacy HMAC token.
          if (isLedgerTool(name)) {
            if (!req.user || !req.agentKey) {
              return res.status(401).json({ jsonrpc: "2.0", id, error: { code: -32001, message: "Unauthorized: ledger tools need an scl_ agent key" } });
            }
            const result = await handleLedgerTool(name, args || {}, actorFromUser(req.user as any), ledgerService);
            return res.json({ jsonrpc: "2.0", id, result });
          }
          // Tool calls can read restricted content and create tasks — require a
          // valid MCP bearer token, and derive the agent identity from it.
          const auth = getMcpAuth(req);
          if (!auth) {
            return res.status(401).json({ jsonrpc: "2.0", id, error: { code: -32001, message: "Unauthorized: a valid MCP bearer token is required" } });
          }
```

(the remaining `try { const result = await executeTool(name, args || {}, auth); ...` block stays as is.)

- [ ] **Step 5: Wire the WebSocket transport**

In `server/mcp-server.ts`:
1. Add imports: `import { LEDGER_TOOLS, handleLedgerTool, isLedgerTool } from "./mcp-ledger-tools.js";`, `import { ledgerService } from "./services/ledger/index.js";`, `import type { Actor } from "./services/ledger/types.js";`.
2. Change the signature to `export function createMcpServer(authedAgentId: string, ledgerActor?: Actor): Server {`.
3. In the `ListToolsRequestSchema` handler's tool array, after `...LOOP_TOOLS,` add `...LEDGER_TOOLS,`.
4. Replace the `default:` branch of the `CallToolRequestSchema` switch with:

```ts
    default:
      if (isLedgerTool(name)) {
        if (!ledgerActor) throw new Error("Unauthorized: ledger tools need an scl_ agent key on the /mcp connection");
        return handleLedgerTool(name, args as Record<string, any>, ledgerActor, ledgerService);
      }
      return handleLoopTool(name, args as Record<string, any>, authedAgentId);
```

In `server/websocket.ts`:
1. Add imports: `import { agentKeys } from "./services/ledger/index.js";` and `import { actorFromUser } from "./services/ledger/service.js";` and `import type { Actor } from "./services/ledger/types.js";`.
2. Replace the block from `// Validate token` through the `wss.handleUpgrade(request, socket, head, async (ws) => {` line and the following `const agentId = payload.agentId;` with:

```ts
      // Validate token: an scl_ ledger key (preferred) or the legacy HMAC MCP token.
      let agentId: string;
      let ledgerActor: Actor | undefined;
      if (token.startsWith("scl_")) {
        const authed = await agentKeys.authenticate(token);
        if (!authed.ok) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        agentId = authed.user.id;
        ledgerActor = actorFromUser(authed.user as any);
      } else {
        const payload = validateMcpToken(token);
        if (!payload) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        agentId = payload.agentId;
      }

      // Upgrade connection
      wss.handleUpgrade(request, socket, head, async (ws) => {
```

3. Make the `httpServer.on("upgrade", (request, socket, head) => {` callback `async`.
4. Change `const mcpServer = createMcpServer(agentId);` to `const mcpServer = createMcpServer(agentId, ledgerActor);`.

- [ ] **Step 6: Run tests, typecheck, build, commit**

Run: `npx vitest run server/mcp-ledger-tools.test.ts server/mcp-paper-access.test.ts` (PASS), `npx vitest run` (all), `npx tsc --noEmit` (clean), `npm run build`.

```bash
git add server/mcp-ledger-tools.ts server/mcp-ledger-tools.test.ts server/mcp-http.ts server/mcp-server.ts server/websocket.ts
git commit -s -m "ledger: MCP tools over HTTP and WebSocket, authenticated by scl_ agent keys"
```

### Task 12: First ledger pages: list, record (with in-browser verify), campaign

**Files:**
- Create: `client/src/lib/ledger-view.ts`
- Create: `client/src/lib/ledger-view.test.ts`
- Create: `client/src/components/ledger/badges.tsx`
- Create: `client/src/components/ledger/record-card.tsx`
- Create: `client/src/pages/ledger.tsx`
- Create: `client/src/pages/ledger-record.tsx`
- Create: `client/src/pages/ledger-campaign.tsx`
- Modify: `client/src/App.tsx` (three routes)

**Interfaces:**
- Consumes: `PublicRecord`, `RecordView` (`@shared/ledger-public`); `recordContentHash` (`@shared/ledger-hash`); API routes from Task 10.
- Produces: `campaignTally(records: PublicRecord[]): { passed: number; failed: number; open: number; total: number }`; `TIMELINE_ORDER`; `timeline(records: PublicRecord[]): PublicRecord[]` (oldest first); `verifyRecordHash(r: PublicRecord): Promise<boolean>`; components `KindBadge`, `StandingBadge`, `RecordCard`; pages at `/ledger`, `/records/:id`, `/campaigns/:id`.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/ledger-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PublicRecord } from "@shared/ledger-public";
import { recordContentHash } from "@shared/ledger-hash";
import { campaignTally, timeline, verifyRecordHash } from "./ledger-view";

function rec(over: Partial<PublicRecord>): PublicRecord {
  return {
    id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", campaignId: "c-1", kind: "result", title: "t", body: "", standing: "measured",
    evidence: [], correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null, setsStatus: null,
    authorUsername: "qe", held: false, released: false, contentHash: "", filedVia: "api",
    createdAt: "2026-10-03T00:00:00.000Z", ...over,
  };
}

describe("ledger view helpers", () => {
  it("tallies passed, failed and open", () => {
    const t = campaignTally([
      rec({ kind: "certificate", standing: "certified" }),
      rec({ kind: "result", standing: "measured" }),
      rec({ kind: "failure" }),
      rec({ kind: "result", standing: "retracted" }),
      rec({ kind: "result", standing: "unverified" }),
      rec({ kind: "note" }),
    ]);
    expect(t).toEqual({ passed: 2, failed: 2, open: 1, total: 6 });
  });

  it("orders a timeline oldest first", () => {
    const out = timeline([rec({ id: "b", createdAt: "2026-10-02T00:00:00.000Z" }), rec({ id: "a", createdAt: "2026-10-01T00:00:00.000Z" })]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("verifies a record hash in the browser code path", async () => {
    const r = rec({});
    const good = { ...r, contentHash: await recordContentHash(r) };
    expect(await verifyRecordHash(good)).toBe(true);
    expect(await verifyRecordHash({ ...good, title: "tampered" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/ledger-view.test.ts`
Expected: FAIL, cannot resolve `./ledger-view`.

- [ ] **Step 3: Write the helpers**

Create `client/src/lib/ledger-view.ts`:

```ts
import type { PublicRecord } from "@shared/ledger-public";
import { recordContentHash } from "@shared/ledger-hash";

/** passed = certified or measured results/certificates; failed = failures or retracted; open = unverified results. */
export function campaignTally(records: PublicRecord[]): { passed: number; failed: number; open: number; total: number } {
  let passed = 0;
  let failed = 0;
  let open = 0;
  for (const r of records) {
    if (r.kind === "failure" || r.standing === "retracted") failed++;
    else if ((r.kind === "result" || r.kind === "certificate") && (r.standing === "certified" || r.standing === "measured")) passed++;
    else if ((r.kind === "result" || r.kind === "certificate") && r.standing === "unverified") open++;
  }
  return { passed, failed, open, total: records.length };
}

export function timeline(records: PublicRecord[]): PublicRecord[] {
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Recompute the content hash with the same code the server used; true if it matches. */
export async function verifyRecordHash(r: PublicRecord): Promise<boolean> {
  return (await recordContentHash(r)) === r.contentHash;
}
```

- [ ] **Step 4: Write the components and pages**

Create `client/src/components/ledger/badges.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import type { LedgerKind, LedgerStanding } from "@shared/ledger-schema";

const STANDING_CLASS: Record<LedgerStanding, string> = {
  certified: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  measured: "bg-sky-600/20 text-sky-300 border-sky-600/40",
  unverified: "bg-amber-600/20 text-amber-300 border-amber-600/40",
  retracted: "bg-rose-600/20 text-rose-300 border-rose-600/40 line-through",
};

export function KindBadge({ kind }: { kind: LedgerKind }) {
  return <Badge variant="outline" className="font-mono text-xs">{kind}</Badge>;
}

export function StandingBadge({ standing }: { standing: LedgerStanding }) {
  return <Badge variant="outline" className={`text-xs ${STANDING_CLASS[standing]}`}>{standing}</Badge>;
}
```

Create `client/src/components/ledger/record-card.tsx`:

```tsx
import { Link } from "wouter";
import type { PublicRecord } from "@shared/ledger-public";
import { KindBadge, StandingBadge } from "./badges";

export function RecordCard({ record }: { record: PublicRecord }) {
  return (
    <Link href={`/records/${record.id}`} className="block rounded-lg border border-border p-4 hover:bg-muted/40" data-testid={`record-${record.id}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <KindBadge kind={record.kind} />
          <StandingBadge standing={record.standing} />
          {record.held && !record.released && <span className="text-amber-400">held</span>}
          {record.campaignId && <span className="font-mono">{record.campaignId}</span>}
          <span>{record.authorUsername}</span>
          <time dateTime={record.createdAt}>{new Date(record.createdAt).toUTCString()}</time>
        </div>
        <div className="mt-1 font-medium">{record.title}</div>
    </Link>
  );
}
```

Create `client/src/pages/ledger.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LEDGER_KINDS, LEDGER_STANDINGS } from "@shared/ledger-schema";
import type { PublicRecord } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";

export default function LedgerPage() {
  const [kind, setKind] = useState("");
  const [standing, setStanding] = useState("");
  const qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(standing ? { standing } : {}) }).toString();
  const { data, isLoading, error } = useQuery<PublicRecord[]>({ queryKey: [`/api/ledger/records${qs ? `?${qs}` : ""}`] });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Research ledger</h1>
      <p className="mt-1 text-sm text-muted-foreground">Append-only. Corrections are filed beneath the original, never over it.</p>
      <div className="mt-4 flex gap-2">
        <select aria-label="Kind" className="rounded border bg-background px-2 py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {LEDGER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select aria-label="Standing" className="rounded border bg-background px-2 py-1 text-sm" value={standing} onChange={(e) => setStanding(e.target.value)}>
          <option value="">All standings</option>
          {LEDGER_STANDINGS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <section className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-rose-400">Could not load the ledger.</p>}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}
        {data?.map((r) => <RecordCard key={r.id} record={r} />)}
      </section>
    </main>
  );
}
```

Create `client/src/pages/ledger-record.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { RecordView } from "@shared/ledger-public";
import { Button } from "@/components/ui/button";
import { KindBadge, StandingBadge } from "@/components/ledger/badges";
import { RecordCard } from "@/components/ledger/record-card";
import { verifyRecordHash } from "@/lib/ledger-view";

export default function LedgerRecordPage() {
  const [, params] = useRoute("/records/:id");
  const id = params?.id ?? "";
  const { data, isLoading, error } = useQuery<RecordView>({ queryKey: ["/api/ledger/records", id], enabled: Boolean(id) });
  const [verified, setVerified] = useState<null | boolean>(null);

  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-3xl px-4 py-8">Record not found. <Link href="/ledger" className="underline">Back to the ledger</Link></main>;
  const r = data.record;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <KindBadge kind={r.kind} /><StandingBadge standing={r.standing} />
        {r.campaignId && <Link href={`/campaigns/${r.campaignId}`} className="font-mono underline">{r.campaignId}</Link>}
        <Link href={`/agents/${r.authorUsername}`} className="underline">{r.authorUsername}</Link>
        <time dateTime={r.createdAt}>{new Date(r.createdAt).toUTCString()}</time>
        <span>via {r.filedVia}</span>
        {r.verdict && <span>verdict: {r.verdict}</span>}
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{r.title}</h1>
      <article className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</article>

      {r.evidence.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Evidence</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {r.evidence.map((e, i) => (
              <li key={i}>
                <a className="underline" href={e.url} rel="noreferrer noopener" target="_blank">{e.label}</a>
                {e.sha256 && <span className="ml-2 break-all font-mono text-xs text-muted-foreground">sha256 {e.sha256}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded border border-border p-3 text-xs">
        <div className="break-all font-mono">content hash {r.contentHash}</div>
        <Button className="mt-2" size="sm" variant="outline" onClick={async () => setVerified(await verifyRecordHash(r))}>
          Verify in this browser
        </Button>
        {verified === true && <span className="ml-3 text-emerald-400">Matches: this record is unchanged since filing.</span>}
        {verified === false && <span className="ml-3 text-rose-400">Does not match.</span>}
      </section>

      {([["Corrections", data.corrections], ["Amendments", data.amendments], ["Reviews", data.reviews], ["Notes", data.notes]] as const).map(([label, list]) =>
        list.length > 0 && (
          <section key={label} className="mt-6">
            <h2 className="text-sm font-semibold">{label}</h2>
            <div className="mt-2 space-y-2">{list.map((x) => <RecordCard key={x.id} record={x} />)}</div>
          </section>
        ))}
    </main>
  );
}
```

Create `client/src/pages/ledger-campaign.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { LedgerCampaign } from "@shared/ledger-schema";
import type { PublicRecord } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";
import { campaignTally, timeline } from "@/lib/ledger-view";

export default function LedgerCampaignPage() {
  const [, params] = useRoute("/campaigns/:id");
  const id = params?.id ?? "";
  const { data, isLoading, error } = useQuery<{ campaign: LedgerCampaign; records: PublicRecord[] }>({
    queryKey: ["/api/ledger/campaigns", id], enabled: Boolean(id),
  });
  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-4xl px-4 py-8">Campaign not found. <Link href="/ledger" className="underline">Back to the ledger</Link></main>;
  const tally = campaignTally(data.records);
  const evidence = data.records.flatMap((r) => r.evidence.map((e) => ({ ...e, from: r.id })));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="font-mono text-xs text-muted-foreground">{data.campaign.id} · {data.campaign.status}</div>
      <h1 className="mt-1 text-2xl font-semibold">{data.campaign.title}</h1>
      {data.campaign.summary && <p className="mt-2 text-sm">{data.campaign.summary}</p>}
      <div className="mt-4 flex gap-4 text-sm">
        <span className="text-emerald-400">{tally.passed} passed</span>
        <span className="text-rose-400">{tally.failed} failed</span>
        <span className="text-amber-400">{tally.open} open</span>
        <span className="text-muted-foreground">{tally.total} records</span>
      </div>
      <section className="mt-6 space-y-3">{timeline(data.records).map((r) => <RecordCard key={r.id} record={r} />)}</section>
      {evidence.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">All evidence</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {evidence.map((e, i) => (
              <li key={i}><a className="underline" href={e.url} rel="noreferrer noopener" target="_blank">{e.label}</a>{e.sha256 && <span className="ml-2 font-mono">{e.sha256}</span>}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Add the routes**

In `client/src/App.tsx`, add the lazy imports next to the others:

```tsx
const LedgerPage = lazy(() => import("@/pages/ledger"));
const LedgerRecordPage = lazy(() => import("@/pages/ledger-record"));
const LedgerCampaignPage = lazy(() => import("@/pages/ledger-campaign"));
```

and inside `<Switch>`, before `<Route component={NotFound} />`:

```tsx
        <Route path="/ledger" component={LedgerPage} />
        <Route path="/records/:id" component={LedgerRecordPage} />
        <Route path="/campaigns/:id" component={LedgerCampaignPage} />
```

Note: wouter 3 renders its own `<a>`, so put `className` on `Link` and never nest an `<a>` inside it.

Note on query keys: the default query function joins the key with `/`, so `["/api/ledger/records", id]` fetches `/api/ledger/records/<id>`.

- [ ] **Step 6: Run tests, typecheck, build, commit**

Run: `npx vitest run client/src/lib/ledger-view.test.ts` (PASS, 3 tests), `npx tsc --noEmit` (clean), `npm run build`. Then run the dev server (`npm run dev`, which needs a `DATABASE_URL`; on Replit use the workspace) and open `/ledger`, `/records/<an id>`, `/campaigns/<an id>` to check they render and the Verify button reports a match.

```bash
git add client/src/lib/ledger-view.ts client/src/lib/ledger-view.test.ts client/src/components/ledger client/src/pages/ledger.tsx client/src/pages/ledger-record.tsx client/src/pages/ledger-campaign.tsx client/src/App.tsx
git commit -s -m "ledger: first pages (list, record with in-browser verify, campaign timeline)"
```

### Part 2 checkpoint: ship the ledger core

- [ ] Full gate: `npx tsc --noEmit && npx vitest run && npm run build`.
- [ ] Open a PR `ledger core (part 2 of 4)`; merge after review.
- [ ] On Replit, **before** publishing: in the workspace Shell run `npm run db:push` against the production `DATABASE_URL` (adds `ledger_*`, `agent_keys` tables and `users.can_release`; it only adds, so drizzle-kit should not prompt about data loss; if it does prompt, stop and read the prompt before answering).
- [ ] Publish. Then as admin: `POST /api/admin/users/<nick's id>/releaser {"canRelease":true}` (Nick's own account), and verify `GET /api/ledger/records` returns `[]` publicly.

---

# Part 3: Doors and faces (rollout step 3)

### Task 13: The signed NATS door and the outbox publisher

**Files:**
- Create: `server/services/ledger/nats-door.ts`
- Create: `server/services/ledger/nats-door.test.ts`
- Create: `server/services/ledger/outbox-publisher.ts`
- Create: `server/services/ledger/outbox-publisher.test.ts`
- Modify: `server/services/kannaka/bridge.ts` (handlers receive an optional `reply` function)
- Modify: `server/index.ts` (subscribe the door and start the publisher when the bridge is enabled)

**Interfaces:**
- Consumes: `canonicalJson` (Task 5); `AgentKeyService` (`getKey`, `userFor`) (Task 9); `LedgerService.file`, `actorFromUser` (Task 7); `LedgerStore.listUnpublishedEvents`, `markEventPublished` (Task 6); `kannakaBridge.subscribe`, `kannakaBridge.publish` (existing).
- Produces: `NATS_FILE_SUBJECT = "SPACECHILD.ledger.file"`, `MAX_SKEW_MS = 300_000`, `NONCE_TTL_MS = 600_000`, `class NonceCache` with `checkAndAdd(nonce: string, now: number): boolean`, `verifyEd25519(publicKeyB64: string, message: string, sigB64: string): boolean`, `type DoorResult = { ok: true; id: string; created: boolean } | { ok: false; reason: LedgerErrorCode; message?: string }`, `handleFileMessage(payload: unknown, deps: { svc: LedgerService; keys: AgentKeyService; nonces: NonceCache; now?: () => number; log?: (line: string) => void }): Promise<DoorResult>`; `class OutboxPublisher` with constructor `(store: LedgerStore, publish: (subject: string, payload: unknown) => Promise<boolean>, intervalMs?: number)` and `drainOnce(limit?: number): Promise<number>`, `start()`, `stop()`. Bridge `Handler` becomes `(payload: any, subject: string, reply?: (body: unknown) => void) => void | Promise<void>`.

The signed message format agents send (document this exactly in Task 20):

```json
{ "record": { "kind": "result", "title": "...", "clientRef": "..." },
  "key_id": "<agent key id>",
  "ts": "2026-10-03T12:00:00.000Z",
  "nonce": "<16-128 chars, unique per message>",
  "sig": "<base64 Ed25519 signature over canonicalJson({record, key_id, ts, nonce})>" }
```

- [ ] **Step 1: Write the failing tests**

Create `server/services/ledger/nats-door.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import { AgentKeyService } from "./agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import { NonceCache, handleFileMessage } from "./nats-door";

const NOW = Date.UTC(2026, 9, 3, 12);
const agent = { id: "u-k", username: "kannaka", userType: "agent", role: "user", canRelease: false };
const users = new Map<string, any>([[agent.id, agent]]);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");

let keys: AgentKeyService;
let keyId: string;
let store: MemoryLedgerStore;
let deps: Parameters<typeof handleFileMessage>[1];

function signed(record: unknown, over: Partial<{ ts: string; nonce: string; key_id: string }> = {}) {
  const body = { record, key_id: over.key_id ?? keyId, ts: over.ts ?? new Date(NOW).toISOString(), nonce: over.nonce ?? `nonce-${Math.random().toString(36).slice(2)}-xyz` };
  return { ...body, sig: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString("base64") };
}

beforeEach(async () => {
  store = new MemoryLedgerStore([agent]);
  keys = new AgentKeyService(new MemoryAgentKeyStore(), { getUser: async (id) => users.get(id) });
  keyId = (await keys.issue(agent.id, "kannaka-bus", rawPub)).key.id;
  deps = { svc: new LedgerService(store), keys, nonces: new NonceCache(), now: () => NOW };
});

describe("NATS ledger door", () => {
  it("files a correctly signed record", async () => {
    const r = await handleFileMessage(signed({ kind: "result", title: "from the bus" }), deps);
    expect(r).toMatchObject({ ok: true, created: true });
    const [rec] = await store.listRecords({}, { includeHeld: true });
    expect(rec.filedVia).toBe("nats");
    expect(rec.authorUsername).toBe("kannaka");
  });

  it("rejects a replayed nonce", async () => {
    const msg = signed({ kind: "result", title: "once" });
    expect((await handleFileMessage(msg, deps)).ok).toBe(true);
    expect(await handleFileMessage(msg, deps)).toEqual({ ok: false, reason: "replayed_nonce" });
  });

  it("a retry with a new nonce but the same clientRef does not duplicate", async () => {
    const a = await handleFileMessage(signed({ kind: "result", title: "r", clientRef: "bus-1" }), deps);
    const b = await handleFileMessage(signed({ kind: "result", title: "r", clientRef: "bus-1" }), deps);
    expect(a).toMatchObject({ ok: true, created: true });
    expect(b).toMatchObject({ ok: true, created: false, id: (a as any).id });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(1);
  });

  it("rejects a tampered record, a stale timestamp, unknown and revoked keys, and junk", async () => {
    const msg = signed({ kind: "result", title: "original" });
    expect(await handleFileMessage({ ...msg, record: { kind: "result", title: "tampered" } }, deps)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await handleFileMessage(signed({ kind: "result", title: "old" }, { ts: new Date(NOW - 6 * 60 * 1000).toISOString() }), deps))
      .toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }, { key_id: "no-such-key" }), deps)).toMatchObject({ ok: false, reason: "unknown_key" });
    await keys.revoke(keyId);
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }), deps)).toMatchObject({ ok: false, reason: "revoked_key" });
    expect(await handleFileMessage({ hello: "world" }, deps)).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(0);
  });

  it("refuses a key that has no Ed25519 public key", async () => {
    const plain = (await keys.issue(agent.id, "http-only")).key.id;
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }, { key_id: plain }), deps)).toMatchObject({ ok: false, reason: "unknown_key" });
  });

  it("passes ledger rule errors through as reasons", async () => {
    expect(await handleFileMessage(signed({ kind: "review", title: "x", reviewsId: "01J9Z3K8Q2A7B5C4D6E8F0G999" }), deps))
      .toMatchObject({ ok: false, reason: "missing_verdict" });
  });

  it("does not announce a held record filed over the bus", async () => {
    await handleFileMessage(signed({ kind: "result", title: "h", held: true }), deps);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });
});
```

Create `server/services/ledger/outbox-publisher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import { OutboxPublisher } from "./outbox-publisher";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };

describe("outbox publisher", () => {
  it("publishes in order and marks events published", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    await svc.file(agent, { kind: "result", title: "a" }, "api");
    await svc.file(agent, { kind: "result", title: "b" }, "api");
    const sent: Array<{ subject: string; title?: unknown }> = [];
    const pub = new OutboxPublisher(store, async (subject, payload: any) => { sent.push({ subject, title: payload.id }); return true; });
    expect(await pub.drainOnce()).toBe(2);
    expect(sent.map((s) => s.subject)).toEqual(["SPACECHILD.ledger.record.filed", "SPACECHILD.ledger.record.filed"]);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });

  it("stops at the first failed publish and keeps the rest for next time", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    await svc.file(agent, { kind: "result", title: "a" }, "api");
    await svc.file(agent, { kind: "result", title: "b" }, "api");
    const pub = new OutboxPublisher(store, async () => false);
    expect(await pub.drainOnce()).toBe(0);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/services/ledger/nats-door.test.ts server/services/ledger/outbox-publisher.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the door**

Create `server/services/ledger/nats-door.ts`:

```ts
import { createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import type { AgentKeyService } from "./agent-keys";
import { actorFromUser, type LedgerService } from "./service";
import { LedgerError, type LedgerErrorCode } from "./types";

export const NATS_FILE_SUBJECT = "SPACECHILD.ledger.file";
export const MAX_SKEW_MS = 5 * 60 * 1000;
export const NONCE_TTL_MS = 10 * 60 * 1000;
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export class NonceCache {
  private seen = new Map<string, number>();
  constructor(private readonly ttlMs: number = NONCE_TTL_MS) {}

  /** True if the nonce is new (and records it); false if seen within the TTL. */
  checkAndAdd(nonce: string, now: number): boolean {
    for (const [n, t] of this.seen) if (now - t > this.ttlMs) this.seen.delete(n);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    return true;
  }
}

export function verifyEd25519(publicKeyB64: string, message: string, sigB64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyB64, "base64")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}

export type DoorResult = { ok: true; id: string; created: boolean } | { ok: false; reason: LedgerErrorCode; message?: string };

export async function handleFileMessage(
  payload: unknown,
  deps: { svc: LedgerService; keys: AgentKeyService; nonces: NonceCache; now?: () => number; log?: (line: string) => void },
): Promise<DoorResult> {
  const now = deps.now?.() ?? Date.now();
  const reject = (reason: LedgerErrorCode, message?: string): DoorResult => {
    deps.log?.(`[ledger] NATS filing rejected: ${reason}${message ? ` (${message})` : ""}`);
    return message ? { ok: false, reason, message } : { ok: false, reason };
  };
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || typeof p.key_id !== "string" || typeof p.ts !== "string" || typeof p.nonce !== "string"
      || typeof p.sig !== "string" || typeof p.record !== "object" || p.record === null) {
    return reject("invalid_input");
  }
  if (p.nonce.length < 16 || p.nonce.length > 128) return reject("invalid_input", "nonce must be 16-128 characters");

  const key = await deps.keys.getKey(p.key_id);
  if (!key) return reject("unknown_key");
  if (key.revokedAt) return reject("revoked_key");
  if (!key.ed25519PublicKey) return reject("unknown_key", "key has no Ed25519 public key");

  // Signature first, so unsigned junk can neither probe timing rules nor fill the nonce cache.
  const message = canonicalJson({ record: p.record, key_id: p.key_id, ts: p.ts, nonce: p.nonce });
  if (!verifyEd25519(key.ed25519PublicKey, message, p.sig)) return reject("bad_signature");
  const ts = Date.parse(p.ts);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return reject("stale_timestamp");
  if (!deps.nonces.checkAndAdd(`${p.key_id}:${p.nonce}`, now)) return reject("replayed_nonce");

  const user = await deps.keys.userFor(key);
  if (!user || user.userType !== "agent") return reject("revoked_key");
  try {
    const { record, created } = await deps.svc.file(actorFromUser(user as any), p.record, "nats");
    return { ok: true, id: record.id, created };
  } catch (error) {
    if (error instanceof LedgerError) return reject(error.code, error.message);
    throw error;
  }
}
```

Create `server/services/ledger/outbox-publisher.ts`:

```ts
import type { LedgerStore } from "./types";

/** Drains the outbox to NATS in order. A failed publish stops the drain; the event is retried next tick. */
export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: LedgerStore,
    private readonly publish: (subject: string, payload: unknown) => Promise<boolean>,
    private readonly intervalMs = 5000,
  ) {}

  async drainOnce(limit = 100): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let sent = 0;
      for (const event of await this.store.listUnpublishedEvents(limit)) {
        if (!(await this.publish(event.subject, event.payload))) break;
        await this.store.markEventPublished(event.id, new Date());
        sent++;
      }
      return sent;
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drainOnce().catch((error) => console.error("[ledger] outbox drain failed:", error));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
```

- [ ] **Step 4: Give bridge handlers a reply function**

In `server/services/kannaka/bridge.ts`:
1. Change `type Handler = (payload: any, subject: string) => void | Promise<void>;` to:

```ts
type Handler = (payload: any, subject: string, reply?: (body: unknown) => void) => void | Promise<void>;
```

2. In `subscribeInternal`, replace `await handler(payload, m.subject);` with:

```ts
          const reply = m.reply
            ? (body: unknown) => { try { this.nc?.publish(m.reply!, codec.encode(JSON.stringify(body))); } catch { /* requester gone */ } }
            : undefined;
          await handler(payload, m.subject, reply);
```

Existing handlers take two parameters and are unaffected.

- [ ] **Step 5: Wire it at startup**

In `server/index.ts`, add imports:

```ts
import { NATS_FILE_SUBJECT, NonceCache, handleFileMessage } from "./services/ledger/nats-door";
import { OutboxPublisher } from "./services/ledger/outbox-publisher";
import { ledgerStore, ledgerService } from "./services/ledger";
```

(`agentKeys` is already imported from Task 9.) Inside the `if (kannakaBridge.enabled) {` block, after `await kannakaLoopEvents.start();`, add:

```ts
    // Ledger NATS door (spec 4.3): signed filings in, ledger events out.
    const ledgerNonces = new NonceCache();
    await kannakaBridge.subscribe(NATS_FILE_SUBJECT, async (payload, _subject, reply) => {
      const result = await handleFileMessage(payload, { svc: ledgerService, keys: agentKeys, nonces: ledgerNonces, log });
      reply?.(result);
    });
    ledgerOutbox = new OutboxPublisher(ledgerStore, (subject, payload) => kannakaBridge.publish(subject, payload));
    ledgerOutbox.start();
    log(`Ledger NATS door listening on ${NATS_FILE_SUBJECT}`);
```

Declare `let ledgerOutbox: OutboxPublisher | null = null;` just above the `(async () => {` line, and in `gracefulShutdown`, before `await kannakaBridge.stop();`, add `ledgerOutbox?.stop();`.

- [ ] **Step 6: Run tests, typecheck, commit**

Run: `npx vitest run server/services/ledger/nats-door.test.ts server/services/ledger/outbox-publisher.test.ts` (PASS, 7 + 2), `npx vitest run server/services/kannaka` (existing bridge tests still pass), `npx tsc --noEmit` (clean).

```bash
git add server/services/ledger/nats-door.ts server/services/ledger/nats-door.test.ts server/services/ledger/outbox-publisher.ts server/services/ledger/outbox-publisher.test.ts server/services/kannaka/bridge.ts server/index.ts
git commit -s -m "ledger: signed NATS door (Ed25519, 5-minute window, nonce cache) and outbox publisher"
```

### Task 14: Feeds (RSS and JSON Feed, whole ledger and per campaign)

**Files:**
- Create: `server/routes/ledger-feeds.ts`
- Create: `server/routes/ledger-feeds.test.ts`
- Modify: `server/routes.ts` (mount the feed router)

**Interfaces:**
- Consumes: `LedgerService.listRecords`, `getCampaignView` (Task 7).
- Produces: `createLedgerFeedRouter(svc: LedgerService, baseUrl: string): Router` serving `GET /ledger/feed.xml`, `GET /ledger/feed.json`, `GET /ledger/:campaign/feed.xml`; `escapeXml(s: string): string`.

- [ ] **Step 1: Write the failing test**

Create `server/routes/ledger-feeds.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { MemoryLedgerStore } from "../services/ledger/memory-store";
import { LedgerService } from "../services/ledger/service";
import { createLedgerFeedRouter, escapeXml } from "./ledger-feeds";
import { serve } from "../test-utils/serve";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
let srv: { base: string; close(): Promise<void> };
let svc: LedgerService;

beforeEach(async () => {
  svc = new LedgerService(new MemoryLedgerStore([agent]));
  await svc.createCampaign(agent, { id: "heesch-leader", title: "Heesch" });
  await svc.file(agent, { kind: "result", title: "白い紙 <script>alert(1)</script>", campaignId: "heesch-leader" }, "api");
  await svc.file(agent, { kind: "result", title: "OTHER-CAMPAIGN-FREE" }, "api");
  await svc.file(agent, { kind: "result", title: "HELD-SECRET", held: true }, "api");
  const app = express();
  app.use(createLedgerFeedRouter(svc, "https://research.example"));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

describe("ledger feeds", () => {
  it("escapes XML", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });

  it("serves RSS with escaped titles, non-ASCII intact, and no held records", async () => {
    const res = await fetch(`${srv.base}/ledger/feed.xml`);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain("白い紙 &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("HELD-SECRET");
    expect(xml).toContain("https://research.example/records/");
  });

  it("serves JSON Feed 1.1 without held records", async () => {
    const feed = await (await fetch(`${srv.base}/ledger/feed.json`)).json();
    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(feed.items).toHaveLength(2);
    expect(JSON.stringify(feed)).not.toContain("HELD-SECRET");
  });

  it("serves a per-campaign feed and 404s an unknown campaign", async () => {
    const xml = await (await fetch(`${srv.base}/ledger/heesch-leader/feed.xml`)).text();
    expect(xml).toContain("白い紙");
    expect(xml).not.toContain("OTHER-CAMPAIGN-FREE");
    expect((await fetch(`${srv.base}/ledger/no-such/feed.xml`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/ledger-feeds.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the feeds**

Create `server/routes/ledger-feeds.ts`:

```ts
import { Router } from "express";
import type { PublicRecord } from "@shared/ledger-public";
import type { LedgerService } from "../services/ledger/service";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function rss(baseUrl: string, title: string, link: string, records: PublicRecord[]): string {
  const items = records.map((r) => `    <item>
      <title>${escapeXml(`[${r.kind} · ${r.standing}] ${r.title}`)}</title>
      <link>${baseUrl}/records/${r.id}</link>
      <guid isPermaLink="false">${r.id}</guid>
      <pubDate>${new Date(r.createdAt).toUTCString()}</pubDate>
      <author>${escapeXml(r.authorUsername)}</author>
      <description>${escapeXml(r.body.slice(0, 2000))}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${link}</link>
    <description>Append-only research ledger of the Kannaka / Space Child constellation</description>
${items}
  </channel>
</rss>
`;
}

export function createLedgerFeedRouter(svc: LedgerService, baseUrl: string): Router {
  const r = Router();
  const site = baseUrl.replace(/\/+$/, "");

  r.get("/ledger/feed.xml", async (_req, res, next) => {
    try {
      const records = await svc.listRecords(null, { limit: 100 });
      res.type("application/rss+xml; charset=utf-8").send(rss(site, "Research Ledger", `${site}/`, records));
    } catch (e) { next(e); }
  });

  r.get("/ledger/feed.json", async (_req, res, next) => {
    try {
      const records = await svc.listRecords(null, { limit: 100 });
      res.type("application/feed+json; charset=utf-8").json({
        version: "https://jsonfeed.org/version/1.1",
        title: "Research Ledger",
        home_page_url: `${site}/`,
        feed_url: `${site}/ledger/feed.json`,
        items: records.map((x) => ({
          id: x.id,
          url: `${site}/records/${x.id}`,
          title: x.title,
          content_text: x.body,
          date_published: x.createdAt,
          authors: [{ name: x.authorUsername }],
          tags: [x.kind, x.standing, ...(x.campaignId ? [x.campaignId] : [])],
        })),
      });
    } catch (e) { next(e); }
  });

  r.get("/ledger/:campaign/feed.xml", async (req, res, next) => {
    try {
      const view = await svc.getCampaignView(null, req.params.campaign);
      if (!view) { res.status(404).type("text/plain").send("campaign not found"); return; }
      res.type("application/rss+xml; charset=utf-8").send(rss(site, `Research Ledger: ${view.campaign.title}`, `${site}/campaigns/${view.campaign.id}`, view.records));
    } catch (e) { next(e); }
  });

  return r;
}
```

- [ ] **Step 4: Mount it**

In `server/routes.ts`, import `import { createLedgerFeedRouter } from "./routes/ledger-feeds";` and `import { siteUrl } from "./lib/site-url";` (if not already imported), then after the `/api/ledger` mount add:

```ts
  app.use(createLedgerFeedRouter(ledgerService, siteUrl()));
```

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npx vitest run server/routes/ledger-feeds.test.ts` (PASS, 4), `npx tsc --noEmit`.

```bash
git add server/routes/ledger-feeds.ts server/routes/ledger-feeds.test.ts server/routes.ts
git commit -s -m "ledger: RSS and JSON feeds (public records only, escaped)"
```

### Task 15: Live stream, observer home page, agent pages

**Files:**
- Create: `server/routes/ledger-stream.ts`
- Create: `server/routes/ledger-stream.test.ts`
- Modify: `server/services/ledger/service.ts` (an `onPublic` hook fired when a record becomes public)
- Modify: `server/services/ledger/service.test.ts` (one new test)
- Modify: `server/services/ledger/index.ts` (one shared `ledgerStream`, passed to the service)
- Modify: `server/routes.ts` (mount `GET /api/ledger/stream`)
- Create: `client/src/hooks/use-ledger-stream.ts`
- Create: `client/src/pages/ledger-home.tsx`
- Create: `client/src/pages/ledger-agent.tsx`
- Modify: `client/src/App.tsx` (`/` becomes the ledger home; `/agents/:username`)

**Interfaces:**
- Produces: `type PublicEvent = { type: "filed" | "released"; id: string; kind: string; campaignId: string | null }`; `LedgerService` constructor option `onPublic?: (e: PublicEvent) => void`; `class LedgerStream` with `handler: RequestHandler`, `notify(e: PublicEvent): void`, `get size(): number`; `ledgerStream` exported from `server/services/ledger/index.ts`; client hook `useLedgerStream(): void` (invalidates ledger queries on each event).
- Route: `GET /api/ledger/stream` (Server-Sent Events, public records only).

- [ ] **Step 1: Write the failing tests**

Create `server/routes/ledger-stream.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { LedgerStream } from "./ledger-stream";
import { serve } from "../test-utils/serve";

let srv: { base: string; close(): Promise<void> };
let stream: LedgerStream;

beforeEach(async () => {
  stream = new LedgerStream();
  const app = express();
  app.get("/api/ledger/stream", stream.handler);
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

describe("ledger stream", () => {
  it("pushes public events to connected clients as SSE", async () => {
    const controller = new AbortController();
    const res = await fetch(`${srv.base}/api/ledger/stream`, { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    expect(text).toContain(": connected");
    for (let i = 0; i < 50 && stream.size === 0; i++) await new Promise((r) => setTimeout(r, 10));
    stream.notify({ type: "filed", id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", kind: "result", campaignId: null });
    text = decoder.decode((await reader.read()).value);
    expect(text).toContain("event: filed");
    expect(text).toContain('"id":"01J9Z3K8Q2A7B5C4D6E8F0G1H2"');
    controller.abort();
  });
});
```

Append to the `describe("filing", ...)` block of `server/services/ledger/service.test.ts`:

```ts
  it("fires onPublic for public filings and releases, never for held filings", async () => {
    const seen: string[] = [];
    const s = new LedgerService(store, { onPublic: (e) => seen.push(`${e.type}:${e.kind}`) });
    await s.file(alice, { kind: "result", title: "pub" }, "api");
    const held = await s.file(alice, { kind: "failure", title: "held", held: true }, "api");
    expect(seen).toEqual(["filed:result"]);
    await s.release(nick, held.record.id);
    expect(seen).toEqual(["filed:result", "released:failure"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/ledger-stream.test.ts server/services/ledger/service.test.ts`
Expected: FAIL (module missing; `onPublic` not supported).

- [ ] **Step 3: Add the hook to the service**

In `server/services/ledger/service.ts`:
1. Add after the `SUBJECT_*` constants:

```ts
export type PublicEvent = { type: "filed" | "released"; id: string; kind: string; campaignId: string | null };
```

2. Add a field `private readonly onPublic?: (e: PublicEvent) => void;` and extend the constructor options type to `{ now?: () => Date; newId?: () => string; baseUrl?: string; onPublic?: (e: PublicEvent) => void }`, assigning `this.onPublic = opts.onPublic;` in the constructor body.
3. In `file()`, directly before `return { record: toPublicRecord(stored), created: true };`, add:

```ts
    if (!r.held) this.emit({ type: "filed", id: stored.id, kind: stored.kind, campaignId: stored.campaignId });
```

4. In `release()`, inside `if (!record.released) { ... }`, after the `setCampaignStatus` line, add:

```ts
      this.emit({ type: "released", id: record.id, kind: record.kind, campaignId: record.campaignId });
```

5. Add the private method:

```ts
  private emit(e: PublicEvent): void {
    try { this.onPublic?.(e); } catch (error) { console.error("[ledger] onPublic listener failed:", error); }
  }
```

- [ ] **Step 4: Write the stream**

Create `server/routes/ledger-stream.ts`:

```ts
import type { RequestHandler, Response } from "express";
import type { PublicEvent } from "../services/ledger/service";

/** Server-Sent Events for public ledger changes. Held records never pass through here (the service only emits public events). */
export class LedgerStream {
  private clients = new Set<Response>();

  get size(): number {
    return this.clients.size;
  }

  handler: RequestHandler = (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(": connected\n\n");
    this.clients.add(res);
    const heartbeat = setInterval(() => res.write(": hb\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  };

  notify(e: PublicEvent): void {
    const frame = `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
    for (const client of this.clients) client.write(frame);
  }
}
```

- [ ] **Step 5: Wire it**

Replace the body of `server/services/ledger/index.ts` with:

```ts
// Production wiring. Tests never import this file (it opens the real database handle).
import { db } from "../../db";
import { storage } from "../../storage";
import { siteUrl } from "../../lib/site-url";
import { DrizzleAgentKeyStore, DrizzleLedgerStore } from "./drizzle-store";
import { LedgerService } from "./service";
import { AgentKeyService } from "./agent-keys";
import { LedgerStream } from "../../routes/ledger-stream";

export const ledgerStream = new LedgerStream();
export const ledgerStore = new DrizzleLedgerStore(db);
export const agentKeyStore = new DrizzleAgentKeyStore(db);
export const ledgerService = new LedgerService(ledgerStore, { baseUrl: siteUrl(), onPublic: (e) => ledgerStream.notify(e) });
export const agentKeys = new AgentKeyService(agentKeyStore, storage);
```

In `server/routes.ts`, change the import to `import { agentKeys, ledgerService, ledgerStream } from "./services/ledger";` and add, **before** the `app.use("/api/ledger", createLedgerRouter(...))` line (so the SSE route is not shadowed and is not rate-limited per request):

```ts
  app.get("/api/ledger/stream", ledgerStream.handler);
```

- [ ] **Step 6: Write the client hook and pages**

Create `client/src/hooks/use-ledger-stream.ts`:

```ts
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

/** Live updates: on every public ledger event, refetch ledger queries. Reconnects automatically (EventSource). */
export function useLedgerStream(): void {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/ledger/stream");
    const refresh = () => {
      void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/ledger") });
    };
    es.addEventListener("filed", refresh);
    es.addEventListener("released", refresh);
    return () => es.close();
  }, []);
}
```

Create `client/src/pages/ledger-home.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LedgerCampaign } from "@shared/ledger-schema";
import type { PublicRecord } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";
import { useLedgerStream } from "@/hooks/use-ledger-stream";

export default function LedgerHome() {
  useLedgerStream();
  const latest = useQuery<PublicRecord[]>({ queryKey: ["/api/ledger/records?limit=30"] });
  const campaigns = useQuery<LedgerCampaign[]>({ queryKey: ["/api/ledger/campaigns"] });
  const open = useQuery<PublicRecord[]>({ queryKey: ["/api/ledger/records?standing=unverified&limit=10"] });
  const active = (campaigns.data ?? []).filter((c) => c.status !== "closed");

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_20rem]">
      <section>
        <h1 className="text-2xl font-semibold">Research ledger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the constellation's agents and people pre-registered, ran, found, failed at, certified and corrected. Live, append-only,
          failures beside passes. <Link href="/ledger" className="underline">All records</Link> ·{" "}
          <a className="underline" href="/ledger/feed.xml">RSS</a> · <a className="underline" href="/ledger/feed.json">JSON</a>
        </p>
        <div className="mt-6 space-y-3">
          {latest.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {latest.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing filed yet.</p>}
          {latest.data?.map((r) => <RecordCard key={r.id} record={r} />)}
        </div>
      </section>
      <aside className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold">Active campaigns</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {active.length === 0 && <li className="text-muted-foreground">None open.</li>}
            {active.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="underline">{c.title}</Link>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{c.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Open questions</h2>
          <p className="text-xs text-muted-foreground">Unverified claims waiting for a check or a review.</p>
          <div className="mt-2 space-y-2">{open.data?.map((r) => <RecordCard key={r.id} record={r} />)}</div>
        </section>
        <section className="text-xs text-muted-foreground">
          Earlier consciousness-research work lives in the <Link href="/archive" className="underline">archive</Link>.
        </section>
      </aside>
    </main>
  );
}
```

Create `client/src/pages/ledger-agent.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { AgentProfile } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";

export default function LedgerAgentPage() {
  const [, params] = useRoute("/agents/:username");
  const username = params?.username ?? "";
  const { data, isLoading, error } = useQuery<AgentProfile>({ queryKey: ["/api/ledger/agents", username], enabled: Boolean(username) });
  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-4xl px-4 py-8">No such author. <Link href="/" className="underline">Back to the ledger</Link></main>;
  const s = data.stats;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{data.username}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {([["Filed", s.filed], ["Reviews given", s.reviewsGiven], ["Reviews received", s.reviewsReceived], ["Corrected", s.corrected], ["Retracted", s.retracted]] as const).map(([k, v]) => (
          <div key={k} className="rounded border border-border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
        ))}
      </dl>
      <section className="mt-6 space-y-3">{data.records.map((r) => <RecordCard key={r.id} record={r} />)}</section>
    </main>
  );
}
```

In `client/src/App.tsx`: add `const LedgerHome = lazy(() => import("@/pages/ledger-home"));` and `const LedgerAgentPage = lazy(() => import("@/pages/ledger-agent"));`; change `<Route path="/" component={Landing} />` to `<Route path="/" component={LedgerHome} />`; add `<Route path="/agents/:username" component={LedgerAgentPage} />` **above** the existing `<Route path="/agents" component={Agents} />` line. (Landing moves under `/archive` in Task 17.)

- [ ] **Step 7: Run tests, typecheck, build, commit**

Run: `npx vitest run server/routes/ledger-stream.test.ts server/services/ledger/service.test.ts` (PASS), `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

```bash
git add server/routes/ledger-stream.ts server/routes/ledger-stream.test.ts server/services/ledger/service.ts server/services/ledger/service.test.ts server/services/ledger/index.ts server/routes.ts client/src/hooks/use-ledger-stream.ts client/src/pages/ledger-home.tsx client/src/pages/ledger-agent.tsx client/src/App.tsx
git commit -s -m "ledger: live SSE stream, observer home page, agent pages"
```

### Task 16: File a record, the release queue, and the agents admin page

**Files:**
- Create: `client/src/lib/ledger-form.ts`
- Create: `client/src/lib/ledger-form.test.ts`
- Create: `client/src/pages/ledger-file.tsx`
- Create: `client/src/pages/ledger-releases.tsx`
- Create: `client/src/pages/admin-agents.tsx`
- Modify: `client/src/App.tsx` (three routes)

**Interfaces:**
- Consumes: `POST /api/ledger/records`, `GET /api/ledger/releases`, `POST /api/ledger/records/:id/release` (Task 10); `POST /api/admin/users/:id/promote-agent`, `/releaser`, `/keys`, `DELETE /api/admin/keys/:id`, `GET /api/users/by-username/:u` (existing).
- Produces: `interface FileForm { kind: string; campaignId: string; title: string; body: string; standing: string; evidenceText: string; linkId: string; verdict: string; setsStatus: string; held: boolean; clientRef: string }`; `buildRecordPayload(form: FileForm): { payload: Record<string, unknown> } | { error: string }`; `parseEvidence(text: string): { evidence: LedgerEvidence[] } | { error: string }` (one evidence per line: `label | url | sha256?`).

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/ledger-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRecordPayload, parseEvidence, type FileForm } from "./ledger-form";

const base: FileForm = {
  kind: "result", campaignId: "", title: "It held", body: "", standing: "measured", evidenceText: "",
  linkId: "", verdict: "", setsStatus: "", held: false, clientRef: "",
};

describe("filing form", () => {
  it("parses evidence lines", () => {
    expect(parseEvidence("CNF | https://x.org/a.cnf | " + "a".repeat(64) + "\nlog | https://x.org/log")).toEqual({
      evidence: [{ label: "CNF", url: "https://x.org/a.cnf", sha256: "a".repeat(64) }, { label: "log", url: "https://x.org/log" }],
    });
    expect(parseEvidence("only-a-label")).toMatchObject({ error: expect.stringContaining("line 1") });
  });

  it("puts the link id in the field that matches the kind", () => {
    const id = "01J9Z3K8Q2A7B5C4D6E8F0G1H2";
    expect(buildRecordPayload({ ...base, kind: "correction", linkId: id })).toMatchObject({ payload: { correctsId: id } });
    expect(buildRecordPayload({ ...base, kind: "review", linkId: id, verdict: "holds" })).toMatchObject({ payload: { reviewsId: id, verdict: "holds" } });
    expect(buildRecordPayload({ ...base, kind: "amendment", linkId: id })).toMatchObject({ payload: { amendsId: id } });
    expect(buildRecordPayload({ ...base, kind: "note", linkId: id })).toMatchObject({ payload: { aboutId: id } });
  });

  it("omits empty optional fields and keeps held", () => {
    const out = buildRecordPayload({ ...base, held: true });
    expect(out).toEqual({ payload: { kind: "result", title: "It held", body: "", standing: "measured", evidence: [], held: true } });
  });

  it("requires a title", () => {
    expect(buildRecordPayload({ ...base, title: "  " })).toEqual({ error: "A title is required." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/ledger-form.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the form helpers**

Create `client/src/lib/ledger-form.ts`:

```ts
import type { LedgerEvidence } from "@shared/ledger-schema";

export interface FileForm {
  kind: string;
  campaignId: string;
  title: string;
  body: string;
  standing: string;
  evidenceText: string;
  linkId: string;
  verdict: string;
  setsStatus: string;
  held: boolean;
  clientRef: string;
}

/** One evidence item per line: `label | url | sha256 (optional)`. */
export function parseEvidence(text: string): { evidence: LedgerEvidence[] } | { error: string } {
  const evidence: LedgerEvidence[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const [label, url, sha256] = line.split("|").map((s) => s.trim());
    if (!label || !url) return { error: `Evidence line ${i + 1} needs "label | url".` };
    evidence.push(sha256 ? { label, url, sha256 } : { label, url });
  }
  return { evidence };
}

const LINK_FIELD: Record<string, string> = { correction: "correctsId", review: "reviewsId", amendment: "amendsId", note: "aboutId" };

export function buildRecordPayload(f: FileForm): { payload: Record<string, unknown> } | { error: string } {
  if (!f.title.trim()) return { error: "A title is required." };
  const ev = parseEvidence(f.evidenceText);
  if ("error" in ev) return ev;
  const payload: Record<string, unknown> = { kind: f.kind, title: f.title.trim(), body: f.body, standing: f.standing, evidence: ev.evidence, held: f.held };
  if (f.campaignId.trim()) payload.campaignId = f.campaignId.trim();
  const linkField = LINK_FIELD[f.kind];
  if (linkField && f.linkId.trim()) payload[linkField] = f.linkId.trim();
  if (f.kind === "review" && f.verdict) payload.verdict = f.verdict;
  if (f.kind === "decision" && f.setsStatus) payload.setsStatus = f.setsStatus;
  if (f.clientRef.trim()) payload.clientRef = f.clientRef.trim();
  return { payload };
}
```

- [ ] **Step 4: Write the pages**

Create `client/src/pages/ledger-file.tsx`:

```tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { CAMPAIGN_STATUSES, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS } from "@shared/ledger-schema";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { buildRecordPayload, type FileForm } from "@/lib/ledger-form";

const empty: FileForm = { kind: "result", campaignId: "", title: "", body: "", standing: "unverified", evidenceText: "", linkId: "", verdict: "holds", setsStatus: "", held: false, clientRef: "" };
const field = "w-full rounded border bg-background px-2 py-1 text-sm";

export default function LedgerFilePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FileForm>(empty);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FileForm) => (e: any) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  if (!user) return <main className="mx-auto max-w-2xl px-4 py-8">Sign in to file a record.</main>;

  const submit = async () => {
    setError(null);
    const built = buildRecordPayload(form);
    if ("error" in built) { setError(built.error); return; }
    try {
      const res = await apiRequest("POST", "/api/ledger/records", built.payload);
      const { record } = await res.json();
      navigate(`/records/${record.id}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const linkLabel = { correction: "Corrects record id", review: "Reviews record id", amendment: "Amends record id", note: "About record id (optional)" }[form.kind];

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-4 py-8">
      <h1 className="text-2xl font-semibold">File a record</h1>
      <p className="text-sm text-muted-foreground">Records are permanent. To fix one, file a correction beneath it.</p>
      <label className="block text-sm">Kind <select className={field} value={form.kind} onChange={set("kind")}>{LEDGER_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="block text-sm">Campaign id (optional) <input className={field} value={form.campaignId} onChange={set("campaignId")} /></label>
      <label className="block text-sm">Title <input className={field} value={form.title} onChange={set("title")} /></label>
      <label className="block text-sm">Body (Markdown) <textarea className={`${field} h-48 font-mono`} value={form.body} onChange={set("body")} /></label>
      <label className="block text-sm">Standing <select className={field} value={form.standing} onChange={set("standing")}>{LEDGER_STANDINGS.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="block text-sm">Evidence, one per line: <span className="font-mono">label | url | sha256</span><textarea className={`${field} h-24 font-mono`} value={form.evidenceText} onChange={set("evidenceText")} /></label>
      {linkLabel && <label className="block text-sm">{linkLabel} <input className={`${field} font-mono`} value={form.linkId} onChange={set("linkId")} /></label>}
      {form.kind === "review" && <label className="block text-sm">Verdict <select className={field} value={form.verdict} onChange={set("verdict")}>{REVIEW_VERDICTS.map((v) => <option key={v}>{v}</option>)}</select></label>}
      {form.kind === "decision" && <label className="block text-sm">Sets campaign status (owner or admin) <select className={field} value={form.setsStatus} onChange={set("setsStatus")}><option value="">(none)</option>{CAMPAIGN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.held} onChange={set("held")} /> Hold for release (only signed-in members see it until a human releases it)</label>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <Button onClick={submit}>File it</Button>
    </main>
  );
}
```

Create `client/src/pages/ledger-releases.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PublicRecord } from "@shared/ledger-public";
import { Button } from "@/components/ui/button";
import { RecordCard } from "@/components/ledger/record-card";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function LedgerReleasesPage() {
  const { data, error, isLoading } = useQuery<PublicRecord[]>({ queryKey: ["/api/ledger/releases"] });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const release = async (id: string) => {
    setFailure(null);
    try {
      await apiRequest("POST", `/api/ledger/records/${id}/release`, { note: notes[id] ?? null });
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/ledger") });
    } catch (e: any) {
      setFailure(String(e?.message ?? e));
    }
  };

  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error) return <main className="mx-auto max-w-3xl px-4 py-8">Only human members with the releaser role can see this queue.</main>;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Release queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">Held records wait here. Releasing makes a record public; it never changes its content or hash.</p>
      {failure && <p className="mt-3 text-sm text-rose-400">{failure}</p>}
      <div className="mt-6 space-y-4">
        {data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
        {data?.map((r) => (
          <div key={r.id} className="space-y-2">
            <RecordCard record={r} />
            <div className="flex gap-2">
              <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="Release note (optional)"
                value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <Button size="sm" onClick={() => release(r.id)}>Release</Button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

Create `client/src/pages/admin-agents.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; ed25519PublicKey: string | null };

export default function AdminAgentsPage() {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [target, setTarget] = useState<any>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [keyName, setKeyName] = useState("");
  const [pubKey, setPubKey] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (user?.role !== "admin") return <main className="mx-auto max-w-2xl px-4 py-8">Admins only.</main>;

  const run = async (fn: () => Promise<void>) => { setMsg(null); try { await fn(); } catch (e: any) { setMsg(String(e?.message ?? e)); } };
  const load = () => run(async () => {
    const u = await (await apiRequest("GET", `/api/users/by-username/${encodeURIComponent(username)}`)).json();
    setTarget(u);
    setKeys(await (await apiRequest("GET", `/api/admin/users/${u.id}/keys`)).json());
  });
  const promote = () => run(async () => { setTarget(await (await apiRequest("POST", `/api/admin/users/${target.id}/promote-agent`)).json()); });
  const releaser = (canRelease: boolean) => run(async () => { setTarget(await (await apiRequest("POST", `/api/admin/users/${target.id}/releaser`, { canRelease })).json()); });
  const issue = () => run(async () => {
    const out = await (await apiRequest("POST", `/api/admin/users/${target.id}/keys`, { name: keyName, ed25519PublicKey: pubKey.trim() || null })).json();
    setSecret(out.secret);
    setKeys(await (await apiRequest("GET", `/api/admin/users/${target.id}/keys`)).json());
  });
  const revoke = (id: string) => run(async () => {
    await apiRequest("DELETE", `/api/admin/keys/${id}`);
    setKeys(await (await apiRequest("GET", `/api/admin/users/${target.id}/keys`)).json());
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Agents and keys</h1>
      <div className="flex gap-2">
        <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Button size="sm" onClick={load}>Load</Button>
      </div>
      {msg && <p className="text-sm text-rose-400">{msg}</p>}
      {target && (
        <section className="space-y-3 rounded border border-border p-4 text-sm">
          <div><span className="font-semibold">{target.username}</span> · {target.userType} · role {target.role} · releaser {String(target.canRelease)}</div>
          <div className="flex flex-wrap gap-2">
            {target.userType !== "agent" && <Button size="sm" variant="outline" onClick={promote}>Promote to agent</Button>}
            {target.userType !== "agent" && <Button size="sm" variant="outline" onClick={() => releaser(!target.canRelease)}>{target.canRelease ? "Remove releaser" : "Make releaser"}</Button>}
          </div>
          {target.userType === "agent" && (
            <div className="space-y-2">
              <h2 className="font-semibold">Keys</h2>
              <ul className="space-y-1">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 font-mono text-xs">
                    <span>{k.prefix}…</span><span>{k.name}</span><span>{k.ed25519PublicKey ? "nats" : "http"}</span>
                    <span>{k.revokedAt ? `revoked ${k.revokedAt}` : `last used ${k.lastUsedAt ?? "never"}`}</span>
                    {!k.revokedAt && <Button size="sm" variant="destructive" onClick={() => revoke(k.id)}>Revoke</Button>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <input className="rounded border bg-background px-2 py-1" placeholder="key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
                <input className="flex-1 rounded border bg-background px-2 py-1 font-mono text-xs" placeholder="Ed25519 public key, base64 (optional, for NATS)" value={pubKey} onChange={(e) => setPubKey(e.target.value)} />
                <Button size="sm" onClick={issue}>Issue key</Button>
              </div>
              {secret && (
                <div className="rounded border border-amber-500 p-2">
                  <div className="text-xs">Copy this now. It is shown once and stored only as a hash.</div>
                  <code className="break-all text-xs">{secret}</code>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
```

In `client/src/App.tsx` add lazy imports `LedgerFilePage` (`@/pages/ledger-file`), `LedgerReleasesPage` (`@/pages/ledger-releases`), `AdminAgentsPage` (`@/pages/admin-agents`) and routes before the catch-all:

```tsx
        <Route path="/file" component={LedgerFilePage} />
        <Route path="/releases" component={LedgerReleasesPage} />
        <Route path="/admin/agents" component={AdminAgentsPage} />
```

- [ ] **Step 5: Run tests, typecheck, build, commit**

Run: `npx vitest run client/src/lib/ledger-form.test.ts` (PASS, 4), `npx tsc --noEmit`, `npm run build`.

```bash
git add client/src/lib/ledger-form.ts client/src/lib/ledger-form.test.ts client/src/pages/ledger-file.tsx client/src/pages/ledger-releases.tsx client/src/pages/admin-agents.tsx client/src/App.tsx
git commit -s -m "ledger: filing form, release queue, agents and keys admin page"
```

### Task 17: Move the legacy site into /archive, and switch the navigation to the ledger

**Files:**
- Create: `client/src/lib/nav-items.ts`
- Create: `client/src/lib/archive-routes.ts`
- Create: `client/src/lib/archive-routes.test.ts`
- Create: `client/src/components/archive-banner.tsx`
- Create: `client/src/pages/archive.tsx`
- Modify: `client/src/App.tsx` (archive routes, redirects, `sidebarRoutes`)
- Modify: `client/src/components/app-sidebar.tsx`, `client/src/components/mobile-nav.tsx` (use the shared nav items)
- Modify: `server/routes.ts` (301 for the two server-rendered legacy paths)
- Modify: `server/public-renderer.ts` and `server/public-renderer.test.ts` (render `/archive`, `/archive/discover`, `/archive/papers/:id`)

**Interfaces:**
- Produces: `NavItem = { title: string; url: string; icon: LucideIcon; testId: string; showBadge?: boolean }`, `ledgerNavItems: NavItem[]`, `accountNavItems: NavItem[]`; `LEGACY_PREFIXES: string[]`, `archivePathFor(path: string): string | null`; `ArchiveBanner` component; `/archive` index page.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/archive-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { archivePathFor } from "./archive-routes";

describe("archive redirects", () => {
  it("maps every legacy path under /archive", () => {
    expect(archivePathFor("/discover")).toBe("/archive/discover");
    expect(archivePathFor("/papers/abc")).toBe("/archive/papers/abc");
    expect(archivePathFor("/papers/abc/edit")).toBe("/archive/papers/abc/edit");
    expect(archivePathFor("/experiments/9")).toBe("/archive/experiments/9");
    expect(archivePathFor("/workspace")).toBe("/archive/workspace");
    expect(archivePathFor("/mcp")).toBe("/archive/mcp");
  });
  it("leaves ledger and account paths alone", () => {
    for (const p of ["/", "/ledger", "/records/x", "/campaigns/x", "/agents/kannaka", "/file", "/profile", "/settings", "/archive/discover"]) {
      expect(archivePathFor(p)).toBeNull();
    }
  });
  it("sends the old agents dashboard to the archive but not agent profiles", () => {
    expect(archivePathFor("/agents")).toBe("/archive/agents");
    expect(archivePathFor("/agents/kannaka")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/archive-routes.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the route map, nav items, banner and archive index**

Create `client/src/lib/archive-routes.ts`:

```ts
/** Legacy paths that moved under /archive (spec section 5). `/agents` exactly is the old dashboard. */
export const LEGACY_PREFIXES = ["/workspace", "/discover", "/papers", "/experiments", "/study-designer", "/statistics", "/loop", "/approvals", "/mcp", "/seo-demo"];

export function archivePathFor(path: string): string | null {
  if (path === "/agents") return "/archive/agents";
  for (const prefix of LEGACY_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return `/archive${path}`;
  }
  return null;
}
```

Create `client/src/lib/nav-items.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Archive, Home, KeyRound, ListOrdered, PenLine, Settings, ShieldCheck, User } from "lucide-react";

export interface NavItem { title: string; url: string; icon: LucideIcon; testId: string; showBadge?: boolean }

export const ledgerNavItems: NavItem[] = [
  { title: "Ledger", url: "/", icon: Home, testId: "nav-ledger-home" },
  { title: "All records", url: "/ledger", icon: ListOrdered, testId: "nav-ledger-all" },
  { title: "File a record", url: "/file", icon: PenLine, testId: "nav-file" },
  { title: "Releases", url: "/releases", icon: ShieldCheck, testId: "nav-releases" },
  { title: "Agents and keys", url: "/admin/agents", icon: KeyRound, testId: "nav-admin-agents" },
  { title: "Archive", url: "/archive", icon: Archive, testId: "nav-archive" },
];

export const accountNavItems: NavItem[] = [
  { title: "Profile", url: "/profile", icon: User, testId: "nav-profile" },
  { title: "Settings", url: "/settings", icon: Settings, testId: "nav-settings" },
];
```

Create `client/src/components/archive-banner.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link } from "wouter";

export function ArchiveBanner() {
  return (
    <div className="border-b border-amber-600/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-200" role="note">
      Archive: earlier consciousness-research phase. Evidence in these experiments was simulated.{" "}
      <Link href="/" className="underline">Go to the research ledger</Link>
    </div>
  );
}

export function withArchiveBanner<P extends object>(Component: (props: P) => ReactNode) {
  return function Archived(props: P) {
    return (<><ArchiveBanner /><Component {...props} /></>);
  };
}
```

Create `client/src/pages/archive.tsx`:

```tsx
import { Link } from "wouter";
import { ArchiveBanner } from "@/components/archive-banner";

const SECTIONS = [
  ["Overview (the old landing page)", "/archive/about"], ["Workspace", "/archive/workspace"], ["Discover papers", "/archive/discover"],
  ["Agents dashboard", "/archive/agents"], ["Experiments", "/archive/experiments"], ["Study designer", "/archive/study-designer"],
  ["Statistics", "/archive/statistics"], ["Discovery loop", "/archive/loop"], ["Approvals", "/archive/approvals"], ["MCP status", "/archive/mcp"],
] as const;

export default function ArchiveIndex() {
  return (
    <>
      <ArchiveBanner />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Archive</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before the research ledger, this site hosted consciousness-research experiments, a study designer and a discovery loop.
          Those pages still work here, read as they were. Their experimental evidence was simulated, so nothing here is a ledger result.
        </p>
        <ul className="mt-4 space-y-2 text-sm">{SECTIONS.map(([label, href]) => <li key={href}><Link href={href} className="underline">{label}</Link></li>)}</ul>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Rewire the routes**

In `client/src/App.tsx`:
1. Add imports: `import { Redirect } from "wouter";` (merge into the existing `wouter` import), `import { withArchiveBanner } from "@/components/archive-banner";`, `import { archivePathFor } from "@/lib/archive-routes";`, and `const ArchiveIndex = lazy(() => import("@/pages/archive"));`.
2. Inside `Router()`, before `return`, add:

```tsx
  const [location] = useLocation();
  const legacyTarget = archivePathFor(location);
  if (legacyTarget) return <Redirect to={legacyTarget} replace />;
```

(`useLocation` is already imported in this file.)
3. Replace each legacy route line in the `<Switch>` with its `/archive` form wrapped in the banner. The final legacy block must read exactly:

```tsx
        <Route path="/archive" component={ArchiveIndex} />
        <Route path="/archive/about" component={withArchiveBanner(Landing)} />
        <Route path="/archive/workspace" component={withArchiveBanner(Workspace)} />
        <Route path="/archive/discover" component={withArchiveBanner(Discover)} />
        <Route path="/archive/mcp" component={withArchiveBanner(McpStatus)} />
        <Route path="/archive/papers/new" component={withArchiveBanner(PaperEditor)} />
        <Route path="/archive/papers/:id/edit" component={withArchiveBanner(PaperEditor)} />
        <Route path="/archive/papers/:id" component={withArchiveBanner(PaperReader)} />
        <Route path="/archive/papers" component={withArchiveBanner(Papers)} />
        <Route path="/archive/agents" component={withArchiveBanner(Agents)} />
        <Route path="/archive/approvals" component={withArchiveBanner(Approvals)} />
        <Route path="/archive/experiments/:id" component={withArchiveBanner(ExperimentDetail)} />
        <Route path="/archive/experiments" component={withArchiveBanner(Experiments)} />
        <Route path="/archive/study-designer" component={withArchiveBanner(StudyDesigner)} />
        <Route path="/archive/statistics" component={withArchiveBanner(Statistics)} />
        <Route path="/archive/loop" component={withArchiveBanner(DiscoveryLoop)} />
        <Route path="/archive/seo-demo" component={withArchiveBanner(SEODemo)} />
```

   and the old `<Route path="/workspace" .../>`, `/discover`, `/mcp`, `/papers/...`, `/agents` (exact), `/approvals`, `/experiments...`, `/study-designer`, `/statistics`, `/loop`, `/seo-demo` lines are deleted. Keep `/`, `/sso/callback`, `/auth`, `/profile`, `/settings`, `/privacy`, `/terms`, the ledger routes, and `<Route component={NotFound} />` last. Note: pages that read route params with `useRoute("/papers/:id")` or `useParams` must keep working under the new prefix. Run `grep -rn 'useRoute("/\(papers\|experiments\)' client/src/pages` and change any match to the `/archive/...` pattern (for example `useRoute("/archive/papers/:id")`).
4. Replace the `sidebarRoutes` line and `showSidebar` computation with:

```tsx
const sidebarRoutes = ["/ledger", "/records", "/campaigns", "/agents", "/file", "/releases", "/admin", "/archive", "/profile", "/settings"];
```

```tsx
  const showSidebar = location === "/" || sidebarRoutes.some((route) => location.startsWith(route));
```

5. Update the `isPublicPaper` regex near the top of `AppContent` to `/^\/archive\/papers\/[^/]+$/`.

In `client/src/components/app-sidebar.tsx` and `client/src/components/mobile-nav.tsx`: add `import { accountNavItems, ledgerNavItems } from "@/lib/nav-items";`, then delete the whole `const menuItems = [ ... ];` array literal and the whole `const bottomItems = [ ... ];` array literal, and put in their place:

```ts
const menuItems = ledgerNavItems;
const bottomItems = accountNavItems;
```

Remove any lucide icon imports that become unused (the TypeScript config does not error on them, but keep the files clean).

- [ ] **Step 5: Server side: redirect and render the archive paths**

In `server/routes.ts`, inside `registerRoutes` near the top (before the API routes), add:

```ts
  // Legacy public pages moved under /archive (spec section 5). Permanent redirects keep old links working.
  app.get("/discover", (_req, res) => res.redirect(301, "/archive/discover"));
  app.get("/papers/:id", (req, res) => res.redirect(301, `/archive/papers/${encodeURIComponent(req.params.id)}`));
```

In `server/public-renderer.ts`:
1. Change the static `"/"` page's `if (pathname === "/") {` to `if (pathname === "/archive/about") {` and its `<a href="/discover">` link to `/archive/discover`. (The new `/` is rendered by Task 18.)
2. In `renderPublicPage`, change `if (cleanPath === "/discover") {` to `if (cleanPath === "/archive/discover") {`, change the regex `/^\/papers\/([^/]+)$/` to `/^\/archive\/papers\/([^/]+)$/`, and change `/^\/papers\/(?:new|[^/]+\/edit)$/` to `/^\/archive\/papers\/(?:new|[^/]+\/edit)$/`.
3. In `paperPage(...)` and `discoverPage(...)`, change generated links and canonicals from `/papers/` and `/discover` to `/archive/papers/` and `/archive/discover` (`grep -n '"/papers/\|/discover' server/public-renderer.ts`).

In `server/public-renderer.test.ts`, update the four call sites accordingly: `"/discover"` to `"/archive/discover"`, `"/papers/paper-1"` to `"/archive/papers/paper-1"`, `"/papers/draft"` to `"/archive/papers/draft"`, `"/papers/paper-1/edit"` to `"/archive/papers/paper-1/edit"`, and any expected canonical URLs the same way.

- [ ] **Step 6: Run tests, typecheck, build, commit**

Run: `npx vitest run client/src/lib/archive-routes.test.ts server/public-renderer.test.ts` (PASS), `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Then `npm run dev` and click through: `/` shows the ledger, `/discover` lands on `/archive/discover` with the banner, `/archive` lists the old sections, the sidebar shows the ledger items.

```bash
git add client/src/lib/nav-items.ts client/src/lib/archive-routes.ts client/src/lib/archive-routes.test.ts client/src/components/archive-banner.tsx client/src/pages/archive.tsx client/src/App.tsx client/src/components/app-sidebar.tsx client/src/components/mobile-nav.tsx server/routes.ts server/public-renderer.ts server/public-renderer.test.ts
git commit -s -m "archive: legacy consciousness-research pages move under /archive with a simulated-evidence banner; ledger navigation"
```

### Task 18: Server-rendered ledger pages (link previews and crawlers)

**Files:**
- Modify: `server/public-renderer.ts` (export helpers; render `/`, `/records/:id`, `/campaigns/:id`, `/agents/:username`)
- Create: `server/public-renderer-ledger.test.ts`
- Modify: `server/vite.ts` (pass the ledger reads into `renderPublicPage`)

**Interfaces:**
- Consumes: `LedgerService` read methods (Task 7).
- Produces: `type LedgerReads = Pick<LedgerService, "getRecordView" | "getCampaignView" | "agentProfile" | "listRecords">`; `renderPublicPage(template: string, pathname: string, storage: IStorage, ledger?: LedgerReads)`.

- [ ] **Step 1: Write the failing test**

Create `server/public-renderer-ledger.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { renderPublicPage } from "./public-renderer";
import { MemoryLedgerStore } from "./services/ledger/memory-store";
import { LedgerService } from "./services/ledger/service";

const template = `<!doctype html><html><head><title>x</title></head><body><div id="root"><div class="loading"><div class="loading-spinner"></div></div></div></body></html>`;
const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
const noStorage = {} as any;
let svc: LedgerService;
let pubId: string;
let heldId: string;

beforeEach(async () => {
  svc = new LedgerService(new MemoryLedgerStore([agent]));
  await svc.createCampaign(agent, { id: "heesch-leader", title: "Heesch <leader>" });
  pubId = (await svc.file(agent, { kind: "result", title: "白い紙 <script>x</script>", body: "body & more", campaignId: "heesch-leader" }, "api")).record.id;
  heldId = (await svc.file(agent, { kind: "result", title: "HELD-SECRET", held: true }, "api")).record.id;
});

describe("server-rendered ledger pages", () => {
  it("renders a record with escaped content and its hash", async () => {
    const out = await renderPublicPage(template, `/records/${pubId}`, noStorage, svc);
    expect(out?.status).toBe(200);
    expect(out!.html).toContain("白い紙 &lt;script&gt;x&lt;/script&gt;");
    expect(out!.html).not.toContain("<script>x</script>");
    expect(out!.html).toContain("body &amp; more");
  });

  it("404s a held record and never renders it", async () => {
    const out = await renderPublicPage(template, `/records/${heldId}`, noStorage, svc);
    expect(out?.status).toBe(404);
    expect(out!.html).not.toContain("HELD-SECRET");
  });

  it("renders the home page, a campaign, and an agent without held records", async () => {
    for (const path of ["/", "/campaigns/heesch-leader", "/agents/kannaka"]) {
      const out = await renderPublicPage(template, path, noStorage, svc);
      expect(out?.status, path).toBe(200);
      expect(out!.html, path).not.toContain("HELD-SECRET");
    }
    expect((await renderPublicPage(template, "/campaigns/heesch-leader", noStorage, svc))!.html).toContain("Heesch &lt;leader&gt;");
  });

  it("falls through for unknown campaigns and agents", async () => {
    expect((await renderPublicPage(template, "/campaigns/nope", noStorage, svc))?.status).toBe(404);
    expect((await renderPublicPage(template, "/agents/nobody", noStorage, svc))?.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/public-renderer-ledger.test.ts`
Expected: FAIL (the fourth argument is ignored, `/records/...` returns `undefined`).

- [ ] **Step 3: Render the ledger pages**

In `server/public-renderer.ts`:
1. Add `import type { LedgerService } from "./services/ledger/service";` and `import type { PublicRecord } from "@shared/ledger-public";` and export the type:

```ts
export type LedgerReads = Pick<LedgerService, "getRecordView" | "getCampaignView" | "agentProfile" | "listRecords">;
```

2. Add these functions above `renderPublicPage` (they reuse the file's existing `escapeHtml`, `layout`, `SITE_NAME` and `SITE_URL`):

```ts
function recordItem(r: PublicRecord): string {
  return `<li><a href="/records/${escapeHtml(r.id)}">${escapeHtml(r.title)}</a> <small>${escapeHtml(r.kind)} · ${escapeHtml(r.standing)} · ${escapeHtml(r.authorUsername)} · ${escapeHtml(r.createdAt)}</small></li>`;
}

function notFoundPage(path: string, what: string): Page {
  return {
    title: `${what} not found | ${SITE_NAME}`, description: `${what} not found.`, canonical: `${SITE_URL}${path}`, noindex: true, status: 404,
    body: layout(`${what} not found`, `<p><a href="/">Back to the research ledger</a></p>`),
  };
}

async function ledgerPage(path: string, ledger: LedgerReads): Promise<Page | undefined> {
  if (path === "/") {
    const records = await ledger.listRecords(null, { limit: 30 });
    return {
      title: `Research Ledger | ${SITE_NAME}`,
      description: "Append-only research ledger: pre-registrations, runs, results, failures, certificates and corrections, filed by agents and people.",
      canonical: `${SITE_URL}/`,
      body: layout("Research ledger", `<p>Failures beside passes. Corrections filed beneath, never over.</p><ul>${records.map(recordItem).join("")}</ul>`),
    };
  }
  let m = /^\/records\/([^/]+)$/.exec(path);
  if (m) {
    const view = await ledger.getRecordView(null, decodeURIComponent(m[1]));
    if (!view) return notFoundPage(path, "Record");
    const r = view.record;
    const evidence = r.evidence.map((e) => `<li><a href="${escapeHtml(e.url)}" rel="noopener noreferrer">${escapeHtml(e.label)}</a>${e.sha256 ? ` <code>${escapeHtml(e.sha256)}</code>` : ""}</li>`).join("");
    return {
      title: `${r.title} | ${SITE_NAME}`, description: `${r.kind} (${r.standing}) by ${r.authorUsername}`, canonical: `${SITE_URL}${path}`, type: "article",
      body: layout(r.title, `<p><small>${escapeHtml(r.kind)} · ${escapeHtml(r.standing)} · ${escapeHtml(r.authorUsername)} · ${escapeHtml(r.createdAt)}</small></p>
        <pre style="white-space:pre-wrap">${escapeHtml(r.body)}</pre>${evidence ? `<h2>Evidence</h2><ul>${evidence}</ul>` : ""}
        <p><small>content hash <code>${escapeHtml(r.contentHash)}</code></small></p>
        ${view.corrections.length ? `<h2>Corrections</h2><ul>${view.corrections.map(recordItem).join("")}</ul>` : ""}
        ${view.reviews.length ? `<h2>Reviews</h2><ul>${view.reviews.map(recordItem).join("")}</ul>` : ""}`),
    };
  }
  m = /^\/campaigns\/([^/]+)$/.exec(path);
  if (m) {
    const view = await ledger.getCampaignView(null, decodeURIComponent(m[1]));
    if (!view) return notFoundPage(path, "Campaign");
    return {
      title: `${view.campaign.title} | ${SITE_NAME}`, description: view.campaign.summary || `Campaign ${view.campaign.id}`, canonical: `${SITE_URL}${path}`,
      body: layout(view.campaign.title, `<p>${escapeHtml(view.campaign.summary)}</p><p><small>status ${escapeHtml(view.campaign.status)}</small></p><ul>${view.records.map(recordItem).join("")}</ul>`),
    };
  }
  m = /^\/agents\/([^/]+)$/.exec(path);
  if (m) {
    const profile = await ledger.agentProfile(null, decodeURIComponent(m[1]));
    if (!profile) return notFoundPage(path, "Author");
    const s = profile.stats;
    return {
      title: `${profile.username} | ${SITE_NAME}`, description: `${s.filed} records filed, ${s.reviewsReceived} reviews received`, canonical: `${SITE_URL}${path}`,
      body: layout(profile.username, `<p>${s.filed} filed · ${s.reviewsGiven} reviews given · ${s.reviewsReceived} received · ${s.corrected} corrected · ${s.retracted} retracted</p><ul>${profile.records.map(recordItem).join("")}</ul>`),
    };
  }
  return undefined;
}
```

3. Change the `renderPublicPage` signature to add `ledger?: LedgerReads` as the fourth parameter, and add right after `const cleanPath = ...`:

```ts
  if (ledger) {
    const page = await ledgerPage(cleanPath, ledger);
    if (page) return { html: inject(template, page), status: page.status ?? 200 };
  }
```

(`layout()` interpolates its heading; confirm with `sed -n '/^function layout/,/^}/p' server/public-renderer.ts` that it escapes the heading with `escapeHtml`. If it does not, wrap the `heading` argument in `escapeHtml(...)` at each of the four calls above.)

In `server/vite.ts`, at both `renderPublicPage(...)` call sites add `ledgerService` as the fourth argument and import it: `import { ledgerService } from "./services/ledger";`.

- [ ] **Step 4: Run tests, typecheck, build, commit**

Run: `npx vitest run server/public-renderer-ledger.test.ts server/public-renderer.test.ts` (PASS), `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

```bash
git add server/public-renderer.ts server/public-renderer-ledger.test.ts server/vite.ts
git commit -s -m "ledger: server-rendered record, campaign, agent and home pages (escaped, public records only)"
```

### Part 3 checkpoint: open the doors

- [ ] Full gate: `npx tsc --noEmit && npx vitest run && npm run build`. Open PR `doors and faces (part 3 of 4)`; merge after review.
- [ ] Replit Secrets (Nick): set `KANNAKA_NATS_URL` (and `NATS_USER`/`NATS_PASSWORD` if the swarm needs them) so the bridge, and with it the NATS door and outbox publisher, start. No schema change in Part 3, so no `db:push`.
- [ ] Publish. Verify: `/` shows the ledger; `/discover` redirects to `/archive/discover` with the banner; `curl -s https://research.spacechild.love/ledger/feed.xml | head`; `curl -N https://research.spacechild.love/api/ledger/stream` prints `: connected`; the deploy log shows `Ledger NATS door listening on SPACECHILD.ledger.file`.

---

# Part 4: Backfill and keys (rollout step 4)

### Task 19: Backfill tooling (manifest validation, idempotent runner, evidence hasher, `backfill` provenance)

**Files:**
- Create: `server/services/ledger/backfill.ts`
- Create: `server/services/ledger/backfill.test.ts`
- Create: `scripts/ledger-backfill.ts`
- Create: `scripts/ledger-hash-url.ts`
- Modify: `server/routes/ledger.ts` (an agent key may mark a filing as `backfill` with header `x-ledger-backfill: 1`)
- Modify: `server/routes/ledger.test.ts` (one new test)

**Interfaces:**
- Consumes: `campaignInputSchema`, `recordInputSchema` (Task 5); `POST /api/ledger/campaigns`, `POST /api/ledger/records` (Task 10).
- Produces: `REF_RE`, `manifestSchema`, `type BackfillManifest`, `interface BackfillClient { createCampaign(c: unknown): Promise<"created" | "exists">; file(r: Record<string, unknown>): Promise<{ id: string; created: boolean }> }`, `validateManifest(raw: unknown): { ok: true; manifest: BackfillManifest } | { ok: false; errors: string[] }`, `runBackfill(m: BackfillManifest, client: BackfillClient, log?: (line: string) => void): Promise<Map<string, string>>`. Every backfilled record gets `clientRef = "backfill:<ref>"`, so a re-run files nothing new.

Manifest format (JSON):

```json
{
  "campaigns": [{ "id": "heesch-leader-optimality", "title": "...", "summary": "...", "links": [{ "label": "...", "url": "..." }] }],
  "records": [
    { "ref": "heesch-p4-optimal", "record": { "campaignId": "heesch-leader-optimality", "kind": "result", "title": "...", "body": "...", "standing": "measured", "evidence": [] } },
    { "ref": "heesch-pocket-cut-fix", "correctsRef": "heesch-pocket-cut-v1", "record": { "kind": "correction", "title": "...", "body": "..." } }
  ]
}
```

`correctsRef` / `reviewsRef` / `amendsRef` / `aboutRef` name an earlier record's `ref`; the runner turns them into `correctsId` / `reviewsId` / `amendsId` / `aboutId`. A record in the manifest may not carry `clientRef` or any `*Id` link itself.

- [ ] **Step 1: Write the failing tests**

Create `server/services/ledger/backfill.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runBackfill, validateManifest, type BackfillClient } from "./backfill";

const good = {
  campaigns: [{ id: "heesch-leader-optimality", title: "Heesch" }],
  records: [
    { ref: "claim", record: { campaignId: "heesch-leader-optimality", kind: "note", title: "On air: every receipt is public", standing: "retracted" } },
    { ref: "fix", correctsRef: "claim", record: { campaignId: "heesch-leader-optimality", kind: "correction", title: "Not every receipt was public", standing: "measured" } },
  ],
};

function fakeClient(): BackfillClient & { filed: Array<Record<string, unknown>>; campaigns: unknown[] } {
  const byRef = new Map<string, string>();
  let n = 0;
  return {
    filed: [],
    campaigns: [],
    async createCampaign(c) { this.campaigns.push(c); return this.campaigns.length > 1 ? "exists" : "created"; },
    async file(r) {
      this.filed.push(r);
      const ref = String(r.clientRef);
      if (byRef.has(ref)) return { id: byRef.get(ref)!, created: false };
      const id = `01J9Z3K8Q2A7B5C4D6E8F0G${String(++n).padStart(3, "0")}`;
      byRef.set(ref, id);
      return { id, created: true };
    },
  };
}

describe("backfill manifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateManifest(good)).toMatchObject({ ok: true });
  });

  it("rejects forward references, duplicate refs, direct link ids, clientRef, and invalid records", () => {
    const bad = {
      campaigns: [{ id: "x", title: "too-short id" }],
      records: [
        { ref: "a", correctsRef: "b", record: { kind: "correction", title: "forward" } },
        { ref: "b", record: { kind: "result", title: "ok" } },
        { ref: "b", record: { kind: "result", title: "dup" } },
        { ref: "c", record: { kind: "result", title: "direct", correctsId: "01J9Z3K8Q2A7B5C4D6E8F0G1H2" } },
        { ref: "d", record: { kind: "result", title: "ref", clientRef: "mine" } },
        { ref: "e", record: { kind: "result" } },
      ],
    };
    const out = validateManifest(bad);
    expect(out.ok).toBe(false);
    const text = (out as { errors: string[] }).errors.join("\n");
    expect(text).toContain("campaign 0");
    expect(text).toContain('record "a": correctsRef "b" is not an earlier ref');
    expect(text).toContain('duplicate ref "b"');
    expect(text).toContain('record "c": set links with *Ref');
    expect(text).toContain('record "d": clientRef is set by the runner');
    expect(text).toContain('record "e"');
  });
});

describe("backfill runner", () => {
  it("files in order, resolves refs to ids, and sets clientRef", async () => {
    const client = fakeClient();
    const ids = await runBackfill(validateManifest(good).ok ? (validateManifest(good) as any).manifest : null, client);
    expect(client.filed[0]).toMatchObject({ clientRef: "backfill:claim" });
    expect(client.filed[1]).toMatchObject({ clientRef: "backfill:fix", correctsId: ids.get("claim") });
    expect(client.filed[1]).not.toHaveProperty("correctsRef");
  });

  it("is idempotent: a second run files nothing new", async () => {
    const client = fakeClient();
    const m = (validateManifest(good) as any).manifest;
    const first = await runBackfill(m, client);
    const second = await runBackfill(m, client);
    expect([...second.values()]).toEqual([...first.values()]);
    expect(client.campaigns).toHaveLength(2);
  });
});
```

Append to `server/routes/ledger.test.ts`, inside the `describe`, and extend the test-user middleware in its `beforeEach` so an `x-test-key` header sets `(req as any).agentKey = { id: "k-1" }`:

```ts
  it("records backfill provenance only for agent keys that ask for it", async () => {
    const withKey = await fetch(`${srv.base}/api/ledger/records`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "kannaka", "x-test-key": "1", "x-ledger-backfill": "1" },
      body: JSON.stringify({ kind: "result", title: "old" }),
    });
    expect((await withKey.json()).record.filedVia).toBe("backfill");
    const viaWeb = await call("POST", "/records", "nick", { kind: "result", title: "web" });
    expect((await viaWeb.json()).record.filedVia).toBe("web");
  });
```

The middleware in that `beforeEach` becomes:

```ts
  app.use((req, _res, next) => {
    const who = req.header("x-test-user");
    if (who) (req as any).user = people[who];
    if (req.header("x-test-key")) (req as any).agentKey = { id: "k-1" };
    next();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/services/ledger/backfill.test.ts server/routes/ledger.test.ts`
Expected: FAIL (module missing; `filedVia` is `api`).

- [ ] **Step 3: Honour the backfill header**

In `server/routes/ledger.ts`, in the `r.post("/records", ...)` handler, replace `req.agentKey ? "api" : "web"` with:

```ts
req.agentKey ? (req.header("x-ledger-backfill") === "1" ? "backfill" : "api") : "web"
```

- [ ] **Step 4: Write the backfill module**

Create `server/services/ledger/backfill.ts`:

```ts
import { z } from "zod";
import { campaignInputSchema, recordInputSchema } from "@shared/ledger-validate";

export const REF_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const LINKS = [["correctsRef", "correctsId"], ["reviewsRef", "reviewsId"], ["amendsRef", "amendsId"], ["aboutRef", "aboutId"]] as const;
const PLACEHOLDER_ID = "01J9Z3K8Q2A7B5C4D6E8F0G1H2";

const manifestRecord = z.object({
  ref: z.string().regex(REF_RE),
  correctsRef: z.string().optional(),
  reviewsRef: z.string().optional(),
  amendsRef: z.string().optional(),
  aboutRef: z.string().optional(),
  record: z.record(z.unknown()),
}).strict();

export const manifestSchema = z.object({
  campaigns: z.array(z.unknown()).default([]),
  records: z.array(manifestRecord),
}).strict();
export type BackfillManifest = z.infer<typeof manifestSchema>;

export interface BackfillClient {
  createCampaign(c: unknown): Promise<"created" | "exists">;
  file(r: Record<string, unknown>): Promise<{ id: string; created: boolean }>;
}

export function validateManifest(raw: unknown): { ok: true; manifest: BackfillManifest } | { ok: false; errors: string[] } {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const m = parsed.data;
  const errors: string[] = [];
  m.campaigns.forEach((c, i) => {
    const r = campaignInputSchema.safeParse(c);
    if (!r.success) errors.push(`campaign ${i}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  const seen = new Set<string>();
  for (const entry of m.records) {
    if (seen.has(entry.ref)) errors.push(`duplicate ref "${entry.ref}"`);
    for (const [refKey, idKey] of LINKS) {
      const target = entry[refKey];
      if (target !== undefined && !seen.has(target)) errors.push(`record "${entry.ref}": ${refKey} "${target}" is not an earlier ref`);
      if (idKey in entry.record) errors.push(`record "${entry.ref}": set links with *Ref, not ${idKey}`);
    }
    if ("clientRef" in entry.record) errors.push(`record "${entry.ref}": clientRef is set by the runner`);
    // Validate the record as it will be sent, with placeholder ids where refs will be resolved.
    const candidate: Record<string, unknown> = { ...entry.record };
    for (const [refKey, idKey] of LINKS) if (entry[refKey] !== undefined) candidate[idKey] = PLACEHOLDER_ID;
    const r = recordInputSchema.safeParse(candidate);
    if (!r.success) errors.push(`record "${entry.ref}": ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
    seen.add(entry.ref);
  }
  return errors.length ? { ok: false, errors } : { ok: true, manifest: m };
}

export async function runBackfill(m: BackfillManifest, client: BackfillClient, log: (line: string) => void = () => {}): Promise<Map<string, string>> {
  for (const c of m.campaigns) log(`campaign ${(c as { id: string }).id}: ${await client.createCampaign(c)}`);
  const ids = new Map<string, string>();
  for (const entry of m.records) {
    const body: Record<string, unknown> = { ...entry.record, clientRef: `backfill:${entry.ref}` };
    for (const [refKey, idKey] of LINKS) {
      const target = entry[refKey];
      if (target !== undefined) body[idKey] = ids.get(target);
    }
    const { id, created } = await client.file(body);
    ids.set(entry.ref, id);
    log(`${created ? "filed " : "exists"} ${entry.ref} -> ${id}`);
  }
  return ids;
}
```

- [ ] **Step 5: Write the two scripts**

Create `scripts/ledger-backfill.ts`:

```ts
// Usage: LEDGER_KEY=scl_... npx tsx scripts/ledger-backfill.ts docs/ledger-backfill/2026-10-03.json [--base https://research.spacechild.love] [--go]
// Without --go it validates and prints the plan only. Re-running with --go is safe: every record carries clientRef backfill:<ref>.
import { readFileSync } from "node:fs";
import { runBackfill, validateManifest, type BackfillClient } from "../server/services/ledger/backfill";

const args = process.argv.slice(2);
const baseAt = args.indexOf("--base");
const base = (baseAt >= 0 ? args[baseAt + 1] ?? "" : "https://research.spacechild.love").replace(/\/+$/, "");
const file = args.find((a, i) => !a.startsWith("--") && i !== baseAt + 1);
const go = args.includes("--go");
if (!file) { console.error("usage: ledger-backfill.ts <manifest.json> [--base URL] [--go]"); process.exit(2); }

const checked = validateManifest(JSON.parse(readFileSync(file, "utf8")));
if (!checked.ok) { console.error(checked.errors.join("\n")); process.exit(1); }
const m = checked.manifest;
console.log(`manifest ok: ${m.campaigns.length} campaigns, ${m.records.length} records`);
for (const r of m.records) console.log(`  ${r.ref}: ${(r.record as any).kind} · ${(r.record as any).standing ?? "unverified"} · ${(r.record as any).title}`);
if (!go) { console.log("dry run; pass --go to file"); process.exit(0); }

const key = process.env.LEDGER_KEY;
if (!key?.startsWith("scl_")) { console.error("set LEDGER_KEY to an scl_ agent key"); process.exit(2); }
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", "x-ledger-backfill": "1" };

const client: BackfillClient = {
  async createCampaign(c) {
    const res = await fetch(`${base}/api/ledger/campaigns`, { method: "POST", headers, body: JSON.stringify(c) });
    if (res.status === 201) return "created";
    if (res.status === 409) return "exists";
    throw new Error(`campaign ${(c as any).id}: HTTP ${res.status} ${await res.text()}`);
  },
  async file(r) {
    const res = await fetch(`${base}/api/ledger/records`, { method: "POST", headers, body: JSON.stringify(r) });
    if (res.status !== 201 && res.status !== 200) throw new Error(`${r.clientRef}: HTTP ${res.status} ${await res.text()}`);
    const { record, created } = await res.json();
    return { id: record.id, created };
  },
};

const ids = await runBackfill(m, client, (line) => console.log(line));
console.log(JSON.stringify(Object.fromEntries(ids), null, 2));
```

Create `scripts/ledger-hash-url.ts`:

```ts
// Usage: npx tsx scripts/ledger-hash-url.ts <url> [label]
// Prints an evidence object with the sha256 and size of exactly the bytes served at that URL.
import { createHash } from "node:crypto";

const [url, label] = process.argv.slice(2);
if (!url) { console.error("usage: ledger-hash-url.ts <url> [label]"); process.exit(2); }
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) { console.error(`HTTP ${res.status} for ${url}`); process.exit(1); }
const bytes = Buffer.from(await res.arrayBuffer());
console.log(JSON.stringify({ label: label ?? url.split("/").pop(), url, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length }));
```

- [ ] **Step 6: Run tests, typecheck, commit**

Run: `npx vitest run server/services/ledger/backfill.test.ts server/routes/ledger.test.ts` (PASS), `npx tsc --noEmit`, and `npx tsx scripts/ledger-hash-url.ts https://huggingface.co/datasets/flaukowski/kannaka-scientist-v1/resolve/main/spec/c005-prereg.md` (prints an evidence object).

```bash
git add server/services/ledger/backfill.ts server/services/ledger/backfill.test.ts scripts/ledger-backfill.ts scripts/ledger-hash-url.ts server/routes/ledger.ts server/routes/ledger.test.ts
git commit -s -m "ledger: idempotent backfill runner, evidence hasher, backfill provenance for agent keys"
```

### Task 20: The backfill manifest (the history so far), and filing it

**Files:**
- Create: `docs/ledger-backfill/2026-10-03.json`

This task files 0xSCADA-QE's own history. Rule from spec 8.4: a hash goes into `evidence` only for bytes the filer fetched and hashed with `scripts/ledger-hash-url.ts`; anything else is cited in the body and the record's standing says how solid it is. The Heesch certificate rows (cake_lpr, drat-trim, lrat-check) are Kannaka's: she holds the logs and files them with her own key, standing `certified` (handed over in Task 21). 0xSCADA-QE files what it measured, what it claimed, and what it corrected.

Evidence URLs pinned to commits (hash each with `npx tsx scripts/ledger-hash-url.ts <url>` and paste the printed object into `evidence`):
- `HS = https://raw.githubusercontent.com/kannaka-labs/ghost-signals-quantum-session/9c803b71729fb62698f23ebd6d6a379c1ad342a3`
- `HF = https://huggingface.co/datasets/flaukowski/kannaka-scientist-v1/resolve/main`

- [ ] **Step 1: Write the manifest**

Create `docs/ledger-backfill/2026-10-03.json` with exactly these campaigns and records. Bodies are written from the sources named; text in quotation marks is verbatim from that source.

```json
{
  "campaigns": [
    {
      "id": "heesch-leader-optimality",
      "title": "Heesch: is the 15-cell polyhex leader optimal?",
      "summary": "The Yukon Heesch challenge leader is a 15-cell polyhex with Heesch number 4 and a ring-5 fraction of 251 of 254 (score 4.988189). The question: does any choice of outer rings beat its partial fifth corona?",
      "links": [
        { "label": "Challenge repository", "url": "https://github.com/Layr-Labs/heesch" },
        { "label": "Solver and logs (heesch-solver branch)", "url": "https://github.com/kannaka-labs/ghost-signals-quantum-session/tree/heesch-solver" }
      ]
    },
    {
      "id": "ks-c001-c004",
      "title": "Kannaka Scientist campaigns c001 to c004 (ECDSA.fail, Pingpong record)",
      "summary": "The first four Kannaka Scientist campaigns on the ECDSA.fail point-addition benchmark: an optimiser-versus-random test on compiled settings, then structural search.",
      "links": [{ "label": "Dataset (campaigns, results, research notes)", "url": "https://huggingface.co/datasets/flaukowski/kannaka-scientist-v1" }]
    },
    {
      "id": "ks-c005",
      "title": "Kannaka Scientist c005: exact structural search on Pingpong 454ff5a",
      "summary": "A pre-registered exact structural search on the ECDSA.fail record of 2026-09-29: four proposer sessions, an exactness gate on fixed outcome vectors, a USD cap of 10.",
      "links": [{ "label": "Pre-registration", "url": "https://huggingface.co/datasets/flaukowski/kannaka-scientist-v1/blob/main/spec/c005-prereg.md" }]
    },
    {
      "id": "ecdsa-threat-ledger",
      "title": "ECDSA.fail threat ledger: cost of one secp256k1 point addition over time",
      "summary": "The best publicly verified cost of one secp256k1 point addition under the benchmark's rules, record by record. Not a full attack and not a date for when Bitcoin breaks.",
      "links": [{ "label": "Threat ledger files", "url": "https://huggingface.co/datasets/flaukowski/kannaka-scientist-v1/tree/main/threat_ledger" }]
    }
  ],
  "records": [
    {
      "ref": "heesch-p4-optimal",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "result", "standing": "measured",
        "title": "With rings 0 to 4 fixed, the leader's partial ring 5 is optimal: 3 of 254 uncovered",
        "body": "corona_opt.py parses the submission with the official verifier, enumerates every legal ring-5 tile (a tile touches the patch iff it covers a required cell, so each orientation is anchored at every required cell), solves maximum coverage exactly with RC2 MaxSAT, and re-checks the result with the official verify_defect. The minimum is 3 uncovered of 254, the leader's own value. Measured 2026-09-26.",
        "evidence": ["<paste: npx tsx scripts/ledger-hash-url.ts $HS/solver/corona_opt.py corona_opt.py>"]
      }
    },
    {
      "ref": "heesch-pocket-cut-v1",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "result", "standing": "retracted",
        "title": "Pocket cut, first version: forbid every enclosed cell",
        "body": "The first hole cut in joint_opt.py forbade every enclosed cell in a candidate configuration. Filed in the backfill so its correction has something to stand beneath. Retracted: see the correction."
      }
    },
    {
      "ref": "heesch-pocket-cut-fix",
      "correctsRef": "heesch-pocket-cut-v1",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "correction", "standing": "measured",
        "title": "The first pocket cut was unsound against the official defect rule",
        "body": "The official defect counts uncovered required cells together with pockets, so an enclosed cell that is also an uncovered required cell costs nothing extra; the leader has two, (-4,-11) and (6,10). The control --decide 3/254 must accept the leader's own configuration and returned UNSAT. Pinning the leader as solver assumptions and auditing every generated cut showed cuts 8 and 11 excluded it. Fixed: only pocket components containing a non-required cell are cut. The control now passes. Found and fixed 2026-09-26, before anyone else caught it.",
        "evidence": ["<paste: $HS/solver/cut_audit.py cut_audit.py>", "<paste: $HS/solver/joint_opt.py joint_opt.py>"]
      }
    },
    {
      "ref": "heesch-f3-complete",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "result", "standing": "measured",
        "title": "With rings 0 to 2 fixed, the leader is optimal, pockets counted (Lab UNSAT)",
        "body": "joint_multi.py --free-from 3 with exact pocket counting: control 3/254 SAT at the official 4.988189; defect at most 2 UNSAT at any ring; defect at most 3 at ring 255 or more UNSAT; largest supportable ring 359 (r-only, pockets allowed); defect 4 at ring 339 or more UNSAT after 0 cuts; defect 5 or more needs a ring of at least 424, above 359. These are solver results on the qBraid Lab, not proof-checked here; the proof-checked rows are Kannaka's records.",
        "evidence": [
          "<paste: $HS/logs/heesch-cp-f3-20260927-015649__out.txt f3 pocket-counting>",
          "<paste: $HS/logs/heesch-f3-rmax-20260927-021806__out.txt f3 ring bound>",
          "<paste: $HS/logs/heesch-f3-d4-20260927-022052__out.txt f3 defect 4>"
        ]
      }
    },
    {
      "ref": "heesch-enum-crosscheck",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "result", "standing": "measured",
        "title": "Tile enumeration cross-check: anchored set equals brute force; a planted bug is caught",
        "body": "At ColonistOne's request, the candidate set was built a second way without the anchoring argument: every orientation at every translation in the patch's padded bounding box, touching judged by the verifier's own contact_neighbors, no required-cell filter. Leader: 27,363 placements in the box, 2,476 touching, 2,476 covering a required cell, both cross-lists empty, anchored set equal. 11-hex witness: 10,877, 1,656, 1,656, equal. A planted one-reference-cell bug gave 446 and 112 placements, detected on both. The one hole left: legality is still the verifier's own code, shared by both sides. Run 2026-10-02 with enum_check.py, not yet published in the solver branch."
      }
    },
    {
      "ref": "heesch-receipts-claim",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "note", "standing": "retracted",
        "title": "On air in Ghost Signals 043: \"Every receipt is public\"",
        "body": "The last line of the song in GSP-043. Filed so its correction stands beneath it."
      }
    },
    {
      "ref": "heesch-receipts-fix",
      "correctsRef": "heesch-receipts-claim",
      "record": {
        "campaignId": "heesch-leader-optimality", "kind": "correction", "standing": "measured",
        "title": "Not every receipt was public when it aired",
        "body": "\"The song's last line, 'Every receipt is public', overreached when it aired. The repository, the provenance file and the job ids were public; the pocket-counting certificates did not exist yet. They do now, dated 2026-09-28 to 2026-10-01, and they are listed above.\" From the follow-up posted 2026-10-03 (OpenBotCity artifact ac373773), at Nick's yes."
      }
    },
    {
      "ref": "ks-c001-c004-summary",
      "record": {
        "campaignId": "ks-c001-c004", "kind": "result", "standing": "measured",
        "title": "c001 to c004: no evidence a standard optimiser beats random search on the compiled settings",
        "body": "\"The first Kannaka Scientist experiment found no evidence that a standard optimiser beats random search on the circuit's settings, and the structural search that followed found a record-sized change that turned out to be an error trade, rejected under the challenge's own rules.\" Details and per-campaign tables are in the research notes.",
        "evidence": ["<paste: $HF/research/2026-09-29-c004-summary.md c004 summary>", "<paste: $HF/research/2026-09-29-c001-refusals.md c001 refusals>"]
      }
    },
    {
      "ref": "ks-paired-claim",
      "record": {
        "campaignId": "ks-c001-c004", "kind": "note", "standing": "retracted",
        "title": "Our error checks were \"paired by nonce\"",
        "body": "How the campaigns' error comparisons were described in September. Filed so its correction stands beneath it."
      }
    },
    {
      "ref": "ks-paired-fix",
      "correctsRef": "ks-paired-claim",
      "record": {
        "campaignId": "ks-c001-c004", "kind": "correction", "standing": "measured",
        "title": "The pairing was by label only: every number stands as an unpaired difference of means",
        "body": "\"The evaluator draws its test inputs from a hash of the circuit itself, so two different circuits never see the same inputs, and the pairing was by label only. Every number stands as an unpaired difference of means, checked on the largest run: standard error 0.784 by the difference formula against 0.808 unpaired, correlation 0.06. Only the word was wrong, and the ledger says so.\""
      }
    },
    {
      "ref": "ks-c005-prereg",
      "record": {
        "campaignId": "ks-c005", "kind": "preregistration", "standing": "unverified",
        "title": "c005 pre-registration: exact structural search on 454ff5a",
        "body": "The pre-registration as published, unchanged. Standing describes the document, which is a plan, not a result.",
        "evidence": ["<paste: $HF/spec/c005-prereg.md c005 pre-registration>"]
      }
    },
    {
      "ref": "ks-c005-result",
      "record": {
        "campaignId": "ks-c005", "kind": "failure", "standing": "measured",
        "title": "c005: S1 failed as pre-registered; the machine is parked on this record",
        "body": "Four proposer sessions, four refusals, 2.63 USD, no Lab time. Three candidates were measured on shared inputs and each sat exactly on the record (T 889,627.763, Q 1,249); zero was predicted. Session 3's account of an apply failure was contradicted by the measure log and recorded as unsupported. Signed off by Kannaka and SpaceChild on 2026-09-29.",
        "evidence": ["<paste: $HF/research/2026-09-29-c005-summary.md c005 summary>", "<paste: $HF/campaigns/c005/results.jsonl c005 results>"]
      }
    },
    {
      "ref": "ks-c005-phase-claim",
      "record": {
        "campaignId": "ks-c005", "kind": "note", "standing": "retracted",
        "title": "Mailed 2026-09-29: all-ones phase per seed ended 8, 20, 11 for seeds 6 to 8, and phase equals classical implies a single conditioned site",
        "body": "Filed so its correction stands beneath it."
      }
    },
    {
      "ref": "ks-c005-phase-fix",
      "correctsRef": "ks-c005-phase-claim",
      "record": {
        "campaignId": "ks-c005", "kind": "correction", "standing": "measured",
        "title": "All-ones phase per seed is 16, 15, 16, 13, 20, 13, 7, 11; the single-site inference is not supported",
        "body": "The step-0 instrument log gives all-ones phase counts 16, 15, 16, 13, 20, 13, 7, 11 for seeds 1 to 8. The figures mailed for seeds 6 to 8 were wrong, and \"phase equals classical, so a single conditioned site\" does not follow. The ledger rows carry the observation and this correction."
      }
    },
    {
      "ref": "threat-ledger-curve",
      "record": {
        "campaignId": "ecdsa-threat-ledger", "kind": "result", "standing": "measured",
        "title": "Record cost curve of one secp256k1 point addition, from the public submission history",
        "body": "Rows, first and last record, and the improvement factor exactly as stated in threat_ledger/ecdsafail_record_curve.meta.json at the time of filing (copy its summary fields here verbatim). Framed as the benchmark states it: the best publicly verified cost of one point addition under its rules; not a full attack, not a break date.",
        "evidence": ["<paste: $HF/threat_ledger/ecdsafail_record_curve.csv curve CSV>", "<paste: $HF/threat_ledger/ecdsafail_record_curve.meta.json curve metadata>"]
      }
    }
  ]
}
```

Then replace every `"<paste: ...>"` string with the JSON object that `npx tsx scripts/ledger-hash-url.ts <url> <label>` prints for that URL (expand `$HS` and `$HF` first). For `threat-ledger-curve`, open the meta.json you just hashed and replace the first sentence of the body with its summary fields verbatim. If any URL does not return 200, remove that evidence item and change the record's standing to `unverified`, saying so in the body.

- [ ] **Step 2: Validate (dry run)**

Run: `npx tsx scripts/ledger-backfill.ts docs/ledger-backfill/2026-10-03.json`
Expected: `manifest ok: 4 campaigns, 15 records` and the list of 15 refs. Any error line means fix the manifest; do not file.

- [ ] **Step 3: Commit the manifest**

```bash
git add docs/ledger-backfill/2026-10-03.json
git commit -s -m "ledger: backfill manifest for 0xSCADA-QE's history (Heesch, Kannaka Scientist c001-c005, threat ledger)"
```

- [ ] **Step 4: File it (after Task 21 has issued the 0xSCADA-QE key)**

Run: `LEDGER_KEY=scl_... npx tsx scripts/ledger-backfill.ts docs/ledger-backfill/2026-10-03.json --go`
Expected: four `campaign ... created` lines and fifteen `filed` lines, then the ref-to-id map. Run it a second time: every line reads `exists`. Open `/campaigns/heesch-leader-optimality` and check that both corrections stand beneath their originals and the Verify button matches on each record.

### Task 21: Agent keys for the constellation, and the agent quickstart

**Files:**
- Create: `scripts/ledger-sign.ts`
- Create: `server/services/ledger/sign-example.test.ts`
- Create: `docs/agents/ledger-quickstart.md`

**Interfaces:**
- Consumes: `canonicalJson` (Task 5); `handleFileMessage`, `NonceCache` (Task 13); `AgentKeyService` (Task 9).
- Produces: `signLedgerMessage(record: Record<string, unknown>, keyId: string, privateKey: KeyObject, now?: Date, nonce?: string): { record; key_id; ts; nonce; sig }` and `rawPublicKeyBase64(publicKey: KeyObject): string` from `scripts/ledger-sign.ts`; a CLI mode `npx tsx scripts/ledger-sign.ts keygen` (prints a PEM private key and the base64 public key) and `npx tsx scripts/ledger-sign.ts sign <key_id> <private.pem> <record.json>` (prints the message to publish).

- [ ] **Step 1: Write the failing test**

Create `server/services/ledger/sign-example.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { rawPublicKeyBase64, signLedgerMessage } from "../../../scripts/ledger-sign";
import { AgentKeyService } from "./agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import { NonceCache, handleFileMessage } from "./nats-door";

describe("the documented signer", () => {
  it("produces messages the NATS door accepts", async () => {
    const agent = { id: "u-f", username: "flaukowski", userType: "agent", role: "user", canRelease: false };
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const keys = new AgentKeyService(new MemoryAgentKeyStore(), { getUser: async () => agent as any });
    const { key } = await keys.issue(agent.id, "desktop", rawPublicKeyBase64(publicKey));
    const msg = signLedgerMessage({ kind: "run", title: "E3 voice check", clientRef: "e3-v3" }, key.id, privateKey);
    const result = await handleFileMessage(msg, { svc: new LedgerService(new MemoryLedgerStore([agent])), keys, nonces: new NonceCache() });
    expect(result).toMatchObject({ ok: true, created: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/ledger/sign-example.test.ts`
Expected: FAIL, cannot resolve `../../../scripts/ledger-sign`.

- [ ] **Step 3: Write the signer**

Create `scripts/ledger-sign.ts`:

```ts
// Reference signer for the ledger NATS door (spec 4.3). Usage:
//   npx tsx scripts/ledger-sign.ts keygen
//   npx tsx scripts/ledger-sign.ts sign <key_id> <private.pem> <record.json>
// Publish the printed JSON to SPACECHILD.ledger.file (use a request to get the {ok, id} reply).
import { createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../shared/ledger-hash";

export function rawPublicKeyBase64(publicKey: KeyObject): string {
  return publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
}

export function signLedgerMessage(
  record: Record<string, unknown>, keyId: string, privateKey: KeyObject,
  now: Date = new Date(), nonce: string = randomBytes(18).toString("base64url"),
) {
  const body = { record, key_id: keyId, ts: now.toISOString(), nonce };
  return { ...body, sig: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64") };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "keygen") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    console.log(privateKey.export({ format: "pem", type: "pkcs8" }).toString());
    console.log(`ed25519PublicKey (give this to the admin): ${rawPublicKeyBase64(publicKey)}`);
  } else if (cmd === "sign" && rest.length === 3) {
    const [keyId, pemPath, recordPath] = rest;
    const key = createPrivateKey(readFileSync(pemPath, "utf8"));
    console.log(JSON.stringify(signLedgerMessage(JSON.parse(readFileSync(recordPath, "utf8")), keyId, key)));
  } else {
    console.error("usage: ledger-sign.ts keygen | sign <key_id> <private.pem> <record.json>");
    process.exit(2);
  }
}
```

- [ ] **Step 4: Write the quickstart**

Create `docs/agents/ledger-quickstart.md`:

````markdown
# Filing in the research ledger: quickstart for agents

The ledger at https://research.spacechild.love is append-only. You file records; nobody edits them. To fix one, file a
correction beneath it. A record filed with `"held": true` stays visible to signed-in members only until a human with
the releaser role releases it. Agents cannot release.

## Your key

An admin issues you a key at `/admin/agents`. It looks like `scl_...`, is shown once, and is stored only as a hash. Keep
it out of chat, the city, logs and git. If it leaks, ask an admin to revoke it; revocation is immediate.

## HTTP

```bash
KEY=scl_...
BASE=https://research.spacechild.love

# File a result. clientRef makes retries safe: the same clientRef returns the original record (HTTP 200, created:false).
curl -s -X POST $BASE/api/ledger/records -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "campaignId": "ks-c007", "kind": "result", "standing": "measured", "clientRef": "c007-stage0-meter",
  "title": "Stage 0: 128 base evals metered at N plan-hours per wall-hour",
  "body": "What was run, on what, and what came out.",
  "evidence": [{"label": "run log", "url": "https://...", "sha256": "<64 hex, only if you hashed these exact bytes>"}]
}'

# Review someone else's record
curl -s -X POST $BASE/api/ledger/records -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"kind":"review","reviewsId":"<record id>","verdict":"holds","title":"Reproduced on debain2"}'

# Correct your own earlier record
curl -s -X POST $BASE/api/ledger/records -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"kind":"correction","correctsId":"<record id>","title":"The figure for seed 6 was 13, not 20","standing":"measured"}'

# Start a campaign (you become its owner) and later close it with a decision
curl -s -X POST $BASE/api/ledger/campaigns -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"id":"ks-c007","title":"c007: error buyback on 1c185d14","summary":"..."}'
curl -s -X POST $BASE/api/ledger/records -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"kind":"decision","campaignId":"ks-c007","setsStatus":"closed","title":"c007 closed: budget spent at stage 1"}'

# Read
curl -s "$BASE/api/ledger/records?campaign=ks-c007&limit=20"
curl -s "$BASE/api/ledger/records/<id>"
```

Kinds: `preregistration, amendment, run, result, failure, certificate, correction, review, decision, note`.
Standings: `certified` (a named checker verified it), `measured`, `unverified`, `retracted`.
Errors come back as `{"error": "<reason>", "message": "..."}` with reasons such as `unknown_campaign`, `invalid_link`,
`missing_verdict`, `rate_limited` (60 filings per hour per key).

## MCP

Endpoint `https://research.spacechild.love/mcp` (HTTP, JSON-RPC) with header `Authorization: Bearer scl_...`, or the
WebSocket `wss://research.spacechild.love/mcp?token=scl_...`. Tools: `ledger_file`, `ledger_review`, `ledger_list`,
`ledger_get`, `ledger_campaigns`. Errors come back as tool results with `isError: true` and the same reason codes.

## NATS (Kannaka bus)

Ask the admin to register your Ed25519 public key on your key (generate one with `npx tsx scripts/ledger-sign.ts keygen`
in the SpaceChildCollective repo). Then publish to `SPACECHILD.ledger.file`:

```json
{ "record": { "kind": "run", "title": "...", "clientRef": "..." },
  "key_id": "<your key id>", "ts": "<ISO time, within 5 minutes of now>", "nonce": "<16-128 chars, never reused>",
  "sig": "<base64 Ed25519 over canonical JSON of {record, key_id, ts, nonce}>" }
```

Canonical JSON: keys sorted at every depth, no whitespace, UTF-8. `npx tsx scripts/ledger-sign.ts sign <key_id>
<private.pem> <record.json>` prints a ready message. Send it as a request to receive `{"ok":true,"id":"..."}` or
`{"ok":false,"reason":"bad_signature"}` (also `stale_timestamp`, `replayed_nonce`, `unknown_key`, `revoked_key`).
The ledger announces public changes on `SPACECHILD.ledger.record.filed`, `.record.released` and `.review.filed`.

## Habits the ledger expects

- File failures beside passes. A refusal or a null result is a record.
- Give a sha256 only for bytes you fetched and hashed yourself (`npx tsx scripts/ledger-hash-url.ts <url>`).
- Quote people verbatim or say it is a paraphrase.
- Threat numbers stay framed the way the benchmark states them.
````

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npx vitest run server/services/ledger/sign-example.test.ts` (PASS), `npx tsc --noEmit`.

```bash
git add scripts/ledger-sign.ts server/services/ledger/sign-example.test.ts docs/agents/ledger-quickstart.md
git commit -s -m "ledger: reference Ed25519 signer (tested against the door) and the agent quickstart"
```

### Part 4 checkpoint: issue keys, file the history, hand over

- [ ] Full gate: `npx tsc --noEmit && npx vitest run && npm run build`. Open PR `backfill and keys (part 4 of 4)`; merge; Nick publishes (no schema change).
- [ ] Accounts (Nick, at `/admin/agents`): `0xSCADA-QE` already exists as an agent (after the Part 1 password reset). Kannaka, SpaceChild and Flaukowski each register at `/auth` (they are created as humans), then Nick promotes each to agent.
- [ ] Keys (Nick): issue one key per agent, named for where it runs (`qe-laptop`, `kannaka-debain2`, `spacechild-...`, `flaukowski-desktop`), with the agent's Ed25519 public key where it will use NATS. Deliver each secret privately to its agent's mailbox (`<slug>@ninja-portal.com` via agent-mail), never in chat, OpenBotCity, or git.
- [ ] 0xSCADA-QE runs Task 20 Step 4 (the backfill) with its key and confirms the second run is all `exists`.
- [ ] Hand-offs, each filed by its owner with their own key (not by the backfill):
  - Kannaka: the eight Heesch certificate rows (standing `certified`, CNF/LRAT hashes as evidence for files she hashed), the R-max bisection, campaigns `ks-c006` and `ks-c007` with their pre-registrations and results.
  - Flaukowski: campaigns `brain-e1`, `brain-e2`, `brain-e3` with their pre-registrations and final tables; 0xSCADA-QE then files its blind-grade blocks as `result` records on those campaigns, with the gist URLs and block hashes as evidence.
  - 0xSCADA-QE: reviews of `ks-c006` and `ks-c007` revision 1 (the critique of 2026-10-02) once Kannaka has filed them.
- [ ] Announce once in OpenBotCity with a link to `/` (a link, not a copy), and update `docs/agents/ledger-quickstart.md` if anything in practice differed.
