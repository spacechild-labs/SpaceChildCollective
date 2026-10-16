import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import type { Actor } from "./types";
import { MemoryVerificationStore, VerificationService, type EvidenceFetcher, type VerificationStore } from "./verifications";
import { describeVerificationStoreContract } from "./verification-store-contract";

const alice: Actor = { id: "u-alice", username: "alice", userType: "agent", role: "user", canRelease: false };
const bob: Actor = { id: "u-bob", username: "bob", userType: "agent", role: "user", canRelease: false };
const nick: Actor = { id: "u-nick", username: "nick", userType: "human", role: "admin", canRelease: true };

const BODY = "the evidence file";
const SHA = createHash("sha256").update(BODY).digest("hex");
const PIN = "https://raw.githubusercontent.com/o/r/" + "a".repeat(40) + "/f.md";

let store: MemoryLedgerStore;
let svc: LedgerService;
let vstore: MemoryVerificationStore;
let fetched: string[];
let fetcher: EvidenceFetcher;
let verifier: VerificationService;
let t: number;
let n: number;

function makeVerifier(s: VerificationStore = vstore) {
  verifier = new VerificationService(s, svc, fetcher, { now: () => new Date(t), autoStart: false });
  svc.setVerifier(verifier);
}

beforeEach(async () => {
  store = new MemoryLedgerStore([alice, bob, nick]);
  t = Date.UTC(2026, 9, 16, 12);
  n = 0;
  svc = new LedgerService(store, {
    now: () => new Date((t += 1000)),
    newId: () => `01M9Z3K8Q2A7B5C4D6E8F0G${String(++n).padStart(3, "0")}`,
  });
  vstore = new MemoryVerificationStore();
  fetched = [];
  fetcher = {
    fetchSha256: async (url) => { fetched.push(url); return url === PIN ? [SHA, BODY.length] : [null, "HTTP 404"]; },
    fetchCrlfSha256: async () => null,
  };
  makeVerifier();
  await svc.createCampaign(alice, { id: "camp-one", title: "Camp" });
});

async function fileResult(extra: Record<string, unknown> = {}) {
  const pre = await svc.file(alice, { kind: "preregistration", title: "pre", campaignId: "camp-one", standing: "measured" }, "api");
  const res = await svc.file(alice, {
    kind: "result", title: "res", campaignId: "camp-one", standing: "measured",
    body: `pre-registration ${pre.record.id}`, evidence: [{ label: "e", url: PIN, sha256: SHA }], ...extra,
  }, "api");
  return { pre: pre.record, res: res.record };
}

describe("VerificationService", () => {
  it("reads unchecked until a check has run, then the tier, without fetching on read", async () => {
    const { res } = await fileResult();
    const v1 = await svc.getRecordView(null, res.id);
    expect(v1!.record.verification).toEqual({ tier: "unchecked", checkedAt: null });
    expect(v1!.verification!.tier).toBe("unchecked");
    expect(fetched).toEqual([]);
    await verifier.drain();
    const v2 = await svc.getRecordView(null, res.id);
    expect(v2!.record.verification!.tier).toBe("MACHINE-CHECKED");
    expect(v2!.record.standing).toBe("measured"); // never changed
    expect(v2!.verification!.checks.some((c) => c.what.includes("sha256 matches"))).toBe(true);
    const before = fetched.length;
    await svc.getRecordView(null, res.id);
    await verifier.drain();
    expect(fetched.length).toBe(before); // cached: no re-fetch
  });

  it("a record without evidence is CLAIMED", async () => {
    const { res } = await fileResult({ evidence: [] });
    await svc.getRecordView(null, res.id);
    await verifier.drain();
    expect((await svc.getRecordView(null, res.id))!.record.verification!.tier).toBe("CLAIMED");
  });

  it("a check that cannot run stays unchecked and says why", async () => {
    fetcher.fetchSha256 = async () => { const { VerifyCheckError } = await import("@shared/ledger-verify"); throw new VerifyCheckError("network down"); };
    const { res } = await fileResult();
    await svc.getRecordView(null, res.id);
    await verifier.drain();
    const v = await svc.getRecordView(null, res.id);
    expect(v!.record.verification!.tier).toBe("unchecked");
    expect(v!.verification!.error).toContain("network down");
  });

  it("a peer review filed later re-checks the record it reviews (onPublic)", async () => {
    const { res } = await fileResult();
    await svc.getRecordView(null, res.id);
    await verifier.drain();
    const review = await svc.file(bob, { kind: "review", title: "rv", reviewsId: res.id, verdict: "holds", standing: "measured" }, "api");
    verifier.onPublic(review.record.id);
    await verifier.drain();
    expect((await svc.getRecordView(null, res.id))!.record.verification!.tier).toBe("PEER-REVIEWED");
  });

  it("a held record is never checked; once released it is", async () => {
    await svc.file(alice, { kind: "preregistration", title: "pre", campaignId: "camp-one" }, "api");
    const held = await svc.file(alice, { kind: "note", title: "h", held: true, evidence: [{ label: "e", url: PIN, sha256: SHA }] }, "api");
    const asMember = await svc.getRecordView(alice, held.record.id);
    expect(asMember!.verification!.tier).toBe("unchecked");
    expect(asMember!.verification!.error).toContain("released");
    await verifier.drain();
    expect(vstore.rows.has(held.record.id)).toBe(false);
    await svc.release(nick, held.record.id);
    verifier.onPublic(held.record.id);
    await verifier.drain();
    expect(vstore.rows.get(held.record.id)?.tier).toBe("MACHINE-CHECKED");
  });

  it("lists and campaign views carry tiers; the verifier's own reads carry none", async () => {
    const { res } = await fileResult();
    await svc.listRecords(null, {});
    await verifier.drain();
    const list = await svc.listRecords(null, {});
    expect(list.find((r) => r.id === res.id)!.verification!.tier).toBe("MACHINE-CHECKED");
    const camp = await svc.getCampaignView(null, "camp-one");
    expect(camp!.records.find((r) => r.id === res.id)!.verification!.tier).toBe("MACHINE-CHECKED");
    const raw = await svc.getRecordView(null, res.id, { tiers: false });
    expect(raw!.record.verification).toBeUndefined();
    expect(raw!.verification).toBeUndefined();
  });

  it("a store that fails (table not yet pushed) never fails a read, and stops queueing work", async () => {
    const broken: VerificationStore = {
      get: async () => { throw new Error('relation "ledger_verifications" does not exist'); },
      put: async () => { throw new Error('relation "ledger_verifications" does not exist'); },
    };
    makeVerifier(broken);
    const { res } = await fileResult();
    const v = await svc.getRecordView(null, res.id);
    expect(v!.record.id).toBe(res.id);
    expect(v!.verification!.tier).toBe("unchecked");
    const list = await svc.listRecords(null, {});
    expect(list.length).toBeGreaterThan(0);
    await verifier.drain();
    expect(fetched).toEqual([]);
  });

  it("without a verifier, records carry no verification field (existing behaviour)", async () => {
    svc.setVerifier(undefined);
    const { res } = await fileResult();
    const v = await svc.getRecordView(null, res.id);
    expect(v!.record.verification).toBeUndefined();
    expect(v!.verification).toBeUndefined();
  });

  it("a wrong recorded sha256 makes the tier CLAIMED with a FAIL check", async () => {
    const { res } = await fileResult({ evidence: [{ label: "e", url: PIN, sha256: "0".repeat(64) }] });
    await svc.getRecordView(null, res.id);
    await verifier.drain();
    const v = await svc.getRecordView(null, res.id);
    expect(v!.record.verification!.tier).toBe("CLAIMED");
    expect(v!.verification!.failed).toBe(true);
    expect(v!.verification!.checks.some((c) => c.status === "FAIL")).toBe(true);
  });
});

describeVerificationStoreContract("memory", async () => ({ store: new MemoryVerificationStore(), recordId: "01M9Z3K8Q2A7B5C4D6E8F0G001", setup: async () => {} }));
