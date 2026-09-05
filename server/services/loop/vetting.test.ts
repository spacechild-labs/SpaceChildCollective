import { describe, it, expect } from "vitest";
import {
  checkSchema,
  checkStatsIntegrity,
  checkReproducibility,
  checkNovelty,
  checkSimulationDisclosure,
  checkSafety,
  runAutomatedChecks,
  summarize,
  zForProportion,
  twoTailedP,
  jaccard,
  tokenize,
  type VettingPolicy,
} from "./vetting";
import { findingContentHash } from "./canonical";

const policy: VettingPolicy = { minTrials: 10, requireHumanApproval: true, duplicateSimilarity: 0.9, nearDuplicateSimilarity: 0.6 };

function mk(overrides: Partial<Parameters<typeof checkSchema>[0]> & { evidence?: Record<string, unknown> } = {}) {
  const base = {
    id: "f1",
    title: "Resonance study: H1 supported",
    claim: "Evidence suggests interconnected resonance exists between AI agents beyond baseline randomness.",
    summary: null as string | null,
    category: "consciousness_studies",
    simulated: false,
    confidence: 70,
    evidence: {
      n: 30,
      detections: 18,
      observedRate: 0.6,
      baselineRate: 0.33,
      zScore: Number(zForProportion(0.6, 0.33, 30).toFixed(4)),
      pValue: Number(twoTailedP(zForProportion(0.6, 0.33, 30)).toFixed(6)),
      significantAtAlpha05: true,
      rawTrials: Array.from({ length: 30 }, (_, i) => ({ trialId: `t${i}`, detected: i < 18, confidence: 0.7 })),
    } as Record<string, unknown>,
  };
  const f = { ...base, ...overrides, evidence: { ...base.evidence, ...(overrides.evidence ?? {}) } };
  return { ...f, contentHash: findingContentHash({ title: f.title, claim: f.claim, evidence: f.evidence }) };
}

describe("checkSchema", () => {
  it("passes a well-formed finding and fails a tampered hash", () => {
    const f = mk();
    expect(checkSchema(f).verdict).toBe("pass");
    expect(checkSchema({ ...f, claim: f.claim + " (edited)" }).verdict).toBe("fail");
    expect(checkSchema(mk({ claim: "short" })).notes).toMatch(/falsifiable/);
  });
});

describe("checkStatsIntegrity", () => {
  it("passes internally consistent statistics", () => {
    const r = checkStatsIntegrity(mk(), policy);
    expect(r.verdict).toBe("pass");
    expect((r.details as any).recomputed.z).toBeCloseTo(zForProportion(0.6, 0.33, 30), 3);
  });

  it("fails when the reported z disagrees with the recomputed z (separation, not range)", () => {
    const r = checkStatsIntegrity(mk({ evidence: { zScore: 0.5 } }), policy);
    expect(r.verdict).toBe("fail");
    expect(r.notes).toMatch(/disagrees with recomputed z/);
  });

  it("fails a positive claim whose p-value is not significant", () => {
    const z = zForProportion(0.36, 0.33, 30);
    const r = checkStatsIntegrity(mk({ evidence: { observedRate: 0.36, detections: 11, zScore: Number(z.toFixed(4)), pValue: Number(twoTailedP(z).toFixed(6)), significantAtAlpha05: false } }), policy);
    expect(r.verdict).toBe("fail");
    expect(r.notes).toMatch(/positive effect but p/);
  });

  it("fails below the minimum trial count and on impossible p-values", () => {
    expect(checkStatsIntegrity(mk({ evidence: { n: 5 } }), policy).notes).toMatch(/below the minimum/);
    expect(checkStatsIntegrity(mk({ evidence: { pValue: 1.7 } }), policy).notes).toMatch(/not a probability/);
  });

  it("flags (does not fail) narrative findings with no numbers", () => {
    const r = checkStatsIntegrity(mk({ evidence: { n: undefined, pValue: undefined, observedRate: undefined, baselineRate: undefined, zScore: undefined, detections: undefined, significantAtAlpha05: undefined, rawTrials: undefined } }), policy);
    expect(r.verdict).toBe("flag");
  });
});

describe("checkReproducibility", () => {
  it("reproduces summary statistics from raw trials", () => {
    expect(checkReproducibility(mk()).verdict).toBe("pass");
  });

  it("fails when raw trials disagree with the summary", () => {
    const r = checkReproducibility(mk({ evidence: { detections: 20 } }));
    expect(r.verdict).toBe("fail");
    expect(r.notes).toMatch(/raw detections 18/);
  });

  it("flags when no raw data is attached", () => {
    expect(checkReproducibility(mk({ evidence: { rawTrials: undefined } })).verdict).toBe("flag");
  });
});

describe("checkNovelty", () => {
  it("passes when nothing similar exists, flags near-duplicates, fails same-experiment duplicates", () => {
    const f = { ...mk(), experimentId: "e1" };
    expect(checkNovelty(f, [], policy).verdict).toBe("pass");
    expect(checkNovelty(f, [{ id: "x", claim: f.claim, status: "vetted", experimentId: "e1" }], policy).verdict).toBe("fail");
    // Same claim from a different experiment is a replication: flagged and linked, never rejected.
    const rep = checkNovelty(f, [{ id: "x", claim: f.claim, status: "vetted", experimentId: "e2" }], policy);
    expect(rep.verdict).toBe("flag");
    expect(rep.notes).toMatch(/replicates finding x/);
    expect((rep.details as any).replicates).toBe("x");
    const near = { id: "y", claim: "Evidence suggests interconnected resonance exists between AI agents beyond chance levels.", status: "vetted" as const };
    const r = checkNovelty(f, [near], policy);
    expect(["flag", "fail"]).toContain(r.verdict);
    expect(r.score).toBeLessThan(50);
    // Rejected findings do not count against novelty.
    expect(checkNovelty(f, [{ id: "z", claim: f.claim, status: "rejected" }], policy).verdict).toBe("pass");
  });

  it("jaccard is 0 for disjoint sets and 1 for identical sets", () => {
    expect(jaccard(tokenize("alpha beta gamma"), tokenize("delta epsilon"))).toBe(0);
    expect(jaccard(tokenize("alpha beta"), tokenize("beta alpha"))).toBe(1);
  });
});

describe("checkSimulationDisclosure", () => {
  it("passes empirical findings, flags disclosed simulations, fails undisclosed ones", () => {
    expect(checkSimulationDisclosure(mk()).verdict).toBe("pass");
    const disclosed = mk({ simulated: true, summary: "Evidence comes from a deterministic simulation of agent signaling." });
    expect(checkSimulationDisclosure(disclosed).verdict).toBe("flag");
    expect(checkSimulationDisclosure(mk({ simulated: true })).verdict).toBe("fail");
    // Source says simulation but the flag is off — that is the dangerous case.
    expect(checkSimulationDisclosure(mk({ evidence: { trialDataSource: "deterministic_simulation" } })).verdict).toBe("fail");
  });
});

describe("checkSafety", () => {
  it("fails on secrets and flags on emails", () => {
    expect(checkSafety(mk({ summary: "key sk-abcdefghijklmnopqrstuvwxyz1234" })).verdict).toBe("fail");
    expect(checkSafety(mk({ summary: "contact alice@example.com" })).verdict).toBe("flag");
    expect(checkSafety(mk()).verdict).toBe("pass");
  });
});

describe("summarize", () => {
  it("rejects on any fail, waits for a human otherwise, and vets once approved", () => {
    const auto = runAutomatedChecks(mk(), [], policy).map((r) => ({ ...r, reviewerType: "automated" as const, score: r.score ?? null }));
    expect(auto.every((r) => r.verdict !== "fail")).toBe(true);
    expect(summarize(auto, policy).outcome).toBe("awaiting_human");
    const approved = [...auto, { check: "human_approval", verdict: "pass" as const, reviewerType: "human" as const, score: null }];
    expect(summarize(approved, policy).outcome).toBe("vetted");
    const failed = [...approved, { check: "peer_review", verdict: "fail" as const, reviewerType: "agent" as const, score: null }];
    expect(summarize(failed, policy).outcome).toBe("rejected");
    expect(summarize(auto, { ...policy, requireHumanApproval: false }).outcome).toBe("vetted");
    expect(summarize(auto, policy).novelty).toBe(100);
  });
});
