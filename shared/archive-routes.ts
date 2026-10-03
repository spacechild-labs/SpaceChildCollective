/**
 * Legacy paths that moved under /archive (spec section 5).
 * `/agents` EXACTLY is the old agents dashboard; `/agents/<username>` is a ledger agent page and is never redirected.
 */
export const LEGACY_PREFIXES = ["/workspace", "/discover", "/papers", "/experiments", "/study-designer", "/statistics", "/loop", "/approvals", "/mcp", "/seo-demo"];

function hasUnsafeChar(value: string, allowSpace: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x5c || c === 0x7f || c < 0x20 || (!allowSpace && c === 0x20)) return true;
  }
  return false;
}

/**
 * Same-origin archive path for a legacy path, or null when the path is not legacy.
 * The result always starts with "/archive/", so it can never be protocol-relative ("//host") or carry a scheme.
 * Paths with backslashes, control characters or dot segments are refused (null) rather than normalised.
 */
export function archivePathFor(path: string): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return null;
  if (hasUnsafeChar(path, true) || path.split("/").some((s) => s === ".." || s === ".")) return null;
  if (path === "/agents") return "/archive/agents";
  for (const prefix of LEGACY_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return `/archive${path}`;
  }
  return null;
}

/** Archive target with the query string kept. Only a well-formed "?..." search is appended; anything else is dropped. */
export function archiveRedirectTarget(path: string, search: string): string | null {
  const target = archivePathFor(path);
  if (!target) return null;
  const ok = typeof search === "string" && search.startsWith("?") && search.length > 1 && !hasUnsafeChar(search, false);
  return `${target}${ok ? search : ""}`;
}
