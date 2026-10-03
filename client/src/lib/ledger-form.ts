import type { LedgerEvidence } from "@shared/ledger-schema";
import { safeHref } from "./ledger-view";

export interface FileForm {
  kind: string;
  campaignId: string;
  title: string;
  body: string;
  standing: string;
  evidenceText: string;
  linkId: string;
  verdict: string;
  setsStatus: string;
  held: boolean;
  clientRef: string;
}

/** One evidence item per line: `label | url | sha256 (optional)`. Only http(s) urls (same rule as the server's httpUrl). */
export function parseEvidence(text: string): { evidence: LedgerEvidence[] } | { error: string } {
  const evidence: LedgerEvidence[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const [label, url, sha256] = line.split("|").map((s) => s.trim());
    if (!label || !url) return { error: `Evidence line ${i + 1} needs "label | url".` };
    if (!safeHref(url)) return { error: `Evidence line ${i + 1}: the url must be an absolute http or https URL.` };
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) return { error: `Evidence line ${i + 1}: sha256 must be 64 lowercase hex characters.` };
    evidence.push(sha256 ? { label, url, sha256 } : { label, url });
  }
  return { evidence };
}

const LINK_FIELD: Record<string, string> = { correction: "correctsId", review: "reviewsId", amendment: "amendsId", note: "aboutId" };

export function buildRecordPayload(f: FileForm): { payload: Record<string, unknown> } | { error: string } {
  if (!f.title.trim()) return { error: "A title is required." };
  const ev = parseEvidence(f.evidenceText);
  if ("error" in ev) return ev;
  const payload: Record<string, unknown> = { kind: f.kind, title: f.title.trim(), body: f.body, standing: f.standing, evidence: ev.evidence, held: f.held };
  if (f.campaignId.trim()) payload.campaignId = f.campaignId.trim();
  const linkField = LINK_FIELD[f.kind];
  if (linkField && f.linkId.trim()) payload[linkField] = f.linkId.trim();
  if (f.kind === "review" && f.verdict) payload.verdict = f.verdict;
  if (f.kind === "decision" && f.setsStatus) payload.setsStatus = f.setsStatus;
  if (f.clientRef.trim()) payload.clientRef = f.clientRef.trim();
  return { payload };
}

/** apiRequest throws `Error("<status>: <body>")`; show the server's own `message` (or reason code) when the body is ledger-shaped JSON. */
export function apiErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = /^\d{3}: ([\s\S]*)$/.exec(raw);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (body && typeof body === "object") {
        const msg = typeof body.message === "string" ? body.message : "";
        const code = typeof body.error === "string" ? body.error : "";
        if (msg) return code ? `${msg} (${code})` : msg;
        if (code) return code;
      }
    } catch { /* not JSON: fall through to the raw text */ }
  }
  return raw;
}
