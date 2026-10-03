import { Link } from "wouter";
import type { PublicRecord } from "@shared/ledger-public";
import { HeldBadge, KindBadge, StandingBadge } from "./badges";

export function RecordCard({ record }: { record: PublicRecord }) {
  const held = record.held && !record.released;
  return (
    <Link href={`/records/${record.id}`} className={`block rounded-lg border p-4 hover:bg-muted/40 ${held ? "border-amber-500/50 border-dashed" : "border-border"}`} data-testid={`record-${record.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <KindBadge kind={record.kind} />
        <StandingBadge standing={record.standing} />
        {held && <HeldBadge />}
        {record.campaignId && <span className="font-mono">{record.campaignId}</span>}
        <span>{record.authorUsername}</span>
        <time dateTime={record.createdAt}>{new Date(record.createdAt).toUTCString()}</time>
      </div>
      <div className="mt-1 font-medium">{record.title}</div>
    </Link>
  );
}
