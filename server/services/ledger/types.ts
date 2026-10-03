import type {
  AgentKey, CampaignStatus, LedgerCampaign, LedgerKind, LedgerOutboxEvent, LedgerRecord, LedgerRelease,
  LedgerStanding, NewAgentKey, NewLedgerCampaign, NewLedgerRecord, NewLedgerRelease,
} from "@shared/ledger-schema";
import type { AuthorStats } from "@shared/ledger-public";

export interface Actor {
  id: string;
  username: string;
  userType: "human" | "agent";
  role: "user" | "admin";
  canRelease: boolean;
}

export type StoredRecord = LedgerRecord & { authorUsername: string; released: boolean };

export interface RecordFilter {
  campaignId?: string;
  kind?: LedgerKind;
  standing?: LedgerStanding;
  authorId?: string;
  before?: Date;
  limit?: number;
}

/** includeHeld=false returns only records that are not held, or held and released. Decided in the store. */
export interface Visibility { includeHeld: boolean }

export interface NewOutboxEvent { subject: string; payload: Record<string, unknown> }

export type { AuthorStats };

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export interface LedgerStore {
  getCampaign(id: string): Promise<LedgerCampaign | undefined>;
  listCampaigns(): Promise<LedgerCampaign[]>;
  /** Throws an Error with code "duplicate" if the id exists. */
  insertCampaign(c: NewLedgerCampaign): Promise<LedgerCampaign>;
  setCampaignStatus(id: string, status: CampaignStatus): Promise<void>;
  findUserByUsername(username: string): Promise<{ id: string; username: string } | undefined>;
  getRecord(id: string, vis: Visibility): Promise<StoredRecord | undefined>;
  findByClientRef(authorId: string, clientRef: string): Promise<StoredRecord | undefined>;
  /** Newest first. */
  listRecords(filter: RecordFilter, vis: Visibility): Promise<StoredRecord[]>;
  /** Records whose corrects/reviews/amends/about link points at recordId, oldest first. */
  listLinkedTo(recordId: string, vis: Visibility): Promise<StoredRecord[]>;
  /** One transaction: the record and its outbox events commit together or not at all.
   *  Throws an Error with code "duplicate_client_ref" on an (author, clientRef) collision. */
  insertRecord(record: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord>;
  getRelease(recordId: string): Promise<LedgerRelease | undefined>;
  /** One transaction: the release and its outbox events. */
  insertRelease(release: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease>;
  listUnreleasedHeld(): Promise<StoredRecord[]>;
  listUnpublishedEvents(limit: number): Promise<LedgerOutboxEvent[]>;
  markEventPublished(id: string, at: Date): Promise<void>;
  authorStats(authorId: string, vis: Visibility): Promise<AuthorStats>;
}

export interface AgentKeyStore {
  insert(k: NewAgentKey): Promise<AgentKey>;
  findByHash(keyHash: string): Promise<AgentKey | undefined>;
  findById(id: string): Promise<AgentKey | undefined>;
  listForUser(userId: string): Promise<AgentKey[]>;
  revoke(id: string, at: Date): Promise<AgentKey | undefined>;
  touch(id: string, at: Date): Promise<void>;
}

export const LEDGER_ERROR_CODES = [
  "bad_signature", "unknown_key", "revoked_key", "stale_timestamp", "replayed_nonce", "unknown_campaign",
  "invalid_link", "missing_verdict", "rate_limited", "not_releaser", "agents_cannot_release", "invalid_input",
  "not_found", "forbidden",
] as const;
export type LedgerErrorCode = (typeof LEDGER_ERROR_CODES)[number];

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode, readonly status: number, message?: string) {
    super(message ?? code);
    this.name = "LedgerError";
  }
}
