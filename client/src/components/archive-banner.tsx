import type { ElementType } from "react";
import { Link } from "wouter";

export function ArchiveBanner() {
  return (
    <div className="border-b border-amber-600/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-200" role="note">
      Archive: earlier consciousness-research phase. Evidence in these experiments was simulated.{" "}
      <Link href="/" className="underline">Go to the research ledger</Link>
    </div>
  );
}

/** Wrap a legacy page with the archive banner. Call once at module scope so the wrapper's identity is stable across renders. */
export function withArchiveBanner(Component: ElementType) {
  return function Archived(props: object) {
    return (
      <>
        <ArchiveBanner />
        <Component {...props} />
      </>
    );
  };
}
