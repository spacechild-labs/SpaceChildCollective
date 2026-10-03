import { beforeEach, describe, expect, it } from "vitest";
import type { InviteStore } from "./types";

export type InviteFixture = { store: InviteStore; creatorId: string; otherCreatorId: string };

const H = (n: number) => n.toString(16).padStart(64, "0");
const later = (ms: number) => new Date(Date.now() + ms);

export function describeInviteStoreContract(label: string, make: () => Promise<InviteFixture>): void {
  describe(`InviteStore contract: ${label}`, () => {
    let f: InviteFixture;
    beforeEach(async () => { f = await make(); });

    const mk = (n: number, over: Record<string, unknown> = {}) => f.store.insert({
      id: `01J9INV${String(n).padStart(19, "0")}`, codeHash: H(n), prefix: `sci_${n}`.slice(0, 8),
      createdBy: f.creatorId, maxUses: 1, uses: 0, expiresAt: later(86_400_000), ...over,
    } as any);

    it("claims an open invite once, then refuses", async () => {
      await mk(1);
      expect((await f.store.claim(H(1), new Date()))?.uses).toBe(1);
      expect(await f.store.claim(H(1), new Date())).toBeUndefined();
    });

    it("refuses expired and revoked invites and unknown hashes", async () => {
      await mk(2, { expiresAt: new Date(Date.now() - 1000) });
      await mk(3);
      await f.store.revoke("01J9INV0000000000000000003", new Date());
      expect(await f.store.claim(H(2), new Date())).toBeUndefined();
      expect(await f.store.claim(H(3), new Date())).toBeUndefined();
      expect(await f.store.claim(H(99), new Date())).toBeUndefined();
    });

    it("release gives a use back and never goes below zero", async () => {
      await mk(4);
      const c = await f.store.claim(H(4), new Date());
      await f.store.release(c!.id);
      await f.store.release(c!.id);
      expect((await f.store.findById(c!.id))?.uses).toBe(0);
      expect((await f.store.claim(H(4), new Date()))?.uses).toBe(1);
    });

    it("multi-use invites allow exactly maxUses claims", async () => {
      await mk(5, { maxUses: 3 });
      const got = [];
      for (let i = 0; i < 5; i++) got.push(await f.store.claim(H(5), new Date()));
      expect(got.filter(Boolean)).toHaveLength(3);
    });

    it("concurrent claims of a single-use invite succeed exactly once", async () => {
      await mk(6);
      const results = await Promise.all(Array.from({ length: 8 }, () => f.store.claim(H(6), new Date())));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("lists, counts and bulk-revokes by creator", async () => {
      await mk(7); await mk(8, { maxUses: 2 }); await mk(9, { createdBy: f.otherCreatorId });
      expect((await f.store.listByCreator(f.creatorId)).map((i) => i.codeHash).sort()).toEqual([H(7), H(8)]);
      expect(await f.store.listAll()).toHaveLength(3);
      expect(await f.store.countMintedSince(f.creatorId, new Date(Date.now() - 60_000))).toBe(2);
      expect(await f.store.countOpen(f.creatorId, new Date())).toBe(2);
      expect(await f.store.revokeAllByCreators([f.creatorId], new Date())).toBe(2);
      expect(await f.store.countOpen(f.creatorId, new Date())).toBe(0);
      expect(await f.store.countOpen(f.otherCreatorId, new Date())).toBe(1);
    });
  });
}
