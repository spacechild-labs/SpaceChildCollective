import { beforeEach, describe, expect, it } from "vitest";
import type { AgentKeyStore } from "./types";

export type AgentKeyFixture = { store: AgentKeyStore; userId: string; otherUserId: string };

const H = (n: number) => n.toString(16).padStart(64, "0");

/** Behaviour every AgentKeyStore must have. Run against the memory store and Drizzle on PGlite. */
export function describeAgentKeyStoreContract(label: string, make: () => Promise<AgentKeyFixture>): void {
  // A fresh PGlite boots per test (WASM load plus DDL); give it room under full-suite parallel load.
  describe(`AgentKeyStore contract: ${label}`, { timeout: 60_000 }, () => {
    let f: AgentKeyFixture;
    beforeEach(async () => { f = await make(); }, 60_000);

    const mk = (n: number, userId: string) => f.store.insert({
      userId, name: `k${n}`, prefix: `scl_${n}`.slice(0, 12), keyHash: H(n), ed25519PublicKey: null, createdAt: new Date(),
    });

    it("revoke keeps the row; deleteForUser removes every row of that user and no other", async () => {
      const a = await mk(1, f.userId);
      await mk(2, f.userId);
      const other = await mk(3, f.otherUserId);
      await f.store.revoke(a.id, new Date());
      expect((await f.store.findById(a.id))?.revokedAt).toBeTruthy();
      expect(await f.store.deleteForUser(f.userId)).toBe(2);
      expect(await f.store.listForUser(f.userId)).toEqual([]);
      expect(await f.store.findById(a.id)).toBeUndefined();
      expect((await f.store.findById(other.id))?.userId).toBe(f.otherUserId);
      expect(await f.store.deleteForUser(f.userId)).toBe(0);
    });
  });
}
