import { and, asc, count, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  agentKeys, ledgerCampaigns, ledgerInvites, ledgerOutbox, ledgerRecords, ledgerReleases,
  type AgentKey, type CampaignStatus, type LedgerCampaign, type LedgerInvite, type LedgerOutboxEvent, type LedgerRelease, type NewAgentKey,
  type NewLedgerCampaign, type NewLedgerInvite, type NewLedgerRecord, type NewLedgerRelease,
} from "@shared/ledger-schema";
import type {
  AgentKeyStore, AuthorStats, InviteStore, LedgerStore, NewOutboxEvent, RecordFilter, StoredRecord, Visibility,
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

  async usernamesFor(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, string>();
    const rows = (await this.db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, unique))) as Array<{ id: string; username: string }>;
    return new Map(rows.map((r) => [r.id, r.username]));
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

export class DrizzleInviteStore implements InviteStore {
  constructor(private readonly db: any) {}

  private openWhere(now: Date) {
    return [isNull(ledgerInvites.revokedAt), gt(ledgerInvites.expiresAt, now), lt(ledgerInvites.uses, ledgerInvites.maxUses)];
  }

  async insert(i: NewLedgerInvite) {
    const [row] = await this.db.insert(ledgerInvites).values(i).returning();
    return row as LedgerInvite;
  }
  async findByHash(codeHash: string) {
    const [row] = await this.db.select().from(ledgerInvites).where(eq(ledgerInvites.codeHash, codeHash));
    return row as LedgerInvite | undefined;
  }
  async findById(id: string) {
    const [row] = await this.db.select().from(ledgerInvites).where(eq(ledgerInvites.id, id));
    return row as LedgerInvite | undefined;
  }
  async claim(codeHash: string, now: Date) {
    const rows = await this.db.update(ledgerInvites)
      .set({ uses: sql`${ledgerInvites.uses} + 1` })
      .where(and(eq(ledgerInvites.codeHash, codeHash), ...this.openWhere(now)))
      .returning();
    return rows[0] as LedgerInvite | undefined;
  }
  async release(id: string) {
    await this.db.update(ledgerInvites)
      .set({ uses: sql`greatest(${ledgerInvites.uses} - 1, 0)` })
      .where(eq(ledgerInvites.id, id));
  }
  async revoke(id: string, at: Date) {
    const [row] = await this.db.update(ledgerInvites).set({ revokedAt: at })
      .where(and(eq(ledgerInvites.id, id), isNull(ledgerInvites.revokedAt))).returning();
    return (row as LedgerInvite | undefined) ?? (await this.findById(id));
  }
  async revokeAllByCreators(userIds: string[], at: Date) {
    if (userIds.length === 0) return 0;
    const rows = await this.db.update(ledgerInvites).set({ revokedAt: at })
      .where(and(inArray(ledgerInvites.createdBy, userIds), ...this.openWhere(at))).returning({ id: ledgerInvites.id });
    return rows.length as number;
  }
  async listByCreator(userId: string) {
    return (await this.db.select().from(ledgerInvites).where(eq(ledgerInvites.createdBy, userId))
      .orderBy(desc(ledgerInvites.createdAt), desc(ledgerInvites.id))) as LedgerInvite[];
  }
  async listAll() {
    return (await this.db.select().from(ledgerInvites)
      .orderBy(desc(ledgerInvites.createdAt), desc(ledgerInvites.id))) as LedgerInvite[];
  }
  async countMintedSince(userId: string, since: Date) {
    const [r] = await this.db.select({ n: count() }).from(ledgerInvites)
      .where(and(eq(ledgerInvites.createdBy, userId), gte(ledgerInvites.createdAt, since)));
    return Number(r?.n ?? 0);
  }
  async countOpen(userId: string, now: Date) {
    const [r] = await this.db.select({ n: count() }).from(ledgerInvites)
      .where(and(eq(ledgerInvites.createdBy, userId), ...this.openWhere(now)));
    return Number(r?.n ?? 0);
  }
}
