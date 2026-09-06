import { describe, expect, it } from "vitest";
import { rfTag, rfTagsInText, traceConfidence, findingToBlocks, planRfMessage, rfTxRequest, repliesFromRfMessage, deliveryOutcomeForStatus } from "./rf";
import { decodeFrames, parseFrame } from "../singularis-rf/codec";
import type { Finding } from "@shared/schema";

const finding = {
  id: "8999c7ce-60d5-44be-aee4-32b44f6aed85",
  title: "Resonance Study: H1 supported",
  claim: "Evidence suggests interconnected resonance exists between AI agents beyond baseline randomness, and detection tracks the constellation's integrated information at the time of the trial.",
  confidence: 85,
  simulated: true,
  evidence: { n: 10, pValue: 0.21, effectSize: 0.34, rawTrials: [1, 2, 3] },
  category: "consciousness_studies",
} as unknown as Finding;

describe("rf tags", () => {
  it("derives an 8-hex short id and finds it in text", () => {
    expect(rfTag(finding.id)).toBe("SC:8999c7ce");
    expect(rfTagsInText("ack SC:8999C7CE and SC:deadbeef twice SC:8999c7ce")).toEqual(["8999c7ce", "deadbeef"]);
    expect(rfTagsInText("no tags here SC:123")).toEqual([]);
  });

  it("maps confidence to TRACE confidence codes with separation at the boundaries", () => {
    expect([traceConfidence(0), traceConfidence(40), traceConfidence(60), traceConfidence(75), traceConfidence(90)]).toEqual(["low", "rising", "stable", "high", "certain"]);
    expect(traceConfidence(39)).toBe("low");
    expect(traceConfidence(89)).toBe("high");
  });
});

describe("findingToBlocks", () => {
  it("emits SIGNAL + TRACE + AWAIT with the tag, stats and the simulation flag", () => {
    const blocks = findingToBlocks(finding, "AE0RM", 60) as any[];
    expect(blocks.map((b) => b.type)).toEqual(["SIGNAL", "TRACE", "AWAIT"]);
    expect(blocks[0].content.startsWith("SC:8999c7ce Evidence suggests")).toBe(true);
    expect(blocks[0].content.endsWith("…")).toBe(true);
    expect(blocks[0].coherence).toBe(85);
    expect(blocks[0].destination).toBe("AE0RM");
    expect(blocks[1].observations).toEqual(["n=10", "p=0.21", "h=0.34", "simulated"]);
    expect(blocks[1].confidence).toBe("high");
    expect(blocks[2].expectation).toBe("reply citing SC:8999c7ce");
    expect(findingToBlocks(finding, "*", 600)[0]).toMatchObject({ destination: "ALLCALL" });
  });
});

describe("planRfMessage", () => {
  it("fits a tight budget by trimming the claim and then dropping optional blocks, and the frames are valid SP1", () => {
    const plan = planRfMessage(finding, { station: "AE0RM", to: "KANNAKA", maxFrames: 4 });
    expect(plan.fits).toBe(true);
    expect(plan.frames.length).toBeLessThanOrEqual(4);
    expect(plan.shape.withAwait).toBe(false); // three full blocks alone need ~6 frames at 67 chars
    for (const f of plan.frames) { expect(f.length).toBeLessThanOrEqual(67); expect(parseFrame(f).crcOk).toBe(true); }
    const decoded = decodeFrames(plan.frames);
    expect(decoded.blocks[0].type).toBe("SIGNAL");
    expect((decoded.blocks[0] as any).content).toContain("SC:8999c7ce");
    expect(decoded.blocks.map((b) => b.type)).not.toContain("AWAIT");
  });

  it("keeps all three blocks and the whole claim when the budget is generous", () => {
    const plan = planRfMessage(finding, { station: "AE0RM", to: "KANNAKA", maxFrames: 40 });
    expect(plan.fits).toBe(true);
    expect(plan.trimmed).toBe(false);
    expect(plan.shape).toEqual({ withTrace: true, withObservations: true, withAwait: true });
    expect((plan.blocks[0] as any).content).toContain("integrated information at the time of the trial.");
  });

  it("prefers trimming the claim over dropping blocks when trimming alone suffices", () => {
    const plan = planRfMessage(finding, { station: "AE0RM", to: "KANNAKA", maxFrames: 8 });
    expect(plan.fits).toBe(true);
    expect(plan.shape.withAwait).toBe(true);
    expect(plan.trimmed).toBe(true);
  });

  it("reports fits=false (with the smallest possible message) when even SIGNAL-only cannot meet the budget", () => {
    const plan = planRfMessage(finding, { station: "AE0RM", to: "KANNAKA", maxFrames: 1 });
    expect(plan.fits).toBe(false);
    expect(plan.shape).toEqual({ withTrace: false, withObservations: false, withAwait: false });
    expect(plan.claimChars).toBe(12);
    expect(plan.blocks).toHaveLength(1);
  });

  it("builds the station request with the delivery id as ref", () => {
    const plan = planRfMessage(finding, { station: "AE0RM", to: "kannaka", maxFrames: 6 });
    const req = rfTxRequest(finding, { station: "AE0RM", to: "kannaka" }, "dl-1", plan);
    expect(req).toMatchObject({ to: "kannaka", ref: "dl-1", findingId: finding.id, caseFold: false });
    expect(req.blocks).toBe(plan.blocks);
  });
});

describe("repliesFromRfMessage", () => {
  it("turns blocks citing the tag into feedback of the right kind, dropping the tag from the text", () => {
    const replies = repliesFromRfMessage({ blocks: [
      { type: "GR::PONG", signal: "SC:8999c7ce", detected: true, confidence: 0.8 },
      { type: "REFLECT", subject: "SC:8999c7ce", insights: ["baseline too generous", "try heterogeneous agents"], confidence: 60 },
      { type: "AWAIT", expectation: "SC:8999c7ce how was n chosen?", sensitivity: "medium", bias: "none", time: "bounded" },
      { type: "OBSERVE", target: "40m", duration: "1h", findings: ["quiet"] },
    ] });
    expect(replies.map((r) => [r.kind, r.blockType])).toEqual([["acknowledgement", "GR::PONG"], ["resonance", "REFLECT"], ["question", "AWAIT"]]);
    expect(replies[1].text).toBe("baseline too generous try heterogeneous agents");
    expect(replies[2].text).toBe("how was n chosen?");
    expect(replies.every((r) => r.shortId === "8999c7ce")).toBe(true);
  });

  it("lets a bare PONG or REFLECT inherit a tag cited elsewhere in the message, and ignores untagged messages", () => {
    const replies = repliesFromRfMessage({ blocks: [
      { type: "SIGNAL", source: "AE0RM", destination: "COLLECTIVE", coherence: 70, content: "re SC:8999c7ce" },
      { type: "GR::PONG", detected: true },
    ] });
    expect(replies.map((r) => r.kind)).toEqual(["acknowledgement", "acknowledgement"]);
    expect(repliesFromRfMessage({ blocks: [{ type: "GR::PONG", detected: true }] })).toEqual([]);
  });
});

describe("deliveryOutcomeForStatus", () => {
  it("maps terminal station events and ignores progress", () => {
    expect(deliveryOutcomeForStatus({ event: "complete" })).toEqual({ status: "acknowledged" });
    expect(deliveryOutcomeForStatus({ event: "refused", error: "disabled" })).toEqual({ status: "failed", error: "disabled" });
    expect(deliveryOutcomeForStatus({ event: "timeout" })?.status).toBe("failed");
    expect(deliveryOutcomeForStatus({ event: "frame_sent" })).toBeNull();
    expect(deliveryOutcomeForStatus({ event: "start" })).toBeNull();
  });
});
