import type {
  AgentKey, CampaignStatus, LedgerCampaign, LedgerInvite, LedgerKind, LedgerOutboxEvent, LedgerRecord, LedgerRelease,
  LedgerStanding, NewAgentKey, NewLedgerInvite, NewLedgerCampaign, NewLedgerRecord, NewLedgerRelease,
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
  /** id -> username for the given user ids (unknown ids are absent). */
  usernamesFor(ids: string[]): Promise<Map<string, string>>;
  getRecord(id: string, vis: Visibility): Promise<StoredRecord | undefined>;
  findByClientRef(authorId: string, clientRef: string): Promise<StoredRecord | undefined>;
  /** Newest first. */
  listRecords(filter: RecordFilter, vis: Visibility): Promise<StoredRecord[]>;
  /** Records whose corrects/reviews/amends/about link points at recordId, oldest first. */
  listLinkedTo(recordId: string, vis: Visibility): Promise<StoredRecord[]>;
  /** Visible corrections of, and "breaks" reviews of, any of these records, oldest first (the read-time disputed signal). */
  listChallenges(recordIds: string[], vis: Visibility): Promise<StoredRecord[]>;
  /** One transaction: the record and its outbox events commit together or not at all.
   *  Throws an Error with code "duplicate_client_ref" on an (author, clientRef) collision. */
  insertRecord(record: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord>;
  getRelease(recordId: string): Promise<LedgerRelease | undefined>;
  /** One transaction: the release and its outbox events. */
  insertRelease(release: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease>;
  listUnreleasedHeld(): Promise<StoredRecord[]>;
  listUnpublishedEvents(limit: number): Promise<LedgerOutboxEvent[]>;
  /**
   * Atomically claim up to `limit` unpublished events, oldest first, for `claimant`: events that are unclaimed or
   * whose claim is older than `leaseMs`. Two concurrent callers never receive the same event within one lease.
   */
  claimUnpublishedEvents(limit: number, claimant: string, now: Date, leaseMs: number): Promise<LedgerOutboxEvent[]>;
  /** Drop `claimant`'s claim on these events (not yet published) so the next drain can take them at once. */
  releaseEventClaims(ids: string[], claimant: string): Promise<void>;
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

export interface InviteStore {
  insert(i: NewLedgerInvite): Promise<LedgerInvite>;
  findByHash(codeHash: string): Promise<LedgerInvite | undefined>;
  findById(id: string): Promise<LedgerInvite | undefined>;
  /** Atomically increments uses when the invite is unrevoked, unexpired at `now`, and uses < maxUses. Returns the updated row, or undefined. */
  claim(codeHash: string, now: Date): Promise<LedgerInvite | undefined>;
  /** Compensation: decrements uses by one (never below 0). */
  release(id: string): Promise<void>;
  revoke(id: string, at: Date): Promise<LedgerInvite | undefined>;
  /** Revokes every still-open invite (unrevoked, expiresAt > at, uses < maxUses) created by any of these users; returns how many were revoked. */
  revokeAllByCreators(userIds: string[], at: Date): Promise<number>;
  listByCreator(userId: string): Promise<LedgerInvite[]>; // newest first
  listAll(): Promise<LedgerInvite[]>; // newest first
  countMintedSince(userId: string, since: Date): Promise<number>;
  /** Unrevoked, expiresAt > now, uses < maxUses. */
  countOpen(userId: string, now: Date): Promise<number>;
}

export const LEDGER_ERROR_CODES = [
  "bad_signature", "unknown_key", "revoked_key", "stale_timestamp", "replayed_nonce", "unknown_campaign",
  "invalid_link", "missing_verdict", "rate_limited", "not_releaser", "agents_cannot_release", "invalid_input",
  "not_found", "forbidden", "invalid_invite",
] as const;
export type LedgerErrorCode = (typeof LEDGER_ERROR_CODES)[number];

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode, readonly status: number, message?: string) {
    super(message ?? code);
    this.name = "LedgerError";
  }
}
