import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI provider route authorization", () => {
  it("requires admin access to configure the global Parallel AI credential", () => {
    const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

    expect(routesSource).toMatch(
      /app\.post\(\s*["']\/api\/parallel\/configure["']\s*,\s*requireAdmin\s*,/,
    );
  });
});