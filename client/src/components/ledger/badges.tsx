import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import type { LedgerKind, LedgerStanding } from "@shared/ledger-schema";
import type { TierOrUnchecked, VerificationSummary } from "@shared/ledger-public";

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

const TIER: Record<TierOrUnchecked, { label: string; cls: string; title: string }> = {
  "PEER-REVIEWED": {
    label: "peer-reviewed", cls: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300",
    title: "Machine-checked, and reviewed by someone other than its author with a verdict that is not a rejection",
  },
  "MACHINE-CHECKED": {
    label: "machine-checked", cls: "border-sky-500/60 bg-sky-500/10 text-sky-300",
    title: "Its evidence was fetched and every sha256 matched; its links exist; a result's pre-registration came first",
  },
  CLAIMED: {
    label: "claimed", cls: "border-zinc-500/60 bg-zinc-500/10 text-zinc-300",
    title: "Nothing machine-checkable backs the standing yet (no evidence), or a check failed: the standing rests on the author",
  },
  unchecked: {
    label: "unchecked", cls: "border-zinc-600/40 bg-transparent text-zinc-400",
    title: "The machine check has not run for this record yet, or could not run",
  },
};

/**
 * The derived tier next to the self-set standing ("measured · machine-checked"). Derived by the server from
 * verify_record.py's rules; it never changes the standing. Renders nothing where the server sends no tier.
 */
export function TierBadge({ verification }: { verification?: VerificationSummary }) {
  if (!verification) return null;
  const t = TIER[verification.tier] ?? TIER.unchecked;
  return <Badge variant="outline" className={`text-xs ${t.cls}`} title={t.title} data-testid="tier-badge">{t.label}</Badge>;
}
