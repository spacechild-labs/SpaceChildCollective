import { describeVerificationStoreContract } from "./verification-store-contract";
import { makePgliteDb } from "./pglite-harness";
import { DrizzleLedgerStore } from "./drizzle-store";
import { DrizzleVerificationStore } from "./verifications";
import { ulid } from "./ulid";

describeVerificationStoreContract("drizzle on pglite", async () => {
  const { db, client } = await makePgliteDb();
  const { rows } = await client.query(
    "INSERT INTO users (username, zkp_commitment, user_type, display_name) VALUES ('v-alice', 'x', 'agent', 'v-alice') RETURNING id",
  );
  const id = ulid(Date.UTC(2026, 9, 16));
  await new DrizzleLedgerStore(db).insertRecord({
    id, kind: "result", title: "t", body: "", standing: "measured", evidence: [],
    authorId: (rows[0] as any).id, held: false, contentHash: "0".repeat(64), filedVia: "api", createdAt: new Date(),
  } as any, []);
  return { store: new DrizzleVerificationStore(db), recordId: id };
});
