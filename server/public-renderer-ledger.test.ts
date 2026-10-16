import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPublicPage, type LedgerReads } from "./public-renderer";
import { MemoryLedgerStore } from "./services/ledger/memory-store";
import { LedgerService } from "./services/ledger/service";

const template = `<!doctype html><html><head><title>x</title><meta name="description" content="generic"></head><body><div id="root"><div class="loading"><div class="loading-spinner"></div></div></div></body></html>`;
const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
const noStorage = {} as any;
let svc: LedgerService;
let pubId: string;
let heldId: string;

beforeEach(async () => {
  svc = new LedgerService(new MemoryLedgerStore([agent]));
  await svc.createCampaign(agent, { id: "heesch-leader", title: "Heesch <leader>" });
  pubId = (await svc.file(agent, { kind: "result", title: "白い紙 <script>x</script>", body: "body & more", campaignId: "heesch-leader" }, "api")).record.id;
  heldId = (await svc.file(agent, { kind: "result", title: "HELD-SECRET", held: true }, "api")).record.id;
});

describe("server-rendered ledger pages", () => {
  it("renders a record with escaped content and its hash", async () => {
    const out = await renderPublicPage(template, `/records/${pubId}`, noStorage, svc);
    expect(out?.status).toBe(200);
    expect(out!.html).toContain("白い紙 &lt;script&gt;x&lt;/script&gt;");
    expect(out!.html).not.toContain("<script>x</script>");
    expect(out!.html).toContain("body &amp; more");
    expect(out!.html).toContain(`rel="canonical" href="https://research.spacechild.love/records/${pubId}"`);
  });

  it("marks a corrected or challenged record from public records only (FI5)", async () => {
    const page = async () => (await renderPublicPage(template, `/records/${pubId}`, noStorage, svc))!.html;
    expect(await page()).not.toContain("· corrected");
    await svc.file(agent, { kind: "correction", title: "quiet fix", correctsId: pubId, held: true }, "api");
    expect(await page()).not.toContain("· corrected");
    await svc.file(agent, { kind: "review", title: "nope", reviewsId: pubId, verdict: "breaks" }, "api");
    expect(await page()).toContain("· challenged");
    expect(await page()).not.toContain("· corrected");
  });

  it("shows the derived tier beside the standing, and the checks, only when the server has a verifier", async () => {
    const page = async (p: string) => (await renderPublicPage(template, p, noStorage, svc))!.html;
    expect(await page(`/records/${pubId}`)).not.toContain("Machine check");
    const { MemoryVerificationStore, VerificationService } = await import("./services/ledger/verifications");
    const v = new VerificationService(new MemoryVerificationStore(), svc, {
      fetchSha256: async () => [null, "HTTP 404"], fetchCrlfSha256: async () => null,
    }, { autoStart: false });
    svc.setVerifier(v);
    expect(await page(`/records/${pubId}`)).toContain("Machine check: unchecked");
    await v.drain();
    const html = await page(`/records/${pubId}`);
    expect(html).toContain("result · unverified · claimed");
    expect(html).toContain("Machine check: claimed");
    expect(html).toContain("evidence: none attached");
    expect(await page("/campaigns/heesch-leader")).toContain("· claimed");
  });

  it("404s a held record and never renders it", async () => {
    const out = await renderPublicPage(template, `/records/${heldId}`, noStorage, svc);
    expect(out?.status).toBe(404);
    expect(out!.html).not.toContain("HELD-SECRET");
  });

  it("renders the home page, a campaign, and an agent without held records", async () => {
    for (const path of ["/", "/campaigns/heesch-leader", "/agents/kannaka"]) {
      const out = await renderPublicPage(template, path, noStorage, svc);
      expect(out?.status, path).toBe(200);
      expect(out!.html, path).not.toContain("HELD-SECRET");
    }
    expect((await renderPublicPage(template, "/campaigns/heesch-leader", noStorage, svc))!.html).toContain("Heesch &lt;leader&gt;");
    const home = (await renderPublicPage(template, "/", noStorage, svc))!.html;
    expect(home).toContain("append-only research ledger");
    expect(home).toContain(`/records/${pubId}`);
  });

  it("404s unknown and malformed campaign, agent and record paths", async () => {
    for (const p of ["/campaigns/nope", "/agents/nobody", "/records/nope", "/records/%E0%A4%A", "/agents/%E0%A4%A"]) {
      const out = await renderPublicPage(template, p, noStorage, svc);
      expect(out?.status, p).toBe(404);
      expect(out!.html).toContain("noindex");
    }
  });

  it("escapes agent-supplied titles in text, attributes and meta tags", async () => {
    const evil = `"><script>alert(1)</script></script><script>alert(2)</script>`;
    const id = (await svc.file(agent, { kind: "note", title: evil, body: evil }, "api")).record.id;
    const html = (await renderPublicPage(template, `/records/${id}`, noStorage, svc))!.html;
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain(`"><script`);
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)");
    // the only <script> elements are the ones the template/ledger page legitimately has: none here
    expect(html.match(/<script/g)).toBeNull();
    const home = (await renderPublicPage(template, "/", noStorage, svc))!.html;
    expect(home).not.toContain("<script>alert");
  });

  it("only links http(s) evidence and neutralises other schemes", async () => {
    const stub = {
      getRecordView: async () => ({
        record: {
          id: "R1", campaignId: null, kind: "result", title: "t", body: "b", standing: "measured",
          evidence: [
            { label: "good", url: "https://example.com/a?x=1&y=2" },
            { label: "bad-js", url: "javascript:alert(1)" },
            { label: "bad-data", url: "data:text/html,<script>1</script>" },
          ],
          authorUsername: "kannaka", contentHash: "h", createdAt: "2026-01-01T00:00:00.000Z",
        },
        corrections: [], reviews: [], notes: [], amendments: [],
      }),
    } as unknown as LedgerReads;
    const html = (await renderPublicPage(template, "/records/R1", noStorage, stub))!.html;
    expect(html).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("bad-js");
  });

  it("shows who invited an agent, escaped, when the inviter lookup is supplied", async () => {
    const profile = { username: "kid", invitedBy: null, stats: { filed: 0, reviewsGiven: 0, reviewsReceived: 0, corrected: 0, retracted: 0 }, records: [] };
    const stub = { agentProfile: async () => profile } as unknown as LedgerReads;
    const withLookup = (await renderPublicPage(template, "/agents/kid", noStorage, stub, async () => "QE<b>"))!.html;
    expect(withLookup).toContain("Invited by");
    expect(withLookup).toContain("QE&lt;b&gt;");
    expect(withLookup).not.toContain("QE<b>");
    const without = (await renderPublicPage(template, "/agents/kid", noStorage, stub))!.html;
    expect(without).not.toContain("Invited by");
    const none = (await renderPublicPage(template, "/agents/kid", noStorage, stub, async () => null))!.html;
    expect(none).not.toContain("Invited by");
  });

  it("reads as the anonymous viewer, whatever the caller", async () => {
    const spy = {
      getRecordView: vi.fn(async () => null), getCampaignView: vi.fn(async () => null),
      agentProfile: vi.fn(async () => null), listRecords: vi.fn(async () => []),
    } as unknown as LedgerReads;
    for (const p of ["/", "/records/x", "/campaigns/abc", "/agents/a"]) await renderPublicPage(template, p, noStorage, spy);
    for (const fn of Object.values(spy) as any[]) for (const call of fn.mock.calls) expect(call[0]).toBeNull();
  });

  it("serves the plain/static page when a ledger read throws", async () => {
    const boom = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      getRecordView: async () => { throw new Error("db down"); }, getCampaignView: async () => { throw new Error("db down"); },
      agentProfile: async () => { throw new Error("db down"); }, listRecords: async () => { throw new Error("db down"); },
    } as unknown as LedgerReads;
    expect(await renderPublicPage(template, "/records/x", noStorage, broken)).toBeUndefined();
    const home = await renderPublicPage(template, "/", noStorage, broken);
    expect(home?.status).toBe(200);
    expect(home!.html).toContain("append-only");
    expect(boom).toHaveBeenCalled();
    boom.mockRestore();
  });

  it("escapes JSON-LD so a paper title cannot close the script element", async () => {
    const paper = {
      id: "p1", title: `</script><script>alert(1)</script>${String.fromCharCode(0x2028)}&`, abstract: "a", content: "c", status: "published",
      createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), publishedAt: new Date("2026-01-01"), contributors: [],
    };
    const html = (await renderPublicPage(template, "/archive/papers/p1", { getPaperWithContributors: async () => paper } as any))!.html;
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
    for (const ch of ["<", ">", "&", String.fromCharCode(0x2028), String.fromCharCode(0x2029)]) expect(ld.includes(ch)).toBe(false);
    expect(JSON.parse(ld).headline).toBe(paper.title);
  });
});

describe("replacement-pattern safety ($ sequences in agent text)", () => {
  const scriptTemplate = `<!doctype html><html><head><title>x</title><script>swStub()</script><meta name="description" content="generic"></head><body><div id="root"><div class="loading"><div class="loading-spinner"></div></div></div><script type="module" src="/src/main.tsx"></script></body></html>`;
  const nasty = "$` $' $& $1 $$";
  const nastyEsc = "$` $&#39; $&amp; $1 $$";

  function expectIntact(html: string) {
    expect(html.match(/swStub\(\)/g)).toHaveLength(1);
    expect(html.match(/src="\/src\/main\.tsx"/g)).toHaveLength(1);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/class="loading"/g)).toBeNull();
    expect(html.match(/<div id="root">/g)).toHaveLength(1);
  }

  it("renders $-patterns literally in a record page", async () => {
    const weird = { ...agent, id: "u-w", username: "ag$`ent" };
    const s = new LedgerService(new MemoryLedgerStore([weird]));
    await s.createCampaign(weird, { id: "weird-camp", title: nasty, summary: nasty });
    const id = (await s.file(weird, { kind: "note", title: nasty, body: nasty, campaignId: "weird-camp" }, "api")).record.id;
    for (const path of [`/records/${id}`, "/", "/campaigns/weird-camp", `/agents/${encodeURIComponent(weird.username)}`]) {
      const html = (await renderPublicPage(scriptTemplate, path, noStorage, s))!.html;
      expectIntact(html);
      expect(html, path).toContain("$` $&#39; $&amp; $1 $$");
    }
    const rec = (await renderPublicPage(scriptTemplate, `/records/${id}`, noStorage, s))!.html;
    expect(rec).toContain(`<title>${nastyEsc} | SpaceChild Research Collective</title>`);
    expect(rec).toContain(`property="og:title" content="${nastyEsc} | SpaceChild Research Collective"`);
    expect(rec).toMatch(/property="og:description" content="[^"]*\$` \$&#39; \$&amp; \$1 \$\$/);
    expect(rec).toMatch(/<div id="root">[\s\S]*<h1>\$` \$&#39;/);
  });

  it("keeps the SPA shell on a 404 page", async () => {
    const html = (await renderPublicPage(scriptTemplate, "/records/nope", noStorage, svc))!.html;
    expectIntact(html);
  });

  it("renders $-patterns literally in a legacy paper page", async () => {
    const paper = {
      id: "p1", title: nasty, abstract: nasty, content: nasty, status: "published",
      createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), publishedAt: new Date("2026-01-01"),
      contributors: [{ role: "author", user: { displayName: nasty } }],
    };
    const html = (await renderPublicPage(scriptTemplate, "/archive/papers/p1", { getPaperWithContributors: async () => paper } as any))!.html;
    expect(html.match(/swStub\(\)/g)).toHaveLength(1);
    expect(html.match(/class="loading"/g)).toBeNull();
    expect(html).toContain(`<title>${nastyEsc} | SpaceChild Research Collective</title>`);
    expect(html).toContain("<h1>$` $&#39; $&amp; $1 $$</h1>");
  });
});
