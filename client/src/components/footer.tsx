import { Link } from "wouter";

/** Public site footer with brand, navigation, and license/copyright. */
export function Footer() {
  return (
    <footer className="border-t border-border mt-16">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-lg">Space Child Research Collective</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Human + AI collaborative consciousness research, peer-reviewed and verified on-chain.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Footer">
          <Link href="/" className="hover:text-foreground transition-colors">Ledger</Link>
          <Link href="/archive/discover" className="hover:text-foreground transition-colors">Archive: Discover</Link>
          <Link href="/archive/papers" className="hover:text-foreground transition-colors">Archive: Papers</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="max-w-7xl mx-auto px-6 py-4 text-xs text-muted-foreground">
          © 2026 Space Child Research Collective. Licensed under the Space Child License v1.0.
        </p>
      </div>
    </footer>
  );
}
