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
  invite: z.string().min(1).max(128),
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
    if (!found || found.revokedAt || new Date(found.expiresAt).getTime() <= now.getTime() || found.uses >= found.maxUses) throw invalid();
    const creator = await this.users.getUser(found.createdBy);
    if (!this.mayInvite(creator)) throw invalid();
    if (await this.users.getUserByUsername(username)) throw new LedgerError("forbidden", 409, `${username} is already taken`);
    const since = new Date(now.getTime() - DAY);
    const onboardedToday = (await this.users.getAllUsers()).filter((u) => u.inviteId && new Date(u.createdAt).getTime() >= since.getTime()).length;
    if (onboardedToday >= this.dailyOnboardCap) throw new LedgerError("rate_limited", 429, "daily onboarding limit reached; try again later");

    // Hash before claiming so the window between claim and create stays short.
    const zkpCommitment = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    const claimed = await this.store.claim(found.codeHash, now);
    if (!claimed) throw invalid();
    const release = () => this.store.release(claimed.id).catch((r) => console.error("[ledger] could not release invite use", claimed.id, r));

    let user: User;
    try {
      user = await this.users.createUser({
        username, displayName: displayName ?? username, userType: "agent", role: "user", canRelease: false,
        canInvite: claimed.grantsInvite, invitedBy: claimed.createdBy, inviteId: claimed.id,
        zkpCommitment, bio: null, researchInterests: [],
      } as InsertUser);
    } catch (e) {
      await release();
      if ((e as { code?: string })?.code === "23505") throw new LedgerError("forbidden", 409, `${username} is already taken`);
      throw e;
    }
    const undoUser = () => this.users.deleteUser(user.id).catch((d) => console.error("[ledger] could not roll back onboarded account", user.id, d));
    let issued;
    try {
      issued = await this.keys.issue(user.id, "default", ed25519PublicKey ?? null);
    } catch (e) {
      await undoUser();
      await release();
      throw e;
    }
    // The inviter's right is part of the claim: re-check now that the account exists, so a revokeChain that ran
    // while this redeem was in flight cannot leave a live descendant behind.
    const inviterNow = await this.users.getUser(claimed.createdBy).catch(() => undefined);
    if (!this.mayInvite(inviterNow)) {
      await this.keys.revoke(issued.key.id).catch((r) => console.error("[ledger] could not revoke key of rolled-back account", issued.key.id, r));
      await undoUser();
      await release();
      throw invalid();
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
    let all = await this.users.getAllUsers();
    const root = all.find((u) => u.id === userId);
    if (!root) throw new LedgerError("not_found", 404, "no such user");
    if (root.userType !== "agent" || root.role === "admin") throw new LedgerError("forbidden", 409, "revoke chain applies to agent accounts");
    const chain = new Set<string>([userId]);
    let keys = 0;
    // Repeat until a pass finds nothing new, so an account created mid-revoke is caught.
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (let grew = true; grew;) {
        grew = false;
        for (const u of all) if (u.invitedBy && chain.has(u.invitedBy) && !chain.has(u.id)) { chain.add(u.id); grew = true; changed = true; }
      }
      for (const id of chain) {
        for (const k of await this.keys.list(id)) if (!k.revokedAt) { await this.keys.revoke(k.id); keys++; changed = true; }
        const u = all.find((x) => x.id === id);
        if (u?.canInvite) { await this.users.updateUser(id, { canInvite: false }); changed = true; }
      }
      if (!changed) break;
      all = await this.users.getAllUsers();
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
