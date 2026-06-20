import { describe, it, expect } from "vitest";
import { BayesianTTestMethod } from "./BayesianInference";

describe("BayesianTTestMethod", () => {
  it("favors H1 for clearly different groups and reports a valid frequentist p-value", async () => {
    const data = [
      ...[1, 2, 3, 4, 5, 6].map((y) => ({ y, g: "A" })),
      ...[7, 8, 9, 10, 11, 12].map((y) => ({ y, g: "B" })),
    ];
    const spec = { id: "b1", outcomes: ["y"], groupingVariables: ["g"], alpha: 0.05 } as any;

    const result = await new BayesianTTestMethod().execute(data, spec, {} as any);

    const bf = result.parameters.find((p) => p.name.startsWith("BF₁"));
    expect(bf!.estimate).toBeGreaterThan(1); // evidence for a difference

    // The frequentist p-value (guards the double-count fix) must be a valid probability.
    for (const p of result.parameters) {
      const pv = (p as { pValue?: number }).pValue;
      if (typeof pv === "number") {
        expect(pv).toBeGreaterThanOrEqual(0);
        expect(pv).toBeLessThanOrEqual(1);
      }
    }
    expect(result.pValue!).toBeLessThan(0.05);
  });
});
