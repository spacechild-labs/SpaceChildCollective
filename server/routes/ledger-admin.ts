import { randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { InsertUser, User } from "@shared/schema";
import { sanitizeUser } from "../lib/sanitize";
import { siteUrl } from "../lib/site-url";
import { isValidEd25519PublicKey, type AgentKeyService } from "../services/ledger/agent-keys";
import type { InviteService } from "../services/ledger/invites";
import { requireLedgerAdmin, sendLedgerError } from "./ledger";

/** Registration has no username rule of its own (any non-empty string), so the agent form uses this one. */
const addAgentSchema = z.object({
  username: z.string().trim().min(3, "The name must be 3-64 characters").max(64, "The name must be 3-64 characters")
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "The name may use letters, digits, '_', '.' and '-', and must start with a letter or digit"),
  displayName: z.string().trim().min(2, "Display name must be 2-120 characters").max(120, "Display name must be 2-120 characters").optional(),
  keyName: z.string().trim().min(1, "Key name must be 1-64 characters").max(64, "Key name must be 1-64 characters").optional(),
  ed25519PublicKey: z.string().trim().optional().transform((v) => v || undefined)
    .refine((v) => v === undefined || isValidEd25519PublicKey(v), "The NATS signing public key must be a 32-byte key in base64"),
  canInvite: z.boolean().optional(),
});

export type LedgerAdminUsers = {
  getUser(id: string): Promise<User | undefined>;
  updateUser(id: string, u: Partial<User>): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(u: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
};

export function createLedgerAdminRouter(deps: { keys: AgentKeyService; users: LedgerAdminUsers; invites: InviteService }): Router {
  const r = Router();
  r.use(requireLedgerAdmin);

  // One-step onboarding: find or create the agent account, then issue its first (or an additional) key.
  r.post("/agents", async (req, res) => {
    try {
      const parsed = addAgentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" });
        return;
      }
      const { username, displayName, keyName: givenKeyName, ed25519PublicKey, canInvite } = parsed.data;
      const existing = await deps.users.getUserByUsername(username);
      if (existing && (existing.userType !== "agent" || existing.role === "admin")) {
        res.status(409).json({ error: "forbidden", message: `${username} is a human/admin account; agent keys can only belong to agent accounts` });
        return;
      }
      let user = existing;
      let created = false;
      if (!user) {
        // The password is unusable by construction: a hash of random bytes nobody ever sees. The agent signs in with its key only.
        try {
          user = await deps.users.createUser({
            username, displayName: displayName ?? username, userType: "agent", role: "user", canRelease: false,
            zkpCommitment: await bcrypt.hash(randomBytes(32).toString("hex"), 12), bio: null, researchInterests: [],
          } as InsertUser);
        } catch (e) {
          // 23505 = unique_violation: another request created this username between our lookup and insert.
          if ((e as { code?: string })?.code === "23505") {
            res.status(409).json({ error: "forbidden", message: `${username} was just created by another request; try again` });
            return;
          }
          throw e;
        }
        created = true;
      }
      if (canInvite === true && !user.canInvite) {
        try { user = await deps.users.updateUser(user.id, { canInvite: true }); } catch (e) {
          if (created) await deps.users.deleteUser(user.id).catch((d) => console.error("[ledger] could not roll back new agent account", user!.id, d));
          throw e;
        }
      }
      // An agent that already has active keys gets "key-<n>" rather than another "default".
      const activeKeys = created ? 0 : (await deps.keys.list(user.id)).filter((k) => !k.revokedAt).length;
      const keyName = givenKeyName ?? (activeKeys > 0 ? `key-${activeKeys + 1}` : "default");
      let issued;
      try {
        issued = await deps.keys.issue(user.id, keyName, ed25519PublicKey ?? null);
      } catch (e) {
        if (created) {
          // No half-made account: undo the create, then report the original failure.
          await deps.users.deleteUser(user.id).catch((d) => console.error("[ledger] could not roll back new agent account", user!.id, d));
        }
        throw e;
      }
      const { key, secret } = issued;
      res.status(created ? 201 : 200).json({
        created,
        user: { id: user.id, username: user.username, displayName: user.displayName, canInvite: Boolean(user.canInvite) },
        key: { id: key.id, name: key.name, prefix: key.prefix, hasEd25519: Boolean(key.ed25519PublicKey) },
        secret,
        setup: { baseUrl: siteUrl(), keyId: key.id, quickstartUrl: `${siteUrl()}/ledger/agent-guide` },
      });
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/agents", async (req, res) => {
    try {
      const everyone = await deps.users.getAllUsers();
      const nameById = new Map(everyone.map((u) => [u.id, u.username]));
      const agents = everyone
        .filter((u) => u.userType === "agent" && u.role !== "admin")
        .sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
      res.json(await Promise.all(agents.map(async (u) => {
        const keys = await deps.keys.list(u.id);
        const used = keys.map((k) => (k.lastUsedAt ? new Date(k.lastUsedAt).getTime() : 0)).filter(Boolean);
        return {
          id: u.id, username: u.username, displayName: u.displayName, canRelease: Boolean(u.canRelease),
          canInvite: Boolean(u.canInvite), invitedBy: (u.invitedBy && nameById.get(u.invitedBy)) || null,
          activeKeys: keys.filter((k) => !k.revokedAt).length,
          lastUsedAt: used.length ? new Date(Math.max(...used)).toISOString() : null,
        };
      })));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/promote-agent", async (req, res) => {
    try {
      if (req.params.id === req.user?.id) { res.status(400).json({ error: "invalid_input", message: "cannot promote yourself" }); return; }
      const user = await deps.users.getUser(req.params.id);
      if (!user) { res.status(404).json({ error: "not_found" }); return; }
      if (user.role === "admin") {
        res.status(409).json({ error: "forbidden", message: "admin accounts cannot be promoted to agents (an agent key would carry admin powers)" });
        return;
      }
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

  r.post("/users/:id/can-invite", async (req, res) => {
    try { res.json(sanitizeUser(await deps.invites.setCanInvite(req.params.id, req.body?.canInvite === true))); } catch (e) { sendLedgerError(res, e, req); }
  });

  // Read-only: what a revoke-chain would cut right now, so the confirm can state the counts before anything happens.
  r.get("/users/:id/revoke-chain/preview", async (req, res) => {
    try { res.json(await deps.invites.previewChain(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/revoke-chain", async (req, res) => {
    try { res.json(await deps.invites.revokeChain(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/users/:id/keys", async (req, res) => {
    try { res.json(await deps.keys.list(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/keys", async (req, res) => {
    try {
      const owner = await deps.users.getUser(req.params.id);
      if (owner?.role === "admin") {
        res.status(409).json({ error: "forbidden", message: "admin accounts cannot hold agent keys" });
        return;
      }
      res.status(201).json(await deps.keys.issue(req.params.id, String(req.body?.name ?? ""), req.body?.ed25519PublicKey ?? null));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.delete("/keys/:id", async (req, res) => {
    try { res.json(await deps.keys.revoke(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  return r;
}
