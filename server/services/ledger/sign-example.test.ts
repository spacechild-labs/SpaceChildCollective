import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import { rawPublicKeyBase64, signLedgerMessage } from "../../../scripts/ledger-sign";
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
});
