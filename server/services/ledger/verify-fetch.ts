import { createHash } from "node:crypto";
import { VerifyCheckError } from "@shared/ledger-verify";

/**
 * Evidence fetching for the derived tier (shared/ledger-verify.ts). The script fetches any URL from the reader's own
 * machine; a server must not, or any filer could make it request internal addresses. So the server fetches only
 * https URLs on hosts it allows, and checks every redirect hop against the same list. A refused host is a check that
 * could not be run (the record shows "unchecked"), never a failure: the reader can still run verify_record.py.
 *
 * Limits follow the script: 512 MiB per file (larger is an error, not a failure) and 120 s without progress.
 */

export const MAX_BYTES = 512 * 1024 * 1024;
const IDLE_MS = 120_000;
const TOTAL_MS = 15 * 60_000;
const MAX_REDIRECTS = 8;

/** Hosts evidence on the ledger lives on (surveyed 2026-10-16), and where they redirect downloads to. */
export const DEFAULT_ALLOWED_HOSTS = [
  "raw.githubusercontent.com", "gist.githubusercontent.com", "github.com", "codeload.github.com",
  "objects.githubusercontent.com", "release-assets.githubusercontent.com",
  "huggingface.co", "*.huggingface.co", "*.hf.co",
  "files.profullstack.com", "thecolony.ai", "yukon.org",
];

export function allowedHosts(extra = process.env.LEDGER_VERIFY_HOSTS): string[] {
  const more = (extra ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return [...DEFAULT_ALLOWED_HOSTS, ...more];
}

export function hostAllowed(url: string, hosts: string[] = allowedHosts()): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  return hosts.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

type FetchLike = (url: string, init: { redirect: "manual"; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/** Follows redirects by hand so every hop is checked. Returns the final response, or throws VerifyCheckError. */
async function open(url: string, f: FetchLike, hosts: string[], signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!hostAllowed(current, hosts)) {
      throw new VerifyCheckError(`${current}: host not on this server's fetch list (run verify_record.py to check it)`);
    }
    let res: Response;
    try {
      res = await f(current, { redirect: "manual", headers: { "User-Agent": "curl/8" }, signal });
    } catch (e: any) {
      throw new VerifyCheckError(`${current}: ${e?.message ?? e}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      try { await res.body?.cancel(); } catch { /* ignore */ }
      continue;
    }
    return res;
  }
  throw new VerifyCheckError(`${url}: too many redirects`);
}

/** Streams the body through `onChunk`, enforcing the size cap and the idle and total timeouts. */
async function stream(url: string, f: FetchLike, hosts: string[], onChunk: (c: Uint8Array) => void): Promise<{ status: number; bytes: number }> {
  const ac = new AbortController();
  const total = setTimeout(() => ac.abort(), TOTAL_MS);
  let idle = setTimeout(() => ac.abort(), IDLE_MS);
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), IDLE_MS); };
  try {
    const res = await open(url, f, hosts, ac.signal);
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { status: res.status, bytes: -1 };
    }
    let n = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        let r: ReadableStreamReadResult<Uint8Array>;
        try { r = await reader.read(); } catch (e: any) { throw new VerifyCheckError(`${url}: ${e?.message ?? e}`); }
        if (r.done) break;
        touch();
        n += r.value.byteLength;
        if (n > MAX_BYTES) {
          try { await reader.cancel(); } catch { /* ignore */ }
          throw new VerifyCheckError(`${url}: larger than ${MAX_BYTES} bytes`);
        }
        onChunk(r.value);
      }
    }
    return { status: res.status, bytes: n };
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
  }
}

/** LF -> CRLF over a stream, after folding any CRLF to LF first (the script's replace order), carrying a trailing CR. */
export function crlfTransform(): { push(c: Uint8Array): Uint8Array; end(): Uint8Array } {
  let pendingCR = false;
  return {
    push(c) {
      const out: number[] = [];
      for (const b of c) {
        if (pendingCR) {
          pendingCR = false;
          if (b === 0x0a) { out.push(0x0d, 0x0a); continue; }
          out.push(0x0d);
        }
        if (b === 0x0d) { pendingCR = true; continue; }
        if (b === 0x0a) { out.push(0x0d, 0x0a); continue; }
        out.push(b);
      }
      return Uint8Array.from(out);
    },
    end() { const tail = pendingCR ? Uint8Array.of(0x0d) : new Uint8Array(0); pendingCR = false; return tail; },
  };
}

export function makeEvidenceFetcher(opts: { fetch?: FetchLike; hosts?: string[] } = {}) {
  const f: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const hosts = opts.hosts ?? allowedHosts();
  return {
    /** As the script's fetch_sha256: an HTTP error status is [null, "HTTP n"] (a failure); anything else that stops the fetch is an error. */
    async fetchSha256(url: string): Promise<[string, number] | [null, string]> {
      const h = createHash("sha256");
      const { status, bytes } = await stream(url, f, hosts, (c) => h.update(c));
      if (bytes < 0) return [null, `HTTP ${status}`];
      return [h.digest("hex"), bytes];
    },
    /** As the script's fetch_crlf_sha256: any problem is null (it is only ever a second chance for a backfill). */
    async fetchCrlfSha256(url: string): Promise<string | null> {
      const h = createHash("sha256");
      const t = crlfTransform();
      try {
        const { bytes } = await stream(url, f, hosts, (c) => h.update(t.push(c)));
        if (bytes < 0) return null;
      } catch {
        return null;
      }
      h.update(t.end());
      return h.digest("hex");
    },
  };
}
