import { describe, expect, it } from "vitest";
import type { NewLedgerRecord } from "@shared/ledger-schema";
import type { LedgerStore } from "./types";
import { MemoryLedgerStore } from "./memory-store";
import { DrizzleLedgerStore } from "./drizzle-store";
import { makePgliteDb } from "./pglite-harness";
import { OutboxPublisher } from "./outbox-publisher";
import { ulid } from "./ulid";

// Ruling FI3: several instances drain one outbox; each event must be published once.
let clock = Date.UTC(2026, 9, 3, 9);
const rec = (authorId: string): NewLedgerRecord => {
  clock += 1000;
  return {
    id: ulid(clock), kind: "result", title: "t", body: "", standing: "unverified", evidence: [],
    authorId, held: false, contentHash: "0".repeat(64), filedVia: "api", createdAt: new Date(clock),
  };
};

async function twoInstances(store: LedgerStore, authorId: string) {
  for (let i = 0; i < 6; i++) await store.insertRecord(rec(authorId), [{ subject: "SPACECHILD.ledger.record.filed", payload: { n: i } }]);
  const published: number[] = [];
  // A slow bus, so both drains are in flight at the same time.
  const publish = async (_s: string, p: any) => { await new Promise((r) => setTimeout(r, 5)); published.push(p.n); return true; };
  const a = new OutboxPublisher(store, publish, 5000, undefined, 5000, "instance-a");
  const b = new OutboxPublisher(store, publish, 5000, undefined, 5000, "instance-b");
  const [na, nb] = await Promise.all([a.drainOnce(4), b.drainOnce(4)]);
  // a second round picks up whatever the first round's limits left
  const [ma, mb] = await Promise.all([a.drainOnce(4), b.drainOnce(4)]);
  return { published, total: na + nb + ma + mb, left: await store.listUnpublishedEvents(100) };
}

describe("outbox drained by two instances at once", () => {
  it("publishes each event exactly once (memory store)", async () => {
    const out = await twoInstances(new MemoryLedgerStore([{ id: "u1", username: "kannaka" }]), "u1");
    expect([...out.published].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.total).toBe(6);
    expect(out.left).toHaveLength(0);
  });

  it("publishes each event exactly once (Drizzle on PGlite)", async () => {
    const { db, client } = await makePgliteDb();
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO users (username, zkp_commitment, user_type, display_name) VALUES ('outbox-k', 'x', 'agent', 'k') RETURNING id",
    );
    const out = await twoInstances(new DrizzleLedgerStore(db), rows[0].id);
    expect([...out.published].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.total).toBe(6);
    expect(out.left).toHaveLength(0);
  }, 30_000); // PGlite builds the whole schema; slow under a loaded full run

  it("a failed publish hands the claim back so the other instance can send it at once", async () => {
    const store = new MemoryLedgerStore([{ id: "u1", username: "kannaka" }]);
    await store.insertRecord(rec("u1"), [{ subject: "s", payload: { n: 0 } }]);
    const down = new OutboxPublisher(store, async () => false, 5000, undefined, 5000, "down");
    expect(await down.drainOnce()).toBe(0);
    const sent: number[] = [];
    const up = new OutboxPublisher(store, async (_s, p: any) => { sent.push(p.n); return true; }, 5000, undefined, 5000, "up");
    expect(await up.drainOnce()).toBe(1);
    expect(sent).toEqual([0]);
  });
});
