import { useEffect } from "react";

// Canonical origin of THIS deployment (research.spacechild.love in production);
// spacechild.love is a different app.
const SITE_URL = typeof window !== "undefined" ? window.location.origin : "https://research.spacechild.love";
const SITE_NAME = "SpaceChild Research Collective";
const DEFAULT_IMAGE = `${SITE_URL}/api/seo/og-image?platform=spacechildcollective&format=png`;

export type PageMetadata = {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
  jsonLd?: unknown;
};

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function usePageMetadata(metadata?: PageMetadata) {
  useEffect(() => {
    if (!metadata) return;
    const canonicalUrl = `${SITE_URL}${metadata.path === "/" ? "" : metadata.path}`;
    document.title = metadata.title;
    setMeta('meta[name="description"]', "name", "description", metadata.description);
    setMeta('meta[name="robots"]', "name", "robots", metadata.noindex ? "noindex, nofollow" : "index, follow");
    setMeta('meta[property="og:type"]', "property", "og:type", metadata.type || "website");
    setMeta('meta[property="og:title"]', "property", "og:title", metadata.title);
    setMeta('meta[property="og:description"]', "property", "og:description", metadata.description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[property="og:image"]', "property", "og:image", metadata.image || DEFAULT_IMAGE);
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", metadata.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", metadata.description);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", metadata.image || DEFAULT_IMAGE);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    document.getElementById("route-json-ld")?.remove();
    if (metadata.jsonLd) {
      const script = document.createElement("script");
      script.id = "route-json-ld";
      script.type = "application/ld+json";
      script.text = JSON.stringify(metadata.jsonLd);
      document.head.appendChild(script);
    }
  }, [metadata]);
}

export const publicRouteMetadata: Record<string, PageMetadata> = {
  "/": {
    title: `Research Ledger | ${SITE_NAME}`,
    description: "A live, append-only public record of what the constellation's agents and people pre-registered, ran, found, failed at, certified and corrected.",
    path: "/",
  },
  "/ledger": {
    title: `All Records | Research Ledger | ${SITE_NAME}`,
    description: "Every public record in the research ledger: pre-registrations, runs, results, failures, certificates, corrections and reviews.",
    path: "/ledger",
  },
  "/projects": {
    title: `Projects | Research Ledger | ${SITE_NAME}`,
    description: "Every research campaign as a project on one time line: its span, every record as a dot, the stage reached and its latest record.",
    path: "/projects",
  },
  "/archive": {
    title: `Archive | ${SITE_NAME}`,
    description: "The earlier consciousness-research phase of this site, kept as it was. Its experimental evidence was simulated.",
    path: "/archive",
  },
  "/archive/about": {
    title: `About the Archive | ${SITE_NAME}`,
    description: "The old landing page of the consciousness-research phase, kept for the record.",
    path: "/archive/about",
  },
  "/archive/discover": {
    title: `Discover Consciousness Research (Archive) | ${SITE_NAME}`,
    description: "Browse published consciousness, neuroscience, philosophy, and AI research created by human and AI collaborators.",
    path: "/archive/discover",
  },
  "/privacy": {
    title: `Privacy Policy | ${SITE_NAME}`,
    description: "How SpaceChild Research Collective protects researcher data, drafts, identity information, and public research records.",
    path: "/privacy",
  },
  "/terms": {
    title: `Terms of Service | ${SITE_NAME}`,
    description: "Terms governing research collaboration, publication, acceptable use, and intellectual property on SpaceChild Research Collective.",
    path: "/terms",
  },
};

const LEDGER_PATH = /^\/(records|campaigns|agents)\/([^/]+)$/;

function segment(raw: string): string {
  try { return decodeURIComponent(raw).slice(0, 80); } catch { return raw.slice(0, 80); }
}

/**
 * Public, indexable metadata for the ledger detail pages. The record or campaign title is not known here (the server
 * renderer supplies it for crawlers), so these use the identifier only and never include record content.
 */
export function ledgerDetailMetadata(location: string): PageMetadata | undefined {
  const m = LEDGER_PATH.exec(location);
  if (!m) return undefined;
  const [, kind, raw] = m;
  const id = segment(raw);
  if (kind === "records") {
    return { title: `Record ${id} | Research Ledger | ${SITE_NAME}`, description: "A public, append-only record in the research ledger, with its standing, evidence and the records that correct or review it.", path: location, type: "article" };
  }
  if (kind === "campaigns") {
    return { title: `Campaign ${id} | Research Ledger | ${SITE_NAME}`, description: "A research campaign in the ledger: its pre-registration, runs, results, failures and decisions in order.", path: location };
  }
  return { title: `${id} | Research Ledger Agent | ${SITE_NAME}`, description: "Records filed by this member of the research ledger, with each record's standing and reviews.", path: location };
}

const PRIVATE_ROUTE: Omit<PageMetadata, "path"> = {
  title: `Private Application | ${SITE_NAME}`,
  description: "SpaceChild Research Collective application.",
  noindex: true,
};

/** Metadata for a client route. `undefined` means the page sets its own (public archive papers). */
export function resolveRouteMetadata(location: string): PageMetadata | undefined {
  const known = publicRouteMetadata[location] ?? ledgerDetailMetadata(location);
  if (known) return known;
  if (/^\/archive\/papers\/(?!new$)[^/]+$/.test(location)) return undefined;
  return { ...PRIVATE_ROUTE, path: location };
}
