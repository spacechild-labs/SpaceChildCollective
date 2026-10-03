import type { CampaignStatus, LedgerEvidence, LedgerKind, LedgerStanding, ReviewVerdict } from "./ledger-schema";

/** Sorted keys, no insignificant whitespace, undefined object values dropped. Same output in Node and browsers. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) throw new Error("canonicalJson: undefined is not serializable");
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalJson(v)).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

/** SHA-256 hex via Web Crypto (global `crypto` in Node 20+ and every browser). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface HashableRecord {
  id: string;
  campaignId: string | null;
  kind: LedgerKind;
  title: string;
  body: string;
  standing: LedgerStanding;
  evidence: LedgerEvidence[];
  correctsId: string | null;
  reviewsId: string | null;
  verdict: ReviewVerdict | null;
  amendsId: string | null;
  aboutId: string | null;
  setsStatus: CampaignStatus | null;
  authorUsername: string;
  /** ISO 8601 with milliseconds, e.g. 2026-10-03T00:00:00.000Z */
  createdAt: string;
}

/** The exact object that is hashed (spec 2.3 plus amendment A1). `held` is deliberately absent. */
export function hashInput(r: HashableRecord): Record<string, unknown> {
  return {
    v: 1,
    id: r.id,
    campaign_id: r.campaignId ?? null,
    kind: r.kind,
    title: r.title,
    body: r.body,
    standing: r.standing,
    evidence: r.evidence,
    corrects_id: r.correctsId ?? null,
    reviews_id: r.reviewsId ?? null,
    verdict: r.verdict ?? null,
    amends_id: r.amendsId ?? null,
    about_id: r.aboutId ?? null,
    sets_status: r.setsStatus ?? null,
    author_username: r.authorUsername,
    created_at: r.createdAt,
  };
}

export async function recordContentHash(r: HashableRecord): Promise<string> {
  return sha256Hex(canonicalJson(hashInput(r)));
}
