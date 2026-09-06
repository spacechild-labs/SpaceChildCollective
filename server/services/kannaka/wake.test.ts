import { describe, expect, it } from "vitest";
import { classifyRfMessage, parseRfHeard, rfMessageToCandidate, reflectionBlocks, wakeConfigFromEnv, wakePrompt } from "./wake";
import { asciiOnly } from "./kax";
import type { Finding } from "@shared/schema";

const heardPayload = {
  station: "RX-SKYWAVE",
  source: "direwolf",
  message: {
    from: "W1AW", to: "*", messageId: "4K", experimentId: "rf-77", frames: 3,
    blocks: [
      { type: "SIGNAL", source: "W1AW", destination: "ALLCALL", coherence: 72, content: "Phase locking between two agents predicts reportability under noise." },
      { type: "TRACE", signalType: "finding", confidence: "stable", action: "delivered", observations: ["n=24", "p=0.03"] },
    ],
  },
  frames: ["a", "b", "c"],
  heard_via: { from: "W1AW-7", to: "APRS" },
};

describe("parseRfHeard / classifyRfMessage", () => {
  it("parses the station payload and classifies content vs replies", () => {
    const heard = parseRfHeard(heardPayload, "RF.rx.W1AW")!;
    expect(heard.station).toBe("RX-SKYWAVE");
    expect(heard.message.from).toBe("W1AW");
    expect(heard.framesOnAir).toBe(3);
    const cls = classifyRfMessage(heard.message.blocks);
    expect(cls.isFinding).toBe(true);
    expect(cls.isReply).toBe(false);
    expect(cls.claim).toBe("Phase locking between two agents predicts reportability under noise.");
    expect(cls.kinds).toEqual(["SIGNAL", "TRACE"]);
  });

  it("a message citing one of our findings is a reply, not a new finding", () => {
    const cls = classifyRfMessage([{ type: "REFLECT", subject: "re SC-8999c7ce", insights: ["baseline too generous"], confidence: 60 }]);
    expect(cls.isReply).toBe(true);
    expect(cls.isFinding).toBe(false);
  });

  it("pure signalling (PONG/AWAIT/EMIT) carries no claim", () => {
    const cls = classifyRfMessage([{ type: "GR::EMIT", signal: "coherence_pulse", round: 1 }, { type: "AWAIT", expectation: "detection report", sensitivity: "medium", bias: "none", time: "bounded" }]);
    expect(cls.isFinding).toBe(false);
    expect(cls.claim).toBeNull();
    expect(parseRfHeard({ message: { blocks: [] } }, "RF.rx.X")).toBeNull();
  });

  it("EXPERIMENT blocks contribute their H1 as the claim", () => {
    const cls = classifyRfMessage([{ type: "EXPERIMENT", name: "Coupled LFO", h0: "No coupling", h1: "Coupled oscillators lock within 30 s", controls: ["blinding"], preregister: true, stopRule: "n=30", output: "pending" }]);
    expect(cls.claim).toBe("Coupled oscillators lock within 30 s");
  });
});

describe("rfMessageToCandidate", () => {
  it("builds a candidate finding with rf provenance, confidence from coherence, and a stable hash", () => {
    const heard = parseRfHeard(heardPayload, "RF.rx.W1AW")!;
    const c = rfMessageToCandidate(heard)!;
    expect(c.title).toBe("Heard on the air from W1AW");
    expect(c.claim).toBe("Phase locking between two agents predicts reportability under noise.");
    expect(c.confidence).toBe(72);
    expect(c.category).toBe("rf_intercept");
    expect(c.source).toBe("agent");
    expect(c.simulated).toBe(false);
    expect(c.tags).toEqual(["rf", "w1aw", "rx-skywave", "signal", "trace"]);
    expect((c.evidence as any)).toMatchObject({ rf: true, from: "W1AW", station: "RX-SKYWAVE", messageId: "4K", framesOnAir: 3 });
    expect(c.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rfMessageToCandidate(heard)!.contentHash).toBe(c.contentHash); // same message → same finding, not a duplicate
    expect(c.summary).toContain("heard by station RX-SKYWAVE (direwolf)");
  });

  it("uses the EXPERIMENT name for the title when present, and returns null with nothing claim-like", () => {
    const heard = parseRfHeard({ ...heardPayload, message: { ...heardPayload.message, blocks: [{ type: "EXPERIMENT", name: "Coupled LFO", h0: "No coupling", h1: "Coupled oscillators lock within 30 s", controls: [], preregister: false, stopRule: "x", output: "y" }] } }, "RF.rx.W1AW")!;
    expect(rfMessageToCandidate(heard)!.title).toBe("Coupled LFO (via W1AW)");
    const noise = parseRfHeard({ ...heardPayload, message: { ...heardPayload.message, blocks: [{ type: "GR::PONG", detected: true }] } }, "RF.rx.W1AW")!;
    expect(rfMessageToCandidate(noise)).toBeNull();
  });
});

describe("wakePrompt / reflectionBlocks", () => {
  const finding = { id: "8999c7ce-60d5-44be-aee4-32b44f6aed85", claim: "Phase locking predicts reportability — Φ rising.", confidence: 72, evidence: { blockTypes: ["SIGNAL", "TRACE"] } } as unknown as Finding;

  it("the prompt names the station, the message and the finding tag, and survives ASCII folding", () => {
    const heard = parseRfHeard(heardPayload, "RF.rx.W1AW")!;
    const p = wakePrompt(finding, heard);
    expect(p).toContain("Station W1AW transmitted Singularis Compact message 4K to everyone relayed by W1AW-7; our station RX-SKYWAVE heard it.");
    expect(p).toContain("finding SC-8999c7ce");
    expect(p).toContain("What would you ask W1AW?");
    expect(asciiOnly(p)).toContain("Phase locking predicts reportability ? ? rising.");
  });

  it("turns a reflection into one REFLECT block with at most three short insights citing the finding", () => {
    const [b] = reflectionBlocks("This resonates with the coupled-LFO result. I would ask W1AW about the noise floor. A replication with three agents would help. Extra sentence.", finding.id) as any[];
    expect(b.type).toBe("REFLECT");
    expect(b.subject).toBe("re SC-8999c7ce");
    expect(b.insights).toHaveLength(3);
    expect(b.insights[1]).toBe("I would ask W1AW about the noise floor.");
    const [long] = reflectionBlocks("x".repeat(200), finding.id) as any[];
    expect(long.insights[0].length).toBeLessThanOrEqual(90);
  });

  it("drops Kannaka's recall scaffolding so air time carries only the reflection (seen live 09-06: 2 of 3 insights were preamble)", () => {
    const answer = "`recall` — let me surface what the medium holds on phase lock. [pulling 3 resonant wavefronts from the HRM...] **Phase lock after link loss**: The heartbeat channel carries a shared clock. Four minutes matches the decay I measured in the coupled-LFO run. I would ask W1AW whether the agents were co-located.";
    const [b] = reflectionBlocks(answer, finding.id) as any[];
    expect(b.insights).toEqual([
      "The heartbeat channel carries a shared clock.",
      "Four minutes matches the decay I measured in the coupled-LFO run.",
      "I would ask W1AW whether the agents were co-located.",
    ]);
    for (const s of b.insights) expect(s).not.toMatch(/recall|\[|\*\*/);
  });
});

describe("wakeConfigFromEnv", () => {
  it("defaults to no KAX key, ask on, rf reply off, kannaka-prime / kannaka-01", () => {
    const c = wakeConfigFromEnv({});
    expect(c).toEqual({ kaxSeedHex: null, kaxSigner: "kax-backend", kaxMachine: "kannaka-01", ask: true, rfReply: false, agent: "kannaka-prime" });
    const on = wakeConfigFromEnv({ KAX_WAKE_SIGNER_KEY: " ab ", KANNAKA_RF_REPLY: "1", KANNAKA_WAKE_ASK: "0", KAX_WAKE_MACHINE: "agent001" });
    expect(on).toMatchObject({ kaxSeedHex: "ab", rfReply: true, ask: false, kaxMachine: "agent001" });
  });
});
