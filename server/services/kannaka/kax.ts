import crypto from "crypto";

/**
 * KAX Computer wake envelopes (kax-computer manager, envelope v1).
 *
 *   {v: 1, machine, id, ts, prompt, signer, sig}
 *   sig = Ed25519 (hex) over canonical JSON — sorted keys, compact separators,
 *   Python json.dumps(sort_keys=True, separators=(",",":")) — of the envelope minus sig.
 *
 * The manager accepts a signer only if its public key is in trusted_keys.json
 * ("operator-nick", "bridge-nostr", "kax-backend"), rejects |now - ts| > 60 s and
 * replayed ids within 10 minutes, and publishes the machine's answer on
 * KAX.machine.<machine>.outbox.
 *
 * Interop rules that bit before: keep numerics INTEGER (Python and V8 format floats
 * differently) and the prompt ASCII-only (Python's ensure_ascii escapes non-ASCII,
 * JSON.stringify does not, and the manager re-serializes what it parsed).
 */

export interface WakeEnvelope {
  v: 1;
  machine: string;
  id: string;
  ts: number;
  prompt: string;
  signer: string;
  sig: string;
}

/** Sorted-key, compact JSON identical to Python's json.dumps(sort_keys=True, separators=(",",":")) for ASCII scalars/objects. */
export function pythonCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonCanonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${pythonCanonical(obj[k])}`).join(",")}}`;
}

/** Non-ASCII → '?' so the JSON is byte-identical under Python's ensure_ascii and JS. */
export function asciiOnly(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?");
}

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function privateKeyFromSeedHex(seedHex: string): crypto.KeyObject {
  const seed = Buffer.from(seedHex.trim(), "hex");
  if (seed.length !== 32) throw new Error("Ed25519 seed must be 32 bytes (64 hex characters)");
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export function publicKeyHex(priv: crypto.KeyObject): string {
  const spki = crypto.createPublicKey(priv).export({ format: "der", type: "spki" }) as Buffer;
  return spki.subarray(spki.length - 32).toString("hex");
}

export function publicKeyFromHex(pubHex: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(pubHex, "hex")]), format: "der", type: "spki" });
}

export function buildWakeEnvelope(opts: { machine: string; prompt: string; signer: string; seedHex: string; id?: string; ts?: number }): WakeEnvelope {
  const base = {
    v: 1 as const,
    machine: opts.machine,
    id: opts.id ?? crypto.randomUUID(),
    ts: Math.floor(opts.ts ?? Date.now() / 1000),
    prompt: asciiOnly(opts.prompt).slice(0, 4000),
    signer: opts.signer,
  };
  const sig = crypto.sign(null, Buffer.from(pythonCanonical(base), "utf8"), privateKeyFromSeedHex(opts.seedHex)).toString("hex");
  return { ...base, sig };
}

export function verifyWakeEnvelope(env: WakeEnvelope, pubHex: string): boolean {
  const { sig, ...base } = env;
  try {
    return crypto.verify(null, Buffer.from(pythonCanonical(base), "utf8"), publicKeyFromHex(pubHex), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

export function wakeSubject(machine: string): string {
  return `KAX.machine.${machine}.inbox`;
}

/** A machine's answer as pumped from its outbox. Field names vary by runtime; take the first text-like one. */
export function parseOutbox(payload: any): { id: string | null; text: string | null; machine: string | null } {
  if (!payload || typeof payload !== "object") return { id: null, text: null, machine: null };
  const text = ["text", "result", "reply", "output", "response", "content"].map((k) => payload[k]).find((v) => typeof v === "string" && v.trim()) ?? null;
  return { id: payload.id != null ? String(payload.id) : null, text: text ? String(text) : null, machine: payload.machine ? String(payload.machine) : null };
}
