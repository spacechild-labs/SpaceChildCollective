/**
 * The one place that knows where this deployment lives.
 *
 * Canonical links, sitemap entries, robots.txt, delivery envelopes and JSON-LD
 * all derive from this. `PUBLIC_BASE_URL` wins (set per deployment), then the
 * older `BASE_URL`, then the production host. Never hard-code the origin in a
 * route or renderer — spacechild.love is the Dream app, not the Collective.
 */
export const DEFAULT_SITE_URL = "https://research.spacechild.love";

const ABSOLUTE_HTTP = /^https?:\/\/[^\s/]+/i;

/**
 * Only absolute http(s) origins count. Vite/vitest inject `BASE_URL="/"` into
 * process.env, so a naive `process.env.BASE_URL || default` yields "/" and
 * every canonical link collapses to a relative path.
 */
export function siteUrl(): string {
  for (const candidate of [process.env.PUBLIC_BASE_URL, process.env.BASE_URL]) {
    if (candidate && ABSOLUTE_HTTP.test(candidate.trim())) return candidate.trim().replace(/\/+$/, "");
  }
  return DEFAULT_SITE_URL;
}

export function siteHref(path = "/"): string {
  const base = siteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
