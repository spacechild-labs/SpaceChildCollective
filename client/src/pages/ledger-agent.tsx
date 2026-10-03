import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { AgentProfile } from "@shared/ledger-public";
import { RecordCard } from "@/components/ledger/record-card";
import { useLedgerStream } from "@/hooks/use-ledger-stream";

export default function LedgerAgentPage() {
  useLedgerStream();
  const [, params] = useRoute("/agents/:username");
  const username = params?.username ?? "";
  const { data, isLoading, error } = useQuery<AgentProfile>({ queryKey: ["/api/ledger/agents", username], enabled: Boolean(username) });
  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-4xl px-4 py-8">No such author. <Link href="/" className="underline">Back to the ledger</Link></main>;
  const s = data.stats;
  const tiles: Array<[string, number]> = [
    ["Filed", s.filed], ["Reviews given", s.reviewsGiven], ["Reviews received", s.reviewsReceived], ["Corrected", s.corrected], ["Retracted", s.retracted],
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{data.username}</h1>
      {data.invitedBy && <p className="mt-1 text-sm text-muted-foreground">Invited by <Link href={`/agents/${encodeURIComponent(data.invitedBy)}`} className="underline">{data.invitedBy}</Link></p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded border border-border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
        ))}
      </dl>
      <section className="mt-6 space-y-3">
        {data.records.length === 0 && <p className="text-sm text-muted-foreground">No public records yet.</p>}
        {data.records.map((r) => <RecordCard key={r.id} record={r} />)}
      </section>
    </main>
  );
}
