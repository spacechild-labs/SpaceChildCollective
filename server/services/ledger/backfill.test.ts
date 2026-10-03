import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { runBackfill, validateManifest, type BackfillClient } from "./backfill";
import { hashUrl } from "../../../scripts/ledger-hash-url";

const good = {
  campaigns: [{ id: "heesch-leader-optimality", title: "Heesch" }],
  records: [
    { ref: "claim", record: { campaignId: "heesch-leader-optimality", kind: "note", title: "On air: every receipt is public", standing: "retracted" } },
    { ref: "fix", correctsRef: "claim", record: { campaignId: "heesch-leader-optimality", kind: "correction", title: "Not every receipt was public", standing: "measured" } },
  ],
};

function manifestOf(raw: unknown) {
  const out = validateManifest(raw);
  if (!out.ok) throw new Error(out.errors.join("\n"));
  return out.manifest;
}

function fakeClient(): BackfillClient & { filed: Array<Record<string, unknown>>; campaigns: unknown[] } {
  const byRef = new Map<string, string>();
  let n = 0;
  return {
    filed: [],
    campaigns: [],
    async createCampaign(c) { this.campaigns.push(c); return this.campaigns.length > 1 ? "exists" : "created"; },
    async file(r) {
      this.filed.push(r);
      const ref = String(r.clientRef);
      if (byRef.has(ref)) return { id: byRef.get(ref)!, created: false };
      const id = `01J9Z3K8Q2A7B5C4D6E8F0G${String(++n).padStart(3, "0")}`;
      byRef.set(ref, id);
      return { id, created: true };
    },
  };
}

describe("backfill manifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateManifest(good)).toMatchObject({ ok: true });
  });

  it("rejects forward references, duplicate refs, direct link ids, clientRef, and invalid records", () => {
    const bad = {
      campaigns: [{ id: "x", title: "too-short id" }],
      records: [
        { ref: "a", correctsRef: "b", record: { kind: "correction", title: "forward" } },
        { ref: "b", record: { kind: "result", title: "ok" } },
        { ref: "b", record: { kind: "result", title: "dup" } },
        { ref: "c", record: { kind: "result", title: "direct", correctsId: "01J9Z3K8Q2A7B5C4D6E8F0G1H2" } },
        { ref: "d", record: { kind: "result", title: "ref", clientRef: "mine" } },
        { ref: "e", record: { kind: "result" } },
      ],
    };
    const out = validateManifest(bad);
    expect(out.ok).toBe(false);
    const text = (out as { errors: string[] }).errors.join("\n");
    expect(text).toContain("campaign 0");
    expect(text).toContain('record "a": correctsRef "b" is not an earlier ref');
    expect(text).toContain('duplicate ref "b"');
    expect(text).toContain('record "c": set links with *Ref');
    expect(text).toContain('record "d": clientRef is set by the runner');
    expect(text).toContain('record "e"');
  });

  it("fails a correction placed before its target, and an unknown or self ref", () => {
    const reversed = { records: [good.records[1], good.records[0]] };
    const out = validateManifest(reversed);
    expect(out.ok).toBe(false);
    expect((out as { errors: string[] }).errors.join("\n")).toContain('correctsRef "claim" is not an earlier ref');
    const unknown = validateManifest({ records: [{ ref: "z", correctsRef: "nope", record: { kind: "correction", title: "t" } }] });
    expect(unknown.ok).toBe(false);
    const self = validateManifest({ records: [{ ref: "z", correctsRef: "z", record: { kind: "correction", title: "t" } }] });
    expect(self.ok).toBe(false);
  });

  it("applies the server's url rules to evidence and campaign links", () => {
    const evil = validateManifest({
      campaigns: [{ id: "abc-camp", title: "t", links: [{ label: "l", url: "javascript:alert(1)" }] }],
      records: [{ ref: "r1", record: { kind: "result", title: "t", evidence: [{ label: "e", url: "data:text/html,x" }] } }],
    });
    expect(evil.ok).toBe(false);
    const text = (evil as { errors: string[] }).errors.join("\n");
    expect(text).toContain("campaign 0");
    expect(text).toContain('record "r1"');
  });

  it("rejects link-rule violations that the server would reject (review without verdict)", () => {
    const out = validateManifest({
      records: [
        { ref: "t1", record: { kind: "result", title: "t" } },
        { ref: "rv", reviewsRef: "t1", record: { kind: "review", title: "r" } },
      ],
    });
    expect(out.ok).toBe(false);
    expect((out as { errors: string[] }).errors.join("\n")).toContain("missing_verdict");
  });
});

describe("backfill runner", () => {
  it("files in order, resolves refs to ids, and sets clientRef", async () => {
    const client = fakeClient();
    const ids = await runBackfill(manifestOf(good), client);
    expect(client.filed[0]).toMatchObject({ clientRef: "backfill:claim" });
    expect(client.filed[1]).toMatchObject({ clientRef: "backfill:fix", correctsId: ids.get("claim") });
    expect(client.filed[1]).not.toHaveProperty("correctsRef");
  });

  it("is idempotent: a second run files nothing new", async () => {
    const client = fakeClient();
    const m = manifestOf(good);
    const first = await runBackfill(m, client);
    const second = await runBackfill(m, client);
    expect([...second.values()]).toEqual([...first.values()]);
    expect(client.campaigns).toHaveLength(2);
  });
});

describe("evidence hasher", () => {
  function host(handler: Parameters<typeof createServer>[1]) {
    const server = createServer(handler);
    return new Promise<{ base: string; close(): Promise<void> }>((resolve) =>
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as { port: number };
        resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) });
      }));
  }

  it("hashes the served bytes and follows http redirects", async () => {
    const h = await host((req, res) => {
      if (req.url === "/go") { res.writeHead(302, { location: "/file" }); res.end(); return; }
      res.end("hello");
    });
    try {
      expect(await hashUrl(`${h.base}/go`)).toEqual({
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", bytes: 5,
      });
    } finally { await h.close(); }
  });

  it("refuses non-http redirects and non-http urls", async () => {
    const h = await host((_req, res) => { res.writeHead(302, { location: "file:///etc/passwd" }); res.end(); });
    try {
      await expect(hashUrl(`${h.base}/x`)).rejects.toThrow(/non-http/);
      await expect(hashUrl("file:///etc/passwd")).rejects.toThrow(/non-http/);
    } finally { await h.close(); }
  });

  it("caps the download size even without a content-length", async () => {
    const h = await host((_req, res) => {
      res.write(Buffer.alloc(4096));
      const t = setInterval(() => { if (!res.write(Buffer.alloc(4096))) return; }, 1);
      res.on("close", () => clearInterval(t));
    });
    try {
      await expect(hashUrl(`${h.base}/endless`, 20_000)).rejects.toThrow(/larger than/);
    } finally { await h.close(); }
  });
});
