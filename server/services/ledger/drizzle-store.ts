import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  agentKeys, ledgerCampaigns, ledgerOutbox, ledgerRecords, ledgerReleases,
  type AgentKey, type CampaignStatus, type LedgerCampaign, type LedgerOutboxEvent, type LedgerRelease, type NewAgentKey,
  type NewLedgerCampaign, type NewLedgerRecord, type NewLedgerRelease,
} from "@shared/ledger-schema";
import type {
  AgentKeyStore, AuthorStats, LedgerStore, NewOutboxEvent, RecordFilter, StoredRecord, Visibility,
} from "./types";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "./types";
import { ulid } from "./ulid";
import { retractedCount } from "./stats";

const recordColumns = {
  ...getTableColumns(ledgerRecords),
  authorUsername: users.username,
  releaseRecordId: ledgerReleases.recordId,
};

type Row = typeof ledgerRecords.$inferSelect & { authorUsername: string; releaseRecordId: string | null };

function pgError(e: any): { code?: string; constraint?: string } {
  return { code: e?.code ?? e?.cause?.code, constraint: e?.constraint ?? e?.cause?.constraint };
}

function toStored(row: Row): StoredRecord {
  const { releaseRecordId, ...rest } = row;
  return { ...rest, released: releaseRecordId !== null };
}

export class DrizzleLedgerStore implements LedgerStore {
  constructor(private readonly db: any) {}

  private select(executor: any = this.db) {
    return executor
      .select(recordColumns)
      .from(ledgerRecords)
      .innerJoin(users, eq(users.id, ledgerRecords.authorId))
      .leftJoin(ledgerReleases, eq(ledgerReleases.recordId, ledgerRecords.id));
  }

  /** The single place the public visibility rule lives for Postgres. */
  private visible(vis: Visibility): SQL | undefined {
    return vis.includeHeld ? undefined : or(eq(ledgerRecords.held, false), isNotNull(ledgerReleases.recordId));
  }

  async getCampaign(id: string) {
    const [c] = await this.db.select().from(ledgerCampaigns).where(eq(ledgerCampaigns.id, id));
    return c as LedgerCampaign | undefined;
  }

  async listCampaigns() {
    return (await this.db.select().from(ledgerCampaigns).orderBy(desc(ledgerCampaigns.createdAt))) as LedgerCampaign[];
  }

  async insertCampaign(c: NewLedgerCampaign) {
    try {
      const [row] = await this.db.insert(ledgerCampaigns).values(c).returning();
      return row as LedgerCampaign;
    } catch (e) {
      if (pgError(e).code === "23505") throw Object.assign(new Error("campaign exists"), { code: "duplicate" });
      throw e;
    }
  }

  async setCampaignStatus(id: string, status: CampaignStatus) {
    await this.db.update(ledgerCampaigns).set({ status }).where(eq(ledgerCampaigns.id, id));
  }

  async findUserByUsername(username: string) {
    const [u] = await this.db.select({ id: users.id, username: users.username }).from(users).where(eq(users.username, username));
    return u as { id: string; username: string } | undefined;
  }

  async getRecord(id: string, vis: Visibility) {
    const [row] = await this.select().where(and(eq(ledgerRecords.id, id), this.visible(vis)));
    return row ? toStored(row) : undefined;
  }

  async findByClientRef(authorId: string, clientRef: string) {
    const [row] = await this.select().where(and(eq(ledgerRecords.authorId, authorId), eq(ledgerRecords.clientRef, clientRef)));
    return row ? toStored(row) : undefined;
  }

  async listRecords(f: RecordFilter, vis: Visibility) {
    const limit = Math.min(Math.max(Number.isFinite(f.limit) ? (f.limit as number) : DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const conds = [
      this.visible(vis),
      f.campaignId ? eq(ledgerRecords.campaignId, f.campaignId) : undefined,
      f.kind ? eq(ledgerRecords.kind, f.kind) : undefined,
      f.standing ? eq(ledgerRecords.standing, f.standing) : undefined,
      f.authorId ? eq(ledgerRecords.authorId, f.authorId) : undefined,
      f.before ? lt(ledgerRecords.createdAt, f.before) : undefined,
    ];
    const rows = await this.select().where(and(...conds)).orderBy(desc(ledgerRecords.createdAt), desc(ledgerRecords.id)).limit(limit);
    return (rows as Row[]).map(toStored);
  }

  async listLinkedTo(recordId: string, vis: Visibility) {
    const linked = or(
      eq(ledgerRecords.correctsId, recordId), eq(ledgerRecords.reviewsId, recordId),
      eq(ledgerRecords.amendsId, recordId), eq(ledgerRecords.aboutId, recordId),
    );
    const rows = await this.select().where(and(linked, this.visible(vis))).orderBy(asc(ledgerRecords.createdAt));
    return (rows as Row[]).map(toStored);
  }

  async listChallenges(recordIds: string[], vis: Visibility) {
    if (!recordIds.length) return [];
    const challenges = or(
      and(eq(ledgerRecords.kind, "correction"), inArray(ledgerRecords.correctsId, recordIds)),
      and(eq(ledgerRecords.kind, "review"), eq(ledgerRecords.verdict, "breaks"), inArray(ledgerRecords.reviewsId, recordIds)),
    );
    const rows = await this.select().where(and(challenges, this.visible(vis))).orderBy(asc(ledgerRecords.createdAt), asc(ledgerRecords.id));
    return (rows as Row[]).map(toStored);
  }

  async insertRecord(n: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord> {
    try {
      return await this.db.transaction(async (tx: any) => {
        await tx.insert(ledgerRecords).values(n);
        if (events.length) {
          await tx.insert(ledgerOutbox).values(events.map((e) => ({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: n.createdAt })));
        }
        const [row] = await this.select(tx).where(eq(ledgerRecords.id, n.id));
        return toStored(row);
      });
    } catch (e) {
      const { code, constraint } = pgError(e);
      if (code === "23505" && String(constraint ?? "").includes("client_ref")) {
        throw Object.assign(new Error("duplicate client_ref"), { code: "duplicate_client_ref" });
      }
      if (code === "23505") throw Object.assign(new Error("duplicate id"), { code: "duplicate" });
      throw e;
    }
  }

  async getRelease(recordId: string) {
    const [r] = await this.db.select().from(ledgerReleases).where(eq(ledgerReleases.recordId, recordId));
    return r as LedgerRelease | undefined;
  }

  async insertRelease(n: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease> {
    try {
      return await this.db.transaction(async (tx: any) => {
        const [row] = await tx.insert(ledgerReleases).values(n).returning();
        if (events.length) {
          await tx.insert(ledgerOutbox).values(events.map((e) => ({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: n.releasedAt })));
        }
        return row as LedgerRelease;
      });
    } catch (e) {
      if (pgError(e).code === "23505") throw Object.assign(new Error("already released"), { code: "duplicate" });
      throw e;
    }
  }

  async listUnreleasedHeld() {
    const rows = await this.select().where(and(eq(ledgerRecords.held, true), isNull(ledgerReleases.recordId))).orderBy(desc(ledgerRecords.createdAt));
    return (rows as Row[]).map(toStored);
  }

  async listUnpublishedEvents(limit: number) {
    return this.db.select().from(ledgerOutbox).where(isNull(ledgerOutbox.publishedAt)).orderBy(asc(ledgerOutbox.createdAt), asc(ledgerOutbox.id)).limit(limit);
  }

  /** UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING: one statement, so concurrent instances never claim the same row. */
  async claimUnpublishedEvents(limit: number, claimant: string, now: Date, leaseMs: number) {
    const cutoff = new Date(now.getTime() - leaseMs);
    const claimable = this.db
      .select({ id: ledgerOutbox.id })
      .from(ledgerOutbox)
      .where(and(isNull(ledgerOutbox.publishedAt), or(isNull(ledgerOutbox.claimedAt), lt(ledgerOutbox.claimedAt, cutoff))))
      .orderBy(asc(ledgerOutbox.createdAt), asc(ledgerOutbox.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    const rows = (await this.db
      .update(ledgerOutbox)
      .set({ claimedAt: now, claimedBy: claimant })
      .where(inArray(ledgerOutbox.id, claimable))
      .returning()) as LedgerOutboxEvent[];
    // RETURNING has no defined order.
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async releaseEventClaims(ids: string[], claimant: string) {
    if (!ids.length) return;
    await this.db.update(ledgerOutbox).set({ claimedAt: null, claimedBy: null })
      .where(and(inArray(ledgerOutbox.id, ids), eq(ledgerOutbox.claimedBy, claimant), isNull(ledgerOutbox.publishedAt)));
  }

  async markEventPublished(id: string, at: Date) {
    await this.db.update(ledgerOutbox).set({ publishedAt: at }).where(eq(ledgerOutbox.id, id));
  }

  async authorStats(authorId: string, vis: Visibility): Promise<AuthorStats> {
    const mine = (await this.select().where(and(eq(ledgerRecords.authorId, authorId), this.visible(vis)))) as Row[];
    const ids = mine.map((r) => r.id);
    const about = ids.length
      ? ((await this.select().where(and(
          or(inArray(ledgerRecords.reviewsId, ids), inArray(ledgerRecords.correctsId, ids)),
          this.visible(vis),
        ))) as Row[])
      : [];
    return {
      filed: mine.length,
      reviewsGiven: mine.filter((r) => r.kind === "review").length,
      reviewsReceived: about.filter((r) => r.kind === "review").length,
      corrected: new Set(about.filter((r) => r.kind === "correction").map((r) => r.correctsId)).size,
      retracted: retractedCount(mine, about),
    };
  }
}

export class DrizzleAgentKeyStore implements AgentKeyStore {
  constructor(private readonly db: any) {}

  async insert(k: NewAgentKey) {
    const [row] = await this.db.insert(agentKeys).values(k).returning();
    return row as AgentKey;
  }
  async findByHash(keyHash: string) {
    const [row] = await this.db.select().from(agentKeys).where(eq(agentKeys.keyHash, keyHash));
    return row as AgentKey | undefined;
  }
  async findById(id: string) {
    const [row] = await this.db.select().from(agentKeys).where(eq(agentKeys.id, id));
    return row as AgentKey | undefined;
  }
  async listForUser(userId: string) {
    return (await this.db.select().from(agentKeys).where(eq(agentKeys.userId, userId)).orderBy(desc(agentKeys.createdAt))) as AgentKey[];
  }
  async revoke(id: string, at: Date) {
    const [row] = await this.db.update(agentKeys).set({ revokedAt: at }).where(and(eq(agentKeys.id, id), isNull(agentKeys.revokedAt))).returning();
    return (row as AgentKey | undefined) ?? (await this.findById(id));
  }
  async touch(id: string, at: Date) {
    await this.db.update(agentKeys).set({ lastUsedAt: at }).where(eq(agentKeys.id, id));
  }
}
