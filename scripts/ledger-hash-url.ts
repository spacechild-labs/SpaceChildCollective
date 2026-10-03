// Usage: npx tsx scripts/ledger-hash-url.ts <url> [label]
// Prints an evidence object with the sha256 and size of exactly the bytes served at that URL.
// Only http(s) is fetched (including every redirect hop); the download is capped at 50 MB.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 10;

function httpOnly(u: string): URL {
  const url = new URL(u);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`refusing non-http(s) URL: ${url.protocol}`);
  return url;
}

export async function hashUrl(input: string, maxBytes = MAX_BYTES): Promise<{ sha256: string; bytes: number }> {
  let url = httpOnly(input);
  for (let hop = 0; ; hop++) {
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
      await res.body?.cancel();
      url = httpOnly(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) { await res.body?.cancel(); throw new Error(`response larger than ${maxBytes} bytes`); }
    const hash = createHash("sha256");
    let bytes = 0;
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        bytes += chunk.length;
        if (bytes > maxBytes) { await res.body.cancel().catch(() => {}); throw new Error(`response larger than ${maxBytes} bytes`); }
        hash.update(chunk);
      }
    }
    return { sha256: hash.digest("hex"), bytes };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [url, label] = process.argv.slice(2);
  if (!url) { console.error("usage: ledger-hash-url.ts <url> [label]"); process.exit(2); }
  try {
    const { sha256, bytes } = await hashUrl(url);
    console.log(JSON.stringify({ label: label ?? url.split("/").pop(), url, sha256, bytes }));
  } catch (e) {
    console.error(`${(e as Error).message} for ${url}`);
    process.exit(1);
  }
}
