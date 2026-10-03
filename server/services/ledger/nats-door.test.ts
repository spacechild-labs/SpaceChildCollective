import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson } from "@shared/ledger-hash";
import { AgentKeyService } from "./agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "./memory-store";
import { KeyBudget } from "./rate-limits";
import { LedgerService } from "./service";
import { NonceCache, handleFileMessage, natsFileSubscriber } from "./nats-door";

const NOW = Date.UTC(2026, 9, 3, 12);
const agent = { id: "u-k", username: "kannaka", userType: "agent", role: "user", canRelease: false };
const users = new Map<string, any>([[agent.id, agent]]);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");

let keys: AgentKeyService;
let keyId: string;
let store: MemoryLedgerStore;
let deps: Parameters<typeof handleFileMessage>[1];

let refSeq = 0;
function signed(record: any, over: Partial<{ ts: string; nonce: string; key_id: string }> = {}) {
  record = { clientRef: `ref-${++refSeq}`, ...record }; // the door requires a clientRef
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
    expect(await handleFileMessage({ ...msg, record: { ...msg.record, title: "tampered" } }, deps)).toMatchObject({ ok: false, reason: "bad_signature" });
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

  it("rejects held records and records without a clientRef, before any filing", async () => {
    expect(await handleFileMessage(signed({ kind: "result", title: "h", held: true }), deps))
      .toMatchObject({ ok: false, reason: "invalid_input", message: expect.stringMatching(/HTTPS or MCP/) });
    const body = { record: { kind: "result", title: "x" }, key_id: keyId, ts: new Date(NOW).toISOString(), nonce: "nonce-no-clientref-1" };
    const msg = { ...body, sig: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString("base64") };
    expect(await handleFileMessage(msg, deps)).toMatchObject({ ok: false, reason: "invalid_input", message: expect.stringMatching(/clientRef is required/) });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(0);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });

  it("a replay of a valid message after a restart (fresh nonce cache) does not duplicate", async () => {
    const msg = signed({ kind: "result", title: "once" });
    const a = await handleFileMessage(msg, deps);
    const b = await handleFileMessage(msg, { ...deps, nonces: new NonceCache() });
    expect(a).toMatchObject({ ok: true, created: true });
    expect(b).toMatchObject({ ok: true, created: false, id: (a as any).id });
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(1);
  });

  it("caps the nonce cache and sweeps expired entries", async () => {
    const small = { ...deps, nonces: new NonceCache(600_000, 2) };
    expect((await handleFileMessage(signed({ kind: "result", title: "1" }), small)).ok).toBe(true);
    expect((await handleFileMessage(signed({ kind: "result", title: "2" }), small)).ok).toBe(true);
    expect(await handleFileMessage(signed({ kind: "result", title: "3" }), small)).toMatchObject({ ok: false, reason: "rate_limited" });
    const c = new NonceCache(1000, 2);
    expect(c.tryAdd("a", 0)).toBe("new");
    expect(c.tryAdd("b", 10)).toBe("new");
    expect(c.tryAdd("c", 20)).toBe("full");
    expect(c.tryAdd("c", 5000)).toBe("new"); // a and b expired
    expect(c.tryAdd("c", 5001)).toBe("replayed");
  });

  it("stores a nonce only after the signature passes", async () => {
    const nonces = new NonceCache(600_000, 1);
    const bad = signed({ kind: "result", title: "x" });
    await handleFileMessage({ ...bad, sig: Buffer.alloc(64).toString("base64") }, { ...deps, nonces });
    expect((await handleFileMessage(signed({ kind: "result", title: "ok" }), { ...deps, nonces })).ok).toBe(true);
  });

  it("an over-budget message does not consume a nonce", async () => {
    const prev = process.env.LEDGER_FILE_LIMIT_PER_HOUR;
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "1";
    try {
      const nonces = new NonceCache();
      expect((await handleFileMessage(signed({ kind: "result", title: "1" }), { ...deps, nonces })).ok).toBe(true);
      const second = signed({ kind: "result", title: "2" });
      expect(await handleFileMessage(second, { ...deps, nonces })).toMatchObject({ reason: "rate_limited" });
      // not recorded as seen: with a fresh budget the same message is accepted, not replayed_nonce
      expect((await handleFileMessage(second, { ...deps, nonces, budget: new KeyBudget() })).ok).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LEDGER_FILE_LIMIT_PER_HOUR;
      else process.env.LEDGER_FILE_LIMIT_PER_HOUR = prev;
    }
  });

  it("answers an unexpected internal error with a generic reply, no internal text", async () => {
    const boom = { ...deps, svc: { file: async () => { throw new Error("pg password=hunter2"); } } as any };
    const replies: any[] = [];
    await natsFileSubscriber(boom)(signed({ kind: "result", title: "x" }), "SPACECHILD.ledger.file", (b) => replies.push(b));
    expect(replies).toEqual([{ ok: false, reason: "invalid_input", message: "internal error" }]);
    expect(JSON.stringify(replies)).not.toContain("hunter2");
  });

  it("the subscriber replies with the door result, and works without a reply function", async () => {
    const replies: any[] = [];
    const sub = natsFileSubscriber(deps);
    await sub(signed({ kind: "result", title: "via sub" }), "SPACECHILD.ledger.file", (b) => replies.push(b));
    await sub(signed({ kind: "result", title: "no reply" }), "SPACECHILD.ledger.file");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ ok: true, created: true });
  });

  it("rejects a malformed key_id before any lookup and never logs it raw", async () => {
    const lines: string[] = [];
    let looked = 0;
    const spy = { ...deps, keys: { getKey: async () => { looked++; return undefined; } } as any, log: (l: string) => lines.push(l) };
    const r = await handleFileMessage(signed({ kind: "result", title: "x" }, { key_id: "evil\n[ledger] forged" }), spy);
    expect(r).toMatchObject({ ok: false, reason: "unknown_key" });
    expect(looked).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("<invalid>");
    expect(lines[0]).not.toContain("forged");
  });

  it("edge cases: future and unparseable timestamps, nonce lengths, bad signatures", async () => {
    const f = (m: unknown) => handleFileMessage(m, deps);
    expect(await f(signed({ kind: "result", title: "f" }, { ts: new Date(NOW + 6 * 60 * 1000).toISOString() }))).toMatchObject({ reason: "stale_timestamp" });
    expect(await f(signed({ kind: "result", title: "f" }, { ts: new Date(NOW + 4 * 60 * 1000).toISOString() }))).toMatchObject({ ok: true });
    expect(await f(signed({ kind: "result", title: "n" }, { ts: "not a time" }))).toMatchObject({ reason: "invalid_input" });
    expect(await f(signed({ kind: "result", title: "n" }, { ts: "2026-13-45T99:00:00.000Z" }))).toMatchObject({ reason: "invalid_input" });
    expect(await f(signed({ kind: "result", title: "n" }, { ts: "2026-10-03T12:00:00+02:00" }))).toMatchObject({ reason: "invalid_input" });
    expect(await f(signed({ kind: "result", title: "n" }, { nonce: "x".repeat(15) }))).toMatchObject({ reason: "invalid_input" });
    expect(await f(signed({ kind: "result", title: "n" }, { nonce: "x".repeat(129) }))).toMatchObject({ reason: "invalid_input" });
    expect(await f(signed({ kind: "result", title: "n" }, { nonce: "x".repeat(16) }))).toMatchObject({ ok: true });
    expect(await f(signed({ kind: "result", title: "n" }, { nonce: "y".repeat(128) }))).toMatchObject({ ok: true });
    const m = signed({ kind: "result", title: "s" });
    expect(await f({ ...m, sig: "!!!not base64!!!" })).toMatchObject({ reason: "bad_signature" });
    expect(await f({ ...m, sig: Buffer.alloc(10).toString("base64") })).toMatchObject({ reason: "bad_signature" });
    expect(await f({ ...m, sig: "" })).toMatchObject({ reason: "bad_signature" });
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

  it("replays never consume the key's filing budget", async () => {
    const prev = process.env.LEDGER_FILE_LIMIT_PER_HOUR;
    process.env.LEDGER_FILE_LIMIT_PER_HOUR = "2";
    try {
      const msg = signed({ kind: "result", title: "captured" });
      expect((await handleFileMessage(msg, deps)).ok).toBe(true);
      for (let i = 0; i < 10; i++) expect(await handleFileMessage(msg, deps)).toEqual({ ok: false, reason: "replayed_nonce" });
      // one of two budget units used by the original; the replays took none
      expect((await handleFileMessage(signed({ kind: "result", title: "fresh" }), deps)).ok).toBe(true);
      expect(await handleFileMessage(signed({ kind: "result", title: "over" }), deps)).toMatchObject({ reason: "rate_limited" });
    } finally {
      if (prev === undefined) delete process.env.LEDGER_FILE_LIMIT_PER_HOUR;
      else process.env.LEDGER_FILE_LIMIT_PER_HOUR = prev;
    }
  });
});
