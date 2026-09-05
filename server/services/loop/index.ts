import type { Delivery, FeedbackEvent, Finding, StudyDesignRecord } from "@shared/schema";
import { loopStorage } from "../../loop-storage";
import { storage } from "../../storage";
import { studyGenerator } from "./study-generator";
import { vettingPipeline, type VettingSummary } from "./vetting";
import { router, type RouteDecision } from "./router";
import { deliveryWorker } from "./delivery";
import { feedbackService } from "./feedback";
import { extractFromPaper, persistCandidates } from "./findings-extractor";

export { studyGenerator } from "./study-generator";
export { vettingPipeline } from "./vetting";
export { router } from "./router";
export { deliveryWorker } from "./delivery";
export { feedbackService } from "./feedback";

/**
 * Discovery Loop facade.
 *
 *   generate study ─► preregister ─► launch/run ─► findings
 *        ▲                                            │
 *        │                                            ▼
 *   feedback ◄─── deliveries ◄─── routing ◄─── vetting (auto + human)
 *
 * `processFinding` is the one-call path: vet, and if vetted, route and attempt
 * delivery immediately (the worker retries anything that fails).
 */
export class DiscoveryLoop {
  async processFinding(findingId: string): Promise<{ finding: Finding; summary: VettingSummary; decisions: RouteDecision[]; deliveries: Delivery[] }> {
    const vetted = await vettingPipeline.vet(findingId);
    if (vetted.finding.status !== "vetted" && vetted.finding.status !== "routed" && vetted.finding.status !== "delivered") {
      return { finding: vetted.finding, summary: vetted.summary, decisions: [], deliveries: [] };
    }
    const routed = await router.route(findingId);
    const attempted: Delivery[] = [];
    for (const d of routed.deliveries) attempted.push(await deliveryWorker.attempt(d.id));
    const finding = (await loopStorage.getFinding(findingId)) ?? routed.finding;
    return { finding, summary: vetted.summary, decisions: routed.decisions, deliveries: attempted };
  }

  /** Route + deliver a finding that has already been vetted (e.g. after human approval). */
  async dispatch(findingId: string): Promise<{ finding: Finding; decisions: RouteDecision[]; deliveries: Delivery[] }> {
    const routed = await router.route(findingId);
    const attempted: Delivery[] = [];
    for (const d of routed.deliveries) attempted.push(await deliveryWorker.attempt(d.id));
    const finding = (await loopStorage.getFinding(findingId)) ?? routed.finding;
    return { finding, decisions: routed.decisions, deliveries: attempted };
  }

  /** Create candidate findings from a paper (manual reverse-discovery entry point). */
  async findingsFromPaper(paperId: string, actorId?: string | null): Promise<{ created: Finding[]; skipped: number }> {
    const paper = await storage.getPaper(paperId);
    if (!paper) throw new Error("Paper not found");
    return persistCandidates(extractFromPaper(paper, { createdBy: actorId ?? null }));
  }

  /** Lineage graph around a finding: its study, ancestors, feedback, and the studies feedback spawned. */
  async lineage(findingId: string): Promise<LineageGraph> {
    const finding = await loopStorage.getFinding(findingId);
    if (!finding) throw new Error("Finding not found");
    const nodes = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    const addNode = (n: LineageNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); };
    const findingNode = (f: Finding): LineageNode => ({ id: `finding:${f.id}`, type: "finding", label: f.title, status: f.status, ref: f.id, simulated: f.simulated, confidence: f.confidence });
    const designNode = (d: StudyDesignRecord): LineageNode => ({ id: `design:${d.id}`, type: "design", label: d.title, status: d.status, ref: d.id, generation: d.generation });
    const feedbackNode = (e: FeedbackEvent): LineageNode => ({ id: `feedback:${e.id}`, type: "feedback", label: e.kind, status: e.spawnedDesignId ? "spawned" : "recorded", ref: e.id });

    addNode(findingNode(finding));

    // Ancestors: the finding's design and its parent chain.
    let designId = finding.studyDesignId;
    let childId = `finding:${finding.id}`;
    const seen = new Set<string>();
    while (designId && !seen.has(designId)) {
      seen.add(designId);
      const d = await loopStorage.getStudyDesign(designId);
      if (!d) break;
      addNode(designNode(d));
      edges.push({ from: `design:${d.id}`, to: childId, kind: "produced" });
      for (const src of d.sourceFindingIds ?? []) {
        const sf = await loopStorage.getFinding(src);
        if (sf) { addNode(findingNode(sf)); edges.push({ from: `finding:${sf.id}`, to: `design:${d.id}`, kind: "informed" }); }
      }
      childId = `design:${d.id}`;
      designId = d.parentDesignId;
    }

    // Descendants: feedback on this finding, the designs it spawned, and their findings.
    const events = await loopStorage.listFeedbackEvents({ findingId: finding.id, limit: 100 });
    for (const e of events) {
      addNode(feedbackNode(e));
      edges.push({ from: `finding:${finding.id}`, to: `feedback:${e.id}`, kind: "received" });
      if (e.spawnedDesignId) {
        const d = await loopStorage.getStudyDesign(e.spawnedDesignId);
        if (d) {
          addNode(designNode(d));
          edges.push({ from: `feedback:${e.id}`, to: `design:${d.id}`, kind: "spawned" });
          for (const f of await loopStorage.listFindings({ studyDesignId: d.id, limit: 50 })) {
            addNode(findingNode(f));
            edges.push({ from: `design:${d.id}`, to: `finding:${f.id}`, kind: "produced" });
          }
        }
      }
    }

    // Sibling findings from the same design.
    if (finding.studyDesignId) {
      for (const f of await loopStorage.listFindings({ studyDesignId: finding.studyDesignId, limit: 50 })) {
        if (f.id === finding.id) continue;
        addNode(findingNode(f));
        edges.push({ from: `design:${finding.studyDesignId}`, to: `finding:${f.id}`, kind: "produced" });
      }
    }

    return { root: `finding:${finding.id}`, nodes: Array.from(nodes.values()), edges };
  }

  async stats(): Promise<LoopStats> {
    const [findingsByStatus, deliveriesByStatus, channels, feedback, designs] = await Promise.all([
      loopStorage.countFindingsByStatus(),
      loopStorage.countDeliveriesByStatus(),
      loopStorage.listChannels(),
      loopStorage.listFeedbackEvents({ limit: 1000 }),
      loopStorage.listStudyDesigns({ limit: 1000 }),
    ]);
    const designsByStatus: Record<string, number> = {};
    for (const d of designs) designsByStatus[d.status] = (designsByStatus[d.status] ?? 0) + 1;
    const closures = feedback.filter((e) => e.spawnedDesignId).length;
    const maxGeneration = designs.reduce((m, d) => Math.max(m, d.generation), 0);
    return {
      findingsByStatus,
      deliveriesByStatus,
      designsByStatus,
      channels: { total: channels.length, active: channels.filter((c) => c.active).length },
      feedback: { total: feedback.length, closures },
      maxGeneration,
    };
  }
}

export interface LineageNode {
  id: string;
  type: "finding" | "design" | "feedback";
  label: string;
  status: string;
  ref: string;
  simulated?: boolean;
  confidence?: number;
  generation?: number;
}
export interface LineageEdge { from: string; to: string; kind: "produced" | "informed" | "received" | "spawned" }
export interface LineageGraph { root: string; nodes: LineageNode[]; edges: LineageEdge[] }
export interface LoopStats {
  findingsByStatus: Record<string, number>;
  deliveriesByStatus: Record<string, number>;
  designsByStatus: Record<string, number>;
  channels: { total: number; active: number };
  feedback: { total: number; closures: number };
  maxGeneration: number;
}

export const discoveryLoop = new DiscoveryLoop();
