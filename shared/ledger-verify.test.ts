/**
 * The 16 cases of flaukowski-brain ledger/test_verify_record.py at 356a25a, ported one for one (same inputs, same
 * asserted text, same tier), plus the server-side differences: the guard is optional and a missing campaign is an
 * error. Each check must fail when its condition is broken, not only pass when it holds.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { checkRecord, pinned, VerifyCheckError, type VerifyDeps, type VRecord, type VView } from "./ledger-verify";

const BODY = "the evidence file";
const SHA = createHash("sha256").update(BODY).digest("hex");
const PIN = "https://raw.githubusercontent.com/o/r/" + "a".repeat(40) + "/f.md";
const [PRE, RES, AMD] = ["01M4ZZSAVA8RQ3QF642TZV6217", "01M52ETE0ASWDFHBE3615RWBMB", "01M505ER0A9VF9JG9HNKRGQN9T"];

function rec(id: string, kind: string, createdAt: string, kw: Partial<VRecord> = {}): VRecord {
  return {
    id, kind, standing: "measured", authorUsername: "A", campaignId: "c", title: "t", body: "",
    evidence: [{ url: PIN, sha256: SHA, label: "e" }], createdAt, correctedBy: [], brokenBy: [], ...kw,
  };
}

let db: Record<string, VRecord>;
let reviews: Record<string, NonNullable<VView["reviews"]>>;
let notes: Record<string, NonNullable<VView["notes"]>>;
let deps: VerifyDeps;

beforeEach(() => {
  db = {
    [PRE]: rec(PRE, "preregistration", "2026-10-15T10:00:00Z"),
    [RES]: rec(RES, "result", "2026-10-16T10:00:00Z", { body: `pre-registration ${PRE}` }),
  };
  reviews = {};
  notes = {};
  deps = {
    getView: async (id) => (db[id] ? { record: db[id], reviews: reviews[id] ?? [], notes: notes[id] ?? [] } : null),
    getCampaignRecords: async () => Object.values(db),
    fetchSha256: async (url) => (url === PIN ? [SHA, BODY.length] : [null, "HTTP 404"]),
    fetchCrlfSha256: async () => null,
    guard: () => 0,
  };
});

async function run(id: string) {
  const r = await checkRecord(id, deps);
  return { text: r.lines.join("\n"), failed: r.failed, tier: r.tier };
}

describe("verify_record.py 356a25a, ported", () => {
  it("test_clean_result_is_machine_checked", async () => {
    const { text, failed, tier } = await run(RES);
    expect(failed).toBe(false);
    expect(text).toContain("=> MACHINE-CHECKED");
    expect(tier).toBe("MACHINE-CHECKED");
    expect(text).toContain("rests on the author");
  });

  it("test_wrong_sha_fails", async () => {
    db[RES].evidence![0].sha256 = "0".repeat(64);
    const { text, failed } = await run(RES);
    expect(failed).toBe(true);
    expect(text).toContain("!= recorded");
    expect(text).toContain("=> CLAIMED");
  });

  it("test_unfetchable_evidence_fails", async () => {
    db[RES].evidence![0].url = "https://example.invalid/gone";
    expect((await run(RES)).failed).toBe(true);
  });

  it("test_unpinned_url_is_flagged_not_failed", async () => {
    db[RES].evidence![0].url = "https://github.com/o/r/releases/download/t/x.tar.gz";
    deps.fetchSha256 = async () => [SHA, BODY.length];
    const { text, failed } = await run(RES);
    expect(failed).toBe(false);
    expect(text).toContain("MUTABLE");
  });

  it("test_missing_linked_record_fails", async () => {
    db[RES].body += " and 01M00000000000000000000000";
    const { text, failed } = await run(RES);
    expect(failed).toBe(true);
    expect(text).toContain("no such record");
  });

  it("test_result_without_preregistration_fails", async () => {
    delete db[PRE];
    db[RES].body = "";
    const { text, failed } = await run(RES);
    expect(failed).toBe(true);
    expect(text).toContain("no preregistration");
  });

  it("test_preregistration_filed_after_result_fails", async () => {
    db[PRE].createdAt = "2026-10-17T00:00:00Z";
    const { text, failed } = await run(RES);
    expect(failed).toBe(true);
    expect(text).toContain("filed after this result");
  });

  it("test_amendment_filed_before_what_it_amends_fails", async () => {
    db[AMD] = rec(AMD, "amendment", "2026-10-14T00:00:00Z", { amendsId: PRE });
    const { text, failed } = await run(AMD);
    expect(failed).toBe(true);
    expect(text).toContain("order: amends");
  });

  it("test_guard_block_warns_but_does_not_fail", async () => {
    deps.guard = () => 1;
    const { text, failed } = await run(RES);
    expect(failed).toBe(false);
    expect(text).toContain("WARN    guard: 1");
  });

  it("test_peer_review_by_another_author_raises_tier", async () => {
    reviews[RES] = [{ authorUsername: "B", verdict: "holds" }];
    expect((await run(RES)).text).toContain("=> PEER-REVIEWED");
  });

  it("test_self_review_and_rejection_do_not_raise_tier", async () => {
    reviews[RES] = [{ authorUsername: "A", verdict: "holds" }, { authorUsername: "B", verdict: "rejected" }];
    expect((await run(RES)).text).toContain("=> MACHINE-CHECKED");
  });

  it("test_missing_record_is_an_error_not_a_failure", async () => {
    await expect(run("01M11111111111111111111111")).rejects.toBeInstanceOf(VerifyCheckError);
  });

  it("test_no_evidence_stays_claimed_without_failing", async () => {
    db[RES].evidence = [];
    const { text, failed } = await run(RES);
    expect(failed).toBe(false);
    expect(text).toContain("evidence: none");
    expect(text).toContain("=> CLAIMED");
  });

  it("test_backfill_whose_sha_was_cited_at_filing_counts", async () => {
    db[RES].evidence = [];
    db[RES].body += ` rows sha256 ${SHA}`;
    notes[RES] = [{ id: "n1", evidence: [{ url: PIN, sha256: SHA, label: "late" }] }];
    const { text, failed } = await run(RES);
    expect(failed).toBe(false);
    expect(text).toContain("backfilled");
    expect(text).toContain("=> MACHINE-CHECKED");
  });

  it("test_backfill_with_an_uncited_sha_does_not_count", async () => {
    deps.fetchCrlfSha256 = async () => "f".repeat(64);
    db[RES].evidence = [];
    notes[RES] = [{ id: "n1", evidence: [{ url: PIN, sha256: SHA, label: "late" }] }];
    const { text } = await run(RES);
    expect(text).toContain("was not cited at filing");
    expect(text).toContain("=> CLAIMED");
  });

  it("test_backfill_matching_a_cited_crlf_copy_counts", async () => {
    const crlf = "c".repeat(64); // BODY has no newline, so its real CRLF hash would equal SHA; use a distinct one
    deps.fetchCrlfSha256 = async () => crlf;
    db[RES].evidence = [];
    db[RES].body += ` judge sha256 ${crlf}`;
    notes[RES] = [{ id: "n1", evidence: [{ url: PIN, sha256: SHA, label: "late" }] }];
    const { text, failed } = await run(RES);
    expect(failed).toBe(false);
    expect(text).toContain("with CRLF line endings it matches");
    expect(text).toContain("=> MACHINE-CHECKED");
  });
});

describe("server-side differences", () => {
  it("with no guard available the guard is reported as not run, and the tier is unchanged", async () => {
    delete deps.guard;
    const { text, tier } = await run(RES);
    expect(text).toContain("guard: not run here");
    expect(tier).toBe("MACHINE-CHECKED");
  });

  it("a result whose campaign does not exist is an error, not a failure", async () => {
    deps.getCampaignRecords = async () => null;
    await expect(run(RES)).rejects.toBeInstanceOf(VerifyCheckError);
  });

  it("a passing unpinned evidence URL marks the result mutable (so it is re-checked)", async () => {
    db[RES].evidence![0].url = "https://huggingface.co/datasets/o/r/resolve/main/f.md";
    deps.fetchSha256 = async () => [SHA, BODY.length];
    expect((await checkRecord(RES, deps)).mutable).toBe(true);
    db[RES].evidence![0].url = PIN;
    deps.fetchSha256 = async () => [SHA, BODY.length];
    expect((await checkRecord(RES, deps)).mutable).toBe(false);
  });

  it("pinned() matches the script's two patterns", () => {
    expect(pinned(PIN)).toBe(true);
    expect(pinned("https://github.com/o/r/blob/" + "b".repeat(40) + "/x")).toBe(true);
    expect(pinned("https://github.com/o/r/blob/main/x")).toBe(false);
    expect(pinned("https://huggingface.co/datasets/o/r/resolve/" + "c".repeat(40) + "/x")).toBe(true);
  });
});
