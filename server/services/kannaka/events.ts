import type { FeedbackKind } from "@shared/schema";
import { loopEvents } from "../loop/events";
import { feedbackService, FEEDBACK_KINDS } from "../loop/feedback";
import { loopStorage } from "../../loop-storage";
import { kannakaBridge, type KannakaBridge } from "./bridge";
import { SPACECHILD_SUBJECTS, findingEventPayload, findingIdsInText, studyEventPayload } from "./helpers";

/**
 * The two directions of the constellation link.
 *
 * Outbound: every loop stage is announced on SPACECHILD.* so Kannaka nodes,
 * KAX machines, the observatory and the radio can react without polling.
 *
 * Inbound: (1) SPACECHILD.feedback.inbound — any authenticated swarm member
 * can send feedback about a finding, which closes the loop exactly like a
 * signed webhook would; (2) KANNAKA.memory.new — when a node remembers
 * something that cites one of our findings, that is resonance, and it is
 * recorded as such automatically.
 */
export class KannakaLoopEvents {
  private stops: (() => void)[] = [];
  private started = false;

  constructor(private readonly bridge: KannakaBridge = kannakaBridge) {}

  async start(): Promise<boolean> {
    if (this.started || !this.bridge.enabled) return false;
    this.started = true;

    const S = SPACECHILD_SUBJECTS;
    this.stops.push(
      loopEvents.on("study.preregistered", ({ study }) => this.bridge.publish(S.studyPreregistered, studyEventPayload(study))),
      loopEvents.on("study.spawned", ({ study, fromFinding, feedback }) =>
        this.bridge.publish(S.studySpawned, studyEventPayload(study, { from_finding_id: fromFinding.id, feedback_kind: feedback.kind })),
      ),
      loopEvents.on("finding.candidate", ({ finding }) => this.bridge.publish(S.findingCandidate, findingEventPayload(finding))),
      loopEvents.on("finding.vetted", ({ finding }) => this.bridge.publish(S.findingVetted, findingEventPayload(finding))),
      loopEvents.on("finding.rejected", ({ finding, fails }) => this.bridge.publish(S.findingRejected, findingEventPayload(finding, { fails }))),
      loopEvents.on("finding.delivered", ({ finding, delivery, channelKind, channelName }) =>
        this.bridge.publish(S.findingDelivered, findingEventPayload(finding, { delivery_id: delivery.id, channel_kind: channelKind, channel_name: channelName })),
      ),
      loopEvents.on("feedback.received", ({ finding, feedback }) =>
        this.bridge.publish(S.feedbackReceived, { finding_id: finding.id, feedback_id: feedback.id, kind: feedback.kind, spawned_design_id: feedback.spawnedDesignId, ts: new Date().toISOString() }),
      ),
    );

    await this.bridge.subscribe(S.feedbackInbound, (p) => this.onInboundFeedback(p));
    await this.bridge.subscribe("KANNAKA.memory.new", (p) => this.onSwarmMemory(p));
    console.log("[kannaka] loop events wired (outbound SPACECHILD.*, inbound feedback + memory watch)");
    return true;
  }

  stop(): void {
    for (const s of this.stops) s();
    this.stops = [];
    this.started = false;
  }

  /** {finding_id, kind, text?, agent_id?, delivery_id?} from an authenticated swarm member. */
  async onInboundFeedback(p: any): Promise<void> {
    const findingId = String(p?.finding_id ?? p?.findingId ?? "");
    const kind = String(p?.kind ?? "") as FeedbackKind;
    if (!findingId || !FEEDBACK_KINDS.includes(kind)) return;
    const agent = String(p?.agent_id ?? p?.from ?? "swarm");
    await feedbackService.ingest({
      findingId,
      kind,
      payload: { text: typeof p?.text === "string" ? p.text.slice(0, 8000) : undefined, via: "nats", agent_id: agent },
      deliveryId: typeof p?.delivery_id === "string" ? p.delivery_id : null,
      externalActor: `swarm:${agent}`,
    });
  }

  /** A node remembered something that cites one of our findings → resonance. */
  async onSwarmMemory(p: any): Promise<void> {
    const content: string = String(p?.memory?.content ?? p?.content ?? "");
    if (!content) return;
    const agent = String(p?.agent_id ?? "unknown");
    if (agent === this.bridgeName()) return; // our own echo
    const ids = findingIdsInText(content);
    for (const id of ids) {
      const finding = await loopStorage.getFinding(id);
      if (!finding) continue;
      await feedbackService.ingest({
        findingId: finding.id,
        kind: "resonance",
        payload: { via: "KANNAKA.memory.new", agent_id: agent, memory_id: p?.memory?.id ?? null, excerpt: content.slice(0, 280) },
        externalActor: `swarm:${agent}`,
        spawnFollowUp: false,
      });
    }
  }

  private bridgeName(): string {
    return process.env.KANNAKA_BRIDGE_NAME || "spacechild-collective";
  }
}

export const kannakaLoopEvents = new KannakaLoopEvents();
