import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { MemoryLedgerStore } from "../services/ledger/memory-store";
import { LedgerService } from "../services/ledger/service";
import { createLedgerFeedRouter, escapeXml } from "./ledger-feeds";
import { serve } from "../test-utils/serve";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
let srv: { base: string; close(): Promise<void> };
let svc: LedgerService;

beforeEach(async () => {
  svc = new LedgerService(new MemoryLedgerStore([agent]));
  await svc.createCampaign(agent, { id: "heesch-leader", title: "Heesch" });
  await svc.file(agent, { kind: "result", title: "白い紙 <script>alert(1)</script>", campaignId: "heesch-leader" }, "api");
  await svc.file(agent, { kind: "result", title: "OTHER-CAMPAIGN-FREE" }, "api");
  await svc.file(agent, { kind: "result", title: "HELD-SECRET", held: true }, "api");
  await svc.file(agent, { kind: "result", title: "HELD-IN-CAMPAIGN", campaignId: "heesch-leader", held: true }, "api");
  const app = express();
  // Simulate a signed-in admin/releaser session and an agent key on every request.
  app.use((req: any, _res, next) => {
    req.user = { id: "admin", username: "admin", userType: "human", role: "admin", canRelease: true };
    req.actor = req.user;
    req.agent = agent;
    next();
  });
  app.use(createLedgerFeedRouter(svc, "https://research.example"));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

describe("ledger feeds", () => {
  it("escapes XML", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });

  it("strips characters illegal in XML 1.0 and keeps valid ones", () => {
    const dirty = "a\u0000b\u0008c\u000Bd\u000Ce\u001Ff￾g￿h\uD800i\uDC00j";
    expect(escapeXml(dirty)).toBe("abcdefghij");
    expect(escapeXml("t\tn\nr\r😀白")).toBe("t\tn\nr\r😀白");
  });

  it("serves RSS with escaped titles, non-ASCII intact, and no held records even for a signed-in request", async () => {
    const res = await fetch(`${srv.base}/ledger/feed.xml`);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain("白い紙 &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("HELD-SECRET");
    expect(xml).not.toContain("HELD-IN-CAMPAIGN");
    expect(xml).toContain("https://research.example/records/");
  });

  it("a control character in a title does not break the feed", async () => {
    await svc.file(agent, { kind: "note", title: "bad\u0001title" }, "api").catch(() => undefined);
    const xml = await (await fetch(`${srv.base}/ledger/feed.xml`)).text();
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });

  it("serves JSON Feed 1.1 without held records", async () => {
    const feed = await (await fetch(`${srv.base}/ledger/feed.json`)).json();
    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(feed.items).toHaveLength(2);
    expect(JSON.stringify(feed)).not.toContain("HELD-");
  });

  it("builds item urls from ids and only exposes http(s) evidence urls", async () => {
    await svc.file(agent, { kind: "result", title: "with evidence", evidence: [{ label: "ok", url: "https://example.org/x" }] }, "api");
    const feed = await (await fetch(`${srv.base}/ledger/feed.json`)).json();
    const item = feed.items.find((i: any) => i.title === "with evidence");
    expect(item.url).toBe(`https://research.example/records/${item.id}`);
    expect(item._ledger.evidence).toEqual([{ label: "ok", url: "https://example.org/x" }]);
  });

  it("serves a per-campaign feed (xml and json) and 404s an unknown campaign", async () => {
    const xml = await (await fetch(`${srv.base}/ledger/heesch-leader/feed.xml`)).text();
    expect(xml).toContain("白い紙");
    expect(xml).not.toContain("OTHER-CAMPAIGN-FREE");
    expect(xml).not.toContain("HELD-IN-CAMPAIGN");
    const json = await (await fetch(`${srv.base}/ledger/heesch-leader/feed.json`)).json();
    expect(json.items).toHaveLength(1);
    expect((await fetch(`${srv.base}/ledger/no-such/feed.xml`)).status).toBe(404);
    expect((await fetch(`${srv.base}/ledger/no-such/feed.json`)).status).toBe(404);
  });
});
