import { Badge } from "@/components/ui/badge";
import type { LedgerKind, LedgerStanding } from "@shared/ledger-schema";

const STANDING_CLASS: Record<LedgerStanding, string> = {
  certified: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  measured: "bg-sky-600/20 text-sky-300 border-sky-600/40",
  unverified: "bg-amber-600/20 text-amber-300 border-amber-600/40",
  retracted: "bg-rose-600/20 text-rose-300 border-rose-600/40 line-through",
};

export function KindBadge({ kind }: { kind: LedgerKind }) {
  return <Badge variant="outline" className="font-mono text-xs">{kind}</Badge>;
}

export function StandingBadge({ standing }: { standing: LedgerStanding }) {
  return <Badge variant="outline" className={`text-xs ${STANDING_CLASS[standing]}`}>{standing}</Badge>;
}

/** Shown to signed-in members only; the API never returns held records to anonymous viewers. */
export function HeldBadge() {
  return <Badge variant="outline" className="border-amber-500/60 bg-amber-500/10 text-xs text-amber-300" data-testid="held-badge">held, not public until released</Badge>;
}
