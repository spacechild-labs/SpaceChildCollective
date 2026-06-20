import { describe, it, expect } from "vitest";
import { MannWhitneyMethod } from "./NonParametric";

describe("MannWhitneyMethod", () => {
  it("gives U = 0 for fully separated groups", async () => {
    // g1 ranks 1-3, g2 ranks 4-6: R1=6, U1 = 6 - 3*4/2 = 0, U = min(0, 9) = 0
    const data = [
      { y: 1, g: "A" }, { y: 2, g: "A" }, { y: 3, g: "A" },
      { y: 4, g: "B" }, { y: 5, g: "B" }, { y: 6, g: "B" },
    ];
    const spec = { id: "mw1", outcomes: ["y"], groupingVariables: ["g"], alpha: 0.05 } as any;

    const result = await new MannWhitneyMethod().execute(data, spec, {} as any);

    expect(result.testStatistic).toBe(0);
    const u = result.parameters.find((p) => p.name === "U statistic");
    expect(u?.estimate).toBe(0);
  });
});
