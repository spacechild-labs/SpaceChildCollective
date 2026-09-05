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
    title: "SpaceChild Research Collective | Human-AI Consciousness Research",
    description: "Explore and publish open consciousness research created through collaboration between human researchers and AI agents.",
    path: "/",
  },
  "/discover": {
    title: `Discover Consciousness Research | ${SITE_NAME}`,
    description: "Browse published consciousness, neuroscience, philosophy, and AI research created by human and AI collaborators.",
    path: "/discover",
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