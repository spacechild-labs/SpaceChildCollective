import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { ledgerVerifications } from "@shared/ledger-schema";
import { checkRecord, SPEC_COMMIT, VerifyCheckError, type Check, type Tier, type VerifyDeps, type VView } from "@shared/ledger-verify";
import type { PublicRecord, RecordView, VerificationDetail, VerificationSummary } from "@shared/ledger-public";

/**
 * Derived verification tiers (CLAIMED / MACHINE-CHECKED / PEER-REVIEWED) for public records, computed in the
 * background and cached. Reading a tier never fetches anything: a record with no cached result reads "unchecked" and
 * is queued. The tier never changes a record's standing or any stored record.
 *
 * Checks run as an anonymous reader (held records are invisible to them, exactly as to verify_record.py), so one
 * result serves every viewer. A held record is never checked and reads "unchecked".
 */

export type { TierOrUnchecked, VerificationDetail, VerificationSummary } from "@shared/ledger-public";

export interface VerificationRow {
  recordId: string;
  inputKey: string;
  tier: Tier | null;
  failed: boolean;
  mutable: boolean;
  error: string | null;
  checks: Check[];
  spec: string;
  checkedAt: Date;
}

export interface VerificationStore {
  get(ids: string[]): Promise<Map<string, VerificationRow>>;
  put(row: VerificationRow): Promise<void>;
}

export class MemoryVerificationStore implements VerificationStore {
  readonly rows = new Map<string, VerificationRow>();
  async get(ids: string[]) { return new Map(ids.filter((i) => this.rows.has(i)).map((i) => [i, this.rows.get(i)!])); }
  async put(row: VerificationRow) { this.rows.set(row.recordId, { ...row }); }
}

export class DrizzleVerificationStore implements VerificationStore {
  constructor(private readonly db: any) {}
  async get(ids: string[]) {
    if (!ids.length) return new Map<string, VerificationRow>();
    const rows: VerificationRow[] = await this.db.select().from(ledgerVerifications).where(inArray(ledgerVerifications.recordId, ids));
    return new Map(rows.map((r) => [r.recordId, r]));
  }
  async put(row: VerificationRow) {
    const { recordId, ...rest } = row;
    await this.db.insert(ledgerVerifications).values(row).onConflictDoUpdate({ target: ledgerVerifications.recordId, set: rest });
  }
  async delete(id: string) { await this.db.delete(ledgerVerifications).where(eq(ledgerVerifications.recordId, id)); }
}

/** What the service needs from the ledger: the anonymous view of a record and of a campaign. */
export interface LedgerReader {
  getRecordView(viewer: null, id: string, opts: { tiers: false }): Promise<RecordView | null>;
  getCampaignView(viewer: null, id: string, opts: { tiers: false }): Promise<{ records: PublicRecord[] } | null>;
}

export interface EvidenceFetcher {
  fetchSha256(url: string): Promise<[string, number] | [null, string]>;
  fetchCrlfSha256(url: string): Promise<string | null>;
}

const DAY = 86_400_000;
/** Re-check a result that could not be run, or whose evidence URL can change, after a day; anything else after 30. */
export const RECHECK_ERROR_OR_MUTABLE_MS = DAY;
export const RECHECK_MS = 30 * DAY;

/** Everything a record's tier depends on that can change after filing (new notes, reviews, corrections). */
export function inputKey(v: RecordView): string {
  const doc = {
    spec: SPEC_COMMIT,
    record: v.record.contentHash,
    notes: v.notes.map((n) => [n.id, n.evidence]),
    reviews: v.reviews.map((r) => [r.id, r.authorUsername, r.verdict]),
    correctedBy: v.record.correctedBy,
    brokenBy: v.record.brokenBy,
  };
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

export function isStale(row: VerificationRow, now: Date, key?: string): boolean {
  if (key !== undefined && row.inputKey !== key) return true;
  if (row.spec !== SPEC_COMMIT) return true;
  const age = now.getTime() - row.checkedAt.getTime();
  if (row.tier === null || row.mutable) return age > RECHECK_ERROR_OR_MUTABLE_MS;
  return age > RECHECK_MS;
}

const toView = (v: RecordView): VView => ({ record: v.record, reviews: v.reviews, notes: v.notes });

export class VerificationService {
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private running = false;
  private storeDown = false;
  private readonly now: () => Date;

  constructor(
    private readonly store: VerificationStore,
    private readonly ledger: LedgerReader,
    private readonly fetcher: EvidenceFetcher,
    opts: { now?: () => Date; guard?: VerifyDeps["guard"]; autoStart?: boolean } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.guard = opts.guard;
    this.autoStart = opts.autoStart ?? true;
  }
  private readonly guard?: VerifyDeps["guard"];
  private readonly autoStart: boolean;

  /** Cached tiers for records; never fetches. Records without a usable result read "unchecked" and are queued. */
  async summaries(records: Array<Pick<PublicRecord, "id" | "held" | "released">>): Promise<Map<string, VerificationSummary>> {
    const out = new Map<string, VerificationSummary>();
    const visible = records.filter((r) => !r.held || r.released);
    let rows = new Map<string, VerificationRow>();
    try {
      rows = await this.store.get(visible.map((r) => r.id));
    } catch (e) {
      this.noteStoreDown(e);
    }
    const now = this.now();
    for (const r of records) {
      const row = rows.get(r.id);
      if (!row || row.tier === null) out.set(r.id, { tier: "unchecked", checkedAt: row ? row.checkedAt.toISOString() : null });
      else out.set(r.id, { tier: row.tier, checkedAt: row.checkedAt.toISOString() });
      if (!this.storeDown && (!r.held || r.released) && (!row || isStale(row, now))) this.enqueue(r.id);
    }
    return out;
  }

  /** The full result for one record's page; the view is the one the page already loaded. */
  async detail(view: RecordView): Promise<VerificationDetail> {
    const blank: VerificationDetail = { tier: "unchecked", checkedAt: null, failed: false, checks: [], error: null, spec: SPEC_COMMIT };
    const r = view.record;
    if (r.held && !r.released) return { ...blank, error: "held records are checked once released" };
    let row: VerificationRow | undefined;
    try {
      row = (await this.store.get([r.id])).get(r.id);
    } catch (e) {
      this.noteStoreDown(e);
      return blank;
    }
    if (!this.storeDown && (!row || isStale(row, this.now(), inputKey(view)))) this.enqueue(r.id);
    if (!row) return blank;
    return {
      tier: row.tier ?? "unchecked", checkedAt: row.checkedAt.toISOString(), failed: row.failed, checks: row.checks,
      error: row.error, spec: row.spec,
    };
  }

  /** A record was filed or released: check it, and re-check whatever it links to (a note, review or correction changes its target's inputs). */
  onPublic(id: string): void { this.enqueue(id, true); }

  enqueue(id: string, withTargets = false): void {
    const key = withTargets ? `+${id}` : id;
    if (this.queued.has(key) || this.queued.has(id)) return;
    this.queued.add(key);
    this.queue.push(key);
    if (this.autoStart) void this.drain();
  }

  /** Runs queued checks one at a time. Returns when the queue is empty. */
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const key = this.queue.shift()!;
        this.queued.delete(key);
        const id = key.startsWith("+") ? key.slice(1) : key;
        try {
          const view = await this.ledger.getRecordView(null, id, { tiers: false });
          if (!view) continue; // held or gone: nothing a reader can check
          if (key.startsWith("+")) {
            const r = view.record;
            for (const t of [r.aboutId, r.reviewsId, r.correctsId, r.amendsId]) if (t) this.enqueue(t);
          }
          await this.runOne(view);
        } catch (e) {
          console.error(`[ledger-verify] ${id}: ${(e as Error)?.message ?? e}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async runOne(view: RecordView): Promise<VerificationRow> {
    const deps: VerifyDeps = {
      getView: async (id) => {
        const v = await this.ledger.getRecordView(null, id, { tiers: false });
        return v ? toView(v) : null;
      },
      getCampaignRecords: async (cid) => (await this.ledger.getCampaignView(null, cid, { tiers: false }))?.records ?? null,
      fetchSha256: (u) => this.fetcher.fetchSha256(u),
      fetchCrlfSha256: (u) => this.fetcher.fetchCrlfSha256(u),
      guard: this.guard,
    };
    const base = { recordId: view.record.id, inputKey: inputKey(view), spec: SPEC_COMMIT, checkedAt: this.now() };
    let row: VerificationRow;
    try {
      const res = await checkRecord(view.record.id, deps, new Map([[view.record.id, toView(view)]]));
      row = { ...base, tier: res.tier, failed: res.failed, mutable: res.mutable, error: null, checks: res.checks };
    } catch (e) {
      if (!(e instanceof VerifyCheckError)) throw e;
      row = { ...base, tier: null, failed: false, mutable: false, error: e.message, checks: [] };
    }
    try {
      await this.store.put(row);
    } catch (e) {
      this.noteStoreDown(e);
    }
    return row;
  }

  // Before the table exists (db:push not yet run) every store call fails; say so once, keep serving "unchecked".
  private noteStoreDown(e: unknown): void {
    if (this.storeDown) return;
    this.storeDown = true;
    console.warn(`[ledger-verify] verification store unavailable, tiers read "unchecked": ${(e as Error)?.message ?? e}`);
  }
}
