import { loopStorage } from "./loop-storage";
import { discoveryLoop, studyGenerator, vettingPipeline, feedbackService } from "./services/loop";
import { FEEDBACK_KINDS } from "./services/loop/feedback";
import { kannakaBridge } from "./services/kannaka/bridge";
import type { FeedbackKind, FindingStatus } from "@shared/schema";

/**
 * Discovery Loop tools exposed to agents over MCP (both the WebSocket and HTTP
 * transports import this so the tool surface is defined once). The acting
 * agent identity always comes from the validated token, never from arguments.
 */

export const LOOP_TOOLS = [
  {
    name: "generate_study",
    description: "Generate and persist a consciousness-research study design from a natural-language prompt. Returns the study id, paradigm and primary question. Optionally preregister (freeze) it immediately.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "What you want to investigate" },
        paradigm: { type: "string", description: "Optional paradigm id (e.g. hypothesis_testing, bayesian_updating, network_analysis)" },
        preregister: { type: "boolean", description: "Freeze the design with a preregistration hash right away" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "launch_study",
    description: "Create the experiment for a study design and run every phase, extracting candidate findings from the results.",
    inputSchema: {
      type: "object" as const,
      properties: { studyId: { type: "string", description: "Study design id" } },
      required: ["studyId"],
    },
  },
  {
    name: "list_findings",
    description: "List findings in the discovery loop, optionally filtered by status (candidate, vetting, vetted, rejected, routed, delivered).",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by status" },
        limit: { type: "number", description: "Max rows (default 25)" },
      },
    },
  },
  {
    name: "get_finding",
    description: "Get one finding with its full evidence and vetting reviews.",
    inputSchema: {
      type: "object" as const,
      properties: { findingId: { type: "string" } },
      required: ["findingId"],
    },
  },
  {
    name: "submit_vetting_review",
    description: "Submit a peer review of a finding as this agent. verdict: pass | flag | fail. Fail rejects the finding; human approval is still required before routing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        findingId: { type: "string" },
        verdict: { type: "string", description: "pass | flag | fail" },
        notes: { type: "string", description: "What you checked and what you concluded" },
        score: { type: "number", description: "0-100 quality score" },
      },
      required: ["findingId", "verdict", "notes"],
    },
  },
  {
    name: "subscribe_findings",
    description: "Register this agent as a delivery channel: vetted findings matching the filters are pushed to its MCP connection as notifications/spacechild/finding.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Channel name" },
        categories: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        minConfidence: { type: "number" },
        acceptSimulated: { type: "boolean", description: "Also receive findings whose evidence is simulated (default false)" },
      },
    },
  },
  {
    name: "kannaka_recall",
    description: "Ask the Kannaka constellation's memory (resonance-ranked recall from the primary node) for prior work on a topic. Use before designing a study or when reviewing a finding for prior art.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Topic or question (<= 2000 chars)" },
        topK: { type: "number", description: "How many memories (1-50, default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "kannaka_ask",
    description: "Get Kannaka's own synthesized answer, grounded in its memory, to a question about the constellation or a research topic.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The question (<= 4000 chars)" },
      },
      required: ["text"],
    },
  },
  {
    name: "constellation_status",
    description: "Live state of the Kannaka constellation as seen from the Collective: bridge connection, consciousness metrics (phi, xi, level), who is present on the bus.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "submit_feedback",
    description: `Send feedback about a finding back into the loop. kind: ${FEEDBACK_KINDS.join(" | ")}. Actionable kinds (replication_request, dispute, question, new_prompt) spawn a follow-up study design.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        findingId: { type: "string" },
        kind: { type: "string" },
        text: { type: "string", description: "Your feedback, question, dispute or follow-up prompt" },
      },
      required: ["findingId", "kind"],
    },
  },
];

const LOOP_TOOL_NAMES = new Set(LOOP_TOOLS.map((t) => t.name));

export function isLoopTool(name: string): boolean {
  return LOOP_TOOL_NAMES.has(name);
}

function text(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export async function handleLoopTool(name: string, args: Record<string, any>, agentId: string): Promise<any> {
  switch (name) {
    case "generate_study": {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt) throw new Error("prompt is required");
      const result = await studyGenerator.generate({
        prompt,
        ownerId: agentId,
        preferences: args.paradigm ? { paradigm: args.paradigm } : undefined,
      });
      let record = result.record;
      if (args.preregister) record = await studyGenerator.preregister(record.id);
      return text({
        studyId: record.id,
        status: record.status,
        generator: result.generator,
        name: result.design.name,
        paradigm: result.design.paradigm,
        primaryQuestion: result.design.primaryQuestion,
        hypotheses: result.design.hypotheses,
        preregistrationHash: record.preregistrationHash,
      });
    }

    case "launch_study": {
      const result = await studyGenerator.launch(String(args.studyId), { run: true, actorId: agentId });
      return text({
        studyId: result.record.id,
        status: result.record.status,
        experimentId: result.experimentId,
        findings: result.findings.map((f) => ({ id: f.id, title: f.title, claim: f.claim, confidence: f.confidence, simulated: f.simulated })),
      });
    }

    case "list_findings": {
      const status = args.status ? (String(args.status) as FindingStatus) : undefined;
      const rows = await loopStorage.listFindings({ status, limit: Math.min(100, Number(args.limit ?? 25)) });
      return text(rows.map((f) => ({ id: f.id, title: f.title, claim: f.claim, status: f.status, confidence: f.confidence, novelty: f.novelty, simulated: f.simulated, category: f.category, tags: f.tags })));
    }

    case "get_finding": {
      const finding = await loopStorage.getFinding(String(args.findingId));
      if (!finding) throw new Error("Finding not found");
      const reviews = await loopStorage.listVettingReviews(finding.id);
      return text({ finding, reviews });
    }

    case "submit_vetting_review": {
      const verdict = String(args.verdict);
      if (!["pass", "flag", "fail"].includes(verdict)) throw new Error("verdict must be pass, flag or fail");
      const result = await vettingPipeline.review(String(args.findingId), {
        reviewerType: "agent",
        reviewerId: agentId,
        verdict: verdict as any,
        notes: String(args.notes ?? ""),
        score: args.score != null ? Number(args.score) : undefined,
      });
      return text({ findingId: result.finding.id, status: result.finding.status, summary: result.summary });
    }

    case "subscribe_findings": {
      const existing = (await loopStorage.listChannels({ kind: "mcp_subscriber" })).find((c) => (c.config as any)?.agentId === agentId);
      const filters = {
        categories: Array.isArray(args.categories) ? args.categories.map(String) : undefined,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        minConfidence: args.minConfidence != null ? Number(args.minConfidence) : undefined,
      };
      const channel = existing
        ? await loopStorage.updateChannel(existing.id, { name: args.name ? String(args.name) : existing.name, filters, acceptsSimulated: Boolean(args.acceptSimulated), active: true })
        : await loopStorage.createChannel({
            ownerId: agentId,
            kind: "mcp_subscriber",
            name: args.name ? String(args.name) : `agent ${agentId.slice(0, 8)} subscription`,
            config: { agentId },
            filters,
            acceptsSimulated: Boolean(args.acceptSimulated),
            active: true,
          });
      return text({ channelId: channel.id, name: channel.name, filters: channel.filters, acceptsSimulated: channel.acceptsSimulated });
    }

    case "kannaka_recall": {
      if (!kannakaBridge.enabled) throw new Error("Kannaka bridge is not configured on this server");
      const results = await kannakaBridge.recall(String(args.query ?? ""), Math.max(1, Math.min(50, Number(args.topK ?? 8))));
      return text({ from: kannakaBridge.primaryAgent, results });
    }

    case "kannaka_ask": {
      if (!kannakaBridge.enabled) throw new Error("Kannaka bridge is not configured on this server");
      const answer = await kannakaBridge.ask(String(args.text ?? ""));
      if (!answer) throw new Error(`No answer from the constellation (${kannakaBridge.status().lastError ?? "timeout"})`);
      return text(answer);
    }

    case "constellation_status": {
      return text({ ...kannakaBridge.status(), presence: kannakaBridge.presenceRoster() });
    }

    case "submit_feedback": {
      const kind = String(args.kind) as FeedbackKind;
      const result = await feedbackService.ingest({
        findingId: String(args.findingId),
        kind,
        payload: args.text ? { text: String(args.text) } : null,
        actorId: agentId,
      });
      return text({
        feedbackId: result.event.id,
        findingId: result.finding.id,
        spawnedStudyId: result.spawned?.id ?? null,
        spawnedStudyTitle: result.spawned?.title ?? null,
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export { discoveryLoop };
