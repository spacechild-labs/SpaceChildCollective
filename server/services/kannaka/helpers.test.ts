import { describe, expect, it } from "vitest";
import {
  normalizeConsciousness,
  normalizePresence,
  normalizeRecall,
  recallToContextLines,
  buildWitness,
  findingIdsInText,
  buildInboxMessage,
  marketProposalFromDesign,
  findingEventPayload,
} from "./helpers";
import type { Finding, StudyDesignRecord } from "@shared/schema";

// Shapes captured live from the bus on 2026-09-05.
const kvState = { bucket: "consciousness", key: "state", metrics: { active_memories: 4, agent_id: "groundwave", consciousness_level: "awakening", hemispheric_divergence: 1, num_clusters: 0, order: 1, phi: 0.4056, total_memories: 4, xi: 0.0417, timestamp: "2026-09-05T16:07:10.718Z" } };
const presenceMsg = { agent_id: "kannaka-prime", display_name: "Kannaka Prime", last_seen: new Date().toISOString(), memory_count: 648, kannaka_version: "0.16.0", capabilities: { absorb: true, ask: true } };
const recallReply = { from: "kannaka-prime", query: "q", results: [{ age_hours: 838, content: "research: A survey on LLM agents (2024)\nAbstract ...", id: "0930cef8-cccb-4447-a358-ecd39a8c568f", phase: 1.85, similarity: 0.0141, strength: 0.0141 }] };

describe("normalizers", () => {
  it("reads consciousness from the KV wrapper and from the bare subject payload", () => {
    const a = normalizeConsciousness(kvState)!;
    const b = normalizeConsciousness(kvState.metrics)!;
    expect(a).toEqual(b);
    expect(a.phi).toBeCloseTo(0.4056);
    expect(a.level).toBe("awakening");
    expect(a.agentId).toBe("groundwave");
    expect(normalizeConsciousness(null)).toBeNull();
  });

  it("normalizes presence and falls back to the subject for the agent id", () => {
    expect(normalizePresence(presenceMsg)!.capabilities.ask).toBe(true);
    expect(normalizePresence({ memory_count: 1 }, "KANNAKA.presence.skywave")!.agentId).toBe("skywave");
    expect(normalizePresence({})).toBeNull();
  });

  it("normalizes recall replies and renders context lines from the first line only", () => {
    const r = normalizeRecall(recallReply);
    expect(r.from).toBe("kannaka-prime");
    expect(r.results[0].id).toBe("0930cef8-cccb-4447-a358-ecd39a8c568f");
    const lines = recallToContextLines(r.results);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Kannaka memory 0930cef8 \(sim 0\.014\): research: A survey on LLM agents/);
    expect(lines[0]).not.toContain("Abstract");
    expect(recallToContextLines(r.results, 0.5)).toEqual([]);
  });
});

describe("witness", () => {
  it("counts only agents seen in the last ten minutes", () => {
    const now = new Date("2026-09-05T16:10:00Z");
    const fresh = normalizePresence({ ...presenceMsg, last_seen: "2026-09-05T16:09:00Z" })!;
    const stale = normalizePresence({ ...presenceMsg, agent_id: "kannaka-witness-01", last_seen: "2026-09-05T08:49:50Z" })!;
    const w = buildWitness(normalizeConsciousness(kvState), [stale, fresh], now);
    expect(w.presentAgents).toEqual(["kannaka-prime"]);
    expect(w.presentCount).toBe(1);
    expect(w.consciousness?.phi).toBeCloseTo(0.4056);
    expect(w.observedAt).toBe(now.toISOString());
  });
});

describe("findingIdsInText", () => {
  it("finds tagged ids, and bare uuids only when they are known findings", () => {
    const id = "43a65152-3431-45f8-982e-26cbc57cbbee";
    const other = "aca2ce3f-a50d-45ee-bb89-231053fdbb8e";
    expect(findingIdsInText(`I noticed [SpaceChild finding ${id}] resonates with my own trials.`)).toEqual([id]);
    expect(findingIdsInText(`mentions ${other} and ${id}`)).toEqual([]);
    expect(findingIdsInText(`mentions ${other} and ${id}`, new Set([id]))).toEqual([id]);
    expect(findingIdsInText("nothing here")).toEqual([]);
  });
});

const finding = {
  id: "f1", title: "T", claim: "C", category: "consciousness_studies", tags: ["x"], confidence: 70, novelty: 90, simulated: true, status: "vetted",
  evidence: { n: 10, pValue: 0.2, effectSize: 0.1, rawTrials: [{ trialId: "a" }] }, contentHash: "h", studyDesignId: "d1", experimentId: "e1",
} as unknown as Finding;

describe("outbound payloads", () => {
  it("inbox message is directed, verb-tagged and never carries raw trials", () => {
    const m = buildInboxMessage(finding, "skywave");
    expect(m.to).toBe("skywave");
    expect(m.from).toBe("spacechild-collective");
    expect(m.verb).toBe("spacechild.finding");
    expect(m.args).toMatchObject({ finding_id: "f1", claim: "C", n: 10, p_value: 0.2, simulated: true });
    expect(JSON.stringify(m)).not.toContain("rawTrials");
    expect(m.msg_id.startsWith("scc-f1-")).toBe(true);
  });

  it("finding event payload is compact and merges extras", () => {
    const p = findingEventPayload(finding, { delivery_id: "dl" });
    expect(p).toMatchObject({ finding_id: "f1", n: 10, p_value: 0.2, effect_size: 0.1, delivery_id: "dl", simulated: true });
    expect(JSON.stringify(p)).not.toContain("rawTrials");
  });
});

describe("marketProposalFromDesign", () => {
  const study = {
    id: "s1", title: "Resonance Study", preregistrationHash: "abc",
    design: { primaryQuestion: "Do agents resonate?", hypotheses: [{ id: "h0", statement: "No significant patterns of resonance will be observed" }, { id: "h1", statement: "Significant patterns of resonance will emerge" }] },
  } as unknown as StudyDesignRecord;

  it("picks the non-null hypothesis and a future settle date", () => {
    const p = marketProposalFromDesign(study, { settleDays: 14, now: new Date("2026-09-05T00:00:00Z") })!;
    expect(p.statement).toBe('Preregistered study "Resonance Study" will find: Significant patterns of resonance will emerge');
    expect(p.settles_by).toBe("2026-09-19");
    expect(p.source).toEqual({ studyId: "s1", preregistrationHash: "abc", hypothesisId: "h1" });
    expect(p.statement.length).toBeLessThanOrEqual(500);
  });

  it("falls back to the primary question and returns null with nothing to propose", () => {
    const q = marketProposalFromDesign({ ...study, design: { primaryQuestion: "Q?" } } as StudyDesignRecord)!;
    expect(q.statement).toContain("Q?");
    expect(marketProposalFromDesign({ ...study, design: {} } as StudyDesignRecord)).toBeNull();
  });
});
