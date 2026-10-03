import { describe, expect, it } from "vitest";
import type { PublicRecord } from "@shared/ledger-public";
import { recordContentHash } from "@shared/ledger-hash";
import { campaignTally, timeline, verifyRecordHash } from "./ledger-view";

function rec(over: Partial<PublicRecord>): PublicRecord {
  return {
    id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", campaignId: "c-1", kind: "result", title: "t", body: "", standing: "measured",
    evidence: [], correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null, setsStatus: null,
    authorUsername: "qe", held: false, released: false, contentHash: "", filedVia: "api",
    createdAt: "2026-10-03T00:00:00.000Z", ...over,
  };
}

describe("ledger view helpers", () => {
  it("tallies passed, failed and open", () => {
    const t = campaignTally([
      rec({ kind: "certificate", standing: "certified" }),
      rec({ kind: "result", standing: "measured" }),
      rec({ kind: "failure" }),
      rec({ kind: "result", standing: "retracted" }),
      rec({ kind: "result", standing: "unverified" }),
      rec({ kind: "note" }),
    ]);
    expect(t).toEqual({ passed: 2, failed: 2, open: 1, total: 6 });
  });

  it("orders a timeline oldest first", () => {
    const out = timeline([rec({ id: "b", createdAt: "2026-10-02T00:00:00.000Z" }), rec({ id: "a", createdAt: "2026-10-01T00:00:00.000Z" })]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("verifies a record hash in the browser code path", async () => {
    const r = rec({});
    const good = { ...r, contentHash: await recordContentHash(r) };
    expect(await verifyRecordHash(good)).toBe(true);
    expect(await verifyRecordHash({ ...good, title: "tampered" })).toBe(false);
  });
});
