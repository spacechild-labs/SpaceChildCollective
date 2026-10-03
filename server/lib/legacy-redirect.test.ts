import { describe, expect, it } from "vitest";
import { legacyRedirectFor } from "./legacy-redirect";

const req = (path: string, query = "") => ({ path, originalUrl: path + query });

describe("legacy server redirects", () => {
  it("301 targets keep the query and stay under /archive", () => {
    expect(legacyRedirectFor(req("/discover"))).toBe("/archive/discover");
    expect(legacyRedirectFor(req("/discover", "?q=x%20y"))).toBe("/archive/discover?q=x%20y");
    expect(legacyRedirectFor(req("/papers/abc%2Fdef"))).toBe("/archive/papers/abc%2Fdef");
  });
  it("never produces an open redirect", () => {
    expect(legacyRedirectFor(req("//evil.com"))).toBeNull();
    expect(legacyRedirectFor(req("/papers/..//evil.com"))).toBeNull();
    expect(legacyRedirectFor(req("/papers/%2F%2Fevil.com"))).toBe("/archive/papers/%2F%2Fevil.com");
    expect(legacyRedirectFor(req("/discover", "?//evil.com"))).toBe("/archive/discover?//evil.com");
    expect(legacyRedirectFor(req("/discover", "?next=\n//evil.com"))).toBe("/archive/discover");
    for (const p of ["/discover", "/papers/x", "/papers/%5Cevil.com"]) {
      const t = legacyRedirectFor(req(p, "?a=//evil.com"));
      expect(t === null || (t.startsWith("/archive/") && !t.startsWith("//"))).toBe(true);
    }
  });
  it("does not touch ledger paths", () => {
    expect(legacyRedirectFor(req("/agents/kannaka"))).toBeNull();
    expect(legacyRedirectFor(req("/ledger"))).toBeNull();
  });
});
