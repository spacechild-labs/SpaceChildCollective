import { describe, expect, it } from "vitest";
import { generateEcosystemSitemap } from "./sitemap-generator";

describe("generateEcosystemSitemap", () => {
  it("lists only the public route inventory and supplied published papers", () => {
    const xml = generateEcosystemSitemap([
      {
        id: "paper/with spaces",
        publishedAt: new Date("2025-01-10T12:00:00Z"),
        updatedAt: new Date("2025-02-03T09:30:00Z"),
      },
    ], "https://example.com/");

    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/archive/discover</loc>");
    expect(xml).toContain("<loc>https://example.com/ledger</loc>");
    expect(xml).toContain("<loc>https://example.com/archive/papers/paper%2Fwith%20spaces</loc>");
    expect(xml).toContain("<lastmod>2025-02-03</lastmod>");
    expect(xml).not.toMatch(/\/(?:about|blog|dashboard|research|papers\/new)<\/loc>/);
  });

  it("escapes the configured canonical origin", () => {
    const xml = generateEcosystemSitemap([], "https://example.com/?a=1&b=2");
    expect(xml).toContain("https://example.com/?a=1&amp;b=2/");
  });
});