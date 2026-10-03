import { Router } from "express";
import type { PublicRecord } from "@shared/ledger-public";
import { httpUrl } from "@shared/ledger-validate";
import type { LedgerService } from "../services/ledger/service";

// Characters XML 1.0 cannot carry at all: C0 controls except \t \n \r, lone surrogates, U+FFFE/U+FFFF.
const XML_ILLEGAL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function escapeXml(s: string): string {
  return s
    .replace(XML_ILLEGAL, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function pubDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date(0).toUTCString() : d.toUTCString();
}

/** Every link is built from the record id on our own origin, never from record-supplied text. */
function rss(baseUrl: string, title: string, link: string, records: PublicRecord[]): string {
  const items = records.map((r) => `    <item>
      <title>${escapeXml(`[${r.kind} · ${r.standing}] ${r.title}`)}</title>
      <link>${baseUrl}/records/${encodeURIComponent(r.id)}</link>
      <guid isPermaLink="false">${escapeXml(r.id)}</guid>
      <pubDate>${pubDate(r.createdAt)}</pubDate>
      <author>${escapeXml(r.authorUsername)}</author>
      <description>${escapeXml(r.body.slice(0, 2000))}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${link}</link>
    <description>Append-only research ledger of the Kannaka / Space Child constellation</description>
${items}
  </channel>
</rss>
`;
}

function jsonFeed(baseUrl: string, title: string, home: string, feedUrl: string, records: PublicRecord[]) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: home,
    feed_url: feedUrl,
    items: records.map((x) => ({
      id: x.id,
      url: `${baseUrl}/records/${encodeURIComponent(x.id)}`,
      title: x.title,
      content_text: x.body,
      date_published: x.createdAt,
      authors: [{ name: x.authorUsername }],
      tags: [x.kind, x.standing, ...(x.campaignId ? [x.campaignId] : [])],
      _ledger: {
        content_hash: x.contentHash,
        evidence: x.evidence.filter((e) => httpUrl.safeParse(e.url).success).map((e) => ({ label: e.label, url: e.url })),
      },
    })),
  };
}

/**
 * Feeds are public: every query runs as the anonymous viewer (null), whatever
 * session or agent key the request carries, so held records can never appear.
 */
export function createLedgerFeedRouter(svc: LedgerService, baseUrl: string): Router {
  const r = Router();
  const site = baseUrl.replace(/\/+$/, "");
  const cache = "public, max-age=60";

  r.get("/ledger/feed.xml", async (_req, res, next) => {
    try {
      const records = await svc.listRecords(null, { limit: 100 });
      res.set("Cache-Control", cache).type("application/rss+xml; charset=utf-8").send(rss(site, "Research Ledger", `${site}/`, records));
    } catch (e) { next(e); }
  });

  r.get("/ledger/feed.json", async (_req, res, next) => {
    try {
      const records = await svc.listRecords(null, { limit: 100 });
      res.set("Cache-Control", cache).type("application/feed+json; charset=utf-8")
        .send(JSON.stringify(jsonFeed(site, "Research Ledger", `${site}/`, `${site}/ledger/feed.json`, records)));
    } catch (e) { next(e); }
  });

  r.get("/ledger/:campaign/feed.xml", async (req, res, next) => {
    try {
      const view = await svc.getCampaignView(null, req.params.campaign);
      if (!view) { res.status(404).type("text/plain").send("campaign not found"); return; }
      res.set("Cache-Control", cache).type("application/rss+xml; charset=utf-8")
        .send(rss(site, `Research Ledger: ${view.campaign.title}`, `${site}/campaigns/${encodeURIComponent(view.campaign.id)}`, view.records));
    } catch (e) { next(e); }
  });

  r.get("/ledger/:campaign/feed.json", async (req, res, next) => {
    try {
      const view = await svc.getCampaignView(null, req.params.campaign);
      if (!view) { res.status(404).type("text/plain").send("campaign not found"); return; }
      const id = encodeURIComponent(view.campaign.id);
      res.set("Cache-Control", cache).type("application/feed+json; charset=utf-8")
        .send(JSON.stringify(jsonFeed(site, `Research Ledger: ${view.campaign.title}`, `${site}/campaigns/${id}`, `${site}/ledger/${id}/feed.json`, view.records)));
    } catch (e) { next(e); }
  });

  return r;
}
