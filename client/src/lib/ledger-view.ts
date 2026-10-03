import type { PublicRecord } from "@shared/ledger-public";
import { recordContentHash } from "@shared/ledger-hash";

export interface CampaignTally { passed: number; failed: number; open: number; disputed: number; total: number }

/** True when a later visible correction or "breaks" review targets the record (the read-time disputed signal). */
export function isDisputed(r: PublicRecord): boolean {
  return (r.correctedBy?.length ?? 0) > 0 || (r.brokenBy?.length ?? 0) > 0;
}

/**
 * Over results and certificates (and failure records): failed = a failure record, or a claim filed retracted;
 * disputed = a claim with a visible correction or "breaks" review, whatever its filed standing (it no longer counts as
 * passed or open); passed = certified or measured; open = unverified. Corrections and reviews are signals about other
 * records, so they are not tallied themselves. total is every record shown.
 */
export function campaignTally(records: PublicRecord[]): CampaignTally {
  let passed = 0;
  let failed = 0;
  let open = 0;
  let disputed = 0;
  for (const r of records) {
    if (r.kind === "failure") { failed++; continue; }
    if (r.kind !== "result" && r.kind !== "certificate") continue;
    if (r.standing === "retracted") failed++;
    else if (isDisputed(r)) disputed++;
    else if (r.standing === "certified" || r.standing === "measured") passed++;
    else if (r.standing === "unverified") open++;
  }
  return { passed, failed, open, disputed, total: records.length };
}

export const TIMELINE_ORDER = "oldest-first" as const;

export function timeline(records: PublicRecord[]): PublicRecord[] {
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Recompute the content hash with the same code the server used (WebCrypto, no node built-ins); true if it matches. */
export async function verifyRecordHash(r: PublicRecord): Promise<boolean> {
  return (await recordContentHash(r)) === r.contentHash;
}

/** The url only if it is an absolute http(s) URL, else undefined. Never put an unchecked ledger url in an href. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url || url !== url.trim()) return undefined;
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:" ? url : undefined;
  } catch { return undefined; }
}
