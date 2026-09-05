import { describe, it, expect } from "vitest";
import { LinearRegressionMethod } from "./Regression";

describe("LinearRegressionMethod", () => {
  it("computes slope, intercept, and R^2 matching hand calculation", async () => {
    // x=[1..5], y=[1,3,2,5,4]: Sxy=8, Sxx=10 -> b1=0.8; b0 = 3 - 0.8*3 = 0.6
    // Syy=10, SSreg=6.4 -> R^2 = 0.64
    const data = [
      { x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 5 }, { x: 5, y: 4 },
    ];
    const spec = { id: "r1", outcomes: ["y"], predictors: ["x"], alpha: 0.05 } as any;

    const result = await new LinearRegressionMethod().execute(data, spec, {} as any);

    const intercept = result.parameters.find((p) => p.name === "Intercept");
    const slope = result.parameters.find((p) => p.name === "x");
    expect(intercept?.estimate).toBeCloseTo(0.6, 6);
    expect(slope?.estimate).toBeCloseTo(0.8, 6);
    expect(result.modelFit?.rSquared).toBeCloseTo(0.64, 6);
  });
});
