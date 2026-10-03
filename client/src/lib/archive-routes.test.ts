import { describe, expect, it } from "vitest";
import { archivePathFor, archiveRedirectTarget } from "./archive-routes";

describe("archive redirects", () => {
  it("maps every legacy path under /archive", () => {
    expect(archivePathFor("/discover")).toBe("/archive/discover");
    expect(archivePathFor("/papers/abc")).toBe("/archive/papers/abc");
    expect(archivePathFor("/papers/abc/edit")).toBe("/archive/papers/abc/edit");
    expect(archivePathFor("/experiments/9")).toBe("/archive/experiments/9");
    expect(archivePathFor("/workspace")).toBe("/archive/workspace");
    expect(archivePathFor("/mcp")).toBe("/archive/mcp");
    expect(archivePathFor("/loop")).toBe("/archive/loop");
  });
  it("leaves ledger, account and archive paths alone", () => {
    for (const p of ["/", "/ledger", "/records/x", "/campaigns/x", "/agents/kannaka", "/agents/kannaka/", "/file", "/releases", "/admin/agents", "/profile", "/settings", "/auth", "/privacy", "/terms", "/archive", "/archive/discover", "/discoverx", "/papersX"]) {
      expect(archivePathFor(p)).toBeNull();
    }
  });
  it("sends the old agents dashboard to the archive but not agent profiles", () => {
    expect(archivePathFor("/agents")).toBe("/archive/agents");
    expect(archivePathFor("/agents/kannaka")).toBeNull();
    expect(archivePathFor("/agents/papers")).toBeNull();
    expect(archivePathFor("/agents/discover")).toBeNull();
  });
  it("never produces anything but a same-origin /archive/ path", () => {
    const hostile = ["//evil.com", "//evil.com/papers/x", "/papers//evil.com", "/\evil.com", "/papers/\evil.com", "/papers/..//evil.com", "/papers/../../evil.com",
      "https://evil.com/papers/x", "/discover\n//evil.com", "/discover\r\nLocation: //evil.com", "javascript:alert(1)", "/papers/%2F%2Fevil.com", "/papers/%5Cevil.com", "", "papers/x"];
    for (const p of hostile) {
      const out = archivePathFor(p);
      if (out !== null) {
        expect(out.startsWith("/archive/")).toBe(true);
        expect(out.startsWith("//")).toBe(false);
        expect(out).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
        expect([...out].some((ch) => ch.charCodeAt(0) < 0x20 || ch === String.fromCharCode(92))).toBe(false);
      }
    }
    expect(archivePathFor("//evil.com")).toBeNull();
    expect(archivePathFor("/papers/..//evil.com")).toBeNull();
    expect(archivePathFor("/papers/%2F%2Fevil.com")).toBe("/archive/papers/%2F%2Fevil.com");
  });
  it("keeps a well-formed query string and drops a malformed one", () => {
    expect(archiveRedirectTarget("/discover", "?q=a%20b&c=1")).toBe("/archive/discover?q=a%20b&c=1");
    expect(archiveRedirectTarget("/discover", "")).toBe("/archive/discover");
    expect(archiveRedirectTarget("/discover", "?")).toBe("/archive/discover");
    expect(archiveRedirectTarget("/discover", "//evil.com")).toBe("/archive/discover");
    expect(archiveRedirectTarget("/discover", "?a=1\n//evil.com")).toBe("/archive/discover");
    expect(archiveRedirectTarget("//evil.com", "?a=1")).toBeNull();
    expect(archiveRedirectTarget("/ledger", "?a=1")).toBeNull();
  });
});
