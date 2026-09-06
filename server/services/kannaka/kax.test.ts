import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { asciiOnly, buildWakeEnvelope, parseOutbox, privateKeyFromSeedHex, publicKeyHex, pythonCanonical, verifyWakeEnvelope, wakeSubject } from "./kax";

const seedHex = "9f".repeat(32); // deterministic test seed, not a real key

describe("pythonCanonical", () => {
  it("matches Python json.dumps(sort_keys=True, separators=(',',':')) for the envelope shape", () => {
    const s = pythonCanonical({ v: 1, ts: 1788655342, machine: "kannaka-01", id: "abc", prompt: "hi there", signer: "kax-backend" });
    expect(s).toBe('{"id":"abc","machine":"kannaka-01","prompt":"hi there","signer":"kax-backend","ts":1788655342,"v":1}');
    expect(pythonCanonical({ b: [1, { z: true, a: null }], a: "x" })).toBe('{"a":"x","b":[1,{"a":null,"z":true}]}');
  });

  it("asciiOnly keeps the JSON byte-identical under ensure_ascii", () => {
    expect(asciiOnly("phi Φ rising — ok")).toBe("phi ? rising ? ok");
    expect(asciiOnly("plain")).toBe("plain");
  });
});

describe("wake envelope", () => {
  it("is v1, integer ts, ASCII prompt, and its Ed25519 signature verifies against the derived public key", () => {
    const env = buildWakeEnvelope({ machine: "kannaka-01", prompt: "A finding arrived over amateur radio Φ", signer: "kax-backend", seedHex, ts: 1788655342.789 });
    expect(env.v).toBe(1);
    expect(env.ts).toBe(1788655342);
    expect(Number.isInteger(env.ts)).toBe(true);
    expect(env.prompt).toBe("A finding arrived over amateur radio ?");
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.sig).toMatch(/^[0-9a-f]{128}$/);
    const pub = publicKeyHex(privateKeyFromSeedHex(seedHex));
    expect(pub).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyWakeEnvelope(env, pub)).toBe(true);
    // Any change to the signed fields breaks the signature; a different key does too.
    expect(verifyWakeEnvelope({ ...env, prompt: env.prompt + "!" }, pub)).toBe(false);
    expect(verifyWakeEnvelope({ ...env, ts: env.ts + 1 }, pub)).toBe(false);
    expect(verifyWakeEnvelope(env, publicKeyHex(privateKeyFromSeedHex("01".repeat(32))))).toBe(false);
  });

  it("uses node's own Ed25519 for the signature (cross-check with a fresh keypair)", () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
    const seed = pkcs8.subarray(pkcs8.length - 32).toString("hex");
    const env = buildWakeEnvelope({ machine: "m", prompt: "p", signer: "s", seedHex: seed });
    expect(verifyWakeEnvelope(env, publicKeyHex(privateKey))).toBe(true);
  });

  it("rejects a malformed seed and addresses the machine inbox", () => {
    expect(() => privateKeyFromSeedHex("abcd")).toThrow(/32 bytes/);
    expect(wakeSubject("kannaka-01")).toBe("KAX.machine.kannaka-01.inbox");
  });
});

describe("parseOutbox", () => {
  it("finds the answer text under any of the runtime's field names", () => {
    expect(parseOutbox({ id: "j1", machine: "kannaka-01", text: "I hear it." })).toEqual({ id: "j1", text: "I hear it.", machine: "kannaka-01" });
    expect(parseOutbox({ id: 7, result: "done" })).toEqual({ id: "7", text: "done", machine: null });
    expect(parseOutbox({ id: "j2", text: "   " }).text).toBeNull();
    expect(parseOutbox("nope")).toEqual({ id: null, text: null, machine: null });
  });
});
