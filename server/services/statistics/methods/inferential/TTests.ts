/**
 * T-Test Methods
 * 
 * Implementations of independent samples t-test, paired t-test, and Welch's t-test.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Independent Samples T-Test
 */
export class TTestMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const groupVar = spec.groupingVariables?.[0];
    
    if (!groupVar) {
      throw new Error("T-test requires a grouping variable");
    }
    
    const groups = Array.from(new Set(data.map(d => d[groupVar])));
    if (groups.length !== 2) {
      throw new Error(`T-test requires exactly 2 groups, found ${groups.length}`);
    }
    
    const group1Data = data.filter(d => d[groupVar] === groups[0]).map(d => Number(d[outcome])).filter(n => !isNaN(n));
    const group2Data = data.filter(d => d[groupVar] === groups[1]).map(d => Number(d[outcome])).filter(n => !isNaN(n));
    
    const n1 = group1Data.length;
    const n2 = group2Data.length;
    const mean1 = StatUtils.mean(group1Data);
    const mean2 = StatUtils.mean(group2Data);
    const var1 = StatUtils.variance(group1Data);
    const var2 = StatUtils.variance(group2Data);
    
    // Pooled variance
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const se = Math.sqrt(pooledVar * (1/n1 + 1/n2));
    
    // T statistic
    const t = (mean1 - mean2) / se;
    const df = n1 + n2 - 2;
    
    // P-value (two-tailed)
    const pValue = StatUtils.tPValue(t, df);
    
    // Effect size (Cohen's d)
    const pooledSD = Math.sqrt(pooledVar);
    const cohensD = (mean1 - mean2) / pooledSD;
    
    // 95% CI for mean difference
    const tCrit = 1.96; // Approximation for large df
    const ciLower = (mean1 - mean2) - tCrit * se;
    const ciUpper = (mean1 - mean2) + tCrit * se;
    
    const significant = pValue < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [
        {
          name: `Mean (${groups[0]})`,
          estimate: mean1,
          se: Math.sqrt(var1 / n1)
        },
        {
          name: `Mean (${groups[1]})`,
          estimate: mean2,
          se: Math.sqrt(var2 / n2)
        },
        {
          name: "Mean Difference",
          estimate: mean1 - mean2,
          se,
          ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
          testStatistic: t,
          testType: "t",
          df,
          pValue
        }
      ],
      effectSizes: [{
        type: "cohens_d",
        value: cohensD,
        interpretation: StatUtils.interpretCohensD(cohensD)
      }],
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: significant
        ? `Significant difference between groups: t(${df}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}, d = ${cohensD.toFixed(2)}`
        : `No significant difference between groups: t(${df}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}, d = ${cohensD.toFixed(2)}`,
      interpretation: `The ${groups[0]} group (M = ${mean1.toFixed(2)}, SD = ${Math.sqrt(var1).toFixed(2)}) ${significant ? "significantly differed from" : "did not significantly differ from"} the ${groups[1]} group (M = ${mean2.toFixed(2)}, SD = ${Math.sqrt(var2).toFixed(2)}). The effect size was ${StatUtils.interpretCohensD(cohensD)}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "homoscedasticity", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 20;
  }
}

/**
 * Paired Samples T-Test
 */
export class PairedTTestMethod implements AnalysisMethod {
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
      throw new Error("Paired t-test requires two variables");
    }
    
    // Calculate differences
    const pairs = data
      .map(d => ({ v1: Number(d[var1]), v2: Number(d[var2]) }))
      .filter(p => !isNaN(p.v1) && !isNaN(p.v2));
    
    if (pairs.length < 3) {
      throw new Error("Insufficient paired observations");
    }
    
    const differences = pairs.map(p => p.v1 - p.v2);
    const n = differences.length;
    const meanDiff = StatUtils.mean(differences);
    const sdDiff = StatUtils.sd(differences);
    const se = sdDiff / Math.sqrt(n);
    const t = meanDiff / se;
    const df = n - 1;
    
    const pValue = StatUtils.tPValue(t, df);
    
    // Effect size (Cohen's d for paired samples)
    const cohensD = meanDiff / sdDiff;
    
    // 95% CI
    const tCrit = 1.96;
    const ciLower = meanDiff - tCrit * se;
    const ciUpper = meanDiff + tCrit * se;
    
    const significant = pValue < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [
        {
          name: `Mean (${var1})`,
          estimate: StatUtils.mean(pairs.map(p => p.v1))
        },
        {
          name: `Mean (${var2})`,
          estimate: StatUtils.mean(pairs.map(p => p.v2))
        },
        {
          name: "Mean Difference",
          estimate: meanDiff,
          se,
          ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
          testStatistic: t,
          testType: "t",
          df,
          pValue
        }
      ],
      effectSizes: [{
        type: "cohens_d",
        value: cohensD,
        interpretation: StatUtils.interpretCohensD(cohensD)
      }],
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: significant
        ? `Significant difference: t(${df}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}, d = ${cohensD.toFixed(2)}`
        : `No significant difference: t(${df}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}, d = ${cohensD.toFixed(2)}`,
      interpretation: `There was ${significant ? "a significant" : "no significant"} difference between ${var1} and ${var2} (mean difference = ${meanDiff.toFixed(2)}, SD = ${sdDiff.toFixed(2)}). The effect size was ${StatUtils.interpretCohensD(cohensD)}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 15;
  }
}

/**
 * Welch's T-Test (unequal variances)
 */
export class WelchTTestMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const groupVar = spec.groupingVariables?.[0];
    
    if (!groupVar) {
      throw new Error("Welch t-test requires a grouping variable");
    }
    
    const groups = Array.from(new Set(data.map(d => d[groupVar])));
    if (groups.length !== 2) {
      throw new Error(`Welch t-test requires exactly 2 groups, found ${groups.length}`);
    }
    
    const g1 = data.filter(d => d[groupVar] === groups[0]).map(d => Number(d[outcome])).filter(n => !isNaN(n));
    const g2 = data.filter(d => d[groupVar] === groups[1]).map(d => Number(d[outcome])).filter(n => !isNaN(n));
    
    const n1 = g1.length, n2 = g2.length;
    const m1 = StatUtils.mean(g1), m2 = StatUtils.mean(g2);
    const v1 = StatUtils.variance(g1), v2 = StatUtils.variance(g2);
    
    // Welch's t-test
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    const t = (m1 - m2) / se;
    
    // Welch-Satterthwaite degrees of freedom
    const df = Math.pow(v1 / n1 + v2 / n2, 2) / 
               (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
    
    const pValue = StatUtils.tPValue(t, df);
    
    // Effect size using pooled SD
    const pooledSD = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
    const cohensD = (m1 - m2) / pooledSD;
    
    // 95% CI
    const tCrit = 1.96;
    const ciLower = (m1 - m2) - tCrit * se;
    const ciUpper = (m1 - m2) + tCrit * se;
    
    const significant = pValue < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [
        {
          name: `Mean (${groups[0]})`,
          estimate: m1,
          se: Math.sqrt(v1 / n1)
        },
        {
          name: `Mean (${groups[1]})`,
          estimate: m2,
          se: Math.sqrt(v2 / n2)
        },
        {
          name: "Mean Difference",
          estimate: m1 - m2,
          se,
          ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
          testStatistic: t,
          testType: "t",
          df,
          pValue
        }
      ],
      effectSizes: [{
        type: "cohens_d",
        value: cohensD,
        interpretation: StatUtils.interpretCohensD(cohensD)
      }],
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: `Welch's t-test: t(${df.toFixed(2)}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}, d = ${cohensD.toFixed(2)}`,
      interpretation: `Using Welch's t-test (which does not assume equal variances), there was ${significant ? "a significant" : "no significant"} difference between groups. The ${groups[0]} group (M = ${m1.toFixed(2)}, SD = ${Math.sqrt(v1).toFixed(2)}) ${significant ? "differed from" : "did not differ from"} the ${groups[1]} group (M = ${m2.toFixed(2)}, SD = ${Math.sqrt(v2).toFixed(2)}).`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 20;
  }
}
