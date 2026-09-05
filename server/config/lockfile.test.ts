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

  /**
   * Every package that declares an esbuild range must be able to resolve it from
   * the lock: either the hoisted esbuild satisfies the range's floor, or a nested
   * `node_modules/<pkg>/node_modules/esbuild` node exists. Replit's lockfile
   * rewrites twice dropped vitest's nested esbuild@0.28.x, and `npm ci` on Linux
   * then failed with "Missing: esbuild@0.28.2 from lock file" while a Windows
   * dry-run under npm 11 stayed green.
   */
  it("keeps a resolvable esbuild for every package that requires one", () => {
    const { packages } = JSON.parse(lock) as { packages: Record<string, any> };
    const version = (v: string) => v.split(".").map((n) => Number(n.replace(/\D.*$/, "")));
    const floor = (range: string) => {
      // Lowest version mentioned in a range like "^0.27.0 || ^0.28.0" or "~0.25.0".
      const nums = [...range.matchAll(/(\d+)\.(\d+)\.(\d+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
      return nums.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])[0];
    };
    const gte = (a: number[], b: number[]) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];
    const hoisted = version(packages["node_modules/esbuild"].version);
    const unresolved: string[] = [];
    for (const [path, pkg] of Object.entries(packages)) {
      const range: string | undefined = pkg?.dependencies?.esbuild ?? pkg?.peerDependencies?.esbuild;
      if (!range || range.startsWith(">=")) continue;
      const need = floor(range);
      if (!need) continue;
      // Walk up the node_modules chain looking for the nearest esbuild node.
      const segments = path.split("/node_modules/");
      let found: string | null = null;
      for (let depth = segments.length; depth >= 1 && !found; depth--) {
        const base = segments.slice(0, depth).join("/node_modules/");
        const candidate = depth === 0 ? "node_modules/esbuild" : `${base}/node_modules/esbuild`;
        if (packages[candidate]) found = packages[candidate].version;
      }
      const have = found ? version(found) : hoisted;
      if (!gte(have, need)) unresolved.push(`${path} needs esbuild ${range}, nearest lock node is ${found ?? packages["node_modules/esbuild"].version}`);
    }
    expect(unresolved).toEqual([]);
  });
});
