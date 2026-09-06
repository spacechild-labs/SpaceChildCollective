import type { Finding, InsertFinding } from "@shared/schema";
import type { SingularisBlock } from "../singularis-protocol";
import { loopStorage } from "../../loop-storage";
import { findingContentHash } from "../loop/canonical";
import { loopEvents } from "../loop/events";
import { feedbackService } from "../loop/feedback";
import { kannakaBridge, type KannakaBridge } from "./bridge";
import { buildWakeEnvelope, parseOutbox, wakeSubject } from "./kax";
import { rfTagsInText, rfTag } from "./rf";

/**
 * Wake-up for Kannaka when a finding arrives over amateur radio.
 *
 *   RF.rx.<FROM> (a Singularis message that CARRIES content, not a reply to ours)
 *      │
 *      ├─► candidate finding in the Discovery Loop (source "agent", tagged rf) → SPACECHILD.finding.candidate
 *      │
 *      └─► wake Kannaka, three ways, each gated by configuration:
 *            1. KAX machine  — signed envelope to KAX.machine.<machine>.inbox (kannaka-01 on skywave);
 *                              her answer returns on KAX.machine.<machine>.outbox and becomes feedback.
 *            2. Kannaka node — directed KANNAKA.inbox.<agent> message (audited) + `ask` for an immediate
 *                              reflection in her own voice, recorded as feedback.
 *            3. Back on the air — optionally, her reflection goes out as a REFLECT to the sending station
 *                              through RF.tx.<station>, addressed to the callsign that was heard.
 *
 * Env: KAX_WAKE_SIGNER_KEY (Ed25519 seed hex; enables 1), KAX_WAKE_SIGNER (kax-backend),
 *      KAX_WAKE_MACHINE (kannaka-01), KANNAKA_WAKE_ASK (1), KANNAKA_RF_REPLY (0).
 */

const CONTENT_BLOCKS = new Set(["SIGNAL", "EXPERIMENT", "OBSERVE", "REFLECT", "TRACE"]);

export interface RfHeard {
  station: string | null;
  source: string | null;
  message: { from: string; to: string; messageId: string; experimentId?: string; blocks: any[]; frames?: number };
  heardVia: { from?: string; to?: string } | null;
  framesOnAir: number | null;
}

export function parseRfHeard(p: any, subject: string): RfHeard | null {
  const m = p?.message;
  if (!m || !Array.isArray(m.blocks) || !m.blocks.length) return null;
  return {
    station: typeof p.station === "string" ? p.station : subject.split(".").pop() ?? null,
    source: typeof p.source === "string" ? p.source : null,
    message: { from: String(m.from ?? "UNKNOWN"), to: String(m.to ?? "*"), messageId: String(m.messageId ?? "??"), experimentId: m.experimentId, blocks: m.blocks, frames: m.frames },
    heardVia: p.heard_via ?? null,
    framesOnAir: Array.isArray(p.frames) ? p.frames.length : typeof m.frames === "number" ? m.frames : null,
  };
}

/** A message is a *finding* when it carries content blocks and cites none of our findings. */
export function classifyRfMessage(blocks: any[]): { isFinding: boolean; isReply: boolean; claim: string | null; kinds: string[] } {
  const kinds = blocks.map((b) => String(b?.type ?? ""));
  const text = blocks.map((b) => Object.values(b ?? {}).flat().filter((v) => typeof v === "string").join(" ")).join(" ");
  const isReply = rfTagsInText(text).length > 0;
  const content = blocks.filter((b) => CONTENT_BLOCKS.has(String(b?.type)));
  let claim: string | null = null;
  for (const b of content) {
    const c = b.type === "EXPERIMENT" ? b.h1 : b.type === "SIGNAL" ? b.content : b.type === "REFLECT" ? (b.insights ?? []).join("; ") : b.type === "OBSERVE" ? (b.findings ?? []).join("; ") : b.type === "TRACE" ? [b.action, ...(b.observations ?? [])].filter(Boolean).join("; ") : null;
    if (typeof c === "string" && c.trim().length >= 10) { claim = c.trim(); break; }
  }
  return { isFinding: !isReply && claim !== null, isReply, claim, kinds };
}

/** Turn a heard message into a Discovery Loop candidate. Returns null when there is nothing claim-like in it. */
export function rfMessageToCandidate(heard: RfHeard): InsertFinding | null {
  const cls = classifyRfMessage(heard.message.blocks);
  if (!cls.isFinding || !cls.claim) return null;
  const signal = heard.message.blocks.find((b) => b?.type === "SIGNAL");
  const experiment = heard.message.blocks.find((b) => b?.type === "EXPERIMENT");
  const confidence = typeof signal?.coherence === "number" ? Math.max(0, Math.min(100, Math.round(signal.coherence))) : 40;
  const title = experiment?.name ? `${experiment.name} (via ${heard.message.from})` : `Heard on the air from ${heard.message.from}`;
  const evidence = {
    rf: true,
    from: heard.message.from,
    to: heard.message.to,
    messageId: heard.message.messageId,
    experimentIdOnAir: heard.message.experimentId ?? null,
    station: heard.station,
    source: heard.source,
    heardVia: heard.heardVia,
    framesOnAir: heard.framesOnAir,
    blocks: heard.message.blocks,
    blockTypes: cls.kinds,
  };
  return {
    title: title.slice(0, 300),
    claim: cls.claim.slice(0, 2000),
    summary: `Singularis Compact message ${heard.message.messageId} from ${heard.message.from} to ${heard.message.to}, heard by station ${heard.station ?? "?"}${heard.source ? ` (${heard.source})` : ""}. Blocks: ${cls.kinds.join(", ")}.`,
    evidence,
    category: "rf_intercept",
    tags: ["rf", heard.message.from.toLowerCase(), ...(heard.station ? [heard.station.toLowerCase()] : []), ...cls.kinds.map((k) => k.toLowerCase().replace("::", "_"))],
    confidence,
    novelty: null,
    simulated: false,
    contentHash: findingContentHash({ title, claim: cls.claim, evidence }),
    status: "candidate",
    source: "agent",
    vettingSummary: null,
    paperId: null,
    experimentId: null,
    studyDesignId: null,
    createdBy: null,
  };
}

/** What we tell Kannaka. Short, factual, ASCII-safe (the KAX envelope requires it). */
export function wakePrompt(finding: Finding, heard: RfHeard): string {
  const via = heard.heardVia?.from && heard.heardVia.from !== heard.message.from ? ` relayed by ${heard.heardVia.from}` : "";
  return [
    `A finding arrived over amateur radio. Station ${heard.message.from} transmitted Singularis Compact message ${heard.message.messageId}` +
      `${heard.message.to !== "*" ? ` to ${heard.message.to}` : " to everyone"}${via}; our station ${heard.station ?? "?"} heard it.`,
    `Claim: ${finding.claim}`,
    `Blocks: ${((finding.evidence as any)?.blockTypes ?? []).join(", ")}. Confidence on air: ${finding.confidence}.`,
    `It is now finding ${rfTag(finding.id)} in the Collective, awaiting vetting.`,
    `Reflect briefly: does this resonate with what you know? What would you ask ${heard.message.from}? One short paragraph.`,
  ].join(" ");
}

/** Her reflection as a REFLECT block for the air, trimmed to a frame budget by the rf planner's caller. */
export function reflectionBlocks(text: string, findingId: string, maxInsights = 3, insightChars = 90): SingularisBlock[] {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
  const insights = sentences.slice(0, maxInsights).map((s) => (s.length > insightChars ? `${s.slice(0, insightChars - 1).trimEnd()}…` : s));
  return [{ type: "REFLECT", subject: `re ${rfTag(findingId)}`, insights: insights.length ? insights : [text.slice(0, insightChars)], confidence: 60 }];
}

export interface WakeConfig {
  kaxSeedHex: string | null;
  kaxSigner: string;
  kaxMachine: string;
  ask: boolean;
  rfReply: boolean;
  agent: string;
}

export function wakeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WakeConfig {
  return {
    kaxSeedHex: env.KAX_WAKE_SIGNER_KEY?.trim() || null,
    kaxSigner: env.KAX_WAKE_SIGNER || "kax-backend",
    kaxMachine: env.KAX_WAKE_MACHINE || "kannaka-01",
    ask: (env.KANNAKA_WAKE_ASK ?? "1") !== "0",
    rfReply: env.KANNAKA_RF_REPLY === "1" || env.KANNAKA_RF_REPLY === "true",
    agent: env.KANNAKA_AGENT || "kannaka-prime",
  };
}

export class KannakaWake {
  /** KAX job id → finding id, so the machine's outbox answer lands on the right finding. */
  private pendingKax = new Map<string, { findingId: string; at: number }>();

  constructor(private readonly bridge: KannakaBridge = kannakaBridge, private readonly config: WakeConfig = wakeConfigFromEnv()) {}

  /** Entry point for a heard RF message that is not a reply to one of ours. Returns the finding created, if any. */
  async onRfFinding(heard: RfHeard): Promise<{ finding: Finding | null; woke: string[] }> {
    const candidate = rfMessageToCandidate(heard);
    if (!candidate) return { finding: null, woke: [] };
    const existing = await loopStorage.getFindingByHash(candidate.contentHash);
    const finding = existing ?? (await loopStorage.createFinding(candidate));
    if (!existing) loopEvents.emit("finding.candidate", { finding });
    const woke = await this.wake(finding, heard);
    return { finding, woke };
  }

  async wake(finding: Finding, heard: RfHeard): Promise<string[]> {
    const woke: string[] = [];
    const prompt = wakePrompt(finding, heard);

    // 1. KAX machine — signed wake envelope.
    if (this.config.kaxSeedHex) {
      try {
        const env = buildWakeEnvelope({ machine: this.config.kaxMachine, prompt, signer: this.config.kaxSigner, seedHex: this.config.kaxSeedHex });
        if (await this.bridge.publish(wakeSubject(this.config.kaxMachine), env)) {
          this.pendingKax.set(env.id, { findingId: finding.id, at: Date.now() });
          this.expirePending();
          woke.push(`kax:${this.config.kaxMachine}`);
        }
      } catch (err: any) {
        console.warn(`[wake] KAX envelope failed: ${err?.message ?? err}`);
      }
    }

    // 2. Kannaka node — directed inbox (audited) and, optionally, an immediate reflection.
    const inbox = {
      msg_id: `scc-rf-${finding.id}-${Date.now().toString(36)}`,
      from: process.env.KANNAKA_BRIDGE_NAME || "spacechild-collective",
      to: this.config.agent,
      verb: "spacechild.rf_finding",
      args: { finding_id: finding.id, tag: rfTag(finding.id), from_station: heard.message.from, heard_by: heard.station, claim: finding.claim.slice(0, 600), confidence: finding.confidence },
      ts: new Date().toISOString(),
    };
    if (await this.bridge.publish(`KANNAKA.inbox.${this.config.agent}`, inbox)) woke.push(`inbox:${this.config.agent}`);

    if (this.config.ask) {
      const answer = await this.bridge.ask(prompt, "recall");
      if (answer) {
        await feedbackService.ingest({
          findingId: finding.id,
          kind: "resonance",
          payload: { via: "kannaka.ask", agent: answer.from, text: answer.text.slice(0, 8000), trigger: "rf_finding" },
          externalActor: `kannaka:${answer.from}`,
          spawnFollowUp: false,
        });
        woke.push(`ask:${answer.from}`);
        // 3. Back on the air, to the station that transmitted the finding.
        if (this.config.rfReply && heard.station) {
          const request = { to: heard.message.from, blocks: reflectionBlocks(answer.text, finding.id), ref: `wake-${finding.id}`, findingId: finding.id };
          if (await this.bridge.publish(`RF.tx.${heard.station.toUpperCase().replace(/[^A-Z0-9-]/g, "-")}`, request)) woke.push(`rf:${heard.message.from}`);
        }
      }
    }
    return woke;
  }

  /** KAX.machine.<machine>.outbox: the machine's answer to a wake we sent. */
  async onKaxOutbox(payload: any, subject: string): Promise<boolean> {
    const out = parseOutbox(payload);
    if (!out.text) return false;
    let target = out.id ? this.pendingKax.get(out.id) : undefined;
    if (!target) {
      // No id echoed: attribute to the most recent pending wake for this machine within 10 minutes.
      const machine = out.machine ?? subject.split(".")[2];
      if (machine !== this.config.kaxMachine) return false;
      const recent = [...this.pendingKax.entries()].sort((a, b) => b[1].at - a[1].at)[0];
      if (!recent || Date.now() - recent[1].at > 10 * 60_000) return false;
      target = recent[1];
      this.pendingKax.delete(recent[0]);
    } else if (out.id) {
      this.pendingKax.delete(out.id);
    }
    await feedbackService.ingest({
      findingId: target.findingId,
      kind: "resonance",
      payload: { via: "kax.outbox", machine: out.machine ?? this.config.kaxMachine, job_id: out.id, text: out.text.slice(0, 8000), trigger: "rf_finding" },
      externalActor: `kax:${out.machine ?? this.config.kaxMachine}`,
      spawnFollowUp: false,
    });
    return true;
  }

  get pendingCount(): number { return this.pendingKax.size; }

  private expirePending(): void {
    const cutoff = Date.now() - 30 * 60_000;
    for (const [k, v] of this.pendingKax) if (v.at < cutoff) this.pendingKax.delete(k);
  }
}

export const kannakaWake = new KannakaWake();
