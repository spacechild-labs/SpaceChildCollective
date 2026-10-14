import type { PublicCampaign, PublicRecord } from "@shared/ledger-public";
import { timeline } from "./ledger-view";

/**
 * A campaign read as a project: where it is in the pre-registration → run → result → decision arc, its span in time,
 * and its last filed record. Everything here is derived from the records at read time; nothing is stored or guessed.
 */

/** The four stages a campaign passes through. A stage is reached when a record of its kind exists. */
export const PROJECT_STAGES = ["pre-registered", "run", "result", "decided"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

const STAGE_KINDS: Record<ProjectStage, readonly PublicRecord["kind"][]> = {
  "pre-registered": ["preregistration"],
  run: ["run"],
  result: ["result", "failure", "certificate"],
  decided: ["decision"],
};

/** Stages reached, in arc order. A closed campaign counts as fully decided whatever it filed. */
export function stagesReached(records: PublicRecord[], status: PublicCampaign["status"]): ProjectStage[] {
  if (status === "closed") return [...PROJECT_STAGES];
  const kinds = new Set(records.map((r) => r.kind));
  return PROJECT_STAGES.filter((s) => STAGE_KINDS[s].some((k) => kinds.has(k)));
}

/** Stages reached over the four, 0 to 1. The arc, not the work: a campaign with only a pre-registration is at 0.25. */
export function projectProgress(records: PublicRecord[], status: PublicCampaign["status"]): number {
  return stagesReached(records, status).length / PROJECT_STAGES.length;
}

export interface ProjectSpan { start: string; end: string; lastActivity: string | null; open: boolean }

/**
 * start = the campaign's registration or its first record, whichever is earlier; end = the last record for a closed
 * campaign, else `today` (the bar runs to now while the campaign is open). lastActivity = the newest record, if any.
 */
export function projectSpan(campaign: PublicCampaign, records: PublicRecord[], today: string): ProjectSpan {
  const dates = records.map((r) => r.createdAt).sort();
  const first = dates[0];
  const last = dates[dates.length - 1] ?? null;
  const start = first && first < campaign.createdAt ? first : campaign.createdAt;
  const open = campaign.status !== "closed";
  const end = open ? (today > start ? today : start) : (last ?? campaign.createdAt);
  return { start, end, lastActivity: last, open };
}

/** The newest record by the ledger's own timeline order, or null for an empty campaign. */
export function latestRecord(records: PublicRecord[]): PublicRecord | null {
  const t = timeline(records);
  return t.length ? t[t.length - 1] : null;
}

/** Open projects first, newest activity first within each group; closed projects after, newest closed first. */
export function sortProjects<T extends { campaign: PublicCampaign; span: ProjectSpan }>(items: T[]): T[] {
  const key = (p: T) => p.span.lastActivity ?? p.campaign.createdAt;
  return [...items].sort((a, b) => Number(!a.span.open) - Number(!b.span.open) || key(b).localeCompare(key(a)) || a.campaign.id.localeCompare(b.campaign.id));
}

/** Where a date falls on a shared axis, 0 at `from` and 1 at `to`; clamped. A zero-length axis maps everything to 0. */
export function axisPosition(date: string, from: string, to: string): number {
  const a = Date.parse(from), b = Date.parse(to), x = Date.parse(date);
  if (!(b > a)) return 0;
  return Math.min(1, Math.max(0, (x - a) / (b - a)));
}
