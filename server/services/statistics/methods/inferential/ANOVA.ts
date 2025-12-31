/**
 * ANOVA Methods
 * 
 * One-way ANOVA and related analyses.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * One-Way ANOVA
 */
export class ANOVAMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const groupVar = spec.groupingVariables?.[0];
    
    if (!groupVar) {
      throw new Error("ANOVA requires a grouping variable");
    }
    
    const groups = Array.from(new Set(data.map(d => d[groupVar])));
    const k = groups.length;
    
    if (k < 2) {
      throw new Error("ANOVA requires at least 2 groups");
    }
    
    // Get data for each group
    const groupData = groups.map(g => ({
      group: g,
      values: data.filter(d => d[groupVar] === g).map(d => Number(d[outcome])).filter(n => !isNaN(n))
    }));
    
    const N = groupData.reduce((sum, g) => sum + g.values.length, 0);
    
    // Group statistics
    const groupStats = groupData.map(g => ({
      group: g.group,
      n: g.values.length,
      mean: StatUtils.mean(g.values),
      sd: StatUtils.sd(g.values),
      ss: g.values.reduce((sum, x) => sum + Math.pow(x - StatUtils.mean(g.values), 2), 0)
    }));
    
    // Grand mean
    const allValues = groupData.flatMap(g => g.values);
    const grandMean = StatUtils.mean(allValues);
    
    // Sum of squares
    const SSB = groupStats.reduce((sum, g) => sum + g.n * Math.pow(g.mean - grandMean, 2), 0);
    const SSW = groupStats.reduce((sum, g) => sum + g.ss, 0);
    const SST = SSB + SSW;
    
    // Degrees of freedom
    const dfB = k - 1;
    const dfW = N - k;
    const dfT = N - 1;
    
    // Mean squares
    const MSB = SSB / dfB;
    const MSW = SSW / dfW;
    
    // F statistic
    const F = MSB / MSW;
    
    // P-value
    const pValue = 1 - StatUtils.fCDF(F, dfB, dfW);
    
    // Effect sizes
    const etaSquared = SSB / SST;
    const omegaSquared = (SSB - dfB * MSW) / (SST + MSW);
    
    const significant = pValue < spec.alpha;
    
    // Build parameters array with group means
    const parameters = groupStats.map(g => ({
      name: `Mean (${g.group})`,
      estimate: g.mean,
      se: g.sd / Math.sqrt(g.n)
    }));
    
    parameters.push({
      name: "F statistic",
      estimate: F,
      testStatistic: F,
      testType: "F",
      df: [dfB, dfW],
      pValue
    } as any);
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "eta_squared",
          value: etaSquared,
          interpretation: StatUtils.interpretEtaSquared(etaSquared)
        },
        {
          type: "omega_squared",
          value: omegaSquared,
          interpretation: StatUtils.interpretEtaSquared(omegaSquared)
        }
      ],
      modelFit: {
        rSquared: etaSquared
      },
      testStatistic: F,
      testType: "F",
      df: [dfB, dfW],
      pValue,
      conclusion: `F(${dfB}, ${dfW}) = ${F.toFixed(3)}, p = ${pValue.toFixed(4)}, η² = ${etaSquared.toFixed(3)}`,
      interpretation: `A one-way ANOVA was conducted to compare ${outcome} across ${k} groups. There was ${significant ? "a statistically significant" : "no statistically significant"} effect of ${groupVar} on ${outcome}, F(${dfB}, ${dfW}) = ${F.toFixed(2)}, p = ${pValue.toFixed(3)}. The effect size (η² = ${etaSquared.toFixed(3)}) indicates that ${(etaSquared * 100).toFixed(1)}% of the variance in ${outcome} is explained by group membership.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "homoscedasticity", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 30;
  }
}
