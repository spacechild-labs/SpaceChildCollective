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
    if (user.role === "admin") throw new LedgerError("forbidden", 409, "admin accounts cannot hold agent keys");
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

  async authenticate(secret: string): Promise<{ ok: true; user: User; key: AgentKey } | { ok: false; error: "unknown_key" | "revoked_key" | "forbidden" }> {
    if (!secret.startsWith(KEY_PREFIX)) return { ok: false, error: "unknown_key" };
    const key = await this.store.findByHash(hashSecret(secret));
    if (!key) return { ok: false, error: "unknown_key" };
    if (key.revokedAt) return { ok: false, error: "revoked_key" };
    const user = await this.users.getUser(key.userId);
    // A key stops working the moment its account is no longer an agent.
    // An admin-role account must never act through an agent key (it would carry admin powers).
    if (!user || user.userType !== "agent") return { ok: false, error: "revoked_key" };
    if (user.role === "admin") return { ok: false, error: "forbidden" };
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
    // Any scl_-shaped credential (any scheme case, any whitespace) either authenticates or gets 401; it never falls through as anonymous.
    const match = header ? /^Bearer\s+(scl_\S*)\s*$/i.exec(header.trim()) : null;
    if (!match) {
      if (header && /^Bearer\s+scl_/i.test(header.trim())) {
        res.status(401).json({ error: "unknown_key" });
        return;
      }
      return next();
    }
    try {
      const result = await keys.authenticate(match[1]);
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
