import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Loads client/public/sw.js in a sandbox and drives its fetch listener (M7).
const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://research.spacechild.love";

function loadWorker(source: string) {
  const listeners: Record<string, (e: any) => void> = {};
  const self = { location: { origin: ORIGIN }, addEventListener: (t: string, fn: (e: any) => void) => { listeners[t] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const cacheStore = { match: async () => undefined, open: async () => ({ put: async () => {} }), keys: async () => [] };
  vm.runInNewContext(source, { self, caches: cacheStore, fetch: async () => new Response("x"), console: { log() {}, error() {}, warn() {} }, URL, Response, Promise, setTimeout });
  return (url: string, init: { method?: string; accept?: string; mode?: string } = {}) => {
    let responded = false;
    const request = { url, method: init.method ?? "GET", mode: init.mode ?? "cors", headers: new Headers(init.accept ? { accept: init.accept } : {}) };
    listeners.fetch({ request, respondWith: () => { responded = true; } });
    return responded;
  };
}

const NEVER_HANDLED: Array<[string, { method?: string; accept?: string }?]> = [
  [`${ORIGIN}/api/ledger/records`],
  [`${ORIGIN}/api/ledger/records/01J9Z3K8Q2A7B5C4D6E8F0G1H2`],
  [`${ORIGIN}/api/ledger/stream`, { accept: "text/event-stream" }],
  [`${ORIGIN}/api/auth/me`],
  [`${ORIGIN}/ledger/feed.xml`],
  [`${ORIGIN}/ledger/feed.json`],
  [`${ORIGIN}/ledger/ecdsa-c005/feed.json`],
  [`${ORIGIN}/mcp`],
  [`${ORIGIN}/some/live`, { accept: "text/event-stream" }],
  [`${ORIGIN}/records/x`, { method: "POST" }],
  ["https://elsewhere.example/app.js"],
];

describe("service worker fetch handler", () => {
  it("loads without a ReferenceError and handles nothing while caching is off", () => {
    const fire = loadWorker(SOURCE);
    for (const [url, init] of NEVER_HANDLED) expect(fire(url, init), url).toBe(false);
    expect(fire(`${ORIGIN}/assets/index.js`)).toBe(false);
  });

  it("still never handles the API, feeds, MCP, event streams or non-GETs if caching is switched on", () => {
    expect(SOURCE).toContain("const SKIP_CACHING = true;");
    const fire = loadWorker(SOURCE.replace("const SKIP_CACHING = true;", "const SKIP_CACHING = false;"));
    for (const [url, init] of NEVER_HANDLED) expect(fire(url, init), url).toBe(false);
    // ordinary same-origin assets are what caching would cover
    expect(fire(`${ORIGIN}/assets/index.js`)).toBe(true);
  });
});
