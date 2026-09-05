import { describe, it, expect } from "vitest";
import { ChiSquareMethod } from "./ChiSquare";

describe("ChiSquareMethod (test of independence)", () => {
  it("computes chi-square and df for a 2x2 table", async () => {
    // Counts: A,X=10 A,Y=20 B,X=20 B,Y=10 (all expected = 15)
    // chi2 = 4 * (5^2 / 15) = 6.6667; df = (2-1)(2-1) = 1
    const data: Array<{ v1: string; v2: string }> = [];
    const add = (v1: string, v2: string, n: number) => {
      for (let i = 0; i < n; i++) data.push({ v1, v2 });
    };
    add("A", "X", 10);
    add("A", "Y", 20);
    add("B", "X", 20);
    add("B", "Y", 10);
    const spec = { id: "x1", outcomes: ["v1"], groupingVariables: ["v2"], alpha: 0.05 } as any;

    const result = await new ChiSquareMethod().execute(data, spec, {} as any);

    const chi = result.parameters.find((p) => p.name === "Chi-Square");
    expect(chi?.estimate).toBeCloseTo(6.6667, 3);
    expect((chi as any)?.df).toBe(1);
    expect((chi as any)?.pValue).toBeLessThan(0.05);
  });
});
