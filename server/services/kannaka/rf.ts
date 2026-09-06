import type { FeedbackKind, Finding } from "@shared/schema";
import type { SingularisBlock } from "../singularis-protocol";
import { encodeMessage } from "../singularis-rf/codec";

/**
 * The `rf` channel: a vetted finding goes out over amateur radio as Singularis
 * Compact frames, and replies heard on the air come back as feedback.
 *
 *   finding ──► blocks (SIGNAL + TRACE + AWAIT) ──► NATS request RF.tx.<STATION> ──► singularis-rf station ──► JS8Call
 *   RF.rx.<FROM> (blocks citing SC:<8hex>) ──► feedback on that finding
 *   RF.tx.<STATION>.status {ref: deliveryId, event} ──► delivery acknowledged / failed
 *
 * Radio time is the constraint: one 67-char frame is roughly two minutes at JS8
 * normal speed, so content is trimmed to a frame budget rather than sent whole.
 * The finding is identified on the air by the first 8 hex characters of its id,
 * tagged `SC:xxxxxxxx`, which fits in a frame and is what a reply must cite.
 */

// 'SC-' rather than 'SC:' because ':' is reserved in Singularis Compact and would be escaped
// to %3A on the air; '-' is literal, so the tag reads the same in a raw frame and when decoded.
export const RF_TAG_PREFIX = "SC-";
const RF_TAG_RE = /\bSC-([0-9a-f]{8})\b/gi;

export function rfTag(findingId: string): string {
  return `${RF_TAG_PREFIX}${findingId.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
}

/** Short ids cited in free text (any block field, any message). */
export function rfTagsInText(text: string): string[] {
  return [...new Set([...text.matchAll(RF_TAG_RE)].map((m) => m[1].toLowerCase()))];
}

export function traceConfidence(confidence: number): "low" | "rising" | "stable" | "high" | "certain" {
  if (confidence >= 90) return "certain";
  if (confidence >= 75) return "high";
  if (confidence >= 60) return "stable";
  if (confidence >= 40) return "rising";
  return "low";
}

export interface RfChannelConfig {
  /** Station id the singularis-rf container listens on: RF.tx.<station> (usually its callsign). */
  station: string;
  /** Destination callsign, or "*" / "@ALLCALL" for everyone. */
  to?: string;
  /** Frame budget; content is trimmed until the message fits. Default 6 (~12 minutes of air time). */
  maxFrames?: number;
  frameLength?: number;
  caseFold?: boolean;
}

export interface BlockShape {
  withTrace: boolean;
  withObservations: boolean;
  withAwait: boolean;
}

export const FULL_SHAPE: BlockShape = { withTrace: true, withObservations: true, withAwait: true };

/** Blocks describing a finding for the air, with the claim trimmed to `claimChars` and optional parts per `shape`. */
export function findingToBlocks(finding: Finding, to: string, claimChars: number, shape: BlockShape = FULL_SHAPE): SingularisBlock[] {
  const ev: any = finding.evidence ?? {};
  const stats: string[] = [];
  if (ev.n != null) stats.push(`n=${ev.n}`);
  if (ev.pValue != null) stats.push(`p=${ev.pValue}`);
  if (ev.effectSize != null) stats.push(`h=${ev.effectSize}`);
  if (finding.simulated) stats.push("simulated");
  const claim = finding.claim.length > claimChars ? `${finding.claim.slice(0, Math.max(0, claimChars - 1)).trimEnd()}…` : finding.claim;
  // The short id rides in `source`, a short token the encoder never splits across frames, so a
  // station that hears a single frame still sees which finding it is; the claim is the content.
  const blocks: SingularisBlock[] = [
    {
      type: "SIGNAL",
      source: rfTag(finding.id),
      destination: to === "*" ? "ALLCALL" : to,
      coherence: Math.max(0, Math.min(100, Math.round(finding.confidence))),
      content: claim,
    },
  ];
  if (shape.withTrace) {
    blocks.push({
      type: "TRACE",
      signalType: "finding",
      confidence: traceConfidence(finding.confidence),
      action: "delivered",
      ...(shape.withObservations ? { observations: stats } : {}),
    });
  }
  if (shape.withAwait) {
    blocks.push({
      type: "AWAIT",
      expectation: `reply citing ${rfTag(finding.id)}`,
      sensitivity: "medium",
      bias: "none",
      time: "bounded",
    });
  }
  return blocks;
}

export interface RfPlan {
  blocks: SingularisBlock[];
  frames: string[];
  claimChars: number;
  trimmed: boolean;
  shape: BlockShape;
  /** False when even the smallest shape with a 12-character claim exceeds the budget. */
  fits: boolean;
}

/** Progressively smaller shapes: full → no AWAIT → bare TRACE → SIGNAL only. */
const SHAPES: BlockShape[] = [
  FULL_SHAPE,
  { withTrace: true, withObservations: true, withAwait: false },
  { withTrace: true, withObservations: false, withAwait: false },
  { withTrace: false, withObservations: false, withAwait: false },
];

/**
 * Fit the message into the frame budget: for each shape (largest first) shrink the
 * claim; the first (shape, claim length) that fits wins. The frames are re-encoded
 * by the station with the licensed callsign; `from` here only sizes the header.
 */
export function planRfMessage(finding: Finding, cfg: RfChannelConfig, from = cfg.station): RfPlan {
  const to = (cfg.to ?? "*").trim() || "*";
  const maxFrames = Math.max(1, cfg.maxFrames ?? 6);
  const frameLength = cfg.frameLength ?? 67;
  const encode = (blocks: SingularisBlock[]) => encodeMessage(blocks, { from, to, messageId: "00", experimentId: null, frameLength, caseFold: cfg.caseFold });
  let last: RfPlan | null = null;
  for (const shape of SHAPES) {
    let claimChars = Math.min(finding.claim.length, 600);
    let blocks = findingToBlocks(finding, to, claimChars, shape);
    let frames = encode(blocks);
    while (frames.length > maxFrames && claimChars > 12) {
      claimChars = Math.max(12, Math.floor(claimChars * 0.7));
      blocks = findingToBlocks(finding, to, claimChars, shape);
      frames = encode(blocks);
    }
    last = { blocks, frames, claimChars, trimmed: claimChars < finding.claim.length, shape, fits: frames.length <= maxFrames };
    if (last.fits) return last;
  }
  return last!;
}

/** The request the station consumes on RF.tx.<STATION>. `ref` is echoed on every status event. */
export function rfTxRequest(finding: Finding, cfg: RfChannelConfig, deliveryId: string, plan: RfPlan) {
  return {
    to: (cfg.to ?? "*").trim() || "*",
    blocks: plan.blocks,
    experimentId: null,
    ref: deliveryId,
    findingId: finding.id,
    caseFold: Boolean(cfg.caseFold),
  };
}

// ---------------------------------------------------------------------------
// Inbound: RF.rx.<FROM> → feedback
// ---------------------------------------------------------------------------

export interface RfReply {
  shortId: string;
  kind: FeedbackKind;
  text: string;
  blockType: string;
}

function blockText(b: any): string {
  const parts: string[] = [];
  for (const k of ["content", "expectation", "subject", "signal", "action", "signalType", "target", "source"]) if (typeof b[k] === "string") parts.push(b[k]);
  for (const k of ["insights", "observations", "findings", "detect"]) if (Array.isArray(b[k])) parts.push(...b[k].map(String));
  return parts.join(" ");
}

function kindForBlock(b: any): FeedbackKind {
  switch (b.type) {
    case "GR::PONG": return "acknowledgement";
    case "REFLECT": return "resonance";
    case "AWAIT": return "question";
    case "OBSERVE": return "acknowledgement";
    case "EXPERIMENT": return "replication_request";
    default: return "acknowledgement";
  }
}

/** Extract feedback items from a heard Singularis message: one per (block, cited short id). */
export function repliesFromRfMessage(message: { blocks: any[] }): RfReply[] {
  const out: RfReply[] = [];
  const messageText = message.blocks.map(blockText).join(" ");
  const citedAnywhere = rfTagsInText(messageText);
  for (const b of message.blocks) {
    const text = blockText(b);
    const cited = rfTagsInText(text);
    const ids = cited.length ? cited : b.type === "GR::PONG" || b.type === "REFLECT" ? citedAnywhere : [];
    for (const shortId of ids) out.push({ shortId, kind: kindForBlock(b), text: text.replace(RF_TAG_RE, "").replace(/\s+/g, " ").trim(), blockType: b.type });
  }
  // Dedupe on (shortId, kind, text)
  const seen = new Set<string>();
  return out.filter((r) => { const k = `${r.shortId}|${r.kind}|${r.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Map a station status event to a delivery outcome; null if not terminal. */
export function deliveryOutcomeForStatus(ev: { event?: string; error?: string }): { status: "acknowledged" | "failed"; error?: string } | null {
  switch (ev.event) {
    case "complete": return { status: "acknowledged" };
    case "refused": return { status: "failed", error: ev.error ?? "refused by station guard" };
    case "timeout": return { status: "failed", error: ev.error ?? "station timed out waiting for JS8Call" };
    case "error": return { status: "failed", error: ev.error ?? "station error" };
    default: return null;
  }
}
