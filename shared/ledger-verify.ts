/**
 * The derived verification tier of a ledger record: a port of flaukowski-brain ledger/verify_record.py at commit
 * b3ba75d (the specification; its 24 tests define each tier, and shared/ledger-verify.test.ts ports them case by
 * case). A record's standing is set by whoever files it, so on its own it is a self-report. This is the machine gate
 * ahead of that standing: it checks what a machine can check and says what is left for a peer. It never changes the
 * standing or any stored row.
 *
 * Tiers, in order: CLAIMED (filed; also any record with no evidence, since nothing could be checked),
 * MACHINE-CHECKED (it has evidence, and evidence, links and order all pass),
 * PEER-REVIEWED (also at least one review by another author whose verdict is "holds"; "breaks", "inconclusive" and
 * any unknown verdict do not raise it).
 *
 * A check that could not be run (network, a missing record) raises VerifyCheckError: an error is never reported as a
 * failure, nor a failure as an error. The server shows such a record as "unchecked", never a guessed tier.
 *
 * Deliberate differences from the script, both outside the tier rule:
 *  - the pub_guard fingerprint is not published on this server, so the guard check is optional (`deps.guard`); the
 *    script only ever reports a guard hit as a warning, so it never changes the tier;
 *  - which hosts the server will fetch from is the fetcher's business (server/services/ledger/verify-fetch.ts); a
 *    refused host is a VerifyCheckError (unchecked), not a failure.
 */

export const SPEC_COMMIT = "b3ba75d";
export const SPEC_URL = "https://github.com/flaukowski/flaukowski-brain/blob/b3ba75d/ledger/verify_record.py";

export type Tier = "CLAIMED" | "MACHINE-CHECKED" | "PEER-REVIEWED";
export type CheckStatus = "PASS" | "FAIL" | "WARN" | "INFO";
export interface Check { status: CheckStatus; what: string }

export class VerifyCheckError extends Error {
  constructor(message: string) { super(message); this.name = "VerifyCheckError"; }
}

// ledger ids are 26-character Crockford base32, time-sortable; every one seen so far starts 01M
const ID_RE = /\b01[0-9A-HJKMNP-TV-Z]{24}\b/g;
const SHA_RE = /\b[0-9a-f]{64}\b/g;
export const LINK_FIELDS = ["correctsId", "amendsId", "aboutId", "reviewsId"] as const;
// a review raises a record only when it endorses it. The ledger's review verdicts are holds, breaks and
// inconclusive; only "holds" endorses. Anything else, including a verdict this list has never seen, does not raise
// the tier: an allowlist, so a new word cannot turn a rejection into an endorsement.
export const ENDORSING = new Set(["holds"]);

/** The parts of a record the checks read (the shape of the public API's record). */
export interface VRecord {
  id: string;
  kind: string;
  standing: string;
  authorUsername: string;
  campaignId: string | null;
  title?: string | null;
  body?: string | null;
  evidence?: Array<{ url: string; sha256?: string; label?: string }> | null;
  createdAt: string;
  correctsId?: string | null;
  amendsId?: string | null;
  aboutId?: string | null;
  reviewsId?: string | null;
  correctedBy?: string[] | null;
  brokenBy?: string[] | null;
}

/** GET /api/ledger/records/:id as the public sees it: the record, the reviews of it and the notes about it. */
export interface VView {
  record: VRecord;
  reviews?: Array<{ authorUsername?: string; verdict?: string | null }> | null;
  notes?: Array<{ id: string; evidence?: Array<{ url: string; sha256?: string; label?: string }> | null }> | null;
}

export interface VerifyDeps {
  /** The public view of a record, or null when there is no such record. */
  getView(id: string): Promise<VView | null>;
  /** The public records of a campaign, or null when there is no such campaign. */
  getCampaignRecords(campaignId: string): Promise<Array<{ id: string; kind: string; createdAt?: string | null }> | null>;
  /** [sha256, bytes] of the file at url; [null, "HTTP 404"] when the server answers with an error status. */
  fetchSha256(url: string): Promise<[string, number] | [null, string]>;
  /** sha256 of the file with LF line endings turned into CRLF (what a Windows working copy hashes to), or null. */
  fetchCrlfSha256(url: string): Promise<string | null>;
  /** Number of held-out (BLOCK) hits in the text, when a pub_guard fingerprint is available here. */
  guard?: (text: string) => Promise<number> | number;
}

export interface VerifyResult {
  id: string;
  tier: Tier;
  failed: boolean;
  checks: Check[];
  /** The header line and the checks as the script prints them. */
  lines: string[];
  /** True when some evidence URL is not pinned to a commit (its content can change under the same URL). */
  mutable: boolean;
}

/** True when the URL names content by a full commit sha, so it cannot change under the same URL. */
export function pinned(url: string): boolean {
  return /\/[0-9a-f]{40}\//.test(url) || /\/(blob|raw|tree)\/[0-9a-f]{40}\//.test(url);
}

const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();

export async function checkRecord(rid: string, deps: VerifyDeps, cache: Map<string, VView> = new Map()): Promise<VerifyResult> {
  const d = cache.get(rid) ?? (await deps.getView(rid));
  if (!d) throw new VerifyCheckError(`record ${rid} not found`);
  cache.set(rid, d);
  const r = d.record;
  const checks: Check[] = [];
  const lines: string[] = [];
  let failed = false;
  let mutable = false;

  const say = (status: CheckStatus, what: string) => {
    if (status === "FAIL") failed = true;
    checks.push({ status, what });
    lines.push(`  ${status.padEnd(7)} ${what}`);
  };

  lines.push(`${rid}  ${r.kind} / ${r.standing}  by ${r.authorUsername}  (${r.campaignId})`);

  const own = r.evidence ?? [];
  const text0 = `${r.title ?? ""} ${r.body ?? ""}`;
  // evidence attached later, in a note about this record, counts only when its sha256 was already
  // cited in this record's own text: that hash was committed at filing, before the note existed
  const cited = new Set(text0.toLowerCase().match(SHA_RE) ?? []);
  const late = (d.notes ?? []).flatMap((n) => (n.evidence ?? []).map((e) => [n.id, e] as const));
  const backed = late.filter(([, e]) => cited.has(lower(e.sha256))).map(([, e]) => e);
  for (const [nid, e] of late) {
    if (cited.has(lower(e.sha256))) continue;
    const crlf = await deps.fetchCrlfSha256(e.url);
    if (crlf !== null && cited.has(crlf)) {
      // the record cited a Windows (CRLF) copy; the same bytes with CRLF endings match it exactly
      backed.push(e);
      say("PASS", `evidence '${e.label || e.url}' (note ${nid}): with CRLF line endings it matches a sha256 cited at filing, so it is the same file`);
    } else {
      say("WARN", `evidence '${e.label || e.url}' (note ${nid}): its sha256 was not cited at filing, so it does not back this record`);
    }
  }
  const ev = [...own, ...backed];
  if (!ev.length) say("WARN", "evidence: none attached");
  for (const e of ev) {
    if (!own.some((o) => o === e || JSON.stringify(o) === JSON.stringify(e))) lines.push(`  ${"".padEnd(7)} (backfilled, its sha256 cited at filing)`);
    const [got, size] = await deps.fetchSha256(e.url);
    const label = e.label || e.url;
    if (got === null) {
      say("FAIL", `evidence '${label}': not fetchable (${size})`);
    } else if (!e.sha256) {
      say("WARN", `evidence '${label}': no sha256 recorded, fetched ${size} bytes, sha256 ${got.slice(0, 16)}...`);
    } else if (got !== e.sha256.toLowerCase()) {
      say("FAIL", `evidence '${label}': sha256 ${got.slice(0, 16)}... != recorded ${e.sha256.slice(0, 16)}...`);
    } else {
      if (!pinned(e.url)) mutable = true;
      say("PASS", `evidence '${label}': sha256 matches (${size} bytes)` + (pinned(e.url) ? "" : "; URL is MUTABLE (not pinned to a commit)"));
    }
  }

  const linked = new Set(LINK_FIELDS.map((f) => r[f]).filter((x): x is string => Boolean(x)));
  const named = new Set((text0.match(ID_RE) ?? []).filter((x) => x !== rid));
  for (const lid of [...new Set([...linked, ...named])].sort()) {
    const other = cache.get(lid) ?? (await deps.getView(lid));
    if (!other) {
      say("FAIL", `link ${lid}: no such record (${linked.has(lid) ? "field" : "named in text"})`);
      continue;
    }
    cache.set(lid, other);
    const o = other.record;
    say("PASS", `link ${lid}: exists (${o.kind}, ${o.campaignId})`);
    if (r.amendsId === lid && o.createdAt >= r.createdAt) say("FAIL", `order: amends ${lid}, which was filed after it`);
  }

  if (r.kind === "result") {
    const camp = r.campaignId ? await deps.getCampaignRecords(r.campaignId) : null;
    if (camp === null) throw new VerifyCheckError(`campaign ${r.campaignId} not found`);
    const pre = camp.filter((x) => x.kind === "preregistration");
    const dated = pre.filter((x) => x.createdAt);
    const early = dated.filter((x) => (x.createdAt as string) < r.createdAt);
    if (!pre.length) say("FAIL", "order: result with no preregistration in its campaign");
    else if (!dated.length) say("WARN", "order: preregistration has no filing time, so the order cannot be checked");
    else if (!early.length) say("FAIL", "order: the campaign's preregistration was filed after this result");
    else say("PASS", `order: preregistration ${early[0].id} filed before this result`);
  }

  if (deps.guard) {
    const blocks = await deps.guard(`${r.title ?? ""}\n${r.body ?? ""}`);
    // pub_guard leaves coincidences to a person to accept, and older records predate the current
    // fingerprint, so a hit on a filed record is a prompt to look, not a failed check
    if (blocks) say("WARN", `guard: ${blocks} held-out hit(s) in title/body; a person should judge them`);
    else say("PASS", "guard: no held-out hit in title/body");
  } else {
    say("INFO", "guard: not run here (the held-out fingerprint is not published on this server); it never changes the tier");
  }

  const peers = (d.reviews ?? []).filter((v) => v.authorUsername !== r.authorUsername);
  const holding = peers.filter((v) => ENDORSING.has(lower(v.verdict)));
  const against = peers.filter((v) => lower(v.verdict) === "breaks");
  if (against.length) say("WARN", `peer: ${against.length} review(s) by another author say the record breaks`);
  if ((r.correctedBy && r.correctedBy.length) || (r.brokenBy && r.brokenBy.length)) {
    say("WARN", `corrected by ${JSON.stringify(r.correctedBy ?? [])} / broken by ${JSON.stringify(r.brokenBy ?? [])}`);
  }
  say("INFO", `peer: ${peers.length} review(s) by another author` + (peers.length ? `, ${holding.length} saying it holds` : "; the standing rests on the author"));

  // with no evidence there is nothing for the machine to have checked, so nothing has been raised
  const tier: Tier = failed || !ev.length ? "CLAIMED" : holding.length ? "PEER-REVIEWED" : "MACHINE-CHECKED";
  lines.push(`  => ${tier}`);
  return { id: rid, tier, failed, checks, lines, mutable };
}
