import { beforeEach, describe, expect, it } from "vitest";
import type { NewLedgerRecord } from "@shared/ledger-schema";
import type { LedgerStore } from "./types";
import { ulid } from "./ulid";

export interface ContractFixture {
  store: LedgerStore;
  alice: { id: string; username: string };
  bob: { id: string; username: string };
}

let clock = Date.UTC(2026, 9, 3);
function rec(authorId: string, over: Partial<NewLedgerRecord> = {}): NewLedgerRecord {
  clock += 1000;
  return {
    id: ulid(clock), kind: "result", title: "t", body: "", standing: "unverified", evidence: [],
    authorId, held: false, contentHash: "0".repeat(64), filedVia: "api", createdAt: new Date(clock), ...over,
  };
}

/** Behaviour every LedgerStore must have. Run against the memory store always, Drizzle when a test DB is set. */
export function describeLedgerStoreContract(label: string, make: () => Promise<ContractFixture>): void {
  describe(`LedgerStore contract: ${label}`, () => {
    let f: ContractFixture;
    beforeEach(async () => { f = await make(); });

    it("hides a held record from public reads until it is released", async () => {
      const held = await f.store.insertRecord(rec(f.alice.id, { held: true }), []);
      expect(await f.store.getRecord(held.id, { includeHeld: false })).toBeUndefined();
      expect((await f.store.listRecords({}, { includeHeld: false })).map((r) => r.id)).not.toContain(held.id);
      expect((await f.store.getRecord(held.id, { includeHeld: true }))?.id).toBe(held.id);
      await f.store.insertRelease({ recordId: held.id, releasedBy: f.bob.id, releasedAt: new Date(), note: null }, []);
      const after = await f.store.getRecord(held.id, { includeHeld: false });
      expect(after?.released).toBe(true);
    });

    it("returns author usernames and lists newest first with filters and a cursor", async () => {
      const a = await f.store.insertRecord(rec(f.alice.id, { kind: "run" }), []);
      const b = await f.store.insertRecord(rec(f.bob.id, { kind: "failure" }), []);
      const all = await f.store.listRecords({}, { includeHeld: false });
      expect(all.map((r) => r.id).slice(0, 2)).toEqual([b.id, a.id]);
      expect(all[0].authorUsername).toBe(f.bob.username);
      expect((await f.store.listRecords({ kind: "run" }, { includeHeld: false })).map((r) => r.id)).toEqual([a.id]);
      expect((await f.store.listRecords({ authorId: f.alice.id }, { includeHeld: false })).map((r) => r.id)).toEqual([a.id]);
      expect((await f.store.listRecords({ before: b.createdAt }, { includeHeld: false })).map((r) => r.id)).toEqual([a.id]);
      expect(await f.store.listRecords({ limit: 1 }, { includeHeld: false })).toHaveLength(1);
    });

    it("finds linked records and respects visibility on them", async () => {
      const base = await f.store.insertRecord(rec(f.alice.id), []);
      const pub = await f.store.insertRecord(rec(f.bob.id, { kind: "review", reviewsId: base.id, verdict: "holds" }), []);
      const heldNote = await f.store.insertRecord(rec(f.bob.id, { kind: "note", aboutId: base.id, held: true }), []);
      expect((await f.store.listLinkedTo(base.id, { includeHeld: false })).map((r) => r.id)).toEqual([pub.id]);
      expect((await f.store.listLinkedTo(base.id, { includeHeld: true })).map((r) => r.id)).toEqual([pub.id, heldNote.id]);
    });

    it("enforces one record per (author, clientRef) and finds it", async () => {
      const first = await f.store.insertRecord(rec(f.alice.id, { clientRef: "x-1" }), []);
      await expect(f.store.insertRecord(rec(f.alice.id, { clientRef: "x-1" }), [])).rejects.toMatchObject({ code: "duplicate_client_ref" });
      expect((await f.store.findByClientRef(f.alice.id, "x-1"))?.id).toBe(first.id);
      await expect(f.store.insertRecord(rec(f.bob.id, { clientRef: "x-1" }), [])).resolves.toBeTruthy();
    });

    it("writes outbox events with the record and marks them published", async () => {
      await f.store.insertRecord(rec(f.alice.id), [{ subject: "SPACECHILD.ledger.record.filed", payload: { a: 1 } }]);
      const events = await f.store.listUnpublishedEvents(10);
      expect(events.map((e) => e.subject)).toContain("SPACECHILD.ledger.record.filed");
      await f.store.markEventPublished(events[0].id, new Date());
      expect((await f.store.listUnpublishedEvents(10)).map((e) => e.id)).not.toContain(events[0].id);
    });

    it("rolls back the outbox when the record insert fails", async () => {
      await f.store.insertRecord(rec(f.alice.id, { clientRef: "dup" }), []);
      const before = (await f.store.listUnpublishedEvents(100)).length;
      await expect(f.store.insertRecord(rec(f.alice.id, { clientRef: "dup" }), [{ subject: "s", payload: {} }])).rejects.toBeTruthy();
      expect((await f.store.listUnpublishedEvents(100)).length).toBe(before);
    });

    it("lists unreleased held records and computes author stats", async () => {
      const held = await f.store.insertRecord(rec(f.alice.id, { held: true }), []);
      const mine = await f.store.insertRecord(rec(f.alice.id, { standing: "retracted" }), []);
      await f.store.insertRecord(rec(f.bob.id, { kind: "review", reviewsId: mine.id, verdict: "breaks" }), []);
      await f.store.insertRecord(rec(f.bob.id, { kind: "correction", correctsId: mine.id }), []);
      expect((await f.store.listUnreleasedHeld()).map((r) => r.id)).toEqual([held.id]);
      expect(await f.store.authorStats(f.alice.id, { includeHeld: false }))
        .toEqual({ filed: 1, reviewsGiven: 0, reviewsReceived: 1, corrected: 1, retracted: 1 });
      expect((await f.store.authorStats(f.alice.id, { includeHeld: true })).filed).toBe(2);
    });

    it("rejects a duplicate campaign id and updates status", async () => {
      await f.store.insertCampaign({ id: "ecdsa-c007", title: "c007", ownerId: f.alice.id });
      await expect(f.store.insertCampaign({ id: "ecdsa-c007", title: "again", ownerId: f.alice.id })).rejects.toMatchObject({ code: "duplicate" });
      await f.store.setCampaignStatus("ecdsa-c007", "running");
      expect((await f.store.getCampaign("ecdsa-c007"))?.status).toBe("running");
      expect((await f.store.findUserByUsername(f.alice.username))?.id).toBe(f.alice.id);
    });
  });
}
