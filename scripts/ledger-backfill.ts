// Usage: LEDGER_BASE_URL=https://... LEDGER_KEY=scl_... npx tsx scripts/ledger-backfill.ts <manifest.json> [--go]
// The base URL and key come only from the environment (never argv), are never printed and never written to disk.
// Without --go it validates and prints the plan and makes no network calls. Re-running with --go is safe:
// every record carries clientRef backfill:<ref>.
import { readFileSync } from "node:fs";
import { runBackfill, validateManifest, type BackfillClient } from "../server/services/ledger/backfill";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const go = args.includes("--go");
if (!file) { console.error("usage: ledger-backfill.ts <manifest.json> [--go]   (env: LEDGER_BASE_URL, LEDGER_KEY)"); process.exit(2); }

const checked = validateManifest(JSON.parse(readFileSync(file, "utf8")));
if (!checked.ok) { console.error(checked.errors.join("\n")); process.exit(1); }
const m = checked.manifest;
console.log(`manifest ok: ${m.campaigns.length} campaigns, ${m.records.length} records`);
for (const r of m.records) console.log(`  ${r.ref}: ${(r.record as any).kind} / ${(r.record as any).standing ?? "unverified"} / ${(r.record as any).title}`);
if (!go) { console.log("dry run (no network calls); pass --go to file"); process.exit(0); }

const base = (process.env.LEDGER_BASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.LEDGER_KEY;
if (!/^https?:\/\//.test(base)) { console.error("set LEDGER_BASE_URL to an http(s) base URL"); process.exit(2); }
if (!key?.startsWith("scl_")) { console.error("set LEDGER_KEY to an scl_ agent key"); process.exit(2); }
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", "x-ledger-backfill": "1" };

/** Failures name the request and status only; never request headers or the key. */
async function send(path: string, body: unknown, what: string) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), redirect: "error" });
  return { res, fail: async () => new Error(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 500)}`) };
}

const client: BackfillClient = {
  async createCampaign(c) {
    const { res, fail } = await send("/api/ledger/campaigns", c, `campaign ${(c as any).id}`);
    if (res.status === 201) return "created";
    if (res.status === 409) return "exists";
    throw await fail();
  },
  async file(r) {
    const { res, fail } = await send("/api/ledger/records", r, String(r.clientRef));
    if (res.status !== 201 && res.status !== 200) throw await fail();
    const { record, created } = await res.json();
    return { id: record.id, created };
  },
};

try {
  const ids = await runBackfill(m, client, (line) => console.log(line));
  console.log(JSON.stringify(Object.fromEntries(ids), null, 2));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
