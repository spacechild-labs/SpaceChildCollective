import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SITE_URL, siteHref, siteUrl } from "./site-url";

const saved = { PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL, BASE_URL: process.env.BASE_URL };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe("siteUrl", () => {
  it("prefers PUBLIC_BASE_URL, strips trailing slashes", () => {
    process.env.PUBLIC_BASE_URL = "https://collective.example/";
    process.env.BASE_URL = "https://other.example";
    expect(siteUrl()).toBe("https://collective.example");
    expect(siteHref("/discover")).toBe("https://collective.example/discover");
    expect(siteHref("/")).toBe("https://collective.example");
  });

  it("ignores the relative BASE_URL that Vite/vitest inject and falls back to the production host", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.BASE_URL = "/";
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    expect(DEFAULT_SITE_URL).toBe("https://research.spacechild.love");
  });

  it("accepts BASE_URL only when it is an absolute http(s) origin", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.BASE_URL = "https://legacy.example";
    expect(siteUrl()).toBe("https://legacy.example");
    process.env.BASE_URL = "legacy.example";
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
  });
});
