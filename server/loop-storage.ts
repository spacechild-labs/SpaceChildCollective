// Storage layer for the Discovery Loop tables. Kept separate from storage.ts so
// the loop is one reviewable unit; it uses the same db handle and conventions.
import {
  studyDesigns,
  findings,
  vettingReviews,
  distributionChannels,
  deliveries,
  feedbackEvents,
  type StudyDesignRecord,
  type InsertStudyDesignRecord,
  type Finding,
  type InsertFinding,
  type FindingStatus,
  type VettingReview,
  type InsertVettingReview,
  type DistributionChannel,
  type InsertDistributionChannel,
  type Delivery,
  type InsertDelivery,
  type DeliveryStatus,
  type FeedbackEvent,
  type InsertFeedbackEvent,
} from "@shared/schema";
import { db } from "./db";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

export interface ILoopStorage {
  // Study designs
  createStudyDesign(d: InsertStudyDesignRecord): Promise<StudyDesignRecord>;
  getStudyDesign(id: string): Promise<StudyDesignRecord | undefined>;
  listStudyDesigns(opts?: { ownerId?: string; status?: string; limit?: number }): Promise<StudyDesignRecord[]>;
  listChildDesigns(parentDesignId: string): Promise<StudyDesignRecord[]>;
  updateStudyDesign(id: string, updates: Partial<InsertStudyDesignRecord>): Promise<StudyDesignRecord>;

  // Findings
  createFinding(f: InsertFinding): Promise<Finding>;
  getFinding(id: string): Promise<Finding | undefined>;
  getFindingByHash(contentHash: string): Promise<Finding | undefined>;
  listFindings(opts?: { status?: FindingStatus | FindingStatus[]; category?: string; studyDesignId?: string; experimentId?: string; limit?: number }): Promise<Finding[]>;
  updateFinding(id: string, updates: Partial<InsertFinding>): Promise<Finding>;

  // Vetting
  createVettingReview(r: InsertVettingReview): Promise<VettingReview>;
  listVettingReviews(findingId: string): Promise<VettingReview[]>;
  deleteAutomatedReviews(findingId: string): Promise<void>;

  // Channels
  createChannel(c: InsertDistributionChannel): Promise<DistributionChannel>;
  getChannel(id: string): Promise<DistributionChannel | undefined>;
  listChannels(opts?: { ownerId?: string; activeOnly?: boolean; kind?: string }): Promise<DistributionChannel[]>;
  updateChannel(id: string, updates: Partial<InsertDistributionChannel> & { lastDeliveryAt?: Date }): Promise<DistributionChannel>;
  deleteChannel(id: string): Promise<void>;

  // Deliveries
  createDelivery(d: InsertDelivery): Promise<Delivery | undefined>; // undefined when idempotency key already exists
  getDelivery(id: string): Promise<Delivery | undefined>;
  listDeliveries(opts?: { findingId?: string; channelId?: string; status?: DeliveryStatus; limit?: number }): Promise<Delivery[]>;
  listDueDeliveries(now: Date, limit?: number): Promise<Delivery[]>;
  updateDelivery(id: string, updates: Partial<Delivery>): Promise<Delivery>;

  // Feedback
  createFeedbackEvent(e: InsertFeedbackEvent): Promise<FeedbackEvent>;
  listFeedbackEvents(opts?: { findingId?: string; limit?: number }): Promise<FeedbackEvent[]>;
  updateFeedbackEvent(id: string, updates: Partial<InsertFeedbackEvent>): Promise<FeedbackEvent>;

  // Aggregates
  countFindingsByStatus(): Promise<Record<string, number>>;
  countDeliveriesByStatus(): Promise<Record<string, number>>;
}

export class DatabaseLoopStorage implements ILoopStorage {
  // ---- Study designs ----
  async createStudyDesign(d: InsertStudyDesignRecord): Promise<StudyDesignRecord> {
    const [row] = await db.insert(studyDesigns).values(d as any).returning();
    return row;
  }

  async getStudyDesign(id: string): Promise<StudyDesignRecord | undefined> {
    const [row] = await db.select().from(studyDesigns).where(eq(studyDesigns.id, id));
    return row;
  }

  async listStudyDesigns(opts: { ownerId?: string; status?: string; limit?: number } = {}): Promise<StudyDesignRecord[]> {
    const conds = [];
    if (opts.ownerId) conds.push(eq(studyDesigns.ownerId, opts.ownerId));
    if (opts.status) conds.push(eq(studyDesigns.status, opts.status as any));
    return db
      .select()
      .from(studyDesigns)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(studyDesigns.createdAt))
      .limit(opts.limit ?? 100);
  }

  async listChildDesigns(parentDesignId: string): Promise<StudyDesignRecord[]> {
    return db.select().from(studyDesigns).where(eq(studyDesigns.parentDesignId, parentDesignId)).orderBy(desc(studyDesigns.createdAt));
  }

  async updateStudyDesign(id: string, updates: Partial<InsertStudyDesignRecord>): Promise<StudyDesignRecord> {
    const [row] = await db
      .update(studyDesigns)
      .set({ ...(updates as any), updatedAt: new Date() })
      .where(eq(studyDesigns.id, id))
      .returning();
    if (!row) throw new Error("Study design not found");
    return row;
  }

  // ---- Findings ----
  async createFinding(f: InsertFinding): Promise<Finding> {
    const [row] = await db.insert(findings).values(f as any).returning();
    return row;
  }

  async getFinding(id: string): Promise<Finding | undefined> {
    const [row] = await db.select().from(findings).where(eq(findings.id, id));
    return row;
  }

  async getFindingByHash(contentHash: string): Promise<Finding | undefined> {
    const [row] = await db.select().from(findings).where(eq(findings.contentHash, contentHash)).limit(1);
    return row;
  }

  async listFindings(opts: { status?: FindingStatus | FindingStatus[]; category?: string; studyDesignId?: string; experimentId?: string; limit?: number } = {}): Promise<Finding[]> {
    const conds = [];
    if (opts.status) {
      conds.push(Array.isArray(opts.status) ? inArray(findings.status, opts.status) : eq(findings.status, opts.status));
    }
    if (opts.category) conds.push(eq(findings.category, opts.category));
    if (opts.studyDesignId) conds.push(eq(findings.studyDesignId, opts.studyDesignId));
    if (opts.experimentId) conds.push(eq(findings.experimentId, opts.experimentId));
    return db
      .select()
      .from(findings)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(findings.createdAt))
      .limit(opts.limit ?? 200);
  }

  async updateFinding(id: string, updates: Partial<InsertFinding>): Promise<Finding> {
    const [row] = await db
      .update(findings)
      .set({ ...(updates as any), updatedAt: new Date() })
      .where(eq(findings.id, id))
      .returning();
    if (!row) throw new Error("Finding not found");
    return row;
  }

  // ---- Vetting ----
  async createVettingReview(r: InsertVettingReview): Promise<VettingReview> {
    const [row] = await db.insert(vettingReviews).values(r as any).returning();
    return row;
  }

  async listVettingReviews(findingId: string): Promise<VettingReview[]> {
    return db.select().from(vettingReviews).where(eq(vettingReviews.findingId, findingId)).orderBy(vettingReviews.createdAt);
  }

  async deleteAutomatedReviews(findingId: string): Promise<void> {
    await db.delete(vettingReviews).where(and(eq(vettingReviews.findingId, findingId), eq(vettingReviews.reviewerType, "automated")));
  }

  // ---- Channels ----
  async createChannel(c: InsertDistributionChannel): Promise<DistributionChannel> {
    const [row] = await db.insert(distributionChannels).values(c as any).returning();
    return row;
  }

  async getChannel(id: string): Promise<DistributionChannel | undefined> {
    const [row] = await db.select().from(distributionChannels).where(eq(distributionChannels.id, id));
    return row;
  }

  async listChannels(opts: { ownerId?: string; activeOnly?: boolean; kind?: string } = {}): Promise<DistributionChannel[]> {
    const conds = [];
    if (opts.ownerId) conds.push(eq(distributionChannels.ownerId, opts.ownerId));
    if (opts.activeOnly) conds.push(eq(distributionChannels.active, true));
    if (opts.kind) conds.push(eq(distributionChannels.kind, opts.kind as any));
    return db
      .select()
      .from(distributionChannels)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(distributionChannels.createdAt));
  }

  async updateChannel(id: string, updates: Partial<InsertDistributionChannel> & { lastDeliveryAt?: Date }): Promise<DistributionChannel> {
    const [row] = await db.update(distributionChannels).set(updates as any).where(eq(distributionChannels.id, id)).returning();
    if (!row) throw new Error("Channel not found");
    return row;
  }

  async deleteChannel(id: string): Promise<void> {
    await db.delete(distributionChannels).where(eq(distributionChannels.id, id));
  }

  // ---- Deliveries ----
  async createDelivery(d: InsertDelivery): Promise<Delivery | undefined> {
    const [row] = await db.insert(deliveries).values(d as any).onConflictDoNothing({ target: deliveries.idempotencyKey }).returning();
    return row;
  }

  async getDelivery(id: string): Promise<Delivery | undefined> {
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    return row;
  }

  async listDeliveries(opts: { findingId?: string; channelId?: string; status?: DeliveryStatus; limit?: number } = {}): Promise<Delivery[]> {
    const conds = [];
    if (opts.findingId) conds.push(eq(deliveries.findingId, opts.findingId));
    if (opts.channelId) conds.push(eq(deliveries.channelId, opts.channelId));
    if (opts.status) conds.push(eq(deliveries.status, opts.status));
    return db
      .select()
      .from(deliveries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(deliveries.queuedAt))
      .limit(opts.limit ?? 200);
  }

  async listDueDeliveries(now: Date, limit = 50): Promise<Delivery[]> {
    return db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.status, "queued"), or(isNull(deliveries.nextAttemptAt), lte(deliveries.nextAttemptAt, now))))
      .orderBy(deliveries.queuedAt)
      .limit(limit);
  }

  async updateDelivery(id: string, updates: Partial<Delivery>): Promise<Delivery> {
    const [row] = await db.update(deliveries).set(updates as any).where(eq(deliveries.id, id)).returning();
    if (!row) throw new Error("Delivery not found");
    return row;
  }

  // ---- Feedback ----
  async createFeedbackEvent(e: InsertFeedbackEvent): Promise<FeedbackEvent> {
    const [row] = await db.insert(feedbackEvents).values(e as any).returning();
    return row;
  }

  async listFeedbackEvents(opts: { findingId?: string; limit?: number } = {}): Promise<FeedbackEvent[]> {
    return db
      .select()
      .from(feedbackEvents)
      .where(opts.findingId ? eq(feedbackEvents.findingId, opts.findingId) : undefined)
      .orderBy(desc(feedbackEvents.createdAt))
      .limit(opts.limit ?? 200);
  }

  async updateFeedbackEvent(id: string, updates: Partial<InsertFeedbackEvent>): Promise<FeedbackEvent> {
    const [row] = await db.update(feedbackEvents).set(updates as any).where(eq(feedbackEvents.id, id)).returning();
    if (!row) throw new Error("Feedback event not found");
    return row;
  }

  // ---- Aggregates ----
  async countFindingsByStatus(): Promise<Record<string, number>> {
    const rows = await db.select({ status: findings.status, n: sql<number>`count(*)::int` }).from(findings).groupBy(findings.status);
    return Object.fromEntries(rows.map((r: { status: string; n: number }) => [r.status, r.n]));
  }

  async countDeliveriesByStatus(): Promise<Record<string, number>> {
    const rows = await db.select({ status: deliveries.status, n: sql<number>`count(*)::int` }).from(deliveries).groupBy(deliveries.status);
    return Object.fromEntries(rows.map((r: { status: string; n: number }) => [r.status, r.n]));
  }
}

export const loopStorage: ILoopStorage = new DatabaseLoopStorage();
