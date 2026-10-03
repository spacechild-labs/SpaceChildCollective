import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import type { Actor } from "./types";
import { recordContentHash } from "@shared/ledger-hash";

const alice: Actor = { id: "u-alice", username: "alice", userType: "agent", role: "user", canRelease: false };
const bob: Actor = { id: "u-bob", username: "bob", userType: "agent", role: "user", canRelease: false };
const nick: Actor = { id: "u-nick", username: "nick", userType: "human", role: "admin", canRelease: true };
const sneaky: Actor = { ...alice, id: "u-sneaky", username: "sneaky", canRelease: true }; // an agent with the flag set

let store: MemoryLedgerStore;
let svc: LedgerService;
let t = Date.UTC(2026, 9, 3, 12);
let n = 0;

beforeEach(() => {
  store = new MemoryLedgerStore([alice, bob, nick, sneaky]);
  t = Date.UTC(2026, 9, 3, 12);
  n = 0;
  svc = new LedgerService(store, {
    now: () => new Date((t += 1000)),
    newId: () => `01J9Z3K8Q2A7B5C4D6E8F0G${String(++n).padStart(3, "0")}`,
    baseUrl: "https://research.example",
  });
});

describe("filing", () => {
  it("files a public record with a correct content hash and an outbox event", async () => {
    const { record, created } = await svc.file(alice, { kind: "result", title: "It held", body: "b" }, "api");
    expect(created).toBe(true);
    expect(record.contentHash).toBe(await recordContentHash({ ...record, createdAt: record.createdAt }));
    const events = await store.listUnpublishedEvents(10);
    expect(events.map((e) => e.subject)).toEqual(["SPACECHILD.ledger.record.filed"]);
    expect(events[0].payload).toMatchObject({ id: record.id, url: `https://research.example/records/${record.id}`, author: "alice" });
    expect(record).not.toHaveProperty("clientRef");
  });

  it("client_ref makes filing idempotent", async () => {
    const first = await svc.file(alice, { kind: "run", title: "r", clientRef: "c005-s1" }, "api");
    const again = await svc.file(alice, { kind: "run", title: "r (retry)", clientRef: "c005-s1" }, "api");
    expect(again.created).toBe(false);
    expect(again.record.id).toBe(first.record.id);
    expect(await store.listRecords({}, { includeHeld: true })).toHaveLength(1);
  });

  it("maps rule violations to reason codes", async () => {
    await expect(svc.file(alice, { kind: "review", title: "r", reviewsId: "01J9Z3K8Q2A7B5C4D6E8F0G999" }, "api"))
      .rejects.toMatchObject({ code: "missing_verdict", status: 400 });
    await expect(svc.file(alice, { kind: "result", title: "r", campaignId: "no-such-campaign" }, "api"))
      .rejects.toMatchObject({ code: "unknown_campaign" });
    await expect(svc.file(alice, { kind: "correction", title: "c", correctsId: "01J9Z3K8Q2A7B5C4D6E8F0G999" }, "api"))
      .rejects.toMatchObject({ code: "invalid_link" });
    await expect(svc.file(alice, { kind: "result" }, "api")).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("an amendment must amend a pre-registration or an amendment", async () => {
    const result = await svc.file(alice, { kind: "result", title: "r" }, "api");
    await expect(svc.file(alice, { kind: "amendment", title: "a", amendsId: result.record.id }, "api"))
      .rejects.toMatchObject({ code: "invalid_link" });
    const pre = await svc.file(alice, { kind: "preregistration", title: "p" }, "api");
    await expect(svc.file(alice, { kind: "amendment", title: "a", amendsId: pre.record.id }, "api")).resolves.toBeTruthy();
  });

  it("a held record is not announced and not publicly readable", async () => {
    const { record } = await svc.file(alice, { kind: "result", title: "secret", held: true }, "api");
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
    expect(await svc.getRecordView(null, record.id)).toBeNull();
    expect((await svc.getRecordView(bob, record.id))?.record.id).toBe(record.id);
    expect((await svc.listRecords(null, {})).map((r) => r.id)).not.toContain(record.id);
  });

  it("a public correction of a held record does not expose the held record", async () => {
    const held = await svc.file(alice, { kind: "result", title: "secret title", body: "secret body", held: true }, "api");
    const corr = await svc.file(alice, { kind: "correction", title: "fix", correctsId: held.record.id }, "api");
    const view = await svc.getRecordView(null, corr.record.id);
    expect(JSON.stringify(view)).not.toContain("secret title");
    expect(JSON.stringify(view)).not.toContain("secret body");
    expect(await svc.getRecordView(null, held.record.id)).toBeNull();
  });

  it("only the campaign owner or an admin may file a status-setting decision", async () => {
    await svc.createCampaign(alice, { id: "ecdsa-c007", title: "c007" });
    await expect(svc.file(bob, { kind: "decision", title: "close", campaignId: "ecdsa-c007", setsStatus: "closed" }, "api"))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
    await svc.file(alice, { kind: "decision", title: "start", campaignId: "ecdsa-c007", setsStatus: "running" }, "api");
    expect((await store.getCampaign("ecdsa-c007"))?.status).toBe("running");
    await svc.file(nick, { kind: "decision", title: "close", campaignId: "ecdsa-c007", setsStatus: "closed" }, "web");
    expect((await store.getCampaign("ecdsa-c007"))?.status).toBe("closed");
  });

  it("a held status-setting decision changes status only on release", async () => {
    await svc.createCampaign(alice, { id: "brain-e3", title: "E3" });
    const d = await svc.file(alice, { kind: "decision", title: "close", campaignId: "brain-e3", setsStatus: "closed", held: true }, "api");
    expect((await store.getCampaign("brain-e3"))?.status).toBe("registered");
    await svc.release(nick, d.record.id);
    expect((await store.getCampaign("brain-e3"))?.status).toBe("closed");
  });
});

describe("release", () => {
  it("only humans with can_release may release; agents never, even with the flag", async () => {
    const { record } = await svc.file(alice, { kind: "result", title: "r", held: true }, "api");
    await expect(svc.release(bob, record.id)).rejects.toMatchObject({ code: "agents_cannot_release", status: 403 });
    await expect(svc.release(sneaky, record.id)).rejects.toMatchObject({ code: "agents_cannot_release" });
    const human: Actor = { id: "u-h", username: "h", userType: "human", role: "user", canRelease: false };
    await expect(svc.release(human, record.id)).rejects.toMatchObject({ code: "not_releaser" });
    const released = await svc.release(nick, record.id, "ok to publish");
    expect(released.released).toBe(true);
    expect((await store.listUnpublishedEvents(10)).map((e) => e.subject)).toEqual(["SPACECHILD.ledger.record.released"]);
  });

  it("releasing twice is idempotent and releasing a public record is invalid", async () => {
    const held = await svc.file(alice, { kind: "result", title: "r", held: true }, "api");
    await svc.release(nick, held.record.id);
    await expect(svc.release(nick, held.record.id)).resolves.toMatchObject({ id: held.record.id, released: true });
    const pub = await svc.file(alice, { kind: "result", title: "p" }, "api");
    await expect(svc.release(nick, pub.record.id)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.release(nick, "01J9Z3K8Q2A7B5C4D6E8F0G999")).rejects.toMatchObject({ code: "not_found" });
  });

  it("a public review also announces review.filed; a held review announces it on release", async () => {
    const base = await svc.file(alice, { kind: "result", title: "r" }, "api");
    await svc.file(bob, { kind: "review", title: "holds", reviewsId: base.record.id, verdict: "holds" }, "api");
    const subjects = (await store.listUnpublishedEvents(10)).map((e) => e.subject);
    expect(subjects).toEqual(["SPACECHILD.ledger.record.filed", "SPACECHILD.ledger.record.filed", "SPACECHILD.ledger.review.filed"]);
    const heldReview = await svc.file(bob, { kind: "review", title: "breaks", reviewsId: base.record.id, verdict: "breaks", held: true }, "api");
    await svc.release(nick, heldReview.record.id);
    const after = (await store.listUnpublishedEvents(20)).map((e) => e.subject).slice(3);
    expect(after).toEqual(["SPACECHILD.ledger.record.released", "SPACECHILD.ledger.review.filed"]);
  });

  it("pending releases are visible only to releasers", async () => {
    await svc.file(alice, { kind: "result", title: "r", held: true }, "api");
    await expect(svc.pendingReleases(bob)).rejects.toMatchObject({ code: "agents_cannot_release" });
    expect(await svc.pendingReleases(nick)).toHaveLength(1);
  });
});

describe("reads", () => {
  it("a record view stacks corrections, reviews, notes and amendments", async () => {
    const pre = await svc.file(alice, { kind: "preregistration", title: "p" }, "api");
    await svc.file(alice, { kind: "amendment", title: "a", amendsId: pre.record.id }, "api");
    await svc.file(bob, { kind: "review", title: "rv", reviewsId: pre.record.id, verdict: "inconclusive" }, "api");
    await svc.file(alice, { kind: "correction", title: "c", correctsId: pre.record.id }, "api");
    await svc.file(bob, { kind: "note", title: "n", aboutId: pre.record.id }, "api");
    const view = await svc.getRecordView(null, pre.record.id);
    expect([view!.amendments.length, view!.reviews.length, view!.corrections.length, view!.notes.length]).toEqual([1, 1, 1, 1]);
  });

  it("lists by author username and campaign; an unknown author lists nothing", async () => {
    await svc.createCampaign(alice, { id: "heesch-leader", title: "Heesch" });
    await svc.file(alice, { kind: "result", title: "a", campaignId: "heesch-leader" }, "api");
    await svc.file(bob, { kind: "result", title: "b" }, "api");
    expect((await svc.listRecords(null, { author: "alice" })).map((r) => r.title)).toEqual(["a"]);
    expect((await svc.listRecords(null, { campaignId: "heesch-leader" })).map((r) => r.title)).toEqual(["a"]);
    expect(await svc.listRecords(null, { author: "nobody" })).toEqual([]);
    await expect(svc.listRecords(null, { kind: "nonsense" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("builds an agent profile with stats", async () => {
    const r = await svc.file(alice, { kind: "result", title: "a" }, "api");
    await svc.file(bob, { kind: "review", title: "rv", reviewsId: r.record.id, verdict: "breaks" }, "api");
    const p = await svc.agentProfile(null, "alice");
    expect(p?.stats).toMatchObject({ filed: 1, reviewsReceived: 1 });
    expect(await svc.agentProfile(null, "nobody")).toBeNull();
  });

  it("refuses a duplicate campaign id", async () => {
    await svc.createCampaign(alice, { id: "brain-e3", title: "E3" });
    await expect(svc.createCampaign(bob, { id: "brain-e3", title: "x" })).rejects.toMatchObject({ code: "invalid_input", status: 409 });
  });
});
