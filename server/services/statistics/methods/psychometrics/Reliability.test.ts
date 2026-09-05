import { describe, it, expect } from "vitest";
import { CronbachAlphaMethod } from "./Reliability";

describe("CronbachAlphaMethod", () => {
  it("returns alpha = 1 for perfectly consistent (identical) items", async () => {
    // Identical item columns => sum(itemVar)=k*V, totalVar=k^2*V
    // alpha = (k/(k-1)) * (1 - 1/k) = 1
    const vals = [10, 12, 14, 9, 11, 13, 8, 15, 7, 16];
    const data = vals.map((v) => ({ q1: v, q2: v, q3: v }));
    const spec = { id: "a1", outcomes: ["q1", "q2", "q3"], alpha: 0.05 } as any;

    const result = await new CronbachAlphaMethod().execute(data, spec, {} as any);

    const alphaParam = result.parameters.find((p) => /alpha/i.test(p.name));
    expect(alphaParam?.estimate).toBeCloseTo(1, 6);
  });
});
