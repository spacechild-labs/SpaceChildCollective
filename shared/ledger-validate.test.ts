import { describe, expect, it } from "vitest";
import { campaignInputSchema, recordInputSchema } from "./ledger-validate";

const ID = "01J9Z3K8Q2A7B5C4D6E8F0G1H2";
const messages = (input: unknown) => {
  const r = recordInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("record input", () => {
  it("accepts a minimal result and fills defaults", () => {
    const r = recordInputSchema.parse({ kind: "result", title: "It held" });
    expect(r).toMatchObject({ kind: "result", body: "", standing: "unverified", evidence: [], held: false });
  });
  it("requires reviewsId and verdict on a review", () => {
    expect(messages({ kind: "review", title: "r", verdict: "holds" })).toContain("invalid_link");
    expect(messages({ kind: "review", title: "r", reviewsId: ID })).toContain("missing_verdict");
    expect(messages({ kind: "review", title: "r", reviewsId: ID, verdict: "holds" })).toEqual([]);
  });
  it("forbids a verdict or reviewsId on a non-review", () => {
    expect(messages({ kind: "result", title: "r", verdict: "holds" })).toContain("invalid_link");
    expect(messages({ kind: "result", title: "r", reviewsId: ID })).toContain("invalid_link");
  });
  it("requires correctsId exactly on corrections and amendsId exactly on amendments", () => {
    expect(messages({ kind: "correction", title: "c" })).toContain("invalid_link");
    expect(messages({ kind: "note", title: "n", correctsId: ID })).toContain("invalid_link");
    expect(messages({ kind: "amendment", title: "a" })).toContain("invalid_link");
    expect(messages({ kind: "correction", title: "c", correctsId: ID })).toEqual([]);
  });
  it("allows aboutId only on notes and setsStatus only on decisions", () => {
    expect(messages({ kind: "note", title: "n", aboutId: ID })).toEqual([]);
    expect(messages({ kind: "result", title: "r", aboutId: ID })).toContain("invalid_link");
    expect(messages({ kind: "decision", title: "d", setsStatus: "closed" })).toEqual([]);
    expect(messages({ kind: "result", title: "r", setsStatus: "closed" })).toContain("invalid_link");
  });
  it("rejects a malformed evidence hash and a bad campaign id", () => {
    expect(messages({ kind: "result", title: "r", evidence: [{ label: "x", url: "https://a.b", sha256: "XYZ" }] }).length).toBeGreaterThan(0);
    expect(messages({ kind: "result", title: "r", campaignId: "Bad Id" }).length).toBeGreaterThan(0);
  });
  it("rejects an empty title", () => {
    expect(messages({ kind: "result", title: "   " }).length).toBeGreaterThan(0);
  });
});

describe("campaign input", () => {
  it("validates id, title and links", () => {
    expect(campaignInputSchema.parse({ id: "ecdsa-c007", title: "c007" })).toMatchObject({ summary: "", links: [] });
    expect(campaignInputSchema.safeParse({ id: "x", title: "t" }).success).toBe(false);
  });
});

describe("url fields are http(s) only", () => {
  const ev = (url: string) => recordInputSchema.safeParse({ kind: "result", title: "t", evidence: [{ label: "x", url }] }).success;
  const link = (url: string) => campaignInputSchema.safeParse({ id: "camp-1", title: "t", links: [{ label: "x", url }] }).success;
  it.each(["javascript:alert(1)", "data:text/html,<script>1</script>", "JAVASCRIPT:alert(1)", " javascript:alert(1)", " https://example.com", "ftp://example.com/x", "not a url"])("rejects %s", (u) => {
    expect(ev(u)).toBe(false);
    expect(link(u)).toBe(false);
  });
  it("accepts http and https", () => {
    expect(ev("https://example.com/a?b=1")).toBe(true);
    expect(ev("http://example.com")).toBe(true);
    expect(link("https://example.com")).toBe(true);
  });
});
