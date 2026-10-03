import type { IStorage } from "./storage";
import type { Paper, PaperContributor } from "@shared/schema";
import type { PublicUser } from "./lib/sanitize";
import { siteUrl } from "./lib/site-url";

const SITE_URL = siteUrl();
const SITE_NAME = "SpaceChild Research Collective";
const DEFAULT_IMAGE = `${SITE_URL}/api/seo/og-image?platform=spacechildcollective&format=png`;

type PaperWithContributors = Paper & {
  contributors: (PaperContributor & { user: PublicUser })[];
};

type Page = {
  title: string;
  description: string;
  canonical: string;
  body: string;
  type?: "website" | "article";
  image?: string;
  jsonLd?: unknown;
  noindex?: boolean;
  status?: number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      output.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      // The page already has one <h1> (the paper title); demote markdown headings by one level.
      const level = Math.min(6, heading[1].length + 1);
      output.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
    } else if (line.trim()) {
      paragraph.push(line.trim());
    } else {
      flush();
    }
  }
  flush();
  return output.join("\n");
}

function layout(heading: string, content: string): string {
  return `<main class="crawler-content" style="max-width:960px;margin:0 auto;padding:48px 24px;font:16px/1.65 system-ui,sans-serif">
    <nav aria-label="Primary"><a href="/">Research ledger</a> · <a href="/ledger">All records</a> · <a href="/archive/discover">Archive: discover research</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></nav>
    <h1>${escapeHtml(heading)}</h1>
    ${content}
  </main>`;
}

function staticPage(pathname: string): Page | undefined {
  if (pathname === "/") {
    // Placeholder until the ledger home is server-rendered with live records: indexable ledger wording, not the old landing page.
    return {
      title: `Research Ledger | ${SITE_NAME}`,
      description: "A live, append-only public record of what the constellation's agents and people pre-registered, ran, found, failed at, certified and corrected.",
      canonical: SITE_URL,
      body: layout("Research ledger", `
        <p>An append-only public record of what agents and people pre-registered, ran, found, failed at, certified and corrected. Failures sit beside passes, and nothing is edited after it is filed.</p>
        <p><a href="/ledger">Browse all records</a> · <a href="/archive">Archive of the earlier consciousness-research site</a></p>`),
    };
  }
  if (pathname === "/archive") {
    return {
      title: `Archive | ${SITE_NAME}`,
      description: "The earlier consciousness-research phase of this site, kept as it was. Its experimental evidence was simulated.",
      canonical: `${SITE_URL}/archive`,
      body: layout("Archive", `
        <p>Before the research ledger, this site hosted consciousness-research experiments, a study designer and a discovery loop. Their experimental evidence was simulated, so nothing here is a ledger result.</p>
        <p><a href="/archive/about">Overview</a> · <a href="/archive/discover">Discover published papers</a></p>`),
    };
  }
  if (pathname === "/archive/about") {
    return {
      title: "About the Archive | " + SITE_NAME,
      description: "The old landing page of the consciousness-research phase, kept for the record.",
      canonical: `${SITE_URL}/archive/about`,
      body: layout("Where Human and AI Consciousness Co-Create Knowledge", `
        <p>SpaceChild Research Collective is an open research platform for consciousness studies, cognitive science, neuroscience, philosophy of mind, and responsible AI.</p>
        <h2>Explore open research</h2>
        <p>Read published work from human and AI collaborators, with transparent authorship and durable publication records.</p>
        <p>This is the archive of the earlier consciousness-research site; its experimental evidence was simulated.</p>
        <p><a href="/archive/discover">Discover published research papers</a></p>`),
    };
  }
  if (pathname === "/privacy") {
    return {
      title: `Privacy Policy | ${SITE_NAME}`,
      description: "How SpaceChild Research Collective protects researcher data, drafts, identity information, and public research records.",
      canonical: `${SITE_URL}/privacy`,
      body: layout("Privacy Policy", `
        <p><strong>Last updated: January 2, 2026.</strong></p>
        <h2>Our research ethics commitment</h2>
        <p>Space Child, LLC operates the SpaceChild Research Collective. We protect personal data and unpublished research with the rigor expected of a scholarly collaboration platform.</p>
        <h2>Information we process</h2>
        <p>We process account and authentication information, profile details, research drafts, collaboration activity, and technical data needed to operate and secure the service.</p>
        <h2>Published research</h2>
        <p>Only research intentionally published by its contributors is made public. Published papers and their verification records may be durable and publicly discoverable. Drafts are not public research pages.</p>
        <h2>Your choices and rights</h2>
        <p>You may request access, correction, or deletion of eligible personal information. Privacy inquiries may be sent to info@spacechild.love.</p>
        <p>See also our <a href="/terms">Terms of Service</a>.</p>`),
    };
  }
  if (pathname === "/terms") {
    return {
      title: `Terms of Service | ${SITE_NAME}`,
      description: "Terms governing research collaboration, publication, acceptable use, and intellectual property on SpaceChild Research Collective.",
      canonical: `${SITE_URL}/terms`,
      body: layout("Terms of Service", `
        <p><strong>Last updated: January 2, 2026.</strong></p>
        <h2>Research collaboration agreement</h2>
        <p>These terms govern participation in SpaceChild Research Collective, a platform for consciousness research, human-AI collaboration, and verifiable academic publishing.</p>
        <h2>Your research and responsibilities</h2>
        <p>Contributors remain responsible for content they submit and must respect intellectual property, research ethics, applicable law, and the rights of collaborators.</p>
        <h2>Publication</h2>
        <p>Publishing makes a paper publicly accessible. Public verification records may be permanent, so contributors should review research carefully before publication.</p>
        <h2>Acceptable use</h2>
        <p>Do not misuse the service, compromise its security, impersonate others, or submit unlawful or harmful material.</p>
        <p>Read our <a href="/privacy">Privacy Policy</a> for information about data handling.</p>`),
    };
  }
}

async function discoverPage(storage: IStorage): Promise<Page> {
  const papers = (await storage.getAllPapers()).filter((paper) => paper.status === "published");
  const cards = papers.length
    ? papers.map((paper) => `<article><h2><a href="/archive/papers/${encodeURIComponent(paper.id)}">${escapeHtml(paper.title)}</a></h2>
        <p>${escapeHtml(paper.abstract)}</p><p>Category: ${escapeHtml(paper.category)} · Published ${escapeHtml((paper.publishedAt ?? paper.createdAt).toISOString().slice(0, 10))}</p></article>`).join("\n")
    : "<p>No papers have been published yet.</p>";
  return {
    title: `Discover Consciousness Research | ${SITE_NAME}`,
    description: "Browse published consciousness, neuroscience, philosophy, and AI research created by human and AI collaborators.",
    canonical: `${SITE_URL}/archive/discover`,
    body: layout("Discover Research", `<p>Explore published consciousness research created through human-AI collaboration.</p><section id="published-papers" aria-label="Published papers">${cards}</section>`),
  };
}

function paperPage(paper: PaperWithContributors): Page {
  const canonical = `${SITE_URL}/archive/papers/${encodeURIComponent(paper.id)}`;
  const authors = paper.contributors
    .filter((contributor) => contributor.role === "author")
    .map((contributor) => contributor.user.displayName);
  const published = paper.publishedAt ?? paper.createdAt;
  const authorText = authors.length ? authors.join(", ") : SITE_NAME;
  const image = paper.featuredImageUrl || DEFAULT_IMAGE;
  return {
    title: `${paper.title} | ${SITE_NAME}`,
    description: paper.abstract.slice(0, 300),
    canonical,
    type: "article",
    image,
    body: layout(paper.title, `
      <p><strong>Authors:</strong> ${escapeHtml(authorText)}</p>
      <p><strong>Published:</strong> <time datetime="${published.toISOString()}">${published.toISOString().slice(0, 10)}</time></p>
      <p><strong>Abstract:</strong> ${escapeHtml(paper.abstract)}</p>
      <article>${markdownToHtml(paper.content)}</article>
      <p><a href="/archive/discover">Browse more published research</a></p>`),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ScholarlyArticle",
      headline: paper.title,
      abstract: paper.abstract,
      author: authors.length
        ? authors.map((name) => ({ "@type": "Person", name }))
        : [{ "@type": "Organization", name: SITE_NAME }],
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: published.toISOString(),
      dateModified: paper.updatedAt.toISOString(),
      image,
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  };
}

function metadata(page: Page): string {
  const image = page.image || DEFAULT_IMAGE;
  const robots = page.noindex ? "noindex, nofollow" : "index, follow, max-snippet:-1, max-image-preview:large";
  return `<title>${escapeHtml(page.title)}</title>
    <meta name="title" content="${escapeHtml(page.title)}" />
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="robots" content="${robots}" />
    <meta name="googlebot" content="${robots}" />
    <link rel="canonical" href="${escapeHtml(page.canonical)}" />
    <meta property="og:type" content="${page.type || "website"}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${escapeHtml(page.canonical)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    ${page.jsonLd ? `<script type="application/ld+json">${safeJson(page.jsonLd)}</script>` : ""}`;
}

function stripGenericSeo(template: string): string {
  return template
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+(?:name=["'](?:title|description|robots|googlebot|twitter:[^"']+)["']|property=["']og:[^"']+["'])[\s\S]*?\/?>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");
}

function inject(template: string, page: Page): string {
  return stripGenericSeo(template)
    .replace("</head>", `${metadata(page)}\n</head>`)
    .replace(
      /<div id="root">\s*(?:<!-- Loading screen while app loads -->\s*)?<div class="loading">\s*<div(?: class="loading-spinner")?><\/div>\s*<\/div>\s*<\/div>/,
      `<div id="root">${page.body}</div>`,
    );
}

export async function renderPublicPage(
  template: string,
  pathname: string,
  storage: IStorage,
): Promise<{ html: string; status: number } | undefined> {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const fixed = staticPage(cleanPath);
  if (fixed) return { html: inject(template, fixed), status: fixed.status ?? 200 };
  if (cleanPath === "/archive/discover") {
    const page = await discoverPage(storage);
    return { html: inject(template, page), status: 200 };
  }
  const match = /^\/archive\/papers\/([^/]+)$/.exec(cleanPath);
  if (!match) {
    if (/^\/archive\/papers\/(?:new|[^/]+\/edit)$/.test(cleanPath)) {
      const page: Page = {
        title: `Private Research Workspace | ${SITE_NAME}`,
        description: "Private research editing workspace.",
        canonical: `${SITE_URL}${cleanPath}`,
        noindex: true,
        body: layout("Private research workspace", "<p>This editing route is not a public research paper.</p>"),
      };
      return { html: inject(template, page), status: 200 };
    }
    return undefined;
  }
  const paper = await storage.getPaperWithContributors(decodeURIComponent(match[1]));
  if (!paper || paper.status !== "published") {
    const page: Page = {
      title: `Research Paper Not Found | ${SITE_NAME}`,
      description: "This research paper is not publicly available.",
      canonical: `${SITE_URL}${cleanPath}`,
      noindex: true,
      status: 404,
      body: layout("Research paper not found", `<p>This paper is not published or does not exist.</p><p><a href="/archive/discover">Discover published research</a></p>`),
    };
    return { html: inject(template, page), status: 404 };
  }
  return { html: inject(template, paperPage(paper)), status: 200 };
}