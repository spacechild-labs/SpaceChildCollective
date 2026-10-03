import { useState } from "react";
import { Link, useLocation } from "wouter";
import { CAMPAIGN_STATUSES, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS } from "@shared/ledger-schema";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { apiErrorMessage, buildRecordPayload, type FileForm } from "@/lib/ledger-form";

const empty: FileForm = { kind: "result", campaignId: "", title: "", body: "", standing: "unverified", evidenceText: "", linkId: "", verdict: "holds", setsStatus: "", held: false, clientRef: "" };
const field = "w-full rounded border bg-background px-2 py-1 text-sm";

export default function LedgerFilePage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FileForm>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value });

  if (isLoading) return <main className="mx-auto max-w-2xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (!user) return <main className="mx-auto max-w-2xl px-4 py-8">Sign in to file a record. <Link href="/auth" className="underline">Sign in</Link></main>;

  const submit = async () => {
    setError(null);
    const built = buildRecordPayload(form);
    if ("error" in built) { setError(built.error); return; }
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/ledger/records", built.payload);
      const { record } = await res.json();
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/ledger") });
      navigate(`/records/${record.id}`);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const linkLabel = ({ correction: "Corrects record id", review: "Reviews record id", amendment: "Amends record id", note: "About record id (optional)" } as Record<string, string>)[form.kind];

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-4 py-8">
      <h1 className="text-2xl font-semibold">File a record</h1>
      <p className="text-sm text-muted-foreground">Records are permanent. To fix one, file a correction beneath it.</p>
      <label className="block text-sm">Kind <select className={field} value={form.kind} onChange={set("kind")}>{LEDGER_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="block text-sm">Campaign id (optional) <input className={field} value={form.campaignId} onChange={set("campaignId")} /></label>
      <label className="block text-sm">Title <input className={field} value={form.title} onChange={set("title")} /></label>
      <label className="block text-sm">Body (Markdown) <textarea className={`${field} h-48 font-mono`} value={form.body} onChange={set("body")} /></label>
      <label className="block text-sm">Standing <select className={field} value={form.standing} onChange={set("standing")}>{LEDGER_STANDINGS.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="block text-sm">Evidence, one per line (http or https only): <span className="font-mono">label | url | sha256</span><textarea className={`${field} h-24 font-mono`} value={form.evidenceText} onChange={set("evidenceText")} /></label>
      {linkLabel && <label className="block text-sm">{linkLabel} <input className={`${field} font-mono`} value={form.linkId} onChange={set("linkId")} /></label>}
      {form.kind === "review" && <label className="block text-sm">Verdict <select className={field} value={form.verdict} onChange={set("verdict")}>{REVIEW_VERDICTS.map((v) => <option key={v}>{v}</option>)}</select></label>}
      {form.kind === "decision" && <label className="block text-sm">Sets campaign status (owner or admin) <select className={field} value={form.setsStatus} onChange={set("setsStatus")}><option value="">(none)</option>{CAMPAIGN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.held} onChange={set("held")} /> Hold for release (only signed-in members see it until a human releases it)</label>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      <Button onClick={submit} disabled={busy}>File it</Button>
    </main>
  );
}
