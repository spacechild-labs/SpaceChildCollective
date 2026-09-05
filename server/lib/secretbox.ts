import crypto from "crypto";

/**
 * Small AES-256-GCM box for secrets that must live in the database (channel
 * webhook secrets, NATS passwords). Same scheme as the AI key manager: the key
 * is sha256(ENCRYPTION_KEY). Without ENCRYPTION_KEY an ephemeral key is used and
 * a warning is printed — encrypted values will not survive a restart.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    console.warn(
      "[secretbox] ENCRYPTION_KEY not set — using an ephemeral key; encrypted channel secrets will not survive a restart.",
    );
  }
  cachedKey = crypto.createHash("sha256").update(envKey || crypto.randomBytes(32).toString("hex")).digest();
  return cachedKey;
}

const PREFIX = "enc:v1:";

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${data.toString("hex")}`;
}

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function open(sealed: string): string {
  if (!isSealed(sealed)) return sealed; // Tolerate legacy plaintext values
  const [ivHex, tagHex, dataHex] = sealed.slice(PREFIX.length).split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed sealed value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/** Seal the named fields of an object (no-op for fields that are absent or already sealed). */
export function sealFields<T extends Record<string, any>>(obj: T, fields: readonly string[]): T {
  const out: Record<string, any> = { ...obj };
  for (const f of fields) {
    if (typeof out[f] === "string" && out[f].length > 0 && !isSealed(out[f])) out[f] = seal(out[f]);
  }
  return out as T;
}

/** Open the named fields of an object. */
export function openFields<T extends Record<string, any>>(obj: T, fields: readonly string[]): T {
  const out: Record<string, any> = { ...obj };
  for (const f of fields) {
    if (isSealed(out[f])) out[f] = open(out[f]);
  }
  return out as T;
}

/** Replace the named fields with a redaction marker for API responses. */
export function redactFields<T extends Record<string, any>>(obj: T, fields: readonly string[]): T {
  const out: Record<string, any> = { ...obj };
  for (const f of fields) {
    if (typeof out[f] === "string" && out[f].length > 0) out[f] = "••••••";
  }
  return out as T;
}
