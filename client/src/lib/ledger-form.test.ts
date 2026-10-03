import { describe, expect, it } from "vitest";
import { apiErrorMessage, buildRecordPayload, parseEvidence, type FileForm } from "./ledger-form";

const base: FileForm = {
  kind: "result", campaignId: "", title: "It held", body: "", standing: "measured", evidenceText: "",
  linkId: "", verdict: "", setsStatus: "", held: false, clientRef: "",
};

describe("filing form", () => {
  it("parses evidence lines", () => {
    expect(parseEvidence("CNF | https://x.org/a.cnf | " + "a".repeat(64) + "\nlog | https://x.org/log")).toEqual({
      evidence: [{ label: "CNF", url: "https://x.org/a.cnf", sha256: "a".repeat(64) }, { label: "log", url: "https://x.org/log" }],
    });
    expect(parseEvidence("only-a-label")).toMatchObject({ error: expect.stringContaining("line 1") });
  });

  it("puts the link id in the field that matches the kind", () => {
    const id = "01J9Z3K8Q2A7B5C4D6E8F0G1H2";
    expect(buildRecordPayload({ ...base, kind: "correction", linkId: id })).toMatchObject({ payload: { correctsId: id } });
    expect(buildRecordPayload({ ...base, kind: "review", linkId: id, verdict: "holds" })).toMatchObject({ payload: { reviewsId: id, verdict: "holds" } });
    expect(buildRecordPayload({ ...base, kind: "amendment", linkId: id })).toMatchObject({ payload: { amendsId: id } });
    expect(buildRecordPayload({ ...base, kind: "note", linkId: id })).toMatchObject({ payload: { aboutId: id } });
  });

  it("omits empty optional fields and keeps held", () => {
    const out = buildRecordPayload({ ...base, held: true });
    expect(out).toEqual({ payload: { kind: "result", title: "It held", body: "", standing: "measured", evidence: [], held: true } });
  });

  it("requires a title", () => {
    expect(buildRecordPayload({ ...base, title: "  " })).toEqual({ error: "A title is required." });
  });
});

describe("evidence safety and errors", () => {
  it("rejects non-http(s) urls, including javascript:", () => {
    expect(parseEvidence("x | javascript:alert(1)")).toMatchObject({ error: expect.stringContaining("line 1") });
    expect(parseEvidence("ok | https://x.org/a\nbad | data:text/html,hi")).toMatchObject({ error: expect.stringContaining("line 2") });
    expect(parseEvidence("f | ftp://x.org/a")).toHaveProperty("error");
    expect(buildRecordPayload({ ...base, evidenceText: "x | javascript:alert(1)" })).toHaveProperty("error");
  });

  it("rejects a malformed sha256", () => {
    expect(parseEvidence("a | https://x.org | ABC")).toMatchObject({ error: expect.stringContaining("sha256") });
  });

  it("surfaces the server message and code", () => {
    expect(apiErrorMessage(new Error('409: {"error":"forbidden","message":"admin accounts cannot hold agent keys"}'))).toBe("admin accounts cannot hold agent keys (forbidden)");
    expect(apiErrorMessage(new Error('400: {"error":"agents_cannot_release"}'))).toBe("agents_cannot_release");
    expect(apiErrorMessage(new Error("500: oops"))).toBe("500: oops");
  });
});
