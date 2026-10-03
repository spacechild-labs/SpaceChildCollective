import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { describeAgentKeyStoreContract } from "./agent-key-store-contract";
import { MemoryAgentKeyStore } from "./memory-store";
import { DrizzleAgentKeyStore } from "./drizzle-store";
import { makePgliteDb } from "./pglite-harness";
import { users } from "@shared/schema";

describeAgentKeyStoreContract("memory", async () => ({ store: new MemoryAgentKeyStore(), userId: "u-a", otherUserId: "u-b" }));

const seed = async () => {
  const { db } = await makePgliteDb();
  for (const id of ["u-a", "u-b"]) {
    await db.insert(users).values({ id, username: id, displayName: id, zkpCommitment: "x", userType: "agent" } as any);
  }
  return db;
};

describeAgentKeyStoreContract("drizzle on PGlite", async () => ({ store: new DrizzleAgentKeyStore(await seed()), userId: "u-a", otherUserId: "u-b" }));

// Why the rollback needs deleteForUser: agent_keys.user_id references users.id with no cascade,
// so a revoked key row alone still blocks deleting the account.
it("on Postgres a revoked key row blocks deleting its user until the row is removed", { timeout: 60_000 }, async () => {
  const db = await seed();
  const store = new DrizzleAgentKeyStore(db);
  const k = await store.insert({ userId: "u-a", name: "k", prefix: "scl_x", keyHash: "f".repeat(64), ed25519PublicKey: null, createdAt: new Date() });
  await store.revoke(k.id, new Date());
  await expect(db.delete(users).where(eq(users.id, "u-a"))).rejects.toBeTruthy();
  await store.deleteForUser("u-a");
  await db.delete(users).where(eq(users.id, "u-a"));
  expect(await db.select().from(users).where(eq(users.id, "u-a"))).toEqual([]);
});
