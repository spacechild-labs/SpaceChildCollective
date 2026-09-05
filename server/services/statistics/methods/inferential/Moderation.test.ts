import { describe, it, expect } from "vitest";
import { ModerationMethod } from "./Moderation";

describe("ModerationMethod", () => {
  it("recovers the interaction coefficient and never returns NaN (guards the use-before-assign fix)", async () => {
    // Y = 2X + 3W + 1*(X*W) + tiny deterministic noise; interaction b3 ~ 1.
    // Moderation requires n >= 30, so use a 4x8 grid (32 rows).
    const rows: Array<[number, number]> = [];
    for (let w = 1; w <= 8; w++) {
      for (let x = 1; x <= 4; x++) rows.push([x, w]);
    }
    const data = rows.map(([x, w], i) => ({
      x,
      w,
      y: 2 * x + 3 * w + x * w + (i % 2 === 0 ? 0.1 : -0.1),
    }));
    const spec = { id: "m1", outcomes: ["y"], predictors: ["x", "w"], alpha: 0.05 } as any;

    const result = await new ModerationMethod().execute(data, spec, {} as any);

    // The b0..b3 coefficients (where the NaN-seed bug lived) must all be finite.
    const coeffs = result.parameters.filter(
      (p) => p.name.startsWith("Intercept") || p.name.includes("Main Effect") || p.name.includes("Interaction"),
    );
    expect(coeffs.length).toBeGreaterThanOrEqual(4);
    coeffs.forEach((p) => expect(Number.isFinite(p.estimate)).toBe(true));

    const interaction = result.parameters.find((p) => p.name.includes("Interaction"));
    expect(interaction!.estimate).toBeCloseTo(1, 1);
  });
});
