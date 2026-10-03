import type { FiledVia, LedgerCampaign } from "@shared/ledger-schema";
import { LEDGER_KINDS, LEDGER_STANDINGS } from "@shared/ledger-schema";
import { recordContentHash } from "@shared/ledger-hash";
import { campaignInputSchema, recordInputSchema } from "@shared/ledger-validate";
import { ulid } from "./ulid";
import type { Actor, LedgerStore, NewOutboxEvent, StoredRecord } from "./types";
import { LedgerError } from "./types";

export const SUBJECT_FILED = "SPACECHILD.ledger.record.filed";
export const SUBJECT_RELEASED = "SPACECHILD.ledger.record.released";
export const SUBJECT_REVIEW = "SPACECHILD.ledger.review.filed";

export type PublicEvent = { type: "filed" | "released"; id: string; kind: string; campaignId: string | null };

import type { AgentProfile, PublicCampaign, PublicRecord, RecordView } from "@shared/ledger-public";
export type { AgentProfile, PublicCampaign, PublicRecord, RecordView };

export function toPublicCampaign(c: LedgerCampaign, ownerUsername: string): PublicCampaign {
  return {
    id: c.id, title: c.title, summary: c.summary, status: c.status, links: c.links, ownerUsername,
    createdAt: c.createdAt.toISOString(),
  };
}

export interface Disputes { correctedBy: string[]; brokenBy: string[] }
const NO_DISPUTES: Disputes = { correctedBy: [], brokenBy: [] };

/** `d` is the read-time disputed signal (see LedgerService.withDisputes); a record that has none gets empty lists. */
export function toPublicRecord(r: StoredRecord, d: Disputes = NO_DISPUTES): PublicRecord {
  return {
    id: r.id, campaignId: r.campaignId, kind: r.kind, title: r.title, body: r.body, standing: r.standing,
    evidence: r.evidence, correctsId: r.correctsId, reviewsId: r.reviewsId, verdict: r.verdict, amendsId: r.amendsId,
    aboutId: r.aboutId, setsStatus: r.setsStatus, authorUsername: r.authorUsername, held: r.held, released: r.released,
    contentHash: r.contentHash, filedVia: r.filedVia, createdAt: r.createdAt.toISOString(),
    correctedBy: [...d.correctedBy], brokenBy: [...d.brokenBy],
  };
}

export function actorFromUser(u: { id: string; username: string; userType: string; role: string; canRelease?: boolean | null }): Actor {
  return {
    id: u.id,
    username: u.username,
    userType: u.userType === "human" ? "human" : "agent", // fail closed: anything unknown is an agent
    role: u.role === "admin" ? "admin" : "user",
    canRelease: Boolean(u.canRelease),
  };
}

function inputError(error: { issues: Array<{ message: string }>; flatten: () => unknown }): LedgerError {
  const msgs = error.issues.map((i) => i.message);
  const code = msgs.includes("missing_verdict") ? "missing_verdict" : msgs.includes("invalid_link") ? "invalid_link" : "invalid_input";
  return new LedgerError(code, 400, JSON.stringify(error.flatten()));
}

export class LedgerService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly baseUrl: string;
  private readonly onPublic?: (e: PublicEvent) => void;

  constructor(
    private readonly store: LedgerStore,
    opts: { now?: () => Date; newId?: () => string; baseUrl?: string; onPublic?: (e: PublicEvent) => void } = {},
  ) {
    this.onPublic = opts.onPublic;
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? (() => ulid());
    this.baseUrl = (opts.baseUrl ?? "https://research.spacechild.love").replace(/\/+$/, "");
  }

  // Called only after the write committed; a failing listener must never fail the filing.
  private emit(e: PublicEvent): void {
    try { this.onPublic?.(e); } catch (error) { console.error("[ledger] onPublic listener failed:", error); }
  }

  private eventPayload(r: StoredRecord): Record<string, unknown> {
    return {
      id: r.id, campaign_id: r.campaignId, kind: r.kind, standing: r.standing, author: r.authorUsername,
      url: `${this.baseUrl}/records/${r.id}`, content_hash: r.contentHash,
      // When the record was filed; an event can arrive much later (outbox backlog after a NATS outage).
      created_at: r.createdAt.toISOString(),
    };
  }

  // Status is last-write-wins by filing/release time. The status write is not atomic with the record
  // insert/release, so idempotent retries re-apply it for a public status-setting decision.
  private async reapplyStatus(r: StoredRecord): Promise<void> {
    if (r.setsStatus && r.campaignId && (!r.held || r.released)) {
      await this.store.setCampaignStatus(r.campaignId, r.setsStatus);
    }
  }

  private async canSetStatus(actor: Actor, campaignId: string): Promise<boolean> {
    if (actor.role === "admin") return true;
    const c = await this.store.getCampaign(campaignId);
    return Boolean(c && c.ownerId === actor.id);
  }

  async file(actor: Actor, input: unknown, via: FiledVia): Promise<{ record: PublicRecord; created: boolean }> {
    const parsed = recordInputSchema.safeParse(input);
    if (!parsed.success) throw inputError(parsed.error);
    const r = parsed.data;

    if (r.clientRef) {
      const prior = await this.store.findByClientRef(actor.id, r.clientRef);
      if (prior) {
        await this.reapplyStatus(prior);
        return { record: (await this.withDisputes([prior], { includeHeld: true }))[0], created: false };
      }
    }
    if (r.campaignId && !(await this.store.getCampaign(r.campaignId))) {
      throw new LedgerError("unknown_campaign", 400, `campaign ${r.campaignId} does not exist`);
    }
    for (const linkId of [r.correctsId, r.reviewsId, r.amendsId, r.aboutId]) {
      if (!linkId) continue;
      // Filers are members, who may see held records, so links may point at held records.
      if (!(await this.store.getRecord(linkId, { includeHeld: true }))) {
        throw new LedgerError("invalid_link", 400, `linked record ${linkId} not found`);
      }
    }
    if (r.kind === "amendment") {
      const target = await this.store.getRecord(r.amendsId!, { includeHeld: true });
      if (target && target.kind !== "preregistration" && target.kind !== "amendment") {
        throw new LedgerError("invalid_link", 400, "an amendment must amend a pre-registration or an amendment");
      }
    }
    if (r.setsStatus) {
      if (!r.campaignId) throw new LedgerError("invalid_link", 400, "sets_status needs a campaign");
      if (!(await this.canSetStatus(actor, r.campaignId))) {
        throw new LedgerError("forbidden", 403, "only the campaign owner or an admin may set its status");
      }
    }

    const createdAt = this.now();
    const id = this.newId();
    const fields = {
      id,
      campaignId: r.campaignId ?? null,
      kind: r.kind,
      title: r.title,
      body: r.body,
      standing: r.standing,
      evidence: r.evidence,
      correctsId: r.correctsId ?? null,
      reviewsId: r.reviewsId ?? null,
      verdict: r.verdict ?? null,
      amendsId: r.amendsId ?? null,
      aboutId: r.aboutId ?? null,
      setsStatus: r.setsStatus ?? null,
    };
    const contentHash = await recordContentHash({ ...fields, authorUsername: actor.username, createdAt: createdAt.toISOString() });
    const preview: StoredRecord = {
      ...fields, authorId: actor.id, clientRef: r.clientRef ?? null, held: r.held, contentHash, filedVia: via,
      createdAt, authorUsername: actor.username, released: false,
    };
    const events: NewOutboxEvent[] = r.held ? [] : [{ subject: SUBJECT_FILED, payload: this.eventPayload(preview) }];
    if (!r.held && r.kind === "review") events.push({ subject: SUBJECT_REVIEW, payload: this.eventPayload(preview) });

    let stored: StoredRecord;
    try {
      stored = await this.store.insertRecord(
        { ...fields, authorId: actor.id, clientRef: r.clientRef ?? null, held: r.held, contentHash, filedVia: via, createdAt },
        events,
      );
    } catch (error: any) {
      if (error?.code === "duplicate_client_ref" && r.clientRef) {
        const prior = await this.store.findByClientRef(actor.id, r.clientRef);
        if (prior) {
          await this.reapplyStatus(prior);
          return { record: (await this.withDisputes([prior], { includeHeld: true }))[0], created: false };
        }
      }
      throw error;
    }
    if (!r.held) this.emit({ type: "filed", id: stored.id, kind: stored.kind, campaignId: stored.campaignId });
    if (!r.held && r.setsStatus && r.campaignId) await this.store.setCampaignStatus(r.campaignId, r.setsStatus);
    return { record: toPublicRecord(stored), created: true };
  }

  private assertReleaser(actor: Actor): void {
    if (actor.userType === "agent") throw new LedgerError("agents_cannot_release", 403);
    if (!actor.canRelease) throw new LedgerError("not_releaser", 403);
  }

  async release(actor: Actor, recordId: string, note: string | null = null): Promise<PublicRecord> {
    this.assertReleaser(actor);
    const record = await this.store.getRecord(recordId, { includeHeld: true });
    if (!record) throw new LedgerError("not_found", 404);
    if (!record.held) throw new LedgerError("invalid_input", 400, "record is not held");
    if (record.released) {
      await this.reapplyStatus(record);
    } else {
      const events: NewOutboxEvent[] = [{ subject: SUBJECT_RELEASED, payload: this.eventPayload(record) }];
      if (record.kind === "review") events.push({ subject: SUBJECT_REVIEW, payload: this.eventPayload(record) });
      let released = true;
      try {
        await this.store.insertRelease({ recordId, releasedBy: actor.id, releasedAt: this.now(), note }, events);
      } catch (error: any) {
        if (error?.code !== "duplicate") throw error; // a concurrent release won (it emits); fall through to the re-read
        released = false;
      }
      if (released) this.emit({ type: "released", id: record.id, kind: record.kind, campaignId: record.campaignId });
      if (record.setsStatus && record.campaignId) await this.store.setCampaignStatus(record.campaignId, record.setsStatus);
    }
    const after = await this.store.getRecord(recordId, { includeHeld: true });
    return (await this.withDisputes([after!], { includeHeld: true }))[0];
  }

  /**
   * The read-time disputed signal (ruling FI5): for each row, the ids of later corrections of it and of "breaks"
   * reviews of it that this viewer may see. Stored rows and their hash input are untouched.
   */
  private async withDisputes(rows: StoredRecord[], vis: { includeHeld: boolean }): Promise<PublicRecord[]> {
    if (!rows.length) return [];
    const challenges = await this.store.listChallenges(rows.map((r) => r.id), vis);
    const by = new Map<string, Disputes>();
    const entry = (id: string) => { let d = by.get(id); if (!d) { d = { correctedBy: [], brokenBy: [] }; by.set(id, d); } return d; };
    for (const c of challenges) {
      if (c.kind === "correction" && c.correctsId) entry(c.correctsId).correctedBy.push(c.id);
      else if (c.kind === "review" && c.verdict === "breaks" && c.reviewsId) entry(c.reviewsId).brokenBy.push(c.id);
    }
    return rows.map((r) => toPublicRecord(r, by.get(r.id)));
  }

  async getRecordView(viewer: Actor | null, id: string): Promise<RecordView | null> {
    const vis = { includeHeld: viewer !== null };
    const record = await this.store.getRecord(id, vis);
    if (!record) return null;
    const linked = await this.store.listLinkedTo(id, vis);
    const [self, ...rest] = await this.withDisputes([record, ...linked], vis);
    const byId = new Map(rest.map((p) => [p.id, p]));
    const pick = (f: (r: StoredRecord) => boolean) => linked.filter(f).map((r) => byId.get(r.id)!);
    return {
      record: self,
      corrections: pick((r) => r.correctsId === id),
      reviews: pick((r) => r.reviewsId === id),
      notes: pick((r) => r.aboutId === id),
      amendments: pick((r) => r.amendsId === id),
    };
  }

  async listRecords(
    viewer: Actor | null,
    q: { campaignId?: string; kind?: string; standing?: string; author?: string; before?: string; limit?: number },
  ): Promise<PublicRecord[]> {
    if (q.kind && !(LEDGER_KINDS as readonly string[]).includes(q.kind)) throw new LedgerError("invalid_input", 400, "unknown kind");
    if (q.standing && !(LEDGER_STANDINGS as readonly string[]).includes(q.standing)) throw new LedgerError("invalid_input", 400, "unknown standing");
    let authorId: string | undefined;
    if (q.author) {
      const u = await this.store.findUserByUsername(q.author);
      if (!u) return [];
      authorId = u.id;
    }
    const before = q.before ? new Date(q.before) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new LedgerError("invalid_input", 400, "before must be an ISO date");
    const rows = await this.store.listRecords(
      { campaignId: q.campaignId, kind: q.kind as any, standing: q.standing as any, authorId, before, limit: q.limit },
      { includeHeld: viewer !== null },
    );
    return this.withDisputes(rows, { includeHeld: viewer !== null });
  }

  async createCampaign(actor: Actor, input: unknown): Promise<PublicCampaign> {
    const parsed = campaignInputSchema.safeParse(input);
    if (!parsed.success) throw inputError(parsed.error);
    try {
      return toPublicCampaign(await this.store.insertCampaign({ ...parsed.data, ownerId: actor.id, status: "registered", createdAt: this.now() }), actor.username);
    } catch (error: any) {
      if (error?.code === "duplicate") throw new LedgerError("invalid_input", 409, "campaign id already exists");
      throw error;
    }
  }

  private async publicCampaigns(cs: LedgerCampaign[]): Promise<PublicCampaign[]> {
    const names = await this.store.usernamesFor(cs.map((c) => c.ownerId));
    return cs.map((c) => toPublicCampaign(c, names.get(c.ownerId) ?? "unknown"));
  }

  async listCampaigns(): Promise<PublicCampaign[]> {
    return this.publicCampaigns(await this.store.listCampaigns());
  }

  async getCampaignView(viewer: Actor | null, id: string): Promise<{ campaign: PublicCampaign; records: PublicRecord[] } | null> {
    const stored = await this.store.getCampaign(id);
    if (!stored) return null;
    const [campaign] = await this.publicCampaigns([stored]);
    const vis = { includeHeld: viewer !== null };
    const records = await this.store.listRecords({ campaignId: id, limit: 200 }, vis);
    return { campaign, records: await this.withDisputes(records, vis) };
  }

  async agentProfile(viewer: Actor | null, username: string): Promise<AgentProfile | null> {
    const u = await this.store.findUserByUsername(username);
    if (!u) return null;
    const vis = { includeHeld: viewer !== null };
    const [stats, records] = await Promise.all([
      this.store.authorStats(u.id, vis),
      this.store.listRecords({ authorId: u.id, limit: 100 }, vis),
    ]);
    return { username: u.username, invitedBy: null, stats, records: await this.withDisputes(records, vis) };
  }

  async pendingReleases(actor: Actor): Promise<PublicRecord[]> {
    this.assertReleaser(actor);
    return this.withDisputes(await this.store.listUnreleasedHeld(), { includeHeld: true });
  }
}
