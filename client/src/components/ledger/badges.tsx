import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import type { LedgerKind, LedgerStanding } from "@shared/ledger-schema";

const STANDING_CLASS: Record<LedgerStanding, string> = {
  certified: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  measured: "bg-sky-600/20 text-sky-300 border-sky-600/40",
  unverified: "bg-amber-600/20 text-amber-300 border-amber-600/40",
  retracted: "bg-rose-600/20 text-rose-300 border-rose-600/40 line-through",
};

/**
 * "corrected" / "challenged" badges from the read-time disputed signal; each links to the newest such record.
 * Rendered above a stretched card link, so they carry relative z-10 like the author link.
 */
export function DisputeBadges({ correctedBy, brokenBy }: { correctedBy?: string[]; brokenBy?: string[] }) {
  const latest = (ids: string[]) => ids[ids.length - 1];
  return (
    <>
      {correctedBy && correctedBy.length > 0 && (
        <Link href={`/records/${latest(correctedBy)}`} className="relative z-10" data-testid="corrected-badge">
          <Badge variant="outline" className="border-orange-500/60 bg-orange-500/10 text-xs text-orange-300" title="A later correction was filed against this record">
            corrected{correctedBy.length > 1 ? ` (${correctedBy.length})` : ""}
          </Badge>
        </Link>
      )}
      {brokenBy && brokenBy.length > 0 && (
        <Link href={`/records/${latest(brokenBy)}`} className="relative z-10" data-testid="challenged-badge">
          <Badge variant="outline" className="border-rose-500/60 bg-rose-500/10 text-xs text-rose-300" title='A review with verdict "breaks" was filed against this record'>
            challenged{brokenBy.length > 1 ? ` (${brokenBy.length})` : ""}
          </Badge>
        </Link>
      )}
    </>
  );
}

export function KindBadge({ kind }: { kind: LedgerKind }) {
  return <Badge variant="outline" className="font-mono text-xs">{kind}</Badge>;
}

export function StandingBadge({ standing }: { standing: LedgerStanding }) {
  return <Badge variant="outline" className={`text-xs ${STANDING_CLASS[standing]}`}>{standing}</Badge>;
}

export const HELD_EXPLANATION =
  "Held records are visible to anyone signed in (registration is open, so anyone can sign up). They are hidden from anonymous visitors, the feeds, the live stream and NATS until a releaser releases them.";

/** Only signed-in viewers ever see this; the API never returns held records to anonymous viewers. */
export function HeldBadge() {
  return <Badge variant="outline" className="border-amber-500/60 bg-amber-500/10 text-xs text-amber-300" data-testid="held-badge" title={HELD_EXPLANATION}>held: signed-in readers only until released</Badge>;
}
