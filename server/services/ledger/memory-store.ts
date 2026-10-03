import type {
  AgentKey, CampaignStatus, LedgerCampaign, LedgerInvite, NewLedgerInvite, LedgerOutboxEvent, LedgerRecord, LedgerRelease, NewAgentKey,
  NewLedgerCampaign, NewLedgerRecord, NewLedgerRelease,
} from "@shared/ledger-schema";
import { randomUUID } from "node:crypto";
import type {
  AgentKeyStore, AuthorStats, InviteStore, LedgerStore, NewOutboxEvent, RecordFilter, StoredRecord, Visibility,
} from "./types";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "./types";
import { ulid } from "./ulid";
import { retractedCount } from "./stats";

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

  async usernamesFor(ids: string[]) {
    const out = new Map<string, string>();
    for (const id of ids) { const u = this.users.get(id); if (u) out.set(id, u.username); }
    return out;
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

  async listChallenges(recordIds: string[], vis: Visibility) {
    const ids = new Set(recordIds);
    return [...this.records.values()]
      .filter((r) => (r.kind === "correction" && r.correctsId && ids.has(r.correctsId))
        || (r.kind === "review" && r.verdict === "breaks" && r.reviewsId && ids.has(r.reviewsId)))
      .filter((r) => this.visible(r, vis))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
      .map((r) => this.stored(r));
  }

  async insertRecord(n: NewLedgerRecord, events: NewOutboxEvent[]): Promise<StoredRecord> {
    if (this.records.has(n.id)) throw Object.assign(new Error("duplicate id"), { code: "duplicate" });
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
    for (const e of events) this.outbox.push({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: row.createdAt, publishedAt: null, claimedAt: null, claimedBy: null });
    return this.stored(row);
  }

  async getRelease(recordId: string) { return this.releases.get(recordId); }

  async insertRelease(n: NewLedgerRelease, events: NewOutboxEvent[]): Promise<LedgerRelease> {
    if (this.releases.has(n.recordId)) throw Object.assign(new Error("already released"), { code: "duplicate" });
    const row: LedgerRelease = { recordId: n.recordId, releasedBy: n.releasedBy, releasedAt: n.releasedAt, note: n.note ?? null };
    this.releases.set(row.recordId, row);
    for (const e of events) this.outbox.push({ id: ulid(), subject: e.subject, payload: e.payload, createdAt: row.releasedAt, publishedAt: null, claimedAt: null, claimedBy: null });
    return row;
  }

  async listUnreleasedHeld() {
    return [...this.records.values()].filter((r) => r.held && !this.releases.has(r.id)).sort(newestFirst).map((r) => this.stored(r));
  }

  async listUnpublishedEvents(limit: number) {
    return this.outbox.filter((e) => !e.publishedAt).slice(0, limit);
  }

  /** Synchronous body, so two concurrent callers on one event loop can never interleave inside a claim. */
  async claimUnpublishedEvents(limit: number, claimant: string, now: Date, leaseMs: number) {
    const cutoff = now.getTime() - leaseMs;
    const free = this.outbox.filter((e) => !e.publishedAt && (!e.claimedAt || e.claimedAt.getTime() < cutoff)).slice(0, limit);
    for (const e of free) { e.claimedAt = now; e.claimedBy = claimant; }
    return free.map((e) => ({ ...e }));
  }

  async releaseEventClaims(ids: string[], claimant: string) {
    for (const e of this.outbox) {
      if (ids.includes(e.id) && e.claimedBy === claimant && !e.publishedAt) { e.claimedAt = null; e.claimedBy = null; }
    }
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
      retracted: retractedCount(mine, all),
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

const inviteNewestFirst = (a: LedgerInvite, b: LedgerInvite) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);

const inviteOpen = (i: LedgerInvite, now: Date) => i.revokedAt === null && i.expiresAt > now && i.uses < i.maxUses;

export class MemoryInviteStore implements InviteStore {
  private invites = new Map<string, LedgerInvite>();

  async insert(i: NewLedgerInvite): Promise<LedgerInvite> {
    const row: LedgerInvite = {
      id: i.id, codeHash: i.codeHash, prefix: i.prefix, createdBy: i.createdBy, note: i.note ?? null,
      grantsInvite: i.grantsInvite ?? false, maxUses: i.maxUses ?? 1, uses: i.uses ?? 0, expiresAt: i.expiresAt,
      revokedAt: i.revokedAt ?? null, createdAt: i.createdAt ?? new Date(),
    };
    this.invites.set(row.id, row);
    return row;
  }
  async findByHash(codeHash: string) { return [...this.invites.values()].find((i) => i.codeHash === codeHash); }
  async findById(id: string) { return this.invites.get(id); }
  // Check and write happen with no await in between, so concurrent claims cannot both win.
  async claim(codeHash: string, now: Date) {
    const cur = [...this.invites.values()].find((i) => i.codeHash === codeHash);
    if (!cur || !inviteOpen(cur, now)) return undefined;
    const row = { ...cur, uses: cur.uses + 1 };
    this.invites.set(row.id, row);
    return row;
  }
  async release(id: string) {
    const cur = this.invites.get(id);
    if (cur) this.invites.set(id, { ...cur, uses: Math.max(cur.uses - 1, 0) });
  }
  async revoke(id: string, at: Date) {
    const cur = this.invites.get(id);
    if (!cur) return undefined;
    const row = { ...cur, revokedAt: cur.revokedAt ?? at };
    this.invites.set(id, row);
    return row;
  }
  async revokeAllByCreators(userIds: string[], at: Date) {
    let n = 0;
    for (const cur of [...this.invites.values()]) {
      if (userIds.includes(cur.createdBy) && inviteOpen(cur, at)) {
        this.invites.set(cur.id, { ...cur, revokedAt: at });
        n++;
      }
    }
    return n;
  }
  async listByCreator(userId: string) {
    return [...this.invites.values()].filter((i) => i.createdBy === userId).sort(inviteNewestFirst);
  }
  async listAll() { return [...this.invites.values()].sort(inviteNewestFirst); }
  async countMintedSince(userId: string, since: Date) {
    return [...this.invites.values()].filter((i) => i.createdBy === userId && i.createdAt >= since).length;
  }
  async countOpen(userId: string, now: Date) {
    return [...this.invites.values()].filter((i) => i.createdBy === userId && inviteOpen(i, now)).length;
  }
}
