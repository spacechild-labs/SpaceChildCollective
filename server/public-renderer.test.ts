import { describe, expect, it } from "vitest";
import { renderPublicPage } from "./public-renderer";
import type { IStorage } from "./storage";

const template = `<!doctype html><html><head>
  <title>Generic home</title>
  <meta name="description" content="generic">
  <meta name="robots" content="index">
  <link rel="canonical" href="https://spacechild.love">
  <meta property="og:title" content="Generic home">
  <meta property="og:url" content="https://spacechild.love">
  <meta name="twitter:title" content="Generic home">
</head><body><div id="root"><div class="loading"><div></div></div></div><script type="module" src="/src/main.tsx"></script></body></html>`;

function storageWith(paper?: any, papers: any[] = []): IStorage {
  return {
    getAllPapers: async () => papers,
    getPaperWithContributors: async () => paper,
  } as IStorage;
}

describe("public route rendering", () => {
  it("renders unique discovery metadata and only published paper links", async () => {
    const published = {
      id: "published",
      title: "A Published Finding",
      abstract: "Visible abstract",
      category: "consciousness",
      status: "published",
      createdAt: new Date("2026-01-01"),
      publishedAt: new Date("2026-01-02"),
    };
    const draft = { ...published, id: "draft", title: "Secret Draft", status: "draft" };
    const result = await renderPublicPage(template, "/discover", storageWith(undefined, [draft, published]));

    expect(result?.status).toBe(200);
    expect(result?.html).toContain("<h1>Discover Research</h1>");
    expect(result?.html).toContain('href="https://research.spacechild.love/discover"');
    expect(result?.html).toContain('property="og:url" content="https://research.spacechild.love/discover"');
    expect(result?.html).toContain("A Published Finding");
    expect(result?.html).not.toContain("Secret Draft");
    expect(result?.html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("renders published paper content and ScholarlyArticle data", async () => {
    const paper = {
      id: "paper-1",
      title: "Machine Consciousness Evidence",
      abstract: "A focused scholarly abstract.",
      content: "# Results\n\nEvidence visible without JavaScript.",
      category: "ai",
      status: "published",
      featuredImageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-02-03"),
      publishedAt: new Date("2026-02-01"),
      contributors: [{
        role: "author",
        user: { displayName: "Ada Researcher" },
      }],
    };
    const result = await renderPublicPage(template, "/papers/paper-1", storageWith(paper));

    expect(result?.status).toBe(200);
    expect(result?.html).toContain("<h1>Machine Consciousness Evidence</h1>");
    expect(result?.html).toContain("Evidence visible without JavaScript.");
    // Exactly one <h1> on the page: the markdown "# Results" is demoted under the title.
    expect(result?.html).toContain("<h2>Results</h2>");
    expect((result?.html.match(/<h1>/g) ?? []).length).toBe(1);
    expect(result?.html).toContain('"@type":"ScholarlyArticle"');
    expect(result?.html).toContain('"name":"Ada Researcher"');
    expect(result?.html).toContain('"datePublished":"2026-02-01T00:00:00.000Z"');
    expect(result?.html).toContain('property="og:type" content="article"');
  });

  it("returns noindex 404 HTML for drafts and missing papers", async () => {
    const draft = {
      id: "draft",
      status: "draft",
      contributors: [],
    };
    const result = await renderPublicPage(template, "/papers/draft", storageWith(draft));

    expect(result?.status).toBe(404);
    expect(result?.html).toContain('name="robots" content="noindex, nofollow"');
    expect(result?.html).not.toContain("ScholarlyArticle");
    expect(result?.html).toContain("Research paper not found");
  });

  it("marks editor URLs noindex", async () => {
    const result = await renderPublicPage(template, "/papers/paper-1/edit", storageWith());
    expect(result?.status).toBe(200);
    expect(result?.html).toContain('name="robots" content="noindex, nofollow"');
    expect(result?.html).toContain("Private research workspace");
  });
});