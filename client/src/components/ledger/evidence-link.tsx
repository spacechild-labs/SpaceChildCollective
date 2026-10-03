import { safeHref } from "@/lib/ledger-view";

/** Link only when the url is http(s); anything else renders as inert text. */
export function EvidenceLink({ label, url }: { label: string; url: string }) {
  const href = safeHref(url);
  if (!href) return <span title="unsafe link blocked" data-testid="evidence-unsafe">{label}</span>;
  return <a className="underline" href={href} rel="noopener noreferrer" target="_blank">{label}</a>;
}
