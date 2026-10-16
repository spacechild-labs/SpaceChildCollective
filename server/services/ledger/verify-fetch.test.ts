import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VerifyCheckError } from "@shared/ledger-verify";
import { crlfTransform, hostAllowed, makeEvidenceFetcher } from "./verify-fetch";

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const enc = (s: string) => new TextEncoder().encode(s);

/** A fake fetch: url -> response factory. Records every URL it was asked for. */
function fakeFetch(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const f = async (url: string) => {
    asked.push(url);
    const r = routes[url];
    if (!r) throw new Error("connect ECONNREFUSED");
    return r();
  };
  return { f, asked };
}
const ok = (body: string) => () => new Response(body, { status: 200 });
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

describe("hostAllowed", () => {
  it("allows https on listed hosts and wildcard subdomains only", () => {
    expect(hostAllowed("https://raw.githubusercontent.com/o/r/x")).toBe(true);
    expect(hostAllowed("https://cdn-lfs-us-1.hf.co/x")).toBe(true);
    expect(hostAllowed("https://hf.co.evil.example/x")).toBe(false);
    expect(hostAllowed("http://raw.githubusercontent.com/o/r/x")).toBe(false);
    expect(hostAllowed("https://169.254.169.254/latest")).toBe(false);
    expect(hostAllowed("https://localhost/x")).toBe(false);
    expect(hostAllowed("https://user:pw@github.com/x")).toBe(false);
    expect(hostAllowed("https://github.com:8443/x")).toBe(false);
    expect(hostAllowed("not a url")).toBe(false);
  });

  it("takes extra hosts from LEDGER_VERIFY_HOSTS", async () => {
    const { allowedHosts } = await import("./verify-fetch");
    expect(hostAllowed("https://example.org/x", allowedHosts("example.org, other.net"))).toBe(true);
  });
});

describe("makeEvidenceFetcher", () => {
  it("hashes the body and reports its size", async () => {
    const { f } = fakeFetch({ "https://github.com/a": ok("hello") });
    const r = await makeEvidenceFetcher({ fetch: f as any }).fetchSha256("https://github.com/a");
    expect(r).toEqual([sha("hello"), 5]);
  });

  it("an HTTP error status is a failure value, as in the script", async () => {
    const { f } = fakeFetch({ "https://github.com/a": () => new Response("no", { status: 404 }) });
    expect(await makeEvidenceFetcher({ fetch: f as any }).fetchSha256("https://github.com/a")).toEqual([null, "HTTP 404"]);
  });

  it("a network error is a VerifyCheckError (unchecked), not a failure", async () => {
    const { f } = fakeFetch({});
    await expect(makeEvidenceFetcher({ fetch: f as any }).fetchSha256("https://github.com/gone")).rejects.toBeInstanceOf(VerifyCheckError);
  });

  it("refuses a host that is not listed, without fetching it", async () => {
    const { f, asked } = fakeFetch({ "https://example.org/x": ok("x") });
    await expect(makeEvidenceFetcher({ fetch: f as any }).fetchSha256("https://example.org/x")).rejects.toThrow(/not on this server's fetch list/);
    expect(asked).toEqual([]);
  });

  it("follows redirects on listed hosts and checks every hop", async () => {
    const { f, asked } = fakeFetch({
      "https://huggingface.co/d/resolve/main/f": redirect("https://cdn-lfs.hf.co/blob"),
      "https://cdn-lfs.hf.co/blob": ok("data"),
    });
    expect(await makeEvidenceFetcher({ fetch: f as any }).fetchSha256("https://huggingface.co/d/resolve/main/f")).toEqual([sha("data"), 4]);
    expect(asked).toEqual(["https://huggingface.co/d/resolve/main/f", "https://cdn-lfs.hf.co/blob"]);
  });

  it("refuses a redirect to an unlisted host", async () => {
    const { f, asked } = fakeFetch({
      "https://github.com/a": redirect("http://169.254.169.254/latest/meta-data"),
    });
    await expect(makeEvidenceFetcher({ fetch: f as any }).fetchSha256("https://github.com/a")).rejects.toBeInstanceOf(VerifyCheckError);
    expect(asked).toEqual(["https://github.com/a"]);
  });

  it("the CRLF variant matches the script's replace order and swallows errors", async () => {
    const body = "a\nb\r\nc\rd\n";
    const want = sha(Buffer.from(body).toString("latin1").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
    const { f } = fakeFetch({ "https://github.com/a": ok(body) });
    const fx = makeEvidenceFetcher({ fetch: f as any });
    expect(await fx.fetchCrlfSha256("https://github.com/a")).toBe(want);
    expect(await fx.fetchCrlfSha256("https://example.org/x")).toBeNull();
    expect(await fx.fetchCrlfSha256("https://github.com/gone")).toBeNull();
  });
});

describe("crlfTransform", () => {
  it("gives the same bytes however the input is split into chunks", () => {
    const s = "x\r\ny\nz\r\r\nw\r";
    const want = s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    for (let cut = 0; cut <= s.length; cut++) {
      const t = crlfTransform();
      const parts = [t.push(enc(s.slice(0, cut))), t.push(enc(s.slice(cut))), t.end()];
      const got = new TextDecoder().decode(Buffer.concat(parts.map((p) => Buffer.from(p))));
      expect(got, `cut at ${cut}`).toBe(want);
    }
  });
});
