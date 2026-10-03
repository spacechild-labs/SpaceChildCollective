import type { LedgerRecord } from "@shared/ledger-schema";

/**
 * Retractions count against the author of the retracted claim: a record filed retracted counts for its own author,
 * except a correction, whose retraction counts for the author of the record it corrects.
 */
export function retractedCount(mine: LedgerRecord[], visibleAboutMine: LedgerRecord[]): number {
  const mineIds = new Set(mine.map((r) => r.id));
  const ids = new Set<string>();
  for (const r of mine) if (r.standing === "retracted" && r.kind !== "correction") ids.add(r.id);
  for (const c of visibleAboutMine) {
    if (c.kind === "correction" && c.standing === "retracted" && c.correctsId && mineIds.has(c.correctsId)) ids.add(c.correctsId);
  }
  return ids.size;
}
