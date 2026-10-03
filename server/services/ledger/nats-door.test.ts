import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import { AgentKeyService } from "./agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "./memory-store";
import { KeyBudget } from "./rate-limits";
import { LedgerService } from "./service";
import { NonceCache, handleFileMessage } from "./nats-door";

const NOW = Date.UTC(2026, 9, 3, 12);
const agent = { id: "u-k", username: "kannaka", userType: "agent", role: "user", canRelease: false };
const users = new Map<string, any>([[agent.id, agent]]);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");

let keys: AgentKeyService;
let keyId: string;
let store: MemoryLedgerStore;
let deps: Parameters<typeof handleFileMessage>[1];

function signed(record: unknown, over: Partial<{ ts: string; nonce: string; key_id: string }> = {}) {
  const body = { record, key_id: over.key_id ?? keyId, ts: over.ts ?? new Date(NOW).toISOString(), nonce: over.nonce ?? `nonce-${Math.random().toString(36).slice(2)}-xyz` };
  return { ...body, sig: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString("base64") };
}

beforeEach(async () => {
  users.clear();
  users.set(agent.id, agent);
  store = new MemoryLedgerStore([agent]);
  keys = new AgentKeyService(new MemoryAgentKeyStore(), { getUser: async (id) => users.get(id) });
  keyId = (await keys.issue(agent.id, "kannaka-bus", rawPub)).key.id;
  deps = { svc: new LedgerService(store), keys, nonces: new NonceCache(), budget: new KeyBudget(), now: () => NOW };
});

describe("NATS ledger door", () => {
  it("files a correctly signed record", async () => {
    const r = await handleFileMessage(signed({ kind: "result", title: "from the bus" }), deps);
    expect(r).toMatchObject({ ok: true, created: true });
    const [rec] = await store.listRecords({}, { includeHeld: true });
    expect(rec.filedVia).toBe("nats");
    expect(rec.authorUsername).toBe("kannaka");
  });

  it("rejects a replayed nonce", async () => {
    const msg = signed({ kind: "result", title: "once" });
    expect((await handleFileMessage(msg, deps)).ok).toBe(true);
    expect(await handleFileMessage(msg, deps)).toEqual({ ok: false, reason: "replayed_nonce" });
  });

  it("a retry with a new nonce but the same clientRef does not duplicate", async () => {
    const a = await handleFileMessage(signed({ kind: "result", title: "r", clientRef: "bus-1" }), deps);
    const b = await handleFileMessage(signed({ kind: "result", title: "r", clientRef: "bus-1" }), deps);
    expect(a).toMatchObject({ ok: true, created: true });
    expect(b).toMatchObject({ ok: true, created: false, id: (a as any).id });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(1);
  });

  it("rejects a tampered record, a stale timestamp, unknown and revoked keys, and junk", async () => {
    const msg = signed({ kind: "result", title: "original" });
    expect(await handleFileMessage({ ...msg, record: { kind: "result", title: "tampered" } }, deps)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(await handleFileMessage(signed({ kind: "result", title: "old" }, { ts: new Date(NOW - 6 * 60 * 1000).toISOString() }), deps))
      .toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }, { key_id: "no-such-key" }), deps)).toMatchObject({ ok: false, reason: "unknown_key" });
    await keys.revoke(keyId);
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }), deps)).toMatchObject({ ok: false, reason: "revoked_key" });
    expect(await handleFileMessage({ hello: "world" }, deps)).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(0);
  });

  it("refuses a key that has no Ed25519 public key", async () => {
    const plain = (await keys.issue(agent.id, "http-only")).key.id;
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }, { key_id: plain }), deps)).toMatchObject({ ok: false, reason: "unknown_key" });
  });

  it("passes ledger rule errors through as reasons", async () => {
    expect(await handleFileMessage(signed({ kind: "review", title: "x", reviewsId: "01J9Z3K8Q2A7B5C4D6E8F0G999" }), deps))
      .toMatchObject({ ok: false, reason: "missing_verdict" });
  });

  it("does not announce a held record filed over the bus", async () => {
    await handleFileMessage(signed({ kind: "result", title: "h", held: true }), deps);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });

  it("applies the owner checks of the other doors: admin-role and non-agent owners are refused", async () => {
    users.set(agent.id, { ...agent, role: "admin" });
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }), deps)).toMatchObject({ ok: false, reason: "forbidden" });
    users.set(agent.id, { ...agent, userType: "human" });
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }), deps)).toMatchObject({ ok: false, reason: "revoked_key" });
    users.delete(agent.id);
    expect(await handleFileMessage(signed({ kind: "result", title: "x" }), deps)).toMatchObject({ ok: false, reason: "revoked_key" });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(0);
  });

  it("enforces the per-key filing budget", async () => {
    const prev = process.env.LEDGER_FILE_LIMIT_PER_HOUR;
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "2";
    try {
      expect((await handleFileMessage(signed({ kind: "result", title: "1" }), deps)).ok).toBe(true);
      expect((await handleFileMessage(signed({ kind: "result", title: "2" }), deps)).ok).toBe(true);
      expect(await handleFileMessage(signed({ kind: "result", title: "3" }), deps)).toMatchObject({ ok: false, reason: "rate_limited" });
      expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(2);
    } finally {
      if (prev === undefined) delete process.env.LEDGER_FILE_LIMIT_PER_HOUR;
      else process.env.LEDGER_FILE_LIMIT_PER_HOUR = prev;
    }
  });

  it("never logs the signature or record content on rejection", async () => {
    const lines: string[] = [];
    const msg = signed({ kind: "result", title: "SECRET-TITLE" });
    await handleFileMessage({ ...msg, sig: Buffer.alloc(64).toString("base64") }, { ...deps, log: (l) => lines.push(l) });
    expect(lines.join("\n")).toContain("bad_signature");
    expect(lines.join("\n")).not.toMatch(/SECRET-TITLE|AAAAAAAA/);
  });
});
