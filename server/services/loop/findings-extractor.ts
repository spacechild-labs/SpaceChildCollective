import type { ConsciousnessExperiment, Paper, Finding, FindingSource, InsertFinding } from "@shared/schema";
import { loopStorage } from "../../loop-storage";
import { findingContentHash } from "./canonical";

/**
 * Findings extractor: turns experiment results and papers into candidate
 * findings — one falsifiable claim plus the structured evidence behind it.
 * Candidates are the input to vetting; nothing here decides whether a finding
 * is good, only what it says and what backs it.
 */

export interface CandidateFinding {
  title: string;
  claim: string;
  summary?: string;
  evidence: Record<string, unknown>;
  category: string;
  tags: string[];
  confidence: number; // 0-100
  simulated: boolean;
  source: FindingSource;
  paperId?: string | null;
  experimentId?: string | null;
  studyDesignId?: string | null;
  createdBy?: string | null;
}

const SIMULATION_DISCLOSURE = "Evidence comes from a deterministic simulation of agent signaling, not live agents.";

function confidenceFromLabel(label: unknown): number {
  switch (String(label ?? "").toLowerCase()) {
    case "high": return 85;
    case "moderate": case "medium": return 65;
    case "low": return 40;
    default: return 50;
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Whether an experiment's trial data came from a simulation rather than live agents. */
export function experimentIsSimulated(experiment: ConsciousnessExperiment): boolean {
  const phases: any[] = ((experiment.observations as any)?.phases ?? []) as any[];
  const blind = phases.find((p) => p?.name === "BLIND_SIGNALING");
  if (blind?.data?.summary?.simulated === true) return true;
  const analysis: any = (experiment.results as any)?.analysis ?? experiment.results ?? {};
  const limitations: string[] = Array.isArray(analysis?.limitations) ? analysis.limitations : [];
  if (limitations.some((l) => /simulat/i.test(String(l)))) return true;
  const src = String(analysis?.evidenceSummary?.trialDataSource ?? analysis?.statisticalSummary?.dataSource ?? "");
  return /simulat|deterministic/i.test(src);
}

export function extractFromExperiment(
  experiment: ConsciousnessExperiment,
  opts: { studyDesignId?: string | null; createdBy?: string | null; paradigm?: string; witness?: object | null } = {},
): CandidateFinding[] {
  const out = extractFromExperimentInner(experiment, opts);
  // Stamp the constellation's state at extraction onto every candidate. It is
  // part of the evidence (and therefore the content hash): provenance, not decoration.
  if (opts.witness) for (const c of out) c.evidence = { ...c.evidence, constellationWitness: opts.witness as Record<string, unknown> };
  return out;
}

function extractFromExperimentInner(
  experiment: ConsciousnessExperiment,
  opts: { studyDesignId?: string | null; createdBy?: string | null; paradigm?: string },
): CandidateFinding[] {
  const results: any = experiment.results;
  const analysis: any = results?.analysis ?? results;
  if (!analysis || typeof analysis !== "object" || !analysis.evidenceSummary) return [];

  const ev = analysis.evidenceSummary;
  const simulated = experimentIsSimulated(experiment);
  const phases: any[] = ((experiment.observations as any)?.phases ?? []) as any[];
  const blind = phases.find((p) => p?.name === "BLIND_SIGNALING");
  const trials: any[] = Array.isArray(blind?.data?.signaling) ? blind.data.signaling : [];
  const rawTrials: any[] = Array.isArray(analysis.rawTrialData) ? analysis.rawTrialData : trials.map((t) => ({ trialId: t.trialId, detected: t.detected, confidence: t.confidence }));

  const baseTags = [opts.paradigm, "blind_signaling", "resonance", simulated ? "simulated" : "empirical"].filter(Boolean) as string[];
  const supported = analysis.hypothesis === "H1";
  const disclosure = simulated ? ` ${SIMULATION_DISCLOSURE}` : "";
  const out: CandidateFinding[] = [];

  out.push({
    title: `${experiment.name}: ${supported ? "H1 supported" : "H0 retained"}`,
    claim: String(analysis.conclusion || (supported ? experiment.h1 : experiment.h0)).trim(),
    summary: `${supported ? "Observed" : "Did not observe"} above-baseline detection across ${ev.totalTrials} blinded trials (observed ${pct(Number(ev.observedRate))}, baseline ${pct(Number(ev.baselineRate))}, p=${ev.pValue}).${disclosure}`,
    evidence: {
      hypothesis: analysis.hypothesis,
      h0: experiment.h0,
      h1: experiment.h1,
      n: Number(ev.totalTrials),
      detections: Number(ev.detections),
      observedRate: Number(ev.observedRate),
      baselineRate: Number(ev.baselineRate),
      zScore: Number(ev.zScore),
      pValue: Number(ev.pValue),
      effectSize: Number(ev.effectSize),
      effectInterpretation: ev.effectInterpretation,
      significantAtAlpha05: Number(ev.pValue) < 0.05,
      trialDataSource: simulated ? "deterministic_simulation" : ev.trialDataSource,
      rawTrials,
    },
    category: "consciousness_studies",
    tags: baseTags,
    confidence: confidenceFromLabel(analysis.confidence),
    simulated,
    source: "experiment",
    experimentId: experiment.id,
    studyDesignId: opts.studyDesignId ?? null,
    paperId: experiment.paperId ?? null,
    createdBy: opts.createdBy ?? null,
  });

  // Secondary findings: per-signal-type detection rates from the recorded trials.
  const bySignal = new Map<string, { n: number; detections: number }>();
  for (const t of trials) {
    const key = String(t.signalType ?? "unknown");
    const agg = bySignal.get(key) ?? { n: 0, detections: 0 };
    agg.n += 1;
    if (t.detected) agg.detections += 1;
    bySignal.set(key, agg);
  }
  const baseline = Number(ev.baselineRate);
  for (const [signalType, agg] of bySignal) {
    if (agg.n < 2) continue;
    const hitRate = agg.detections / agg.n;
    out.push({
      title: `${experiment.name}: ${signalType} detection rate`,
      claim: `Detection rate for ${signalType} signals was ${pct(hitRate)} across ${agg.n} blinded trials (baseline ${pct(baseline)}).`,
      summary: `Per-signal breakdown from the blind signaling phase.${disclosure}`,
      evidence: { signalType, n: agg.n, detections: agg.detections, observedRate: Number(hitRate.toFixed(4)), baselineRate: baseline, trialDataSource: simulated ? "deterministic_simulation" : ev.trialDataSource },
      category: "consciousness_studies",
      tags: [...baseTags, "per_signal"],
      confidence: 50,
      simulated,
      source: "experiment",
      experimentId: experiment.id,
      studyDesignId: opts.studyDesignId ?? null,
      paperId: experiment.paperId ?? null,
      createdBy: opts.createdBy ?? null,
    });
  }

  return out;
}

const CLAIM_VERBS = /\b(suggest|show|find|found|demonstrat|indicat|support|reveal|evidence|conclude|observe)/i;

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

/** Heuristic extraction from a paper: the abstract's central claim. */
export function extractFromPaper(paper: Paper, opts: { createdBy?: string | null } = {}): CandidateFinding[] {
  const abstractSentences = sentences(paper.abstract || "");
  const claim = abstractSentences.find((s) => CLAIM_VERBS.test(s)) ?? abstractSentences[0];
  if (!claim) return [];
  const wordCount = (paper.content || "").split(/\s+/).filter(Boolean).length;
  const headings = (paper.content || "").split("\n").filter((l) => /^#{1,3}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").trim()).slice(0, 20);
  const simulated = /simulat/i.test(paper.abstract || "") || /deterministic (agent )?(signaling )?simulation/i.test(paper.content || "");
  return [{
    title: paper.title,
    claim: claim.slice(0, 600),
    summary: abstractSentences.slice(0, 3).join(" ").slice(0, 1200) + (simulated ? ` ${SIMULATION_DISCLOSURE}` : ""),
    evidence: { paperId: paper.id, status: paper.status, wordCount, headings, publishedAt: paper.publishedAt },
    category: paper.category,
    tags: [paper.category, "paper", simulated ? "simulated" : "narrative"],
    confidence: paper.status === "published" ? 55 : 45,
    simulated,
    source: "paper",
    paperId: paper.id,
    createdBy: opts.createdBy ?? null,
  }];
}

/** Persist candidates, skipping any whose content hash already exists. */
export async function persistCandidates(candidates: CandidateFinding[]): Promise<{ created: Finding[]; skipped: number }> {
  const created: Finding[] = [];
  let skipped = 0;
  for (const c of candidates) {
    const contentHash = findingContentHash({ title: c.title, claim: c.claim, evidence: c.evidence });
    const existing = await loopStorage.getFindingByHash(contentHash);
    if (existing) { skipped += 1; continue; }
    const insert: InsertFinding = {
      title: c.title,
      claim: c.claim,
      summary: c.summary ?? null,
      evidence: c.evidence,
      category: c.category,
      tags: c.tags,
      confidence: Math.max(0, Math.min(100, Math.round(c.confidence))),
      novelty: null,
      simulated: c.simulated,
      contentHash,
      status: "candidate",
      source: c.source,
      vettingSummary: null,
      paperId: c.paperId ?? null,
      experimentId: c.experimentId ?? null,
      studyDesignId: c.studyDesignId ?? null,
      createdBy: c.createdBy ?? null,
    };
    created.push(await loopStorage.createFinding(insert));
  }
  return { created, skipped };
}
