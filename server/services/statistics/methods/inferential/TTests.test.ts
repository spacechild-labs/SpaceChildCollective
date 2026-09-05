import { describe, it, expect } from "vitest";
import { TTestMethod, PairedTTestMethod, WelchTTestMethod } from "./TTests";

describe("TTestMethod (independent samples)", () => {
  it("computes t, df, and a two-tailed p-value matching hand calculation", async () => {
    // Group A: [1,2,3,4,5] mean=3 var=2.5; Group B: [3,4,5,6,7] mean=5 var=2.5
    // pooled var = 2.5, se = sqrt(2.5*(1/5+1/5)) = 1 -> t = (3-5)/1 = -2, df = 8
    const data = [
      { y: 1, g: "A" }, { y: 2, g: "A" }, { y: 3, g: "A" }, { y: 4, g: "A" }, { y: 5, g: "A" },
      { y: 3, g: "B" }, { y: 4, g: "B" }, { y: 5, g: "B" }, { y: 6, g: "B" }, { y: 7, g: "B" },
    ];
    const spec = { id: "t1", outcomes: ["y"], groupingVariables: ["g"], alpha: 0.05 } as any;

    const result = await new TTestMethod().execute(data, spec, {} as any);

    expect(Math.abs(result.testStatistic!)).toBeCloseTo(2, 6);
    expect(result.df).toBe(8);

    // Two-tailed p for |t|=2, df=8 ≈ 0.0808 (guards against the p-value double-count regression)
    const meanDiff = result.parameters.find((p) => p.name === "Mean Difference");
    expect(meanDiff?.pValue).toBeDefined();
    expect(meanDiff!.pValue!).toBeGreaterThan(0.06);
    expect(meanDiff!.pValue!).toBeLessThan(0.10);
  });
});

describe("PairedTTestMethod", () => {
  it("computes paired t, df, and p matching hand calculation", async () => {
    // before-after diffs = [-2,-3,-1,-3,-1]: meanDiff=-2, sd=1, se=1/sqrt(5)
    // t = -2 / 0.4472 ≈ -4.472, df = 4
    const data = [
      { before: 5, after: 7 }, { before: 6, after: 9 }, { before: 7, after: 8 },
      { before: 8, after: 11 }, { before: 9, after: 10 },
    ];
    const spec = { id: "p1", outcomes: ["before", "after"], alpha: 0.05 } as any;

    const result = await new PairedTTestMethod().execute(data, spec, {} as any);

    expect(Math.abs(result.testStatistic!)).toBeCloseTo(4.472, 2);
    expect(result.df).toBe(4);
    expect(result.pValue!).toBeGreaterThan(0.005);
    expect(result.pValue!).toBeLessThan(0.02);
  });
});

describe("WelchTTestMethod", () => {
  it("computes Welch t and Satterthwaite df for unequal variances", async () => {
    // A=[1..5] var 2.5; B=[6,8,10,12,14] var 10
    // se=sqrt(0.5+2)=1.5811 -> t=-7/1.5811=-4.427; df=6.25/1.0625=5.882
    const data = [
      { y: 1, g: "A" }, { y: 2, g: "A" }, { y: 3, g: "A" }, { y: 4, g: "A" }, { y: 5, g: "A" },
      { y: 6, g: "B" }, { y: 8, g: "B" }, { y: 10, g: "B" }, { y: 12, g: "B" }, { y: 14, g: "B" },
    ];
    const spec = { id: "w1", outcomes: ["y"], groupingVariables: ["g"], alpha: 0.05 } as any;

    const result = await new WelchTTestMethod().execute(data, spec, {} as any);

    expect(Math.abs(result.testStatistic!)).toBeCloseTo(4.427, 2);
    expect(result.df as number).toBeCloseTo(5.882, 2);
    expect(result.pValue!).toBeLessThan(0.01);
  });
});
