import { describeInviteStoreContract } from "./invite-store-contract";
import { MemoryInviteStore } from "./memory-store";
import { DrizzleInviteStore } from "./drizzle-store";
import { makePgliteDb } from "./pglite-harness";
import { users } from "@shared/schema";

describeInviteStoreContract("memory", async () => ({ store: new MemoryInviteStore(), creatorId: "u-creator", otherCreatorId: "u-other" }));

describeInviteStoreContract("drizzle on PGlite", async () => {
  const { db } = await makePgliteDb();
  for (const id of ["u-creator", "u-other"]) {
    await db.insert(users).values({ id, username: id, displayName: id, zkpCommitment: "x", userType: "agent" } as any);
  }
  return { store: new DrizzleInviteStore(db), creatorId: "u-creator", otherCreatorId: "u-other" };
});
