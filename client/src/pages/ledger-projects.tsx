import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { PublicCampaign, PublicRecord } from "@shared/ledger-public";
import { campaignTally } from "@/lib/ledger-view";
import { PROJECT_STAGES, axisPosition, latestRecord, projectProgress, projectSpan, sortProjects, stagesReached } from "@/lib/project-view";

type CampaignView = { campaign: PublicCampaign; records: PublicRecord[] };

const DOT_CLASS: Partial<Record<PublicRecord["kind"], string>> = {
  preregistration: "fill-violet-400", amendment: "fill-violet-300", run: "fill-sky-400", result: "fill-emerald-400", certificate: "fill-emerald-400",
  failure: "fill-rose-400", correction: "fill-orange-400", review: "fill-orange-300", decision: "fill-emerald-300", note: "fill-zinc-500",
};

const day = (iso: string) => iso.slice(0, 10);

/**
 * Every campaign as a project: a bar on one shared time axis from its start to today (or its last record once closed),
 * a dot per record, the stage reached, and its latest record. Nothing here is stored: it is read off the records.
 */
export default function LedgerProjectsPage() {
  const campaigns = useQuery<PublicCampaign[]>({ queryKey: ["/api/ledger/campaigns"] });
  const ids = (campaigns.data ?? []).map((c) => c.id);
  const views = useQueries({ queries: ids.map((id) => ({ queryKey: ["/api/ledger/campaigns", id] as const })) });
  const today = new Date().toISOString();
  const loaded = views.every((v) => v.data) && Boolean(campaigns.data);
  const projects = loaded
    ? sortProjects((views.map((v) => v.data) as CampaignView[]).map((v) => ({
        campaign: v.campaign, records: v.records, span: projectSpan(v.campaign, v.records, today),
        stages: stagesReached(v.records, v.campaign.status), progress: projectProgress(v.records, v.campaign.status),
        tally: campaignTally(v.records), latest: latestRecord(v.records),
      })))
    : [];
  const from = projects.length ? projects.map((p) => p.span.start).sort()[0] : today;
  const open = projects.filter((p) => p.span.open).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every campaign as a project on one time line. The bar runs from a campaign's start to today while it is open, and to its last
        record once closed; each dot is a record. Progress is the stage reached, pre-registered → run → result → decided, read from
        the records filed, not from anyone's estimate.
      </p>
      {campaigns.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {campaigns.error && <p className="mt-6 text-sm text-rose-400">Could not load the ledger.</p>}
      {loaded && (
        <>
          <p className="mt-4 text-sm" data-testid="projects-summary">
            <span className="font-semibold">{open}</span> open, <span className="font-semibold">{projects.length - open}</span> closed ·
            axis from {day(from)} to {day(today)}
          </p>
          <section className="mt-6 space-y-2" data-testid="projects-list">
            {projects.map((p) => (
              <article key={p.campaign.id} className="grid gap-2 rounded border border-border p-3 md:grid-cols-[18rem_1fr]">
                <div className="min-w-0">
                  <Link href={`/campaigns/${p.campaign.id}`} className="font-medium underline">{p.campaign.title}</Link>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {p.campaign.id} · {p.campaign.status} ·{" "}
                    <Link href={`/agents/${encodeURIComponent(p.campaign.ownerUsername)}`} className="underline">{p.campaign.ownerUsername}</Link>
                  </div>
                  <div className="mt-2 flex items-center gap-2" title={`Stages reached: ${p.stages.join(", ") || "none"}`}>
                    <div className="h-1.5 w-32 overflow-hidden rounded bg-muted">
                      <div className={`h-full ${p.span.open ? "bg-sky-400" : "bg-zinc-400"}`} style={{ width: `${p.progress * 100}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{p.stages.length ? p.stages[p.stages.length - 1] : "registered"}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs">
                    <span className="text-emerald-400">{p.tally.passed} passed</span>
                    <span className="text-rose-400">{p.tally.failed} failed</span>
                    <span className="text-amber-400">{p.tally.open} open</span>
                    {p.tally.disputed > 0 && <span className="text-orange-400">{p.tally.disputed} disputed</span>}
                    <span className="text-muted-foreground">{p.tally.total} records</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <svg viewBox="0 0 1000 28" className="h-7 w-full" role="img" aria-label={`${p.campaign.title}: ${day(p.span.start)} to ${day(p.span.end)}, ${p.records.length} records`}>
                    <rect x={0} y={12} width={1000} height={4} className="fill-muted" rx={2} />
                    <rect x={axisPosition(p.span.start, from, today) * 1000} y={10} width={Math.max(4, (axisPosition(p.span.end, from, today) - axisPosition(p.span.start, from, today)) * 1000)} height={8} rx={4}
                      className={p.span.open ? "fill-sky-500/50" : "fill-zinc-500/50"} />
                    {p.records.map((r) => (
                      <circle key={r.id} cx={axisPosition(r.createdAt, from, today) * 1000} cy={14} r={5} className={DOT_CLASS[r.kind] ?? "fill-zinc-500"}>
                        <title>{`${day(r.createdAt)} · ${r.kind} · ${r.title}`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div className="flex justify-between font-mono text-[10px] text-muted-foreground"><span>{day(p.span.start)}</span><span>{day(p.span.end)}</span></div>
                  {p.latest ? (
                    <p className="mt-1 truncate text-xs" title={p.latest.title}>
                      Latest: <Link href={`/records/${p.latest.id}`} className="underline">{p.latest.title}</Link>
                      <span className="ml-1 text-muted-foreground">({day(p.latest.createdAt)}, {p.latest.kind})</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No records yet.</p>
                  )}
                </div>
              </article>
            ))}
          </section>
          <p className="mt-6 text-xs text-muted-foreground">
            Dots: <span className="text-violet-400">pre-registration and amendments</span>, <span className="text-sky-400">runs</span>,{" "}
            <span className="text-emerald-400">results, certificates and decisions</span>, <span className="text-rose-400">failures</span>,{" "}
            <span className="text-orange-400">corrections and reviews</span>, notes grey. Stages: {PROJECT_STAGES.join(" → ")}.
          </p>
        </>
      )}
    </main>
  );
}
