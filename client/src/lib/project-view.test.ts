import { describe, expect, it } from "vitest";
import type { PublicCampaign, PublicRecord } from "@shared/ledger-public";
import { axisPosition, latestRecord, projectProgress, projectSpan, sortProjects, stagesReached } from "./project-view";

function rec(over: Partial<PublicRecord>): PublicRecord {
  return {
    id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", campaignId: "c-1", kind: "result", title: "t", body: "", standing: "measured",
    evidence: [], correctedBy: [], brokenBy: [], correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null, setsStatus: null,
    authorUsername: "qe", held: false, released: false, contentHash: "", filedVia: "api",
    createdAt: "2026-10-03T00:00:00.000Z", ...over,
  };
}
function camp(over: Partial<PublicCampaign>): PublicCampaign {
  return { id: "c-1", title: "C", summary: "", status: "registered", links: [], ownerUsername: "qe", createdAt: "2026-10-03T00:00:00.000Z", ...over };
}

describe("project view", () => {
  it("reaches stages from the kinds filed, in arc order, and a failure counts as a result", () => {
    expect(stagesReached([], "registered")).toEqual([]);
    expect(stagesReached([rec({ kind: "preregistration" })], "registered")).toEqual(["pre-registered"]);
    expect(stagesReached([rec({ kind: "failure" }), rec({ kind: "preregistration" }), rec({ kind: "note" })], "registered")).toEqual(["pre-registered", "result"]);
    expect(stagesReached([rec({ kind: "run" }), rec({ kind: "decision" })], "running")).toEqual(["run", "decided"]);
  });

  it("a closed campaign is fully decided whatever it filed; progress is stages over four", () => {
    expect(stagesReached([rec({ kind: "note" })], "closed")).toEqual(["pre-registered", "run", "result", "decided"]);
    expect(projectProgress([rec({ kind: "note" })], "closed")).toBe(1);
    expect(projectProgress([rec({ kind: "preregistration" })], "registered")).toBe(0.25);
    expect(projectProgress([], "registered")).toBe(0);
  });

  it("spans from the earlier of registration and first record to today while open, to the last record once closed", () => {
    const c = camp({ createdAt: "2026-10-05T00:00:00.000Z" });
    const rs = [rec({ createdAt: "2026-10-04T00:00:00.000Z" }), rec({ id: "b", createdAt: "2026-10-09T00:00:00.000Z" })];
    expect(projectSpan(c, rs, "2026-10-14T00:00:00.000Z")).toEqual({ start: "2026-10-04T00:00:00.000Z", end: "2026-10-14T00:00:00.000Z", lastActivity: "2026-10-09T00:00:00.000Z", open: true });
    expect(projectSpan(camp({ ...c, status: "closed" }), rs, "2026-10-14T00:00:00.000Z")).toEqual({ start: "2026-10-04T00:00:00.000Z", end: "2026-10-09T00:00:00.000Z", lastActivity: "2026-10-09T00:00:00.000Z", open: false });
    expect(projectSpan(c, [], "2026-10-01T00:00:00.000Z").end).toBe("2026-10-05T00:00:00.000Z");
  });

  it("picks the latest record by the ledger's timeline order", () => {
    expect(latestRecord([])).toBeNull();
    expect(latestRecord([rec({ id: "late", createdAt: "2026-10-09T00:00:00.000Z" }), rec({ id: "early" })])?.id).toBe("late");
  });

  it("sorts open projects first by newest activity, then closed ones", () => {
    const mk = (id: string, open: boolean, last: string | null) => ({ campaign: camp({ id }), span: { start: "", end: "", lastActivity: last, open } });
    const out = sortProjects([mk("closed-new", false, "2026-10-12"), mk("open-old", true, "2026-10-04"), mk("open-new", true, "2026-10-13"), mk("closed-old", false, "2026-10-04")]);
    expect(out.map((p) => p.campaign.id)).toEqual(["open-new", "open-old", "closed-new", "closed-old"]);
  });

  it("places a date on a shared axis, clamped, and never divides by a zero-length axis", () => {
    expect(axisPosition("2026-10-06", "2026-10-01", "2026-10-11")).toBeCloseTo(0.5);
    expect(axisPosition("2025-01-01", "2026-10-01", "2026-10-11")).toBe(0);
    expect(axisPosition("2027-01-01", "2026-10-01", "2026-10-11")).toBe(1);
    expect(axisPosition("2026-10-01", "2026-10-01", "2026-10-01")).toBe(0);
  });
});
