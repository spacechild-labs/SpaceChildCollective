import { describe, it, expect } from "vitest";
import { MediationMethod } from "./Mediation";

describe("MediationMethod", () => {
  it("recovers paths and reports valid p-values (guards the p-value double-count fix)", async () => {
    // M = 2X (+noise), Y = 3M (+noise), no direct X->Y: a≈2, b≈3, indirect≈6.
    // n>=30 required; small noise keeps X and M from being perfectly collinear.
    const data = Array.from({ length: 32 }, (_, i) => {
      const x = i + 1;
      const m = 2 * x + (i % 2 ? 0.3 : -0.3);
      const y = 3 * m + (i % 3 === 0 ? 0.5 : -0.2);
      return { x, m, y };
    });
    const spec = { id: "med1", outcomes: ["y"], predictors: ["x", "m"], alpha: 0.05 } as any;

    const result = await new MediationMethod().execute(data, spec, {} as any);

    const pathA = result.parameters.find((p) => p.name.startsWith("Path a"));
    const indirect = result.parameters.find((p) => p.name.startsWith("Indirect"));
    expect(pathA!.estimate).toBeCloseTo(2, 1);
    expect(indirect!.estimate).toBeGreaterThan(5);
    expect(indirect!.estimate).toBeLessThan(7);

    // Every reported p-value must be a valid probability in [0,1]
    // (the double-count bug could produce values > 1).
    for (const p of result.parameters) {
      const pv = (p as { pValue?: number }).pValue;
      if (typeof pv === "number") {
        expect(pv).toBeGreaterThanOrEqual(0);
        expect(pv).toBeLessThanOrEqual(1);
      }
    }
  });
});
