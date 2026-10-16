import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import type { PublicRecord, VerificationDetail } from "@shared/ledger-public";
import { RecordCard } from "./record-card";
import { tierSentence } from "./machine-check";

function rec(over: Partial<PublicRecord>): PublicRecord {
  return {
    id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", campaignId: null, kind: "result", title: "claim", body: "", standing: "measured",
    evidence: [], correctedBy: [], brokenBy: [], correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null,
    setsStatus: null, authorUsername: "qe", held: false, released: false, contentHash: "", filedVia: "api",
    createdAt: "2026-10-03T00:00:00.000Z", ...over,
  };
}
const html = (r: PublicRecord) => renderToStaticMarkup(createElement(Router, { ssrPath: "/" }, createElement(RecordCard, { record: r })));

describe("derived tier on the record card", () => {
  it("shows nothing when the server sent no tier", () => {
    expect(html(rec({}))).not.toContain("tier-badge");
  });

  it("shows the tier next to the standing, standing unchanged", () => {
    const out = html(rec({ verification: { tier: "MACHINE-CHECKED", checkedAt: "2026-10-16T00:00:00.000Z" } }));
    expect(out).toContain("tier-badge");
    expect(out).toContain(">machine-checked<");
    expect(out).toContain(">measured<");
  });

  it("labels every tier, including unchecked", () => {
    for (const [tier, label] of [["PEER-REVIEWED", "peer-reviewed"], ["CLAIMED", "claimed"], ["unchecked", "unchecked"]] as const) {
      expect(html(rec({ verification: { tier, checkedAt: null } }))).toContain(`>${label}<`);
    }
  });
});

describe("tierSentence", () => {
  const d = (over: Partial<VerificationDetail>): VerificationDetail => ({ tier: "CLAIMED", checkedAt: null, failed: false, checks: [], error: null, spec: "356a25a", ...over });
  it("says why a record is only claimed", () => {
    expect(tierSentence(d({}), "measured")).toContain("no evidence a machine can check");
    expect(tierSentence(d({ failed: true }), "measured")).toContain("a machine check failed");
  });
  it("says why a record is unchecked", () => {
    expect(tierSentence(d({ tier: "unchecked", error: "host not on this server's fetch list" }), "measured")).toContain("could not run: host not on");
    expect(tierSentence(d({ tier: "unchecked" }), "measured")).toContain("has not run");
  });
});
