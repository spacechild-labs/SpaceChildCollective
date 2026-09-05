import { describe, it, expect } from "vitest";
import { signBody, verifySignature, backoffMs, buildEnvelope, findingAsText, MAX_ATTEMPTS } from "./delivery";
import type { Finding } from "@shared/schema";

const finding = {
  id: "f1",
  title: "T",
  claim: "C",
  summary: "S",
  evidence: { n: 30, pValue: 0.01, rawTrials: [{ trialId: "a", detected: true }, { trialId: "b", detected: false }] },
  category: "consciousness_studies",
  tags: ["x"],
  confidence: 70,
  novelty: 90,
  simulated: false,
  contentHash: "h",
  status: "routed",
  source: "experiment",
  vettingSummary: { outcome: "vetted" },
  paperId: null,
  experimentId: "e1",
  studyDesignId: "d1",
  createdBy: null,
  createdAt: new Date("2026-09-05T00:00:00Z"),
  updatedAt: new Date("2026-09-05T00:00:00Z"),
} as unknown as Finding;

describe("signing", () => {
  it("round-trips and rejects a tampered body or wrong secret", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signBody("secret", body);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifySignature("secret", body, sig)).toBe(true);
    expect(verifySignature("secret", body + " ", sig)).toBe(false);
    expect(verifySignature("other", body, sig)).toBe(false);
    expect(verifySignature("secret", body, undefined)).toBe(false);
    expect(verifySignature("secret", body, "sha256=short")).toBe(false);
  });
});

describe("backoff", () => {
  it("grows geometrically and is capped by MAX_ATTEMPTS", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(480_000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe("envelope", () => {
  it("strips raw trials but reports their count, and links back for feedback", () => {
    const env = buildEnvelope(finding, { id: "dl1", channelId: "ch1" }, "https://collective.example");
    expect(env.event).toBe("finding.vetted");
    expect((env.finding.evidence as any).rawTrials).toBeUndefined();
    expect((env.finding.evidence as any).rawTrialCount).toBe(2);
    expect((env.finding.evidence as any).n).toBe(30);
    expect(env.links.feedback).toBe("https://collective.example/api/loop/feedback/inbound/ch1");
    expect(env.links.finding).toBe("https://collective.example/api/loop/findings/f1");
  });

  it("renders a one-line text form with stats and the simulated marker", () => {
    expect(findingAsText(finding)).toBe("[SpaceChild finding f1] C (n=30, p=0.01) confidence=70");
    expect(findingAsText({ ...finding, simulated: true } as Finding)).toContain("[SIMULATED]");
  });
});
