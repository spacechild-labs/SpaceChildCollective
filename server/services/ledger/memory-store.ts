import type {
  AgentKey, CampaignStatus, LedgerCampaign, LedgerOutboxEvent, LedgerRecord, LedgerRelease, NewAgentKey,
  NewLedgerCampaign, NewLedgerRecord, NewLedgerRelease,
} from "@shared/ledger-schema";
import { randomUUID } from "node:crypto";
import type {
  AgentKeyStore, AuthorStats, LedgerStore, NewOutboxEvent, RecordFilter, StoredRecord, Visibility,
} from "./types";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "./types";
import { ulid } from "./ulid";

const LINK_FIELDS = ["correctsId", "reviewsId", "amendsId", "aboutId"] as const;

function newestFirst(a: LedgerRecord, b: LedgerRecord): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
}

/** Test and local-dev implementation of LedgerStore. Same visibility rules as the Drizzle store. */
export class MemoryLedgerStore implements LedgerStore {
  private campaigns = new Map<string, LedgerCampaign>();
  private records = new Map<string, LedgerRecord>();
  private releases = new Map<string, LedgerRelease>();
  private outbox: LedgerOutboxEvent[] = [];
  private users = new Map<string, { id: string; username: string }>();

  constructor(users: Array<{ id: string; username: string }> = []) {
    for (const u of users) this.addUser(u);
  }

  addUser(u: { id: string; username: string }): void {
    this.users.set(u.id, u);
  }

  private stored(r: LedgerRecord): StoredRecord {
    return { ...r, authorUsername: this.users.get(r.authorId)?.username ?? "unknown", released: this.releases.has(r.id) };
  }

  private visible(r: LedgerRecord, vis: Visibility): boolean {
    return vis.includeHeld || !r.held || this.releases.has(r.id);
  }

  async getCampaign(id: string) { return this.campaigns.get(id); }

  async listCampaigns() {
    return [...this.campaigns.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async insertCampaign(c: NewLedgerCampaign): Promise<LedgerCampaign> {
    if (this.campaigns.has(c.id)) throw Object.assign(new Error("campaign exists"), { code: "duplicate" });
    const row: LedgerCampaign = {
      id: c.id, title: c.title, summary: c.summary ?? "", ownerId: c.ownerId,
      status: (c.status ?? "registered") as CampaignStatus, links: c.links ?? [], createdAt: c.createdAt ?? new Date(),
    };
    this.campaigns.set(row.id, row);
    return row;
  }

  async setCampaignStatus(id: string, status: CampaignStatus) {
    const c = this.campaigns.get(id);
    if (c) this.campaigns.set(id, { ...c, status });
  }

  async findUserByUsername(username: string) {
    return [...this.users.values()].find((u) => u.username === username);
  }

  async getRecord(id: string, vis: Visibility) {
    const r = this.records.get(id);
    return r && this.visible(r, vis) ? this.stored(r) : undefined;
  }

  async findByClientRef(authorId: string, clientRef: string) {
    const r = [...this.records.values()].find((x) => x.authorId === authorId && x.clientRef === clientRef);
    return r ? this.stored(r) : undefined;
  }

  async listRecords(filter: RecordFilter, vis: Visibility) {
    const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    return [...this.records.values()]
      .filter((r) => this.visible(r, vis))
      .filter((r) => !filter.campaignId || r.campaignId === filter.campaignId)
      .filter((r) => !filter.kind || r.kind === filter.kind)
      .filter((r) => !filter.standing || r.standing === filter.standing)
      .filter((r) => !filter.authorId || r.authorId === filter.authorId)
      .filter((r) => !filter.before || r.createdAt.getTime() < filter.before.getTime())
      .sort(newestFirst)
      .slice(0, limit)
      .map((r) => this.stored(r));
  }

  async listLinkedTo(recordId: string, vis: Visibility) {
    return [...this.records.values()]
      .filter((r) => LINK_FIELDS.some((f) => r[f] === recordId))
      .filter((r) => this.visible(r, vis))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => this.stored(r));
  }

  async insertRecord(n: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord> {
    if (n.clientRef && [...this.records.values()].some((r) => r.authorId === n.authorId && r.clientRef === n.clientRef)) {
      throw Object.assign(new Error("duplicate client_ref"), { code: "duplicate_client_ref" });
    }
    const row: LedgerRecord = {
      id: n.id, campaignId: n.campaignId ?? null, kind: n.kind, title: n.title, body: n.body ?? "",
      standing: n.standing, evidence: n.evidence ?? [], correctsId: n.correctsId ?? null, reviewsId: n.reviewsId ?? null,
      verdict: n.verdict ?? null, amendsId: n.amendsId ?? null, aboutId: n.aboutId ?? null, setsStatus: n.setsStatus ?? null,
      authorId: n.authorId, clientRef: n.clientRef ?? null, held: n.held ?? false, contentHash: n.contentHash,
      filedVia: n.filedVia, createdAt: n.createdAt,
    };
    this.records.set(row.id, row);
    for (const e of events) this.outbox.push({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: row.createdAt, publishedAt: null });
    return this.stored(row);
  }

  async getRelease(recordId: string) { return this.releases.get(recordId); }

  async insertRelease(n: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease> {
    if (this.releases.has(n.recordId)) throw Object.assign(new Error("already released"), { code: "duplicate" });
    const row: LedgerRelease = { recordId: n.recordId, releasedBy: n.releasedBy, releasedAt: n.releasedAt, note: n.note ?? null };
    this.releases.set(row.recordId, row);
    for (const e of events) this.outbox.push({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: row.releasedAt, publishedAt: null });
    return row;
  }

  async listUnreleasedHeld() {
    return [...this.records.values()].filter((r) => r.held && !this.releases.has(r.id)).sort(newestFirst).map((r) => this.stored(r));
  }

  async listUnpublishedEvents(limit: number) {
    return this.outbox.filter((e) => !e.publishedAt).slice(0, limit);
  }

  async markEventPublished(id: string, at: Date) {
    const e = this.outbox.find((x) => x.id === id);
    if (e) e.publishedAt = at;
  }

  async authorStats(authorId: string, vis: Visibility): Promise<AuthorStats> {
    const all = [...this.records.values()].filter((r) => this.visible(r, vis));
    const mine = all.filter((r) => r.authorId === authorId);
    const mineIds = new Set(mine.map((r) => r.id));
    return {
      filed: mine.length,
      reviewsGiven: mine.filter((r) => r.kind === "review").length,
      reviewsReceived: all.filter((r) => r.kind === "review" && r.reviewsId && mineIds.has(r.reviewsId)).length,
      corrected: new Set(all.filter((r) => r.kind === "correction" && r.correctsId && mineIds.has(r.correctsId)).map((r) => r.correctsId)).size,
      retracted: mine.filter((r) => r.standing === "retracted").length,
    };
  }
}

export class MemoryAgentKeyStore implements AgentKeyStore {
  private keys = new Map<string, AgentKey>();

  async insert(k: NewAgentKey): Promise<AgentKey> {
    const row: AgentKey = {
      id: k.id ?? randomUUID(), userId: k.userId, name: k.name, prefix: k.prefix, keyHash: k.keyHash,
      ed25519PublicKey: k.ed25519PublicKey ?? null, createdAt: k.createdAt ?? new Date(),
      lastUsedAt: k.lastUsedAt ?? null, revokedAt: k.revokedAt ?? null,
    };
    this.keys.set(row.id, row);
    return row;
  }
  async findByHash(keyHash: string) { return [...this.keys.values()].find((k) => k.keyHash === keyHash); }
  async findById(id: string) { return this.keys.get(id); }
  async listForUser(userId: string) { return [...this.keys.values()].filter((k) => k.userId === userId); }
  async revoke(id: string, at: Date) {
    const k = this.keys.get(id);
    if (!k) return undefined;
    const row = { ...k, revokedAt: k.revokedAt ?? at };
    this.keys.set(id, row);
    return row;
  }
  async touch(id: string, at: Date) {
    const k = this.keys.get(id);
    if (k) this.keys.set(id, { ...k, lastUsedAt: at });
  }
}
