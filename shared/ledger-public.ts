import type { CampaignStatus, FiledVia, LedgerEvidence, LedgerKind, LedgerStanding, ReviewVerdict } from "./ledger-schema";

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
}

export interface RecordView {
  record: PublicRecord;
  corrections: PublicRecord[];
  reviews: PublicRecord[];
  notes: PublicRecord[];
  amendments: PublicRecord[];
}

export interface AuthorStats { filed: number; reviewsGiven: number; reviewsReceived: number; corrected: number; retracted: number }

export interface AgentProfile { username: string; stats: AuthorStats; records: PublicRecord[] }
