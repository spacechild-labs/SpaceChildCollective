/**
 * Non-Parametric Methods
 * 
 * Mann-Whitney U test and Wilcoxon signed-rank test.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Mann-Whitney U Test (non-parametric alternative to independent t-test)
 */
export class MannWhitneyMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const groupVar = spec.groupingVariables?.[0];
    
    if (!groupVar) {
      throw new Error("Mann-Whitney test requires a grouping variable");
    }
    
    const groups = Array.from(new Set(data.map(d => d[groupVar])));
    if (groups.length !== 2) {
      throw new Error(`Mann-Whitney test requires exactly 2 groups, found ${groups.length}`);
    }
    
    const g1 = data.filter(d => d[groupVar] === groups[0]).map(d => Number(d[outcome])).filter(n => !isNaN(n));
    const g2 = data.filter(d => d[groupVar] === groups[1]).map(d => Number(d[outcome])).filter(n => !isNaN(n));
    
    const n1 = g1.length, n2 = g2.length;
    
    // Combine and rank all values
    const all = [
      ...g1.map(v => ({ v, g: 1 })),
      ...g2.map(v => ({ v, g: 2 }))
    ];
    all.sort((a, b) => a.v - b.v);
    
    // Assign ranks (handling ties by averaging)
    let rank = 1;
    for (let i = 0; i < all.length; i++) {
      let j = i;
      while (j < all.length - 1 && all[j + 1].v === all[i].v) j++;
      const avgRank = (rank + rank + j - i) / 2;
      for (let k = i; k <= j; k++) {
        (all[k] as any).rank = avgRank;
      }
      rank += j - i + 1;
      i = j;
    }
    
    // Sum of ranks for group 1
    const R1 = all.filter(x => x.g === 1).reduce((s, x) => s + (x as any).rank, 0);
    
    // U statistics
    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);
    
    // Normal approximation for large samples
    const mu = (n1 * n2) / 2;
    const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
    const z = (U - mu) / sigma;
    const pValue = 2 * (1 - StatUtils.normalCDF(Math.abs(z)));
    
    // Effect size (rank-biserial correlation)
    const r = 1 - (2 * U) / (n1 * n2);
    
    // Medians for interpretation
    const median1 = StatUtils.median(g1);
    const median2 = StatUtils.median(g2);
    
    const significant = pValue < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [
        {
          name: `Median (${groups[0]})`,
          estimate: median1
        },
        {
          name: `Median (${groups[1]})`,
          estimate: median2
        },
        {
          name: "U statistic",
          estimate: U,
          testStatistic: z,
          testType: "z",
          pValue
        }
      ],
      effectSizes: [{
        type: "r",
        value: r,
        interpretation: StatUtils.interpretR(r)
      }],
      testStatistic: U,
      testType: "U",
      pValue,
      conclusion: `Mann-Whitney U = ${U.toFixed(0)}, z = ${z.toFixed(3)}, p = ${pValue.toFixed(4)}, r = ${r.toFixed(2)}`,
      interpretation: `A Mann-Whitney U test was conducted to compare ${outcome} between ${groups[0]} and ${groups[1]} groups. There was ${significant ? "a significant" : "no significant"} difference in ${outcome} between ${groups[0]} (Mdn = ${median1.toFixed(2)}) and ${groups[1]} (Mdn = ${median2.toFixed(2)}), U = ${U.toFixed(0)}, z = ${z.toFixed(2)}, p = ${pValue.toFixed(3)}. The effect size (r = ${r.toFixed(2)}) indicates a ${StatUtils.interpretR(r)} effect.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["independence"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}

/**
 * Wilcoxon Signed-Rank Test (non-parametric alternative to paired t-test)
 */
export class WilcoxonMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    // Get the two variables to compare
    let var1: string, var2: string;
    
    if (spec.outcomes.length >= 2) {
      [var1, var2] = spec.outcomes;
    } else if (spec.outcomes.length === 1 && spec.predictors && spec.predictors.length >= 1) {
      var1 = spec.outcomes[0];
      var2 = spec.predictors[0];
    } else {
      throw new Error("Wilcoxon test requires two variables");
    }
    
    // Calculate differences (excluding zeros)
    const pairs = data
      .map(d => ({ v1: Number(d[var1]), v2: Number(d[var2]) }))
      .filter(p => !isNaN(p.v1) && !isNaN(p.v2));
    
    const diffs = pairs.map(p => p.v1 - p.v2).filter(d => d !== 0);
    const n = diffs.length;
    
    if (n < 5) {
      throw new Error("Insufficient non-zero differences for Wilcoxon test");
    }
    
    // Rank absolute differences
    const ranked = diffs.map(d => ({
      d,
      abs: Math.abs(d),
      sign: d > 0 ? 1 : -1
    }));
    ranked.sort((a, b) => a.abs - b.abs);
    
    // Assign ranks (handling ties)
    let rank = 1;
    for (let i = 0; i < ranked.length; i++) {
      let j = i;
      while (j < ranked.length - 1 && ranked[j + 1].abs === ranked[i].abs) j++;
      const avgRank = (rank + rank + j - i) / 2;
      for (let k = i; k <= j; k++) {
        (ranked[k] as any).rank = avgRank;
      }
      rank += j - i + 1;
      i = j;
    }
    
    // Sum of positive and negative ranks
    const Wplus = ranked.filter(r => r.sign > 0).reduce((s, r) => s + (r as any).rank, 0);
    const Wminus = ranked.filter(r => r.sign < 0).reduce((s, r) => s + (r as any).rank, 0);
    const W = Math.min(Wplus, Wminus);
    
    // Normal approximation
    const mu = n * (n + 1) / 4;
    const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
    const z = (W - mu) / sigma;
    const pValue = 2 * (1 - StatUtils.normalCDF(Math.abs(z)));
    
    // Effect size
    const r = z / Math.sqrt(n);
    
    // Medians for interpretation
    const median1 = StatUtils.median(pairs.map(p => p.v1));
    const median2 = StatUtils.median(pairs.map(p => p.v2));
    const medianDiff = StatUtils.median(diffs);
    
    const significant = pValue < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [
        {
          name: `Median (${var1})`,
          estimate: median1
        },
        {
          name: `Median (${var2})`,
          estimate: median2
        },
        {
          name: "Median Difference",
          estimate: medianDiff
        },
        {
          name: "W statistic",
          estimate: W,
          testStatistic: z,
          testType: "z",
          pValue
        }
      ],
      effectSizes: [{
        type: "r",
        value: r,
        interpretation: StatUtils.interpretR(r)
      }],
      testStatistic: W,
      testType: "W",
      pValue,
      conclusion: `Wilcoxon W = ${W.toFixed(0)}, z = ${z.toFixed(3)}, p = ${pValue.toFixed(4)}, r = ${r.toFixed(2)}`,
      interpretation: `A Wilcoxon signed-rank test was conducted to compare ${var1} and ${var2}. There was ${significant ? "a significant" : "no significant"} difference between ${var1} (Mdn = ${median1.toFixed(2)}) and ${var2} (Mdn = ${median2.toFixed(2)}), W = ${W.toFixed(0)}, z = ${z.toFixed(2)}, p = ${pValue.toFixed(3)}. The effect size (r = ${r.toFixed(2)}) indicates a ${StatUtils.interpretR(r)} effect.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["independence"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}
