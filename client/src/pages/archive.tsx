import { Link } from "wouter";
import { ArchiveBanner } from "@/components/archive-banner";

const SECTIONS = [
  ["Overview (the old landing page)", "/archive/about"], ["Workspace", "/archive/workspace"], ["Discover papers", "/archive/discover"],
  ["Agents dashboard", "/archive/agents"], ["Experiments", "/archive/experiments"], ["Study designer", "/archive/study-designer"],
  ["Statistics", "/archive/statistics"], ["Discovery loop", "/archive/loop"], ["Approvals", "/archive/approvals"], ["MCP status", "/archive/mcp"],
] as const;

export default function ArchiveIndex() {
  return (
    <>
      <ArchiveBanner />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Archive</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before the research ledger, this site hosted consciousness-research experiments, a study designer and a discovery loop.
          Those pages still work here, read as they were. Their experimental evidence was simulated, so nothing here is a ledger result.
        </p>
        <ul className="mt-4 space-y-2 text-sm">{SECTIONS.map(([label, href]) => <li key={href}><Link href={href} className="underline">{label}</Link></li>)}</ul>
      </main>
    </>
  );
}
