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
});