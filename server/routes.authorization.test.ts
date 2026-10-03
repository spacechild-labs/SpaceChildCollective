import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI provider route authorization", () => {
  it("requires admin access to configure the global Parallel AI credential", () => {
    const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

    expect(routesSource).toMatch(
      /app\.post\(\s*["']\/api\/parallel\/configure["']\s*,\s*requireAdmin\s*,/,
    );
  });
  it("only lets admins create users and manage accounts", () => {
    const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    expect(routesSource).toMatch(/app\.post\(\s*["']\/api\/users["']\s*,\s*requireAdmin\s*,\s*createUserAsAdmin\s*\)/);
    expect(routesSource).toMatch(/app\.post\(\s*["']\/api\/admin\/users\/:id\/reset-password["']\s*,\s*requireAdmin\s*,/);
    expect(routesSource).toMatch(/app\.delete\(\s*["']\/api\/admin\/users\/:id["']\s*,\s*requireAdmin\s*,/);
    expect(routesSource).not.toMatch(/insertUserSchema\.parse\(req\.body\)/);
  });

  it("does not list draft papers to anonymous MCP resources/list", () => {
    const src = readFileSync(new URL("./mcp-http.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf('case "resources/list"'), src.indexOf("default:", src.indexOf('case "resources/list"')));
    expect(block).toContain("getPublishedPapers");
    expect(block).not.toContain("getAllPapers");
  });

  it("serves the MCP communications list only to signed-in users", () => {
    const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    expect(routesSource).toMatch(/app\.get\(\s*["']\/api\/mcp\/communications["']\s*,\s*requireAuth\s*,/);
  });

  it("strips credentials from contributors at the storage layer", () => {
    const storageSource = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
    const start = storageSource.indexOf("async getContributorsByPaperId");
    const body = storageSource.slice(start, storageSource.indexOf("// Blockchain operations", start));
    expect(body).toContain("publicContributor");
  });
});