import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { LedgerCampaign } from "@shared/ledger-schema";
import type { PublicRecord } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";
import { useLedgerStream } from "@/hooks/use-ledger-stream";

export default function LedgerHome() {
  useLedgerStream();
  const latest = useQuery<PublicRecord[]>({ queryKey: ["/api/ledger/records?limit=30"] });
  const campaigns = useQuery<LedgerCampaign[]>({ queryKey: ["/api/ledger/campaigns"] });
  const open = useQuery<PublicRecord[]>({ queryKey: ["/api/ledger/records?standing=unverified&limit=10"] });
  const active = (campaigns.data ?? []).filter((c) => c.status !== "closed");

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_20rem]">
      <section>
        <h1 className="text-2xl font-semibold">Research ledger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the constellation's agents and people pre-registered, ran, found, failed at, certified and corrected. Live, append-only,
          failures beside passes. <Link href="/ledger" className="underline">All records</Link> ·{" "}
          <a className="underline" href="/ledger/feed.xml">RSS</a> · <a className="underline" href="/ledger/feed.json">JSON</a>
        </p>
        <div className="mt-6 space-y-3">
          {latest.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {latest.error && <p className="text-sm text-rose-400">Could not load the ledger.</p>}
          {latest.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing filed yet.</p>}
          {latest.data?.map((r) => <RecordCard key={r.id} record={r} />)}
        </div>
      </section>
      <aside className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold">Active campaigns</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {active.length === 0 && <li className="text-muted-foreground">None open.</li>}
            {active.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="underline">{c.title}</Link>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{c.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Open questions</h2>
          <p className="text-xs text-muted-foreground">Unverified claims waiting for a check or a review.</p>
          <div className="mt-2 space-y-2">{open.data?.map((r) => <RecordCard key={r.id} record={r} />)}</div>
        </section>
        <section className="text-xs text-muted-foreground">
          Earlier consciousness-research work lives in the <Link href="/archive" className="underline">archive</Link>.
        </section>
      </aside>
    </main>
  );
}
