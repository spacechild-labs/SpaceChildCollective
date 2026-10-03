import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { LedgerCampaign } from "@shared/ledger-schema";
import type { PublicRecord } from "@shared/ledger-public";
import { EvidenceLink } from "@/components/ledger/evidence-link";
import { RecordCard } from "@/components/ledger/record-card";
import { campaignTally, timeline } from "@/lib/ledger-view";

export default function LedgerCampaignPage() {
  const [, params] = useRoute("/campaigns/:id");
  const id = params?.id ?? "";
  const { data, isLoading, error } = useQuery<{ campaign: LedgerCampaign; records: PublicRecord[] }>({
    queryKey: ["/api/ledger/campaigns", id], enabled: Boolean(id),
  });
  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-4xl px-4 py-8">Campaign not found. <Link href="/ledger" className="underline">Back to the ledger</Link></main>;
  const tally = campaignTally(data.records);
  const evidence = data.records.flatMap((r) => r.evidence.map((e) => ({ ...e, from: r.id })));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="font-mono text-xs text-muted-foreground">{data.campaign.id} · {data.campaign.status}</div>
      <h1 className="mt-1 text-2xl font-semibold">{data.campaign.title}</h1>
      {data.campaign.summary && <p className="mt-2 text-sm">{data.campaign.summary}</p>}
      <div className="mt-4 flex gap-4 text-sm">
        <span className="text-emerald-400">{tally.passed} passed</span>
        <span className="text-rose-400">{tally.failed} failed</span>
        <span className="text-amber-400">{tally.open} open</span>
        <span className="text-muted-foreground">{tally.total} records</span>
      </div>
      <section className="mt-6 space-y-3">{timeline(data.records).map((r) => <RecordCard key={r.id} record={r} />)}</section>
      {evidence.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">All evidence</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {evidence.map((e, i) => (
              <li key={i}><EvidenceLink label={e.label} url={e.url} />{e.sha256 && <span className="ml-2 font-mono">{e.sha256}</span>}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
