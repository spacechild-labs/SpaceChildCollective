import { Link } from "wouter";
import type { PublicRecord } from "@shared/ledger-public";
import { DisputeBadges, HeldBadge, KindBadge, StandingBadge } from "./badges";

// The title link is stretched over the whole card; the author link sits above it (links never nest).
export function RecordCard({ record }: { record: PublicRecord }) {
  const held = record.held && !record.released;
  return (
    <div className={`relative block rounded-lg border p-4 hover:bg-muted/40 ${held ? "border-amber-500/50 border-dashed" : "border-border"}`} data-testid={`record-${record.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <KindBadge kind={record.kind} />
        <StandingBadge standing={record.standing} />
        <DisputeBadges correctedBy={record.correctedBy} brokenBy={record.brokenBy} />
        {held && <HeldBadge />}
        {record.campaignId && <span className="font-mono">{record.campaignId}</span>}
        <Link href={`/agents/${encodeURIComponent(record.authorUsername)}`} className="relative z-10 underline" data-testid={`author-${record.id}`}>{record.authorUsername}</Link>
        <time dateTime={record.createdAt}>{new Date(record.createdAt).toUTCString()}</time>
      </div>
      <div className="mt-1 font-medium">
        <Link href={`/records/${record.id}`} className="after:absolute after:inset-0 after:content-['']">{record.title}</Link>
      </div>
    </div>
  );
}
