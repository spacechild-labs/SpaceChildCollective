import type { PublicRecord } from "@shared/ledger-public";
import { recordContentHash } from "@shared/ledger-hash";

/** passed = certified or measured results/certificates; failed = failures or retracted; open = unverified results. */
export function campaignTally(records: PublicRecord[]): { passed: number; failed: number; open: number; total: number } {
  let passed = 0;
  let failed = 0;
  let open = 0;
  for (const r of records) {
    if (r.kind === "failure" || r.standing === "retracted") failed++;
    else if ((r.kind === "result" || r.kind === "certificate") && (r.standing === "certified" || r.standing === "measured")) passed++;
    else if ((r.kind === "result" || r.kind === "certificate") && r.standing === "unverified") open++;
  }
  return { passed, failed, open, total: records.length };
}

export const TIMELINE_ORDER = "oldest-first" as const;

export function timeline(records: PublicRecord[]): PublicRecord[] {
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Recompute the content hash with the same code the server used (WebCrypto, no node built-ins); true if it matches. */
export async function verifyRecordHash(r: PublicRecord): Promise<boolean> {
  return (await recordContentHash(r)) === r.contentHash;
}
