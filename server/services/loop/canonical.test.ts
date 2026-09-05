import { describe, it, expect } from "vitest";
import { canonicalize, hashCanonical, preregistrationHash, findingContentHash } from "./canonical";

describe("canonicalize", () => {
  it("is order-independent and drops undefined", () => {
    const a = canonicalize({ b: 1, a: [3, { y: 2, x: 1 }], c: undefined });
    const b = canonicalize({ a: [3, { x: 1, y: 2 }], b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":[3,{"x":1,"y":2}],"b":1}');
  });

  it("serializes dates as ISO strings and non-finite numbers as null", () => {
    const d = new Date("2026-09-05T00:00:00.000Z");
    expect(canonicalize({ d, n: Number.NaN })).toBe('{"d":"2026-09-05T00:00:00.000Z","n":null}');
  });
});

describe("hashes", () => {
  it("hashCanonical is stable across key order", () => {
    expect(hashCanonical({ x: 1, y: 2 })).toBe(hashCanonical({ y: 2, x: 1 }));
    expect(hashCanonical({ x: 1 })).not.toBe(hashCanonical({ x: 2 }));
  });

  it("preregistrationHash ignores non-confirmatory fields but SEPARATES confirmatory changes", () => {
    const base = { name: "S", paradigm: "hypothesis_testing", hypotheses: [{ statement: "H1" }], limitations: ["a"], createdAt: "t1" };
    const cosmetic = { ...base, limitations: ["b"], createdAt: "t2" };
    const substantive = { ...base, hypotheses: [{ statement: "H1 changed" }] };
    expect(preregistrationHash(cosmetic)).toBe(preregistrationHash(base));
    expect(preregistrationHash(substantive)).not.toBe(preregistrationHash(base));
  });

  it("findingContentHash changes when the evidence changes", () => {
    const f = { title: "T", claim: "C", evidence: { n: 10, pValue: 0.04 } };
    expect(findingContentHash(f)).toBe(findingContentHash({ ...f }));
    expect(findingContentHash({ ...f, evidence: { n: 10, pValue: 0.05 } })).not.toBe(findingContentHash(f));
  });
});
