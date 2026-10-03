import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson } from "@shared/ledger-hash";
import { loadPrivateKey, main, rawPublicKeyBase64, signLedgerMessage } from "../../../scripts/ledger-sign";
import { AgentKeyService } from "./agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import { NonceCache, handleFileMessage, verifyEd25519 } from "./nats-door";

const agent = { id: "u-f", username: "flaukowski", userType: "agent", role: "user", canRelease: false };

async function setup() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keys = new AgentKeyService(new MemoryAgentKeyStore(), { getUser: async () => agent as any });
  const { key } = await keys.issue(agent.id, "desktop", rawPublicKeyBase64(publicKey));
  const deps = { svc: new LedgerService(new MemoryLedgerStore([agent as any])), keys, nonces: new NonceCache() };
  return { publicKey, privateKey, key, deps };
}

describe("the documented signer", () => {
  it("produces messages the NATS door accepts, and a re-send is a replay", async () => {
    const { privateKey, key, deps } = await setup();
    const msg = signLedgerMessage({ kind: "run", title: "E3 voice check", clientRef: "e3-v3" }, key.id, privateKey);
    expect(await handleFileMessage(msg, deps)).toMatchObject({ ok: true, created: true });
    expect(await handleFileMessage(msg, deps)).toMatchObject({ ok: false, reason: "replayed_nonce" });
  });

  it("emits a signature the server's own verifier accepts, over canonical JSON, and rejects tampering", async () => {
    const { publicKey, privateKey } = await setup();
    const msg = signLedgerMessage({ kind: "note", title: "t", clientRef: "r" }, "key1", privateKey, new Date(Date.UTC(2026, 9, 3, 12)), "n".repeat(20));
    expect(msg.ts).toBe("2026-10-03T12:00:00.000Z");
    const canon = canonicalJson({ record: msg.record, key_id: msg.key_id, ts: msg.ts, nonce: msg.nonce });
    expect(verifyEd25519(rawPublicKeyBase64(publicKey), canon, msg.sig)).toBe(true);
    const tampered = canonicalJson({ record: { ...msg.record, title: "x" }, key_id: msg.key_id, ts: msg.ts, nonce: msg.nonce });
    expect(verifyEd25519(rawPublicKeyBase64(publicKey), tampered, msg.sig)).toBe(false);
  });

  it("refuses to sign what the door would reject anyway", async () => {
    const { privateKey } = await setup();
    expect(() => signLedgerMessage({ kind: "run", title: "t" }, "k", privateKey)).toThrow(/clientRef/);
    expect(() => signLedgerMessage({ kind: "run", title: "t", clientRef: "r", held: true }, "k", privateKey)).toThrow(/held/);
  });

  it("a message signed with a different key is bad_signature", async () => {
    const { key, deps } = await setup();
    const other = generateKeyPairSync("ed25519").privateKey;
    const msg = signLedgerMessage({ kind: "run", title: "t", clientRef: "r" }, key.id, other);
    expect(await handleFileMessage(msg, deps)).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("validates a caller-supplied nonce length", async () => {
    const { privateKey } = await setup();
    const rec = { kind: "run", title: "t", clientRef: "r" };
    expect(() => signLedgerMessage(rec, "k", privateKey, new Date(), "short")).toThrow(/nonce/);
    expect(() => signLedgerMessage(rec, "k", privateKey, new Date(), "x".repeat(129))).toThrow(/nonce/);
    expect(() => signLedgerMessage(rec, "k", privateKey, new Date(), "x".repeat(16))).not.toThrow();
  });

  it("reads LEDGER_SIGNING_KEY with escaped newlines", async () => {
    const { privateKey } = await setup();
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const BACKSLASH_N = String.fromCharCode(92) + "n";
    const oneLine = pem.trim().split("\n").join(BACKSLASH_N);
    expect(oneLine).not.toContain("\n");
    const loaded = loadPrivateKey(undefined, { LEDGER_SIGNING_KEY: oneLine });
    expect(loaded.export({ format: "pem", type: "pkcs8" }).toString()).toBe(pem);
    expect(() => loadPrivateKey(undefined, {})).toThrow(/no private key/);
  });
});

describe("the signer CLI", () => {
  const run = (argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = main(argv, (l) => out.push(l), (l) => err.push(l));
    return { code, out: out.join("\n"), err: err.join("\n") };
  };

  it("keygen without --out, with a valueless --out, or with an unknown flag fails and prints no key", () => {
    for (const argv of [["keygen"], ["keygen", "--out"], ["keygen", "--out", "--force"], ["keygen", "--output", "f.pem"]]) {
      const r = run(argv);
      expect(r.code).not.toBe(0);
      expect(r.out + r.err).not.toMatch(/PRIVATE KEY|MC4C/);
    }
  });

  it("keygen --out writes the PEM, prints only the public key, and refuses to overwrite without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-sign-"));
    const file = join(dir, "k.pem");
    const r = run(["keygen", "--out", file]);
    expect(r.code).toBe(0);
    const pem = readFileSync(file, "utf8");
    expect(pem).toContain("BEGIN PRIVATE KEY");
    expect(r.out).toMatch(/[A-Za-z0-9+/]{43}=$/);
    expect(r.out + r.err).not.toContain("PRIVATE KEY");
    expect(r.out + r.err).not.toContain(pem.split("\n")[1]);

    const again = run(["keygen", "--out", file]);
    expect(again.code).not.toBe(0);
    expect(readFileSync(file, "utf8")).toBe(pem);
    expect(run(["keygen", "--out", file, "--force"]).code).toBe(0);
    expect(readFileSync(file, "utf8")).not.toBe(pem);
  });

  it("sign prints a message the door accepts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-sign-"));
    const file = join(dir, "k.pem");
    const gen = run(["keygen", "--out", file]);
    const pub = gen.out.split(": ").pop()!;
    const keys = new AgentKeyService(new MemoryAgentKeyStore(), { getUser: async () => agent as any });
    const { key } = await keys.issue(agent.id, "cli", pub);
    const rec = join(dir, "r.json");
    writeFileSync(rec, JSON.stringify({ kind: "run", title: "cli", clientRef: "cli-1" }));
    const r = run(["sign", key.id, rec, file]);
    expect(r.code).toBe(0);
    const deps = { svc: new LedgerService(new MemoryLedgerStore([agent as any])), keys, nonces: new NonceCache() };
    expect(await handleFileMessage(JSON.parse(r.out), deps)).toMatchObject({ ok: true, created: true });
  });
});
