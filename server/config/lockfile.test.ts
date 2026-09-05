import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Guard: the lockfile must resolve packages from the public registry.
 *
 * Installing inside Replit rewrites `resolved` URLs to its internal proxy
 * (package-firewall.replit.local), which makes `npm ci` fail everywhere else,
 * including CI. This caught main on 2026-09-05.
 */
describe("package-lock.json", () => {
  const lock = fs.readFileSync(path.resolve(process.cwd(), "package-lock.json"), "utf8");

  it("exists and is non-trivial (so the assertions below are not vacuous)", () => {
    expect(lock.length).toBeGreaterThan(10_000);
    expect((lock.match(/"resolved": "https:\/\/registry\.npmjs\.org\//g) ?? []).length).toBeGreaterThan(100);
  });

  it("has no Replit package-firewall or other private-proxy resolved URLs", () => {
    const bad = lock.match(/"resolved": "http:\/\/[^"]+"/g) ?? [];
    expect(bad, `insecure/proxy resolved URLs: ${bad.slice(0, 5).join(", ")}`).toEqual([]);
    expect(lock.includes("replit.local")).toBe(false);
  });
});
