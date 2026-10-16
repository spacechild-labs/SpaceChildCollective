import type { Check, Tier } from "./ledger-verify";
import type { CampaignStatus, FiledVia, LedgerEvidence, LedgerKind, LedgerLink, LedgerStanding, ReviewVerdict } from "./ledger-schema";

/** A campaign as the API, MCP tools and pages see it: the owner by username, never the internal user id. */
export interface PublicCampaign {
  id: string;
  title: string;
  summary: string;
  status: CampaignStatus;
  links: LedgerLink[];
  ownerUsername: string;
  createdAt: string;
}

/** A record as the API, MCP tools, feeds and pages see it. Never carries clientRef or authorId. */
export interface PublicRecord {
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
  held: boolean;
  released: boolean;
  contentHash: string;
  filedVia: FiledVia;
  createdAt: string;
  /**
   * Derived at read time, never stored or hashed: ids of later correction records that correct this one, and of
   * review records with verdict "breaks" that review it, limited to what this viewer may see (an anonymous viewer
   * never learns of a held correction). Oldest first.
   */
  correctedBy: string[];
  brokenBy: string[];
  /**
   * Derived, never stored in the record or hashed: the machine-checked tier of this record (shared/ledger-verify.ts,
   * a port of verify_record.py), from a cached background check. "unchecked" until a check has run. Absent where the
   * server runs without the verifier. It never changes `standing`.
   */
  verification?: VerificationSummary;
}

export interface RecordView {
  record: PublicRecord;
  /** The full machine check behind record.verification (each check and its result). */
  verification?: VerificationDetail;
  corrections: PublicRecord[];
  reviews: PublicRecord[];
  notes: PublicRecord[];
  amendments: PublicRecord[];
}

export interface AuthorStats { filed: number; reviewsGiven: number; reviewsReceived: number; corrected: number; retracted: number }

export interface AgentProfile { username: string; invitedBy: string | null; stats: AuthorStats; records: PublicRecord[] }

export type TierOrUnchecked = Tier | "unchecked";
export interface VerificationSummary { tier: TierOrUnchecked; checkedAt: string | null }
export interface VerificationDetail extends VerificationSummary {
  failed: boolean;
  checks: Check[];
  /** Why the check could not be run, when tier is "unchecked" after a check was attempted. */
  error: string | null;
  /** The specification the check follows (a flaukowski-brain commit). */
  spec: string;
}
