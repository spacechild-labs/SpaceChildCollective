import type { Finding, FeedbackEvent, StudyDesignRecord, StudyGenerator as GeneratorKind } from "@shared/schema";
import { aiStudyDesigner, type StudyDesign, type StudyPrompt } from "../ai-study-designer";
import { consciousnessExperimentService } from "../consciousness-experiment-service";
import { storage } from "../../storage";
import { loopStorage } from "../../loop-storage";
import { llmRefineDesign } from "./llm-designer";
import { preregistrationHash } from "./canonical";
import { publishToBase, publishToNeoX } from "../blockchain";
import { extractFromExperiment, persistCandidates } from "./findings-extractor";

/**
 * Study generation, integrated end to end:
 *
 *   prompt ──► heuristic design ──► LLM refinement (if configured) ──► persisted
 *   design ──► preregistration (canonical hash, optional on-chain anchor) ──►
 *   experiment ──► phases ──► candidate findings
 *
 * Every design records its lineage (parent design + source findings) so a study
 * spawned by feedback on a delivered finding is a first-class descendant.
 */

export interface GenerateStudyOptions {
  prompt: string;
  ownerId?: string | null;
  preferences?: StudyPrompt["preferences"];
  context?: StudyPrompt["context"];
  /** Free-text context lines given to the LLM (prior findings, feedback). */
  contextLines?: string[];
  parentDesignId?: string | null;
  sourceFindingIds?: string[];
  generation?: number;
}

export interface GenerateStudyResult {
  record: StudyDesignRecord;
  design: StudyDesign;
  generator: GeneratorKind;
  llmError?: string;
}

export class StudyGenerator {
  async generate(opts: GenerateStudyOptions): Promise<GenerateStudyResult> {
    const prompt = opts.prompt.trim();
    if (!prompt) throw new Error("A prompt is required to generate a study");

    const base = await aiStudyDesigner.designStudyFromPrompt({ prompt, preferences: opts.preferences, context: opts.context });
    const refined = await llmRefineDesign(base, prompt, { context: opts.contextLines });
    const design = refined.design;
    const generator: GeneratorKind = refined.used ? "hybrid" : "heuristic";
    design.generatedBy = "ai";

    const record = await loopStorage.createStudyDesign({
      ownerId: opts.ownerId ?? null,
      prompt,
      title: design.name,
      paradigm: design.paradigm,
      constructs: design.constructs,
      design: design as unknown as Record<string, unknown>,
      generator,
      status: "draft",
      preregistrationHash: null,
      preregisteredAt: null,
      anchor: null,
      experimentId: null,
      parentDesignId: opts.parentDesignId ?? null,
      sourceFindingIds: opts.sourceFindingIds ?? [],
      generation: opts.generation ?? 0,
    });

    return { record, design, generator, llmError: refined.error };
  }

  /**
   * Freeze the design: compute the preregistration hash over the confirmatory
   * fields and, if requested and a signing key exists, anchor it on-chain.
   */
  async preregister(id: string, opts: { anchorChain?: "base" | "neox" } = {}): Promise<StudyDesignRecord> {
    const record = await loopStorage.getStudyDesign(id);
    if (!record) throw new Error("Study design not found");
    if (record.status !== "draft") throw new Error(`Study is ${record.status}; only drafts can be preregistered`);

    const hash = preregistrationHash(record.design as Record<string, unknown>);
    let anchor: Record<string, unknown> | null = null;
    if (opts.anchorChain) {
      const req = { paperHash: hash, title: `PREREG ${record.title}`, authors: ["Space Child Research Collective"], timestamp: new Date() };
      const result = opts.anchorChain === "base" ? await publishToBase(req) : await publishToNeoX(req);
      anchor = { chain: result.chain, transactionHash: result.transactionHash, blockNumber: result.blockNumber, gasUsed: result.gasUsed };
    }

    const design = { ...(record.design as Record<string, unknown>), preregistration: true };
    return loopStorage.updateStudyDesign(id, {
      design,
      status: "preregistered",
      preregistrationHash: hash,
      preregisteredAt: new Date(),
      anchor,
    });
  }

  /** Verify a preregistered design has not drifted since it was frozen. */
  async verifyPreregistration(id: string): Promise<{ ok: boolean; expected: string | null; actual: string }> {
    const record = await loopStorage.getStudyDesign(id);
    if (!record) throw new Error("Study design not found");
    const actual = preregistrationHash(record.design as Record<string, unknown>);
    return { ok: record.preregistrationHash === actual, expected: record.preregistrationHash, actual };
  }

  /**
   * Create the experiment for a design and optionally run every phase, then
   * extract candidate findings from the results.
   */
  async launch(id: string, opts: { run?: boolean; actorId?: string | null } = {}): Promise<{ record: StudyDesignRecord; experimentId: string; findings: Finding[] }> {
    const record = await loopStorage.getStudyDesign(id);
    if (!record) throw new Error("Study design not found");
    if (record.status === "archived") throw new Error("Study is archived");

    const design = record.design as unknown as StudyDesign;
    let experimentId = record.experimentId;
    if (!experimentId) {
      const config = await aiStudyDesigner.convertToExperimentConfig(design);
      experimentId = await consciousnessExperimentService.createExperiment(config);
      const experiment = await storage.getConsciousnessExperiment(experimentId);
      if (experiment) {
        const observations = (experiment.observations as any) || {};
        observations.aiDesign = design;
        observations.studyDesignId = record.id;
        observations.preregistrationHash = record.preregistrationHash;
        await storage.updateConsciousnessExperiment(experimentId, { observations, preregistered: Boolean(record.preregistrationHash) });
      }
    }

    let updated = await loopStorage.updateStudyDesign(id, { experimentId, status: "running" });
    let created: Finding[] = [];

    if (opts.run) {
      const experiment = await storage.getConsciousnessExperiment(experimentId);
      const phases: any[] = ((experiment?.observations as any)?.phases ?? []) as any[];
      for (let i = 0; i < phases.length; i++) {
        await consciousnessExperimentService.runPhase(experimentId, i);
      }
      const finished = await storage.getConsciousnessExperiment(experimentId);
      if (finished) {
        const candidates = extractFromExperiment(finished, { studyDesignId: record.id, createdBy: opts.actorId ?? null, paradigm: record.paradigm });
        created = (await persistCandidates(candidates)).created;
      }
      updated = await loopStorage.updateStudyDesign(id, { status: "concluded" });
    }

    return { record: updated, experimentId, findings: created };
  }

  /** Extract (or re-extract) findings for an already-run experiment linked to a design. */
  async harvest(id: string, actorId?: string | null): Promise<Finding[]> {
    const record = await loopStorage.getStudyDesign(id);
    if (!record?.experimentId) throw new Error("Study has no experiment to harvest");
    const experiment = await storage.getConsciousnessExperiment(record.experimentId);
    if (!experiment) throw new Error("Experiment not found");
    const candidates = extractFromExperiment(experiment, { studyDesignId: record.id, createdBy: actorId ?? null, paradigm: record.paradigm });
    return (await persistCandidates(candidates)).created;
  }

  /**
   * Close the loop: turn feedback on a delivered finding into the next study.
   * The new design descends from the finding's design (generation + 1).
   */
  async fromFeedback(finding: Finding, feedback: FeedbackEvent, ownerId?: string | null): Promise<GenerateStudyResult> {
    const parent = finding.studyDesignId ? await loopStorage.getStudyDesign(finding.studyDesignId) : undefined;
    const payload: any = feedback.payload ?? {};
    const feedbackText: string = String(payload.text ?? payload.message ?? payload.prompt ?? payload.reason ?? "").trim();

    const intent: Record<string, string> = {
      replication_request: "Design an independent replication with higher power and a different agent population.",
      dispute: "Design a study that could falsify the original claim; address the dispute directly.",
      question: "Design a study that answers the open question raised about the finding.",
      new_prompt: "Design the follow-up study described in the feedback.",
      citation: "Design an extension study that builds on the cited finding.",
      resonance: "Design a study that tests whether the resonance reported generalizes.",
      acknowledgement: "Design a follow-up that deepens the original finding.",
    };

    const ev: any = finding.evidence ?? {};
    const evidenceLine = [
      ev.n != null ? `n=${ev.n}` : null,
      ev.pValue != null ? `p=${ev.pValue}` : null,
      ev.effectSize != null ? `effect=${ev.effectSize}` : null,
      finding.simulated ? "SIMULATED evidence" : null,
    ].filter(Boolean).join(", ");

    const prompt = [
      intent[feedback.kind] ?? intent.new_prompt,
      `Original finding: "${finding.claim}"${evidenceLine ? ` (${evidenceLine})` : ""}.`,
      feedbackText ? `Feedback (${feedback.kind}): ${feedbackText}` : `Feedback kind: ${feedback.kind}.`,
      parent ? `Original study prompt: ${parent.prompt}` : null,
    ].filter(Boolean).join(" ");

    return this.generate({
      prompt,
      ownerId: ownerId ?? parent?.ownerId ?? null,
      preferences: parent ? { paradigm: parent.paradigm as any } : undefined,
      contextLines: [
        `Finding: ${finding.claim}${evidenceLine ? ` (${evidenceLine})` : ""}`,
        feedbackText ? `Feedback (${feedback.kind}): ${feedbackText}` : `Feedback: ${feedback.kind}`,
      ],
      parentDesignId: parent?.id ?? null,
      sourceFindingIds: [finding.id],
      generation: (parent?.generation ?? 0) + 1,
    });
  }
}

export const studyGenerator = new StudyGenerator();
