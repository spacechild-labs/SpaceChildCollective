import { describe, it, expect } from "vitest";
import { ANOVAMethod } from "./ANOVA";

describe("ANOVAMethod (one-way)", () => {
  it("computes F and df matching hand calculation", async () => {
    // A=[1,2,3] B=[4,5,6] C=[7,8,9]; grand mean 5
    // SSB=54 (df 2), SSW=6 (df 6) -> MSB=27, MSW=1, F=27
    const data = [
      { y: 1, g: "A" }, { y: 2, g: "A" }, { y: 3, g: "A" },
      { y: 4, g: "B" }, { y: 5, g: "B" }, { y: 6, g: "B" },
      { y: 7, g: "C" }, { y: 8, g: "C" }, { y: 9, g: "C" },
    ];
    const spec = { id: "a1", outcomes: ["y"], groupingVariables: ["g"], alpha: 0.05 } as any;

    const result = await new ANOVAMethod().execute(data, spec, {} as any);

    const f = result.parameters.find((p) => p.name === "F statistic");
    expect(f?.estimate).toBeCloseTo(27, 4);
    expect(f?.df).toEqual([2, 6]);
    expect((f as any)?.pValue).toBeLessThan(0.01);
  });
});
