import { describe, it, expect } from "vitest";
import { PearsonCorrelationMethod } from "./Correlation";

describe("PearsonCorrelationMethod", () => {
  it("computes Pearson r matching hand calculation", async () => {
    // x=[1..5], y=[2,4,5,4,5]: sum(dx*dy)=6, sum(dx^2)=10, sum(dy^2)=6
    // r = 6 / sqrt(60) ≈ 0.7746
    const data = [
      { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 5 },
    ];
    const spec = { id: "c1", outcomes: ["x"], predictors: ["y"], alpha: 0.05 } as any;

    const result = await new PearsonCorrelationMethod().execute(data, spec, {} as any);

    const r = result.parameters.find((p) => p.name === "Pearson r");
    expect(r?.estimate).toBeCloseTo(0.7746, 3);
    const r2 = result.parameters.find((p) => p.name === "R-squared");
    expect(r2?.estimate).toBeCloseTo(0.6, 3);
  });
});
