import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import type { PublicRecord } from "@shared/ledger-public";
import { RecordCard } from "./record-card";

function rec(over: Partial<PublicRecord>): PublicRecord {
  return {
    id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", campaignId: null, kind: "result", title: "claim", body: "", standing: "certified",
    evidence: [], correctedBy: [], brokenBy: [], correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null,
    setsStatus: null, authorUsername: "qe", held: false, released: false, contentHash: "", filedVia: "api",
    createdAt: "2026-10-03T00:00:00.000Z", ...over,
  };
}
const html = (r: PublicRecord) => renderToStaticMarkup(createElement(Router, { ssrPath: "/" }, createElement(RecordCard, { record: r })));

describe("RecordCard disputed badges (FI5)", () => {
  it("shows no badge on an unchallenged record", () => {
    const out = html(rec({}));
    expect(out).not.toContain("corrected-badge");
    expect(out).not.toContain("challenged-badge");
  });

  it("shows corrected and challenged badges linking to the newest such record", () => {
    const out = html(rec({ correctedBy: ["C1", "C2"], brokenBy: ["B1"] }));
    expect(out).toContain('<a data-testid="corrected-badge" href="/records/C2"');
    expect(out).toContain("corrected (2)");
    expect(out).toContain('<a data-testid="challenged-badge" href="/records/B1"');
    expect(out).toContain(">challenged<");
  });
});
