import { beforeEach, describe, expect, it } from "vitest";
import type { VerificationStore } from "./verifications";

export type VerificationFixture = { store: VerificationStore; recordId: string };

export function describeVerificationStoreContract(label: string, make: () => Promise<VerificationFixture & { setup?: () => Promise<void> }>): void {
  // A fresh PGlite boots per test (WASM load plus DDL); give it room under full-suite parallel load.
  describe(`VerificationStore contract: ${label}`, { timeout: 60_000 }, () => {
    let f: VerificationFixture;
    beforeEach(async () => { f = await make(); }, 60_000);

    const row = (over: Record<string, unknown> = {}) => ({
      recordId: f.recordId, inputKey: "k1", tier: "MACHINE-CHECKED" as const, failed: false, mutable: false, error: null,
      checks: [{ status: "PASS" as const, what: "evidence 'e': sha256 matches (3 bytes)" }], spec: "356a25a",
      checkedAt: new Date(Date.UTC(2026, 9, 16, 12)), ...over,
    });

    it("returns nothing for an unknown id and for an empty list", async () => {
      expect((await f.store.get([f.recordId])).size).toBe(0);
      expect((await f.store.get([])).size).toBe(0);
    });

    it("stores a row and reads it back field for field", async () => {
      await f.store.put(row());
      const got = (await f.store.get([f.recordId])).get(f.recordId)!;
      expect(got).toMatchObject({ recordId: f.recordId, inputKey: "k1", tier: "MACHINE-CHECKED", failed: false, mutable: false, error: null, spec: "356a25a" });
      expect(got.checks).toEqual(row().checks);
      expect(new Date(got.checkedAt).toISOString()).toBe("2026-10-16T12:00:00.000Z");
    });

    it("a second put replaces the first (one row per record)", async () => {
      await f.store.put(row());
      await f.store.put(row({ inputKey: "k2", tier: null, error: "network down", checks: [] }));
      const got = (await f.store.get([f.recordId])).get(f.recordId)!;
      expect(got).toMatchObject({ inputKey: "k2", tier: null, error: "network down" });
      expect(got.checks).toEqual([]);
    });
  });
}
