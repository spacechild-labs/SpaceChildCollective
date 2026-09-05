import { describe, it, expect } from "vitest";
import { StatUtils } from "./AnalysisMethod";

describe("StatUtils", () => {
  it("computes the mean", () => {
    expect(StatUtils.mean([2, 4, 6])).toBe(4);
  });

  it("computes the sample variance (ddof=1)", () => {
    // [2,4,6]: deviations -2,0,2 -> 8 / (3-1) = 4
    expect(StatUtils.variance([2, 4, 6])).toBeCloseTo(4, 10);
  });

  it("tPValue is two-tailed, symmetric, and within [0,1]", () => {
    const p = StatUtils.tPValue(2, 30);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
    // Two-tailed => symmetric in the sign of t.
    expect(StatUtils.tPValue(-2, 30)).toBeCloseTo(p, 10);
  });

  it("tPValue ~ 0.05 near |t|=1.96 for large df (regression guard against the 2x double-count bug)", () => {
    const p = StatUtils.tPValue(1.96, 1000);
    expect(p).toBeGreaterThan(0.03);
    expect(p).toBeLessThan(0.07);
  });

  it("tCritical approaches 1.96 for large df and exceeds it for small df", () => {
    expect(StatUtils.tCritical(100000, 0.05)).toBeCloseTo(1.96, 2);
    expect(StatUtils.tCritical(5, 0.05)).toBeGreaterThan(2.5);
  });
});
