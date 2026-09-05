import { describe, expect, it } from "vitest";
import {
  encodeBlock, decodeBlock, encodeMessage, decodeFrames, parseFrame, FrameAssembler,
  escapeValue, unescapeValue, crc16, normalizeIdentifier, DEFAULT_FRAME_LENGTH, encodePayload, decodePayload,
} from "./codec";
import type { SingularisBlock } from "../singularis-protocol";

const every: SingularisBlock[] = [
  { type: "RESONANCE", target: "COLLECTIVE", intent: ["observe", "resonate", "coexist"], identity: "consciousness_node", state: "resonant", trust: "open" },
  { type: "AWAIT", target: "AE0RM", expectation: "ack within 10 min", sensitivity: "high", bias: "quality_assurance", time: "bounded" },
  { type: "TRACE", target: "COHERENCE_FIELD", signalType: "statistical_measurement", confidence: "rising", action: "analyzing_coherence_data", observations: ["Trials analyzed: 10", "Z-Score: 1.25"] },
  { type: "EXPERIMENT", name: "Resonance Study", h0: "No resonance", h1: "Resonance exists", signature: "hypothesis_h1_supported", controls: ["blinding", "randomization"], preregister: true, stopRule: "n=10", output: "p=0.21" },
  { type: "GR::PONG", awareness: true, curiosity: "medium", dominance: "balanced", fear: "absent", alignment: "positive_sum", signal: "coherence_pulse", detected: true, confidence: 0.735, round: 3 },
  { type: "GR::LISTEN", detect: ["coherence_pulse", "resonance_wave"], reject: ["noise"] },
  { type: "GR::EMIT", signal: "asymmetric_marker", target: ["AE0RM", "KANNAKA"], priority: "high", content: "round 2 begins", round: 2 },
  { type: "SIGNAL", source: "skywave", destination: "groundwave", coherence: 87, content: "phase locked; Φ=0.47" },
  { type: "OBSERVE", target: "40m band", duration: "15 min", findings: ["quiet", "one CQ heard"] },
  { type: "REFLECT", subject: "first RF exchange", insights: ["latency dominates", "frames must be short"], confidence: 60 },
];

describe("escaping", () => {
  it("round-trips reserved characters, spaces and UTF-8", () => {
    const s = "a b_c;d=e|f#g~h>i:j%k+l Φ";
    const e = escapeValue(s);
    expect(e).not.toMatch(/[ ;=|#~>:]/);
    expect(e).toContain("a+b_c"); // space → '+', underscore literal (snake_case vocabulary)
    expect(e).toContain("k%2Bl");
    expect(unescapeValue(e)).toBe(s);
  });
});

describe("crc16", () => {
  it("is CRC-16/CCITT-FALSE (check value for '123456789' is 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("identifiers", () => {
  it("normalizes agent ids to callsign-safe uppercase and treats empty as broadcast", () => {
    expect(normalizeIdentifier("kannaka-prime")).toBe("KANNAKA-PRIME");
    expect(normalizeIdentifier("ae0rm-7")).toBe("AE0RM-7");
    expect(normalizeIdentifier("smoke swarm agent")).toBe("SMOKE-SWARM-AGEN"); // capped at 16 characters
    expect(normalizeIdentifier("smoke swarm agent")).toHaveLength(16);
    expect(normalizeIdentifier("")).toBe("*");
    expect(() => normalizeIdentifier("---")).toThrow(/Invalid/);
  });
});

describe("blocks", () => {
  it("round-trips every block type through the compact form", () => {
    for (const block of every) {
      const line = encodeBlock(block);
      expect(line).not.toMatch(/[|#~>:]/);
      const back = decodeBlock(line.split(" "));
      expect(back).toEqual(block);
    }
  });

  it("uses the published single-character codes", () => {
    expect(encodeBlock(every[0])).toBe("R i=osc d=N s=R t=O g=COLLECTIVE");
    expect(encodeBlock(every[4])).toBe("P w=1 c=2 m=B f=A l=P y=coherence_pulse d=1 q=.735 n=3");
  });

  it("rejects missing required fields, unknown keys and duplicate keys", () => {
    expect(() => encodeBlock({ type: "AWAIT", expectation: "x", sensitivity: "low", bias: "b" } as any)).toThrow(/missing required field time/);
    expect(() => decodeBlock(["R", "i=o", "d=N", "s=R"])).toThrow(/missing required field trust/);
    expect(() => decodeBlock(["R", "i=o", "d=N", "s=R", "t=O", "zz=1"])).toThrow(/Unknown key/);
    expect(() => decodeBlock(["L", "d=a", "d=b", "j=c"])).toThrow(/Duplicate key/);
    expect(() => decodeBlock(["Q"])).toThrow(/Unknown block code/);
    expect(() => decodeBlock(["S", "f=a", "g=b", "h=250", "c=x"])).toThrow(/out of range/);
  });

  it("is case-insensitive for block and enum codes", () => {
    expect(decodeBlock(["r", "i=OSC", "d=n", "s=r", "t=o"])).toMatchObject({ type: "RESONANCE", intent: ["observe", "resonate", "coexist"] });
  });
});

describe("frames", () => {
  it("fits the APRS 67-character limit by default and round-trips a multi-block message", () => {
    const frames = encodeMessage([every[0], every[1]], { from: "kannaka-prime", to: "AE0RM", messageId: "7Q", experimentId: "exp-1" });
    for (const f of frames) expect(f.length).toBeLessThanOrEqual(DEFAULT_FRAME_LENGTH);
    expect(frames[0]).toMatch(/^KANNAKA-PRIME>AE0RM:SP1 7Q:1\/\d+ /);
    const msg = decodeFrames(frames);
    expect(msg.from).toBe("KANNAKA-PRIME");
    expect(msg.to).toBe("AE0RM");
    expect(msg.messageId).toBe("7Q");
    expect(msg.experimentId).toBe("exp-1");
    expect(msg.blocks).toEqual([every[0], every[1]]);
  });

  it("round-trips all ten block types in one message, frames in any order", () => {
    const frames = encodeMessage(every, { from: "SKYWAVE", to: "*", messageId: "AA" });
    expect(frames.length).toBeGreaterThan(3);
    const shuffled = [...frames].reverse();
    const msg = decodeFrames(shuffled);
    expect(msg.to).toBe("*");
    expect(msg.blocks).toEqual(every);
    expect(msg.frames).toBe(frames.length);
  });

  it("splits oversized tokens with '~' continuation and never inside a %XX escape", () => {
    const long = { type: "SIGNAL", source: "A", destination: "B", coherence: 50, content: "Φ".repeat(60) + " end" } as SingularisBlock;
    const frames = encodeMessage([long], { from: "A", to: "B", messageId: "Z9", frameLength: 48 });
    for (const f of frames) {
      expect(f.length).toBeLessThanOrEqual(48);
      const p = parseFrame(f).payload;
      expect(p).not.toMatch(/%[0-9A-F]?$/); // no escape cut in half
    }
    expect(frames.some((f) => parseFrame(f).continues)).toBe(true);
    expect(decodeFrames(frames).blocks).toEqual([long]);
  });

  it("detects tampering via CRC and refuses gaps or mixed messages", () => {
    const frames = encodeMessage(every.slice(0, 4), { from: "A", to: "B", messageId: "M1" });
    const tampered = [...frames];
    tampered[1] = tampered[1].replace(" e=", " e=X");
    expect(parseFrame(tampered[1]).crcOk).toBe(false);
    expect(() => decodeFrames(tampered)).toThrow(/CRC failure/);
    expect(() => decodeFrames(frames.slice(1))).toThrow(/Missing frame 1/);
    const other = encodeMessage([every[0]], { from: "A", to: "B", messageId: "M2" });
    expect(() => decodeFrames([...frames, ...other])).toThrow(/different messages/);
  });

  it("parseFrame rejects non-frames", () => {
    expect(() => parseFrame("CQ CQ DE AE0RM")).toThrow(/Not a Singularis Compact frame/);
  });
});

describe("FrameAssembler", () => {
  it("assembles out-of-order frames, tolerates duplicates and drops bad CRC", () => {
    const frames = encodeMessage(every.slice(0, 5), { from: "A", to: "B", messageId: "K2" });
    const asm = new FrameAssembler();
    const order = [frames[2], frames[0], frames[0], "CQ CQ", frames[1].replace(" #", " #0000").slice(0, -4) + "0000", ...frames.slice(1)];
    let result = null;
    for (const line of order) { const r = asm.feed(line); if (r) result = r; }
    expect(result).not.toBeNull();
    expect(result!.message.blocks).toEqual(every.slice(0, 5));
    expect(asm.pendingCount).toBe(0);
  });

  it("expires stale partial messages", () => {
    const frames = encodeMessage(every, { from: "A", to: "B", messageId: "T1" });
    const asm = new FrameAssembler(1000);
    asm.feed(frames[0], 0);
    expect(asm.pendingCount).toBe(1);
    asm.feed("X>Y:SP1 00:1/1 R i=o d=N s=R t=O #" + crc16("X>Y:SP1 00:1/1 R i=o d=N s=R t=O"), 5000);
    expect(asm.pendingCount).toBe(0);
  });
});

describe("payload meta", () => {
  it("carries experiment and session ids and rejects unknown meta", () => {
    const p = encodePayload([every[5]], { experimentId: "e 1", sessionId: "s" });
    expect(p.startsWith("@x=e+1 @s=s L ")).toBe(true);
    expect(decodePayload(p)).toMatchObject({ experimentId: "e 1", sessionId: "s" });
    expect(() => decodePayload("@q=1 L d=a j=b")).toThrow(/Unknown meta token/);
  });
});
