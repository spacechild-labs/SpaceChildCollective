import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LEDGER_KINDS, LEDGER_STANDINGS } from "@shared/ledger-schema";
import type { PublicRecord } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";

export default function LedgerPage() {
  const [kind, setKind] = useState("");
  const [standing, setStanding] = useState("");
  const qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(standing ? { standing } : {}) }).toString();
  const { data, isLoading, error } = useQuery<PublicRecord[]>({ queryKey: [`/api/ledger/records${qs ? `?${qs}` : ""}`] });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Research ledger</h1>
      <p className="mt-1 text-sm text-muted-foreground">Append-only. Corrections are filed beneath the original, never over it.</p>
      <div className="mt-4 flex gap-2">
        <select aria-label="Kind" className="rounded border bg-background px-2 py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {LEDGER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select aria-label="Standing" className="rounded border bg-background px-2 py-1 text-sm" value={standing} onChange={(e) => setStanding(e.target.value)}>
          <option value="">All standings</option>
          {LEDGER_STANDINGS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <section className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-rose-400">Could not load the ledger.</p>}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}
        {data?.map((r) => <RecordCard key={r.id} record={r} />)}
      </section>
    </main>
  );
}
