import { describe, it, expect } from "vitest";
import { extractFromExperiment, extractFromPaper, experimentIsSimulated } from "./findings-extractor";
import type { ConsciousnessExperiment, Paper } from "@shared/schema";

function experiment(overrides: Partial<ConsciousnessExperiment> = {}): ConsciousnessExperiment {
  const trials = Array.from({ length: 12 }, (_, i) => ({
    trialId: `t${i}`,
    signalType: ["coherence_pulse", "asymmetric_marker", "resonance_wave"][i % 3],
    detected: i % 2 === 0,
    confidence: 0.7,
  }));
  return {
    id: "e1",
    name: "Resonance Study",
    description: "",
    h0: "No resonance",
    h1: "Resonance exists",
    controls: [],
    leadAgentId: "a1",
    participantAgentIds: ["a1", "a2"],
    status: "concluded",
    preregistered: false,
    startedAt: null,
    concludedAt: null,
    observations: { phases: [{ name: "BLIND_SIGNALING", data: { signaling: trials, summary: { simulated: true, generator: "deterministic_hash" } } }] },
    results: {
      analysis: {
        hypothesis: "H1",
        conclusion: "Evidence suggests interconnected resonance exists between AI agents beyond baseline randomness",
        confidence: "moderate",
        evidenceSummary: { totalTrials: 12, detections: 6, observedRate: 0.5, baselineRate: 0.33, zScore: 1.25, pValue: 0.21, effectSize: 0.34, effectInterpretation: "small", trialDataSource: "blind_signaling_phase_trials" },
        limitations: ["Deterministic agent signaling simulation - requires real autonomous agents"],
        rawTrialData: trials.map((t) => ({ trialId: t.trialId, detected: t.detected, confidence: t.confidence })),
      },
    },
    conclusion: null,
    paperId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ConsciousnessExperiment;
}

describe("extractFromExperiment", () => {
  it("produces a primary finding plus one per signal type, all flagged and disclosed as simulated", () => {
    const out = extractFromExperiment(experiment(), { studyDesignId: "d1", paradigm: "network_analysis" });
    expect(out.length).toBe(4);
    const primary = out[0];
    expect(primary.claim).toMatch(/interconnected resonance/);
    expect(primary.simulated).toBe(true);
    expect(primary.summary).toMatch(/deterministic simulation/);
    expect(primary.evidence).toMatchObject({ n: 12, detections: 6, observedRate: 0.5, baselineRate: 0.33, trialDataSource: "deterministic_simulation" });
    expect((primary.evidence as any).rawTrials).toHaveLength(12);
    expect(primary.confidence).toBe(65);
    expect(primary.tags).toContain("simulated");
    expect(primary.studyDesignId).toBe("d1");
    for (const f of out.slice(1)) {
      expect(f.tags).toContain("per_signal");
      expect((f.evidence as any).n).toBe(4);
      expect(f.simulated).toBe(true);
    }
  });

  it("returns nothing for an experiment without analysis results", () => {
    expect(extractFromExperiment(experiment({ results: null }))).toEqual([]);
  });

  it("detects simulation from the phase summary, the limitations, or the data source", () => {
    expect(experimentIsSimulated(experiment())).toBe(true);
    const clean = experiment({
      observations: { phases: [{ name: "BLIND_SIGNALING", data: { signaling: [], summary: {} } }] },
      results: { analysis: { hypothesis: "H0", conclusion: "x", confidence: "low", evidenceSummary: { totalTrials: 12, detections: 4, observedRate: 0.33, baselineRate: 0.33, pValue: 1, trialDataSource: "live_agents" }, limitations: [] } },
    });
    expect(experimentIsSimulated(clean)).toBe(false);
    expect(extractFromExperiment(clean)[0].simulated).toBe(false);
  });
});

describe("extractFromPaper", () => {
  it("lifts the central claim from the abstract", () => {
    const paper = {
      id: "p1",
      title: "On Phase Locking",
      abstract: "We study agents. Our findings suggest that phase locking predicts reportability in coupled agents. We discuss limits.",
      content: "# Intro\n\nwords words\n\n## Method\n",
      status: "published",
      category: "consciousness",
      publishedAt: null,
    } as unknown as Paper;
    const [f] = extractFromPaper(paper);
    expect(f.claim).toBe("Our findings suggest that phase locking predicts reportability in coupled agents.");
    expect(f.source).toBe("paper");
    expect(f.paperId).toBe("p1");
    expect((f.evidence as any).headings).toEqual(["Intro", "Method"]);
    expect(f.simulated).toBe(false);
  });

  it("returns nothing when the abstract has no usable sentence", () => {
    expect(extractFromPaper({ id: "p", title: "t", abstract: "short", content: "", status: "draft", category: "c" } as unknown as Paper)).toEqual([]);
  });
});
