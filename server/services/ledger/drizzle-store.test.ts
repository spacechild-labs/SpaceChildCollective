import { describe, expect, it } from "vitest";
import { describeLedgerStoreContract } from "./store-contract";
import { makePgliteDb } from "./pglite-harness";
import { DrizzleLedgerStore } from "./drizzle-store";
import { ulid } from "./ulid";

async function mkUser(client: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }, username: string) {
  const { rows } = await client.query(
    "INSERT INTO users (username, zkp_commitment, user_type, display_name) VALUES ($1, 'x', 'agent', $1) RETURNING id, username",
    [username],
  );
  return rows[0] as { id: string; username: string };
}

describeLedgerStoreContract("drizzle on pglite", async () => {
  const { db, client } = await makePgliteDb();
  const alice = await mkUser(client, "contract-alice");
  const bob = await mkUser(client, "contract-bob");
  return { store: new DrizzleLedgerStore(db), alice, bob };
});

describe("DrizzleLedgerStore (pglite)", () => {
  it("rolls back the record when an outbox insert fails inside the transaction", async () => {
    const { db, client } = await makePgliteDb();
    const alice = await mkUser(client, "contract-alice");
    const store = new DrizzleLedgerStore(db);
    const id = ulid(Date.UTC(2026, 9, 3));
    const rec = {
      id, kind: "result" as const, title: "t", body: "", standing: "unverified" as const, evidence: [],
      authorId: alice.id, held: false, contentHash: "0".repeat(64), filedVia: "api" as const, createdAt: new Date(),
    };
    await expect(store.insertRecord(rec, [{ subject: null as any, payload: {} }])).rejects.toBeTruthy();
    expect(await store.getRecord(id, { includeHeld: true })).toBeUndefined();
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });
});

const url = process.env.LEDGER_TEST_DATABASE_URL;
if (!url) {
  describe("DrizzleLedgerStore (real Postgres contract)", () => {
    it.skip("set LEDGER_TEST_DATABASE_URL to a throwaway Postgres whose db name contains 'test'", () => {});
  });
} else {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) throw new Error(`refusing to run destructive store tests against database "${dbName}"`);
  describeLedgerStoreContract("drizzle on postgres", async () => {
    const pg = (await import("pg")).default;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const baseSchema = await import("@shared/schema");
    const ledgerSchema = await import("@shared/ledger-schema");
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzle(pool, { schema: { ...baseSchema, ...ledgerSchema } });
    await pool.query("TRUNCATE ledger_outbox, ledger_releases, ledger_records, ledger_campaigns, agent_keys");
    await pool.query("DELETE FROM users WHERE username IN ('contract-alice', 'contract-bob')");
    const alice = await mkUser(pool as any, "contract-alice");
    const bob = await mkUser(pool as any, "contract-bob");
    return { store: new DrizzleLedgerStore(db), alice, bob };
  });
}
