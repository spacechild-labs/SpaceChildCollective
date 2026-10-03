import { describeLedgerStoreContract } from "./store-contract";
import { MemoryLedgerStore } from "./memory-store";

describeLedgerStoreContract("memory", async () => {
  const alice = { id: "u-alice", username: "alice" };
  const bob = { id: "u-bob", username: "bob" };
  return { store: new MemoryLedgerStore([alice, bob]), alice, bob };
});
