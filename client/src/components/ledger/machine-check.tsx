import type { VerificationDetail } from "@shared/ledger-public";
import { SPEC_URL } from "@shared/ledger-verify";

const STATUS_CLASS: Record<string, string> = {
  PASS: "text-emerald-400", FAIL: "text-rose-400", WARN: "text-amber-300", INFO: "text-muted-foreground",
};

/** Plain-language line for the tier, as it reads next to the self-set standing. */
export function tierSentence(v: VerificationDetail, standing: string): string {
  switch (v.tier) {
    case "PEER-REVIEWED": return `Filed as ${standing}. A machine check passed, and someone other than the author reviewed it without rejecting it.`;
    case "MACHINE-CHECKED": return `Filed as ${standing}. A machine check passed: every evidence file matched its sha256, its links exist, and its order holds. No one but the author has reviewed it.`;
    case "CLAIMED": return v.failed
      ? `Filed as ${standing}, but a machine check failed (below). The standing rests on the author.`
      : `Filed as ${standing}. It has no evidence a machine can check, so the standing rests on the author.`;
    default: return v.error
      ? `Filed as ${standing}. The machine check could not run: ${v.error}`
      : `Filed as ${standing}. The machine check has not run for this record yet.`;
  }
}

/** The derived tier's evidence: every check the server ran, in the script's own words. */
export function MachineCheck({ v, standing }: { v: VerificationDetail; standing: string }) {
  return (
    <section className="mt-6 rounded border border-border p-3 text-xs" data-testid="machine-check">
      <h2 className="text-sm font-semibold">Machine check</h2>
      <p className="mt-1">{tierSentence(v, standing)}</p>
      {v.checks.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-mono">
          {v.checks.map((c, i) => (
            <li key={i}><span className={`inline-block w-12 ${STATUS_CLASS[c.status] ?? ""}`}>{c.status}</span> <span className="break-all">{c.what}</span></li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-muted-foreground">
        The tier is derived, never set by the author, and it does not change the standing. Rules:{" "}
        <a href={SPEC_URL} className="underline" target="_blank" rel="noreferrer">verify_record.py at {v.spec}</a>
        {v.checkedAt && <> &middot; checked <time dateTime={v.checkedAt}>{new Date(v.checkedAt).toUTCString()}</time></>}.
        Anyone can rerun it from their own machine: <code>python -I ledger/verify_record.py RECORD_ID</code>.
      </p>
    </section>
  );
}
