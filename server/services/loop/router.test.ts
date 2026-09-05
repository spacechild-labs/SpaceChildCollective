import { describe, it, expect } from "vitest";
import { channelMatches, idempotencyKey } from "./router";

const finding = { category: "consciousness_studies", tags: ["resonance", "empirical"], confidence: 70, novelty: 80, simulated: false, source: "experiment" as const };
const channel = { active: true, acceptsSimulated: false, filters: null };

describe("channelMatches", () => {
  it("matches an unfiltered active channel", () => {
    expect(channelMatches(finding, channel).matched).toBe(true);
  });

  it("never routes to an inactive channel", () => {
    expect(channelMatches(finding, { ...channel, active: false }).reason).toMatch(/inactive/);
  });

  it("keeps simulated findings away from channels that do not accept them", () => {
    expect(channelMatches({ ...finding, simulated: true }, channel).matched).toBe(false);
    expect(channelMatches({ ...finding, simulated: true }, { ...channel, acceptsSimulated: true }).matched).toBe(true);
  });

  it("applies category, tag, source, confidence and novelty filters", () => {
    expect(channelMatches(finding, { ...channel, filters: { categories: ["philosophy"] } }).matched).toBe(false);
    expect(channelMatches(finding, { ...channel, filters: { categories: ["consciousness_studies"] } }).matched).toBe(true);
    expect(channelMatches(finding, { ...channel, filters: { tags: ["nothing"] } }).matched).toBe(false);
    expect(channelMatches(finding, { ...channel, filters: { tags: ["resonance"] } }).matched).toBe(true);
    expect(channelMatches(finding, { ...channel, filters: { sources: ["paper"] } }).matched).toBe(false);
    expect(channelMatches(finding, { ...channel, filters: { minConfidence: 71 } }).matched).toBe(false);
    expect(channelMatches(finding, { ...channel, filters: { minConfidence: 70 } }).matched).toBe(true);
    expect(channelMatches(finding, { ...channel, filters: { minNovelty: 81 } }).matched).toBe(false);
    expect(channelMatches({ ...finding, novelty: null }, { ...channel, filters: { minNovelty: 1 } }).matched).toBe(false);
  });
});

describe("idempotencyKey", () => {
  it("is deterministic per (finding, channel)", () => {
    expect(idempotencyKey("f", "c")).toBe("f:c");
    expect(idempotencyKey("f", "c")).toBe(idempotencyKey("f", "c"));
    expect(idempotencyKey("f", "d")).not.toBe(idempotencyKey("f", "c"));
  });
});
