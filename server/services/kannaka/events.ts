import type { FeedbackKind } from "@shared/schema";
import { loopEvents } from "../loop/events";
import { feedbackService, FEEDBACK_KINDS } from "../loop/feedback";
import { loopStorage } from "../../loop-storage";
import { kannakaBridge, type KannakaBridge } from "./bridge";
import { SPACECHILD_SUBJECTS, findingEventPayload, findingIdsInText, studyEventPayload } from "./helpers";
import { deliveryOutcomeForStatus, repliesFromRfMessage } from "./rf";
import { classifyRfMessage, kannakaWake, parseRfHeard } from "./wake";

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
    // Amateur radio: messages heard by any singularis-rf station, and our own transmit outcomes.
    await this.bridge.subscribe("RF.rx.>", (p, subject) => this.onRfMessage(p, subject));
    await this.bridge.subscribe("RF.tx.*.status", (p) => this.onRfTxStatus(p));
    // A KAX machine's answer to a wake we sent about an RF-borne finding.
    await this.bridge.subscribe("KAX.machine.*.outbox", async (p, subject) => { await kannakaWake.onKaxOutbox(p, subject); });
    console.log("[kannaka] loop events wired (outbound SPACECHILD.*, inbound feedback + memory watch + RF + KAX outbox)");
    return true;
  }

  /**
   * A Singularis message heard on the air. Blocks that cite one of our findings become feedback
   * on it; a message that carries its own content is a finding arriving over RF: it enters the
   * loop as a candidate and wakes Kannaka.
   */
  async onRfMessage(p: any, subject: string): Promise<void> {
    const message = p?.message;
    if (!message || !Array.isArray(message.blocks)) return;
    const replies = repliesFromRfMessage(message);
    if (!replies.length) {
      const heard = parseRfHeard(p, subject);
      const cls = heard ? classifyRfMessage(heard.message.blocks) : null;
      if (heard && cls?.isFinding) {
        try {
          const r = await kannakaWake.onRfFinding(heard);
          console.log(`[kannaka] RF finding ${r.finding?.id ?? "?"} from ${heard.message.from}; woke: ${r.woke.join(", ") || "nobody (bridge idle)"}`);
          await this.bridge.diag("rf", { subject, from: heard.message.from, isFinding: true, findingId: r.finding?.id ?? null, woke: r.woke });
        } catch (err: any) {
          await this.bridge.diag("rf", { subject, from: heard.message.from, isFinding: true, error: String(err?.message ?? err), stack: String(err?.stack ?? "").split("\n").slice(0, 4).join(" | ") });
          throw err;
        }
      } else {
        await this.bridge.diag("rf", { subject, parsed: Boolean(heard), isFinding: false, kinds: cls?.kinds ?? [], claim: cls?.claim ?? null });
      }
      return;
    }
    const candidates = await loopStorage.listFindings({ limit: 1000 });
    for (const r of replies) {
      const finding = candidates.find((f) => f.id.replace(/-/g, "").toLowerCase().startsWith(r.shortId));
      if (!finding) continue;
      await feedbackService.ingest({
        findingId: finding.id,
        kind: r.kind,
        payload: {
          via: "rf",
          text: r.text || undefined,
          block_type: r.blockType,
          from: message.from,
          to: message.to,
          message_id: message.messageId,
          station: p.station ?? subject.split(".").pop(),
          heard_via: p.heard_via ?? null,
          frames: Array.isArray(p.frames) ? p.frames.length : undefined,
        },
        externalActor: `rf:${message.from}`,
        // Questions and replication requests from the air spawn follow-ups like any other feedback;
        // acknowledgements and resonance do not.
        spawnFollowUp: undefined,
      });
    }
  }

  /** The station's progress on one of our rf deliveries (ref = delivery id). */
  async onRfTxStatus(p: any): Promise<void> {
    const ref = typeof p?.ref === "string" ? p.ref : null;
    if (!ref) return;
    const outcome = deliveryOutcomeForStatus(p);
    if (!outcome) return;
    const delivery = await loopStorage.getDelivery(ref);
    if (!delivery) return;
    if (outcome.status === "acknowledged") {
      if (delivery.status === "sent") await loopStorage.updateDelivery(ref, { status: "acknowledged", ackedAt: new Date(), receipt: { ...(delivery.receipt as object ?? {}), station: p.station, messageId: p.message_id, framesOnAir: p.frames } });
    } else if (delivery.status === "sent" || delivery.status === "queued") {
      await loopStorage.updateDelivery(ref, { status: "failed", lastError: `station: ${outcome.error}`, nextAttemptAt: null });
    }
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
