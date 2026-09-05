import type { Finding, VettingReview, VettingVerdict } from "@shared/schema";
import { loopStorage } from "../../loop-storage";
import { findingContentHash } from "./canonical";

/**
 * Vetting pipeline. A finding must survive the automated checks below and, by
 * default, a human approval before it can be routed anywhere. Every check
 * writes its own review row so the audit trail is complete and re-runnable.
 *
 * Verdicts: "pass" (ok), "flag" (routable, but consumers are warned), "fail"
 * (not routable). One fail rejects the finding.
 */

export interface CheckResult {
  check: string;
  verdict: VettingVerdict;
  score?: number; // 0-100 where meaningful
  notes: string;
  details?: Record<string, unknown>;
}

export interface VettingPolicy {
  minTrials: number; // Minimum n for statistical evidence
  requireHumanApproval: boolean;
  duplicateSimilarity: number; // Jaccard ≥ this ⇒ duplicate (fail)
  nearDuplicateSimilarity: number; // Jaccard ≥ this ⇒ flag
}

export function policyFromEnv(): VettingPolicy {
  return {
    minTrials: Number(process.env.LOOP_MIN_TRIALS ?? 10),
    requireHumanApproval: (process.env.LOOP_REQUIRE_HUMAN_APPROVAL ?? "true") !== "false",
    duplicateSimilarity: Number(process.env.LOOP_DUPLICATE_SIMILARITY ?? 0.9),
    nearDuplicateSimilarity: Number(process.env.LOOP_NEAR_DUPLICATE_SIMILARITY ?? 0.6),
  };
}

// ---------------------------------------------------------------------------
// Statistics helpers (self-contained so checks can be unit-tested without the DB)
// ---------------------------------------------------------------------------

export function normalCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function zForProportion(observed: number, baseline: number, n: number): number {
  const se = Math.sqrt((baseline * (1 - baseline)) / n);
  return se === 0 ? 0 : (observed - baseline) / se;
}

export function twoTailedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9%.\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ---------------------------------------------------------------------------
// Automated checks
// ---------------------------------------------------------------------------

type FindingLike = Pick<Finding, "id" | "title" | "claim" | "summary" | "evidence" | "category" | "simulated" | "contentHash" | "confidence">;

export function checkSchema(f: FindingLike): CheckResult {
  const problems: string[] = [];
  if (!f.title || f.title.trim().length < 3) problems.push("title missing");
  if (!f.claim || f.claim.trim().length < 10) problems.push("claim too short to be falsifiable");
  if (!f.category) problems.push("category missing");
  if (!f.evidence || typeof f.evidence !== "object" || Object.keys(f.evidence as object).length === 0) problems.push("evidence missing");
  if (f.confidence < 0 || f.confidence > 100) problems.push("confidence out of range");
  const expectedHash = findingContentHash({ title: f.title, claim: f.claim, evidence: f.evidence });
  if (f.contentHash !== expectedHash) problems.push("content hash does not match content (tampered or stale)");
  return problems.length
    ? { check: "schema", verdict: "fail", notes: problems.join("; "), details: { problems } }
    : { check: "schema", verdict: "pass", notes: "well-formed finding with matching content hash" };
}

const POSITIVE_CLAIM = /\b(evidence (suggests|supports|indicates)|supports? the hypothesis|significant(ly)? (above|greater|higher)|demonstrat|reveals?|shows? (that|a|an) (significant|strong|clear))/i;

export function checkStatsIntegrity(f: FindingLike, policy: VettingPolicy): CheckResult {
  const ev: any = f.evidence ?? {};
  const hasStats = ev.pValue != null || ev.n != null || ev.observedRate != null;
  if (!hasStats) return { check: "stats_integrity", verdict: "flag", notes: "no quantitative evidence supplied; treated as narrative", details: {} };

  const problems: string[] = [];
  const details: Record<string, unknown> = {};
  const n = Number(ev.n);
  if (!Number.isFinite(n) || n < policy.minTrials) problems.push(`n=${ev.n} is below the minimum of ${policy.minTrials}`);

  if (ev.pValue != null) {
    const p = Number(ev.pValue);
    if (!Number.isFinite(p) || p < 0 || p > 1) problems.push(`pValue=${ev.pValue} is not a probability`);
    if (ev.significantAtAlpha05 === true && p >= 0.05) problems.push("claims significance at α=0.05 but p ≥ 0.05");
    if (POSITIVE_CLAIM.test(f.claim) && Number.isFinite(p) && p >= 0.05) problems.push("claim asserts a positive effect but p ≥ 0.05");
  }

  // Assert SEPARATION, not just range: recompute z and p from the reported proportions.
  if (ev.observedRate != null && ev.baselineRate != null && Number.isFinite(n) && n > 0) {
    const observed = Number(ev.observedRate), baseline = Number(ev.baselineRate);
    if (observed < 0 || observed > 1 || baseline <= 0 || baseline >= 1) {
      problems.push("rates must be proportions in (0,1)");
    } else {
      const z = zForProportion(observed, baseline, n);
      const p = twoTailedP(z);
      details.recomputed = { z: Number(z.toFixed(4)), p: Number(p.toFixed(6)) };
      if (ev.zScore != null && Math.abs(Number(ev.zScore) - z) > 0.05) problems.push(`reported z=${ev.zScore} disagrees with recomputed z=${z.toFixed(3)}`);
      if (ev.pValue != null && Math.abs(Number(ev.pValue) - p) > 0.01) problems.push(`reported p=${ev.pValue} disagrees with recomputed p=${p.toFixed(4)}`);
      if (ev.detections != null && Math.abs(Number(ev.detections) / n - observed) > 1e-3) problems.push("detections/n does not equal observedRate");
    }
  }

  if (problems.length) return { check: "stats_integrity", verdict: "fail", notes: problems.join("; "), details: { ...details, problems } };
  return { check: "stats_integrity", verdict: "pass", notes: "reported statistics are internally consistent", details };
}

export function checkReproducibility(f: FindingLike): CheckResult {
  const ev: any = f.evidence ?? {};
  const raw: any[] = Array.isArray(ev.rawTrials) ? ev.rawTrials : [];
  if (raw.length === 0) return { check: "reproducibility", verdict: "flag", notes: "no raw trial data attached; summary statistics cannot be recomputed", details: {} };
  const detections = raw.filter((t) => t && t.detected === true).length;
  const n = raw.length;
  const rate = detections / n;
  const problems: string[] = [];
  if (ev.n != null && Number(ev.n) !== n) problems.push(`raw trial count ${n} ≠ reported n=${ev.n}`);
  if (ev.detections != null && Number(ev.detections) !== detections) problems.push(`raw detections ${detections} ≠ reported ${ev.detections}`);
  if (ev.observedRate != null && Math.abs(Number(ev.observedRate) - rate) > 1e-3) problems.push(`raw hit rate ${rate.toFixed(4)} ≠ reported ${ev.observedRate}`);
  const ids = raw.map((t) => t?.trialId).filter(Boolean);
  if (new Set(ids).size !== ids.length) problems.push("duplicate trial ids in raw data");
  const details = { rawN: n, rawDetections: detections, rawRate: Number(rate.toFixed(4)) };
  return problems.length
    ? { check: "reproducibility", verdict: "fail", notes: problems.join("; "), details: { ...details, problems } }
    : { check: "reproducibility", verdict: "pass", score: 100, notes: `summary statistics reproduced from ${n} raw trials`, details };
}

type NoveltyPeer = Pick<Finding, "id" | "claim" | "status"> & Partial<Pick<Finding, "experimentId">>;

/**
 * Novelty. An identical claim backed by the SAME experiment is a duplicate and
 * fails. An identical claim from a DIFFERENT experiment is a replication — the
 * most valuable thing a loop can produce — so it is flagged and linked, never
 * rejected. The score (0-100) is 1 − max similarity.
 */
export function checkNovelty(f: FindingLike & Partial<Pick<Finding, "experimentId">>, others: NoveltyPeer[], policy: VettingPolicy): CheckResult {
  const mine = tokenize(f.claim);
  let maxSim = 0;
  let nearest: NoveltyPeer | null = null;
  for (const o of others) {
    if (o.id === f.id || o.status === "rejected" || o.status === "archived") continue;
    const sim = jaccard(mine, tokenize(o.claim));
    if (sim > maxSim) { maxSim = sim; nearest = o; }
  }
  const score = Math.round((1 - maxSim) * 100);
  const details: Record<string, unknown> = { maxSimilarity: Number(maxSim.toFixed(3)), nearestFindingId: nearest?.id ?? null };
  if (nearest && maxSim >= policy.duplicateSimilarity) {
    const sameExperiment = Boolean(f.experimentId) && nearest.experimentId === f.experimentId;
    if (sameExperiment) return { check: "novelty", verdict: "fail", score, notes: `duplicate of finding ${nearest.id} from the same experiment (similarity ${maxSim.toFixed(2)})`, details };
    details.replicates = nearest.id;
    return { check: "novelty", verdict: "flag", score, notes: `replicates finding ${nearest.id} with independent evidence (similarity ${maxSim.toFixed(2)})`, details };
  }
  if (nearest && maxSim >= policy.nearDuplicateSimilarity) return { check: "novelty", verdict: "flag", score, notes: `near-duplicate of finding ${nearest.id} (similarity ${maxSim.toFixed(2)})`, details };
  return { check: "novelty", verdict: "pass", score, notes: nearest ? `nearest existing finding has similarity ${maxSim.toFixed(2)}` : "no comparable findings on record", details };
}

export function checkSimulationDisclosure(f: FindingLike): CheckResult {
  const ev: any = f.evidence ?? {};
  const looksSimulated = f.simulated || /simulat|deterministic/i.test(String(ev.trialDataSource ?? ""));
  if (!looksSimulated) return { check: "simulation_disclosure", verdict: "pass", notes: "evidence is not marked as simulated" };
  const disclosed = /simulat/i.test(`${f.claim} ${f.summary ?? ""}`);
  if (!f.simulated) return { check: "simulation_disclosure", verdict: "fail", notes: "evidence source is a simulation but the finding is not flagged simulated", details: { trialDataSource: ev.trialDataSource } };
  if (!disclosed) return { check: "simulation_disclosure", verdict: "fail", notes: "simulated finding does not disclose the simulation in its claim or summary" };
  return { check: "simulation_disclosure", verdict: "flag", notes: "simulated evidence, disclosed; routable only to channels that accept simulated findings" };
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, "API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\b0x[a-fA-F0-9]{64}\b/, "64-byte hex secret"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, "AWS access key"],
];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function checkSafety(f: FindingLike): CheckResult {
  const text = `${f.title}\n${f.claim}\n${f.summary ?? ""}\n${JSON.stringify(f.evidence ?? {})}`;
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) return { check: "safety", verdict: "fail", notes: `contains what looks like a ${label}` };
  if (EMAIL.test(`${f.claim} ${f.summary ?? ""}`)) return { check: "safety", verdict: "flag", notes: "contains an email address; verify no personal data is being shared" };
  if (text.length > 200_000) return { check: "safety", verdict: "fail", notes: "finding is too large to distribute" };
  return { check: "safety", verdict: "pass", notes: "no secrets or personal data patterns detected" };
}

export function runAutomatedChecks(f: FindingLike, others: Pick<Finding, "id" | "claim" | "status">[], policy: VettingPolicy): CheckResult[] {
  return [
    checkSchema(f),
    checkStatsIntegrity(f, policy),
    checkReproducibility(f),
    checkNovelty(f, others, policy),
    checkSimulationDisclosure(f),
    checkSafety(f),
  ];
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface VettingSummary {
  outcome: "vetted" | "rejected" | "awaiting_human";
  fails: string[];
  flags: string[];
  passes: string[];
  humanApproved: boolean;
  agentReviews: number;
  novelty: number | null;
  vettedAt: string;
}

export function summarize(reviews: Pick<VettingReview, "check" | "verdict" | "reviewerType" | "score">[], policy: VettingPolicy): VettingSummary {
  const fails = reviews.filter((r) => r.verdict === "fail").map((r) => r.check);
  const flags = reviews.filter((r) => r.verdict === "flag").map((r) => r.check);
  const passes = reviews.filter((r) => r.verdict === "pass").map((r) => r.check);
  const humanApproved = reviews.some((r) => r.reviewerType === "human" && r.check === "human_approval" && r.verdict === "pass");
  const agentReviews = reviews.filter((r) => r.reviewerType === "agent").length;
  const noveltyRow = reviews.find((r) => r.check === "novelty");
  const novelty = noveltyRow?.score ?? null;
  let outcome: VettingSummary["outcome"];
  if (fails.length) outcome = "rejected";
  else if (policy.requireHumanApproval && !humanApproved) outcome = "awaiting_human";
  else outcome = "vetted";
  return { outcome, fails, flags, passes, humanApproved, agentReviews, novelty, vettedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Pipeline (DB-backed)
// ---------------------------------------------------------------------------

export class VettingPipeline {
  constructor(private readonly policy: VettingPolicy = policyFromEnv()) {}

  /** Run (or re-run) the automated checks and recompute the finding's status. */
  async vet(findingId: string): Promise<{ finding: Finding; summary: VettingSummary; reviews: VettingReview[] }> {
    const finding = await loopStorage.getFinding(findingId);
    if (!finding) throw new Error("Finding not found");
    if (finding.status === "archived") throw new Error("Finding is archived");

    await loopStorage.deleteAutomatedReviews(findingId);
    const others = await loopStorage.listFindings({ limit: 1000 });
    const results = runAutomatedChecks(finding, others, this.policy);
    for (const r of results) {
      await loopStorage.createVettingReview({
        findingId,
        reviewerType: "automated",
        reviewerId: null,
        check: r.check,
        verdict: r.verdict,
        score: r.score ?? null,
        notes: r.notes,
        details: r.details ?? null,
      });
    }
    return this.recompute(findingId);
  }

  /** Record a human or agent review and recompute status. */
  async review(findingId: string, input: { reviewerType: "human" | "agent"; reviewerId: string | null; verdict: VettingVerdict; notes?: string; score?: number }): Promise<{ finding: Finding; summary: VettingSummary; reviews: VettingReview[] }> {
    const finding = await loopStorage.getFinding(findingId);
    if (!finding) throw new Error("Finding not found");
    await loopStorage.createVettingReview({
      findingId,
      reviewerType: input.reviewerType,
      reviewerId: input.reviewerId,
      check: input.reviewerType === "human" ? "human_approval" : "peer_review",
      verdict: input.verdict,
      score: input.score ?? null,
      notes: input.notes ?? null,
      details: null,
    });
    return this.recompute(findingId);
  }

  private async recompute(findingId: string) {
    const reviews = await loopStorage.listVettingReviews(findingId);
    const summary = summarize(reviews, this.policy);
    const current = await loopStorage.getFinding(findingId);
    if (!current) throw new Error("Finding not found");
    // Do not regress a finding that has already been routed/delivered unless it now fails.
    const downstream = current.status === "routed" || current.status === "delivered";
    let status = current.status;
    if (summary.outcome === "rejected") status = "rejected";
    else if (summary.outcome === "awaiting_human") status = downstream ? current.status : "vetting";
    else status = downstream ? current.status : "vetted";
    const finding = await loopStorage.updateFinding(findingId, {
      status,
      novelty: summary.novelty,
      vettingSummary: summary as unknown as Record<string, unknown>,
    });
    return { finding, summary, reviews };
  }
}

export const vettingPipeline = new VettingPipeline();
