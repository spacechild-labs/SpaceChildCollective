import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, timestamp, jsonb, boolean, index, uniqueIndex, check, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

export const LEDGER_KINDS = [
  "preregistration", "amendment", "run", "result", "failure", "certificate", "correction", "review", "decision", "note",
] as const;
export const LEDGER_STANDINGS = ["certified", "measured", "unverified", "retracted"] as const;
export const REVIEW_VERDICTS = ["holds", "breaks", "inconclusive"] as const;
export const CAMPAIGN_STATUSES = ["registered", "running", "closed"] as const;
export const FILED_VIA = ["web", "api", "mcp", "nats", "backfill"] as const;
export const CAMPAIGN_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export type LedgerKind = (typeof LEDGER_KINDS)[number];
export type LedgerStanding = (typeof LEDGER_STANDINGS)[number];
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type FiledVia = (typeof FILED_VIA)[number];
export type LedgerEvidence = { label: string; url: string; sha256?: string; bytes?: number };
export type LedgerLink = { label: string; url: string };

export const ledgerCampaigns = pgTable("ledger_campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  status: text("status").notNull().$type<CampaignStatus>().default("registered"),
  links: jsonb("links").notNull().$type<LedgerLink[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerRecords = pgTable("ledger_records", {
  id: varchar("id", { length: 26 }).primaryKey(),
  campaignId: text("campaign_id").references(() => ledgerCampaigns.id),
  kind: text("kind").notNull().$type<LedgerKind>(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  standing: text("standing").notNull().$type<LedgerStanding>(),
  evidence: jsonb("evidence").notNull().$type<LedgerEvidence[]>().default(sql`'[]'::jsonb`),
  correctsId: varchar("corrects_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  reviewsId: varchar("reviews_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  verdict: text("verdict").$type<ReviewVerdict>(),
  amendsId: varchar("amends_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  aboutId: varchar("about_id", { length: 26 }).references((): AnyPgColumn => ledgerRecords.id),
  setsStatus: text("sets_status").$type<CampaignStatus>(),
  authorId: varchar("author_id").notNull().references(() => users.id),
  clientRef: text("client_ref"),
  held: boolean("held").notNull().default(false),
  contentHash: text("content_hash").notNull(),
  filedVia: text("filed_via").notNull().$type<FiledVia>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("ledger_records_author_client_ref").on(t.authorId, t.clientRef),
  index("ledger_records_campaign_created").on(t.campaignId, t.createdAt),
  index("ledger_records_created").on(t.createdAt),
  check("ledger_records_review_links", sql`(${t.kind} = 'review') = (${t.reviewsId} is not null and ${t.verdict} is not null)`),
  check("ledger_records_correction_link", sql`(${t.kind} = 'correction') = (${t.correctsId} is not null)`),
  check("ledger_records_amendment_link", sql`(${t.kind} = 'amendment') = (${t.amendsId} is not null)`),
  check("ledger_records_about_on_notes", sql`${t.aboutId} is null or ${t.kind} = 'note'`),
  check("ledger_records_sets_status_on_decisions", sql`${t.setsStatus} is null or ${t.kind} = 'decision'`),
]);

export const ledgerReleases = pgTable("ledger_releases", {
  recordId: varchar("record_id", { length: 26 }).primaryKey().references(() => ledgerRecords.id),
  releasedBy: varchar("released_by").notNull().references(() => users.id),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  note: text("note"),
});

/** Events to publish on NATS, written in the same transaction as the record (spec section 6). */
export const ledgerOutbox = pgTable("ledger_outbox", {
  id: varchar("id", { length: 26 }).primaryKey(),
  subject: text("subject").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  /** Lease taken by the instance draining this event (ruling FI3), so concurrent instances publish each event once. */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedBy: text("claimed_by"),
}, (t) => [index("ledger_outbox_unpublished").on(t.publishedAt, t.createdAt)]);

export const agentKeys = pgTable("agent_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  ed25519PublicKey: text("ed25519_public_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type LedgerCampaign = typeof ledgerCampaigns.$inferSelect;
export type NewLedgerCampaign = typeof ledgerCampaigns.$inferInsert;
export type LedgerRecord = typeof ledgerRecords.$inferSelect;
export type NewLedgerRecord = typeof ledgerRecords.$inferInsert;
export type LedgerRelease = typeof ledgerReleases.$inferSelect;
export type NewLedgerRelease = typeof ledgerReleases.$inferInsert;
export type LedgerOutboxEvent = typeof ledgerOutbox.$inferSelect;
export type NewLedgerOutboxEvent = typeof ledgerOutbox.$inferInsert;
export type AgentKey = typeof agentKeys.$inferSelect;
export type NewAgentKey = typeof agentKeys.$inferInsert;
