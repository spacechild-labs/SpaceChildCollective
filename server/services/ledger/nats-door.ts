import { createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import type { AgentKeyService } from "./agent-keys";
import { mcpKeyBudget, type KeyBudget } from "./rate-limits";
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
  deps: { svc: LedgerService; keys: AgentKeyService; nonces: NonceCache; budget?: KeyBudget; now?: () => number; log?: (line: string) => void },
): Promise<DoorResult> {
  const now = deps.now?.() ?? Date.now();
  // Logs the key id and the reason only; never the payload, signature or record.
  const reject = (reason: LedgerErrorCode, keyId?: string, message?: string): DoorResult => {
    deps.log?.(`[ledger] NATS filing rejected: ${reason}${keyId ? ` key_id=${keyId.slice(0, 40)}` : ""}`);
    return message ? { ok: false, reason, message } : { ok: false, reason };
  };
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || typeof p.key_id !== "string" || typeof p.ts !== "string" || typeof p.nonce !== "string"
      || typeof p.sig !== "string" || typeof p.record !== "object" || p.record === null) {
    return reject("invalid_input");
  }
  const keyId = p.key_id;
  if (p.nonce.length < 16 || p.nonce.length > 128) return reject("invalid_input", keyId, "nonce must be 16-128 characters");

  const key = await deps.keys.getKey(keyId);
  if (!key) return reject("unknown_key", keyId);
  if (key.revokedAt) return reject("revoked_key", keyId);
  if (!key.ed25519PublicKey) return reject("unknown_key", keyId, "key has no Ed25519 public key");

  // Signature first, so unsigned junk can neither probe timing rules nor fill the nonce cache.
  const message = canonicalJson({ record: p.record, key_id: keyId, ts: p.ts, nonce: p.nonce });
  if (!verifyEd25519(key.ed25519PublicKey, message, p.sig)) return reject("bad_signature", keyId);
  const ts = Date.parse(p.ts);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return reject("stale_timestamp", keyId);
  if (!deps.nonces.checkAndAdd(`${keyId}:${p.nonce}`, now)) return reject("replayed_nonce", keyId);

  // Same owner checks as the HTTP and MCP doors: revoked, owner gone or not an agent, admin-role owner.
  const auth = await deps.keys.reauthenticate(keyId);
  if (!auth.ok) return reject(auth.error, keyId);
  if (!(deps.budget ?? mcpKeyBudget).take("file", keyId)) return reject("rate_limited", keyId);
  try {
    const { record, created } = await deps.svc.file(actorFromUser(auth.user as any), p.record, "nats");
    return { ok: true, id: record.id, created };
  } catch (error) {
    if (error instanceof LedgerError) return reject(error.code, keyId, error.message);
    throw error;
  }
}
