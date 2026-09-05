import { describe, it, expect } from "vitest";
import { MixedEffectsMethod } from "./MixedEffects";

describe("MixedEffectsMethod", () => {
  it("recovers the fixed-effect slope and reports valid p-values", async () => {
    // 5 groups x 8 obs (n=40, J=5). Y = 10 + 2X + groupIntercept(+noise); slope ~ 2.
    const groups = ["A", "B", "C", "D", "E"];
    const data: Array<{ g: string; x: number; y: number }> = [];
    groups.forEach((g, gi) => {
      for (let x = 1; x <= 8; x++) {
        data.push({ g, x, y: 10 + 2 * x + gi * 5 + (x % 2 ? 0.2 : -0.2) });
      }
    });
    const spec = { id: "me1", outcomes: ["y"], predictors: ["x"], groupingVariables: ["g"], alpha: 0.05 } as any;

    const result = await new MixedEffectsMethod().execute(data, spec, {} as any);

    const slope = result.parameters.find((p) => p.name.startsWith("Slope"));
    expect(slope!.estimate).toBeCloseTo(2, 1);

    for (const p of result.parameters) {
      const pv = (p as { pValue?: number }).pValue;
      if (typeof pv === "number") {
        expect(pv).toBeGreaterThanOrEqual(0);
        expect(pv).toBeLessThanOrEqual(1);
      }
    }
  });
});
