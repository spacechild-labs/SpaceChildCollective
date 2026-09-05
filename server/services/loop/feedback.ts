import type { FeedbackEvent, FeedbackKind, Finding, StudyDesignRecord } from "@shared/schema";
import { loopStorage } from "../../loop-storage";
import { studyGenerator } from "./study-generator";

/**
 * Feedback: everything that comes back about a delivered finding. Recording it
 * is the value signal; turning the actionable kinds into the next study is what
 * closes the loop.
 */

export const FEEDBACK_KINDS: FeedbackKind[] = ["acknowledgement", "citation", "replication_request", "resonance", "dispute", "question", "new_prompt"];

/** Kinds that, by default, spawn a follow-up study design. */
export const SPAWNING_KINDS: ReadonlySet<FeedbackKind> = new Set<FeedbackKind>(["replication_request", "dispute", "question", "new_prompt"]);

export interface IngestFeedbackInput {
  findingId: string;
  kind: FeedbackKind;
  payload?: Record<string, unknown> | null;
  deliveryId?: string | null;
  channelId?: string | null;
  actorId?: string | null;
  externalActor?: string | null;
  /** Override the env default for spawning a follow-up study. */
  spawnFollowUp?: boolean;
}

export interface IngestFeedbackResult {
  event: FeedbackEvent;
  finding: Finding;
  spawned?: StudyDesignRecord;
}

export function autoFollowUpEnabled(): boolean {
  return (process.env.LOOP_AUTO_FOLLOWUP ?? "true") !== "false";
}

export class FeedbackService {
  async ingest(input: IngestFeedbackInput): Promise<IngestFeedbackResult> {
    if (!FEEDBACK_KINDS.includes(input.kind)) throw new Error(`Unknown feedback kind: ${input.kind}`);
    const finding = await loopStorage.getFinding(input.findingId);
    if (!finding) throw new Error("Finding not found");

    // Acknowledgements from a channel close out the delivery receipt.
    if (input.deliveryId && input.kind === "acknowledgement") {
      const delivery = await loopStorage.getDelivery(input.deliveryId);
      if (delivery && delivery.status === "sent") {
        await loopStorage.updateDelivery(delivery.id, { status: "acknowledged", ackedAt: new Date() });
      }
    }

    let event = await loopStorage.createFeedbackEvent({
      findingId: finding.id,
      deliveryId: input.deliveryId ?? null,
      channelId: input.channelId ?? null,
      kind: input.kind,
      payload: input.payload ?? null,
      actorId: input.actorId ?? null,
      externalActor: input.externalActor ?? null,
      spawnedDesignId: null,
    });

    const shouldSpawn = input.spawnFollowUp ?? (autoFollowUpEnabled() && SPAWNING_KINDS.has(input.kind));
    let spawned: StudyDesignRecord | undefined;
    if (shouldSpawn) {
      const result = await studyGenerator.fromFeedback(finding, event, input.actorId ?? null);
      spawned = result.record;
      event = await loopStorage.updateFeedbackEvent(event.id, { spawnedDesignId: spawned.id });
    }

    return { event, finding, spawned };
  }

  async list(findingId?: string, limit = 200): Promise<FeedbackEvent[]> {
    return loopStorage.listFeedbackEvents({ findingId, limit });
  }
}

export const feedbackService = new FeedbackService();
