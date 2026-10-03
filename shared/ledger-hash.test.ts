import { describe, expect, it } from "vitest";
import { canonicalJson, recordContentHash, sha256Hex, type HashableRecord } from "./ledger-hash";

const fixture: HashableRecord = {
  id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2",
  campaignId: "heesch-leader-optimality",
  kind: "certificate",
  title: "f=4 plain, D<=3 at R>=255: UNSAT",
  body: "Proof checked by cake_lpr.",
  standing: "certified",
  evidence: [{ label: "CNF", url: "https://example.org/f4.cnf", sha256: "37202fa52ba8ead950e8dae9591b7fe84b4ebd17a49676eb1482e751828ef4cb" }],
  correctsId: null, reviewsId: null, verdict: null, amendsId: null, aboutId: null, setsStatus: null,
  authorUsername: "0xSCADA-QE",
  createdAt: "2026-10-03T00:00:00.000Z",
};

describe("canonical JSON", () => {
  it("sorts keys at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: { z: "é", y: 2 } }))
      .toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":"é"}}');
  });
  it("drops undefined object values", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it("refuses non-finite numbers", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe("content hash", () => {
  it("sha256Hex matches the standard vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes the fixture to the registered value", async () => {
    expect(await recordContentHash(fixture)).toBe("39cd9f99a07c584ec2838e6ff2f2e1b35375f82f7bc15e38e6f2bed006019629");
  });
  it("changes when one character of the title changes", async () => {
    expect(await recordContentHash({ ...fixture, title: fixture.title + "." }))
      .toBe("43cd85958e24464530d37d5269a39ac275f8a26db3920173a3013f79d86f524c");
  });
  it("is stable for non-ASCII and markup in the title", async () => {
    expect(await recordContentHash({
      ...fixture, id: "01J9Z3K8Q2A7B5C4D6E8F0G1H3", kind: "note", campaignId: null, evidence: [],
      title: "白い紙 🌙 <script>alert(1)</script>", body: "二つの机。", standing: "unverified",
    })).toBe("744f1ae457bcc1bde7098523781a2d8314549b412f94f11df7453040a5175731");
  });
});
