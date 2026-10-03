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
