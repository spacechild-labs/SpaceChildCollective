import { createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import type { AgentKeyService } from "./agent-keys";
import { mcpKeyBudget, type KeyBudget } from "./rate-limits";
import { actorFromUser, type LedgerService } from "./service";
import { LedgerError, type LedgerErrorCode } from "./types";

export const NATS_FILE_SUBJECT = "SPACECHILD.ledger.file";
/** Queue group for the door subscription: each filing is handled by one instance. */
export const NATS_FILE_QUEUE = "spacechild-ledger";
export const MAX_SKEW_MS = 5 * 60 * 1000;
export const NONCE_TTL_MS = 10 * 60 * 1000;
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export const MAX_NONCES = 100_000;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export class NonceCache {
  private seen = new Map<string, number>();
  constructor(private readonly ttlMs: number = NONCE_TTL_MS, private readonly maxEntries: number = MAX_NONCES) {}

  /** Read-only: was this nonce seen within the TTL? */
  has(nonce: string, now: number): boolean {
    const t = this.seen.get(nonce);
    return t !== undefined && now - t <= this.ttlMs;
  }

  /** "new" (recorded), "replayed" (seen within the TTL) or "full" (cache at its cap; nothing recorded). */
  tryAdd(nonce: string, now: number): "new" | "replayed" | "full" {
    // Insertion order is time order, so the sweep stops at the first live entry.
    for (const [n, t] of this.seen) {
      if (now - t > this.ttlMs) this.seen.delete(n);
      else break;
    }
    if (this.seen.has(nonce)) return "replayed";
    if (this.seen.size >= this.maxEntries) return "full";
    this.seen.set(nonce, now);
    return "new";
  }

  /** True if the nonce is new (and records it); false if replayed or the cache is full. */
  checkAndAdd(nonce: string, now: number): boolean {
    return this.tryAdd(nonce, now) === "new";
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
    // key_id is attacker-controlled until the signature checks out: log it only when it is a plain token.
    const shown = keyId === undefined ? "" : ` key_id=${KEY_ID_RE.test(keyId) ? keyId : "<invalid>"}`;
    deps.log?.(`[ledger] NATS filing rejected: ${reason}${shown}`);
    return message ? { ok: false, reason, message } : { ok: false, reason };
  };
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || typeof p.key_id !== "string" || typeof p.ts !== "string" || typeof p.nonce !== "string"
      || typeof p.sig !== "string" || typeof p.record !== "object" || p.record === null) {
    return reject("invalid_input");
  }
  const keyId = p.key_id;
  if (!KEY_ID_RE.test(keyId)) return reject("unknown_key", keyId); // before any DB lookup
  if (p.nonce.length < 16 || p.nonce.length > 128) return reject("invalid_input", keyId, "nonce must be 16-128 characters");

  const rec = p.record as Record<string, unknown>;
  if (typeof rec.clientRef !== "string" || rec.clientRef.trim() === "") {
    return reject("invalid_input", keyId, "clientRef is required on the NATS door (it makes retries safe)");
  }
  if (rec.held === true) {
    // The bus allows anonymous subscribers, so held content must never travel on it.
    return reject("invalid_input", keyId, "held records cannot be filed over NATS; file them over HTTPS or MCP");
  }

  const key = await deps.keys.getKey(keyId);
  if (!key) return reject("unknown_key", keyId);
  if (key.revokedAt) return reject("revoked_key", keyId);
  if (!key.ed25519PublicKey) return reject("unknown_key", keyId, "key has no Ed25519 public key");

  // Signature first, so unsigned junk can neither probe timing rules nor fill the nonce cache.
  const message = canonicalJson({ record: p.record, key_id: keyId, ts: p.ts, nonce: p.nonce });
  if (!verifyEd25519(key.ed25519PublicKey, message, p.sig)) return reject("bad_signature", keyId);
  if (!ISO_UTC_RE.test(p.ts)) return reject("invalid_input", keyId, "ts must be ISO 8601 UTC, e.g. 2026-10-03T12:00:00.000Z");
  const ts = Date.parse(p.ts);
  if (!Number.isFinite(ts)) return reject("invalid_input", keyId, "ts is not a valid time");
  if (Math.abs(now - ts) > MAX_SKEW_MS) return reject("stale_timestamp", keyId);
  // A replay must be refused before it can touch the budget (a bus listener could otherwise drain the key's
  // budget with captured messages). Then budget, then record the nonce, so flooding is bounded by the budget.
  const nonceKey = `${keyId}:${p.nonce}`;
  if (deps.nonces.has(nonceKey, now)) return reject("replayed_nonce", keyId);
  if (!(deps.budget ?? mcpKeyBudget).take("file", keyId)) return reject("rate_limited", keyId);
  const added = deps.nonces.tryAdd(nonceKey, now);
  if (added === "replayed") return reject("replayed_nonce", keyId);
  if (added === "full") return reject("rate_limited", keyId, "nonce cache is full; retry later");

  // Same owner checks as the HTTP and MCP doors: revoked, owner gone or not an agent, admin-role owner.
  const auth = await deps.keys.reauthenticate(keyId);
  if (!auth.ok) return reject(auth.error, keyId);
  try {
    const { record, created } = await deps.svc.file(actorFromUser(auth.user as any), p.record, "nats");
    return { ok: true, id: record.id, created };
  } catch (error) {
    if (error instanceof LedgerError) return reject(error.code, keyId, error.message);
    throw error;
  }
}

/** The bridge subscriber for the filing subject: always replies, and never leaks internal error text. */
export function natsFileSubscriber(deps: Parameters<typeof handleFileMessage>[1]) {
  return async (payload: unknown, _subject: string, reply?: (body: unknown) => void): Promise<void> => {
    let result: DoorResult;
    try {
      result = await handleFileMessage(payload, deps);
    } catch (error) {
      deps.log?.(`[ledger] NATS filing failed internally: ${(error as Error)?.name ?? "error"}`);
      result = { ok: false, reason: "invalid_input", message: "internal error" };
    }
    reply?.(result);
  };
}
