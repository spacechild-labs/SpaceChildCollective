import type { Finding, StudyDesignRecord } from "@shared/schema";

/**
 * Pure helpers for the Kannaka constellation integration. No I/O here so the
 * wire formats and mappings are unit-testable without a bus.
 *
 * Wire formats (from kannaka-memory source, verified live 2026-09-05):
 *   KANNAKA.recall.<agent>   request {query, top_k}      reply {from, query, results:[{id, content, similarity, strength, age_hours, phase}]}
 *   KANNAKA.ask.<agent>      request {text, mode}        reply {from, text | error, mode_used}
 *   KANNAKA.presence.<agent> heartbeat {agent_id, display_name, memory_count, kannaka_version, capabilities, ...}
 *   KANNAKA.consciousness    {agent_id, phi, xi, order, consciousness_level, total_memories, num_clusters, hemispheric_divergence, ...}
 *   KANNAKA.memory.new       {agent_id, memory:{content, ...}, memory_count, cluster_count}
 *   KANNAKA.inbox.<agent>    {msg_id, from, to, verb, args, ts}   (audited on KANNAKA.inbox.audit)
 */

export const SPACECHILD_SUBJECTS = {
  studyPreregistered: "SPACECHILD.study.preregistered",
  studySpawned: "SPACECHILD.study.spawned",
  findingCandidate: "SPACECHILD.finding.candidate",
  findingVetted: "SPACECHILD.finding.vetted",
  findingRejected: "SPACECHILD.finding.rejected",
  findingDelivered: "SPACECHILD.finding.delivered",
  feedbackReceived: "SPACECHILD.feedback.received",
  /** Swarm agents talk back here: {finding_id, kind, text?, agent_id} */
  feedbackInbound: "SPACECHILD.feedback.inbound",
  /** A falsifiable preregistered hypothesis, shaped for GhostSignals' propose_prediction. */
  marketProposal: "SPACECHILD.market.proposal",
} as const;

export interface ConsciousnessSnapshot {
  agentId: string;
  phi: number | null;
  xi: number | null;
  order: number | null;
  level: string | null;
  totalMemories: number | null;
  clusters: number | null;
  hemisphericDivergence: number | null;
  observedAt: string;
}

/** Normalize a KANNAKA.consciousness payload (or the KV `state` value) into a stable shape. */
export function normalizeConsciousness(raw: any): ConsciousnessSnapshot | null {
  const m = raw?.metrics ?? raw;
  if (!m || typeof m !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    agentId: String(m.agent_id ?? "unknown"),
    phi: num(m.phi),
    xi: num(m.xi),
    order: num(m.order),
    level: typeof m.consciousness_level === "string" ? m.consciousness_level : null,
    totalMemories: num(m.total_memories),
    clusters: num(m.num_clusters),
    hemisphericDivergence: num(m.hemispheric_divergence),
    observedAt: typeof m.timestamp === "string" ? m.timestamp : new Date().toISOString(),
  };
}

export interface PresenceEntry {
  agentId: string;
  displayName: string;
  memoryCount: number | null;
  version: string | null;
  capabilities: Record<string, boolean>;
  lastSeen: string;
}

export function normalizePresence(raw: any, subject?: string): PresenceEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const agentId = String(raw.agent_id ?? subject?.split(".").pop() ?? "");
  if (!agentId) return null;
  return {
    agentId,
    displayName: String(raw.display_name ?? agentId),
    memoryCount: typeof raw.memory_count === "number" ? raw.memory_count : null,
    version: typeof raw.kannaka_version === "string" ? raw.kannaka_version : null,
    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : {},
    lastSeen: typeof raw.last_seen === "string" ? raw.last_seen : new Date().toISOString(),
  };
}

export interface RecallHit {
  id: string;
  content: string;
  similarity: number;
  strength: number;
  ageHours: number | null;
}

export function normalizeRecall(raw: any): { from: string; results: RecallHit[] } {
  const results: RecallHit[] = Array.isArray(raw?.results)
    ? raw.results
        .filter((r: any) => r && typeof r.content === "string")
        .map((r: any) => ({
          id: String(r.id ?? r.memory_id ?? ""),
          content: String(r.content),
          similarity: Number(r.similarity ?? 0),
          strength: Number(r.strength ?? 0),
          ageHours: typeof r.age_hours === "number" ? r.age_hours : null,
        }))
    : [];
  return { from: String(raw?.from ?? "unknown"), results };
}

/** Turn recall hits into short context lines for the study designer (title-ish first line). */
export function recallToContextLines(hits: RecallHit[], minSimilarity = 0.0, max = 6): string[] {
  return hits
    .filter((h) => h.similarity >= minSimilarity)
    .slice(0, max)
    .map((h) => {
      const first = h.content.split("\n")[0].trim();
      return `Kannaka memory ${h.id.slice(0, 8)} (sim ${h.similarity.toFixed(3)}): ${first.slice(0, 220)}`;
    });
}

/** The witness attached to a finding or preregistration: the constellation's state at that moment. */
export interface ConstellationWitness {
  observedAt: string;
  consciousness: ConsciousnessSnapshot | null;
  presentAgents: string[];
  presentCount: number;
}

export function buildWitness(consciousness: ConsciousnessSnapshot | null, presence: PresenceEntry[], now = new Date()): ConstellationWitness {
  const present = presence
    .filter((p) => now.getTime() - new Date(p.lastSeen).getTime() < 10 * 60_000)
    .map((p) => p.agentId)
    .sort();
  return { observedAt: now.toISOString(), consciousness, presentAgents: present, presentCount: present.length };
}

const FINDING_TAG = /\[SpaceChild finding ([0-9a-f-]{8,36})\]/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Finding ids referenced in free text (a swarm memory, a DM). Tagged form first, bare UUIDs as fallback. */
export function findingIdsInText(text: string, knownIds?: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(FINDING_TAG)) out.add(m[1].toLowerCase());
  if (knownIds) for (const m of text.matchAll(UUID)) if (knownIds.has(m[0].toLowerCase())) out.add(m[0].toLowerCase());
  return [...out];
}

/** KANNAKA.inbox.<agent> message carrying a finding to a specific node. */
export function buildInboxMessage(finding: Finding, to: string, from = "spacechild-collective") {
  const ev: any = finding.evidence ?? {};
  return {
    msg_id: `scc-${finding.id}-${Date.now().toString(36)}`,
    from,
    to,
    verb: "spacechild.finding",
    args: {
      finding_id: finding.id,
      title: finding.title,
      claim: finding.claim,
      confidence: finding.confidence,
      simulated: finding.simulated,
      category: finding.category,
      n: ev.n ?? null,
      p_value: ev.pValue ?? null,
      content_hash: finding.contentHash,
    },
    ts: new Date().toISOString(),
  };
}

export interface MarketProposal {
  statement: string;
  settles_by: string;
  category: string;
  source: { studyId: string; preregistrationHash: string | null; hypothesisId: string | null };
}

/**
 * Shape a preregistered study's confirmatory hypothesis as a GhostSignals
 * proposal: one falsifiable statement (≤ 500 chars) and a settle-by date.
 * The Labs curate and open it; the collective cannot trade its own proposal.
 */
export function marketProposalFromDesign(study: StudyDesignRecord, opts: { settleDays?: number; now?: Date } = {}): MarketProposal | null {
  const design: any = study.design ?? {};
  const hyps: any[] = Array.isArray(design.hypotheses) ? design.hypotheses : [];
  const h1 = hyps.find((h) => h && typeof h.statement === "string" && !/^no\b|\bno significant\b/i.test(h.statement)) ?? hyps[0];
  const claim: string | undefined = h1?.statement ?? design.primaryQuestion;
  if (!claim) return null;
  const now = opts.now ?? new Date();
  const settle = new Date(now.getTime() + (opts.settleDays ?? 14) * 86_400_000);
  const statement = `Preregistered study "${study.title}" will find: ${claim}`.slice(0, 500);
  return {
    statement,
    settles_by: settle.toISOString().slice(0, 10),
    category: "consciousness",
    source: { studyId: study.id, preregistrationHash: study.preregistrationHash, hypothesisId: h1?.id ?? null },
  };
}

/** Compact event payloads published on SPACECHILD.* — never raw trials, never secrets. */
export function findingEventPayload(finding: Finding, extra: Record<string, unknown> = {}) {
  const ev: any = finding.evidence ?? {};
  return {
    finding_id: finding.id,
    title: finding.title,
    claim: finding.claim,
    category: finding.category,
    tags: finding.tags ?? [],
    confidence: finding.confidence,
    novelty: finding.novelty,
    simulated: finding.simulated,
    status: finding.status,
    n: ev.n ?? null,
    p_value: ev.pValue ?? null,
    effect_size: ev.effectSize ?? null,
    content_hash: finding.contentHash,
    study_design_id: finding.studyDesignId,
    experiment_id: finding.experimentId,
    ts: new Date().toISOString(),
    ...extra,
  };
}

export function studyEventPayload(study: StudyDesignRecord, extra: Record<string, unknown> = {}) {
  return {
    study_id: study.id,
    title: study.title,
    paradigm: study.paradigm,
    status: study.status,
    generation: study.generation,
    parent_design_id: study.parentDesignId,
    preregistration_hash: study.preregistrationHash,
    ts: new Date().toISOString(),
    ...extra,
  };
}
