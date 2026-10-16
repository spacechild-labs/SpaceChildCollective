import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { RecordView } from "@shared/ledger-public";
import { Button } from "@/components/ui/button";
import { DisputeBadges, HeldBadge, KindBadge, StandingBadge, TierBadge } from "@/components/ledger/badges";
import { MachineCheck } from "@/components/ledger/machine-check";
import { EvidenceLink } from "@/components/ledger/evidence-link";
import { RecordCard } from "@/components/ledger/record-card";
import { verifyRecordHash } from "@/lib/ledger-view";

export default function LedgerRecordPage() {
  const [, params] = useRoute("/records/:id");
  const id = params?.id ?? "";
  const { data, isLoading, error } = useQuery<RecordView>({ queryKey: ["/api/ledger/records", id], enabled: Boolean(id) });
  const [verified, setVerified] = useState<null | boolean>(null);

  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-3xl px-4 py-8">Record not found. <Link href="/ledger" className="underline">Back to the ledger</Link></main>;
  const r = data.record;
  const held = r.held && !r.released;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {held && (
        <div className="mb-4 rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200" role="status" data-testid="held-banner">
          This record is held. Anyone signed in can read it, and registration is open, so anyone can sign up. It is hidden from
          anonymous visitors, the feeds, the live stream and NATS until a releaser releases it.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <KindBadge kind={r.kind} /><StandingBadge standing={r.standing} /><TierBadge verification={r.verification} />
        <DisputeBadges correctedBy={r.correctedBy} brokenBy={r.brokenBy} />
        {held && <HeldBadge />}
        {r.campaignId && <Link href={`/campaigns/${r.campaignId}`} className="font-mono underline">{r.campaignId}</Link>}
        <Link href={`/agents/${encodeURIComponent(r.authorUsername)}`} className="underline">{r.authorUsername}</Link>
        <time dateTime={r.createdAt}>{new Date(r.createdAt).toUTCString()}</time>
        <span>via {r.filedVia}</span>
        {r.verdict && <span>verdict: {r.verdict}</span>}
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{r.title}</h1>
      {(r.correctedBy.length > 0 || r.brokenBy.length > 0) && (
        <div className="mt-3 rounded border border-orange-500/50 bg-orange-500/10 p-3 text-sm" role="note" data-testid="disputed-banner">
          This record was filed as <strong>{r.standing}</strong> and is unchanged, but later records dispute it:
          {r.correctedBy.map((cid) => <Link key={cid} href={`/records/${cid}`} className="ml-2 font-mono text-xs underline">correction {cid}</Link>)}
          {r.brokenBy.map((bid) => <Link key={bid} href={`/records/${bid}`} className="ml-2 font-mono text-xs underline">review (breaks) {bid}</Link>)}
        </div>
      )}
      <article className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</article>

      {r.evidence.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Evidence</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {r.evidence.map((e, i) => (
              <li key={i}>
                <EvidenceLink label={e.label} url={e.url} />
                {e.sha256 && <span className="ml-2 break-all font-mono text-xs text-muted-foreground">sha256 {e.sha256}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.verification && <MachineCheck v={data.verification} standing={r.standing} />}

      <section className="mt-6 rounded border border-border p-3 text-xs">
        <div className="break-all font-mono">content hash {r.contentHash}</div>
        <Button className="mt-2" size="sm" variant="outline" onClick={async () => setVerified(await verifyRecordHash(r))}>
          Verify in this browser
        </Button>
        {verified === true && <span className="ml-3 text-emerald-400">Matches the content hash the ledger published for this record.</span>}
        {verified === false && <span className="ml-3 text-rose-400">Does not match the content hash the ledger published for this record.</span>}
        <p className="mt-2 text-muted-foreground" data-testid="verify-note">
          This check recomputes the hash from what this server sent, so it cannot catch a server that rewrote both. For an
          independent anchor, compare <code>content_hash</code> in the NATS <code>SPACECHILD.ledger.record.filed</code> event
          (or <code>record.released</code>) captured when the record was published, or the backfill history manifest for
          backfilled records.
        </p>
      </section>

      {([["Corrections", data.corrections], ["Amendments", data.amendments], ["Reviews", data.reviews], ["Notes", data.notes]] as const).map(([label, list]) =>
        list.length > 0 && (
          <section key={label} className="mt-6">
            <h2 className="text-sm font-semibold">{label}</h2>
            <div className="mt-2 space-y-2">{list.map((x) => <RecordCard key={x.id} record={x} />)}</div>
          </section>
        ))}
    </main>
  );
}
