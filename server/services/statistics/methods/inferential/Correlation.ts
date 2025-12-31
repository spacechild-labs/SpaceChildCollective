/**
 * Correlation Methods
 * 
 * Pearson, Spearman, and correlation matrix analysis.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Pearson Correlation
 */
export class PearsonCorrelationMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const var1 = spec.outcomes[0];
    const var2 = spec.predictors?.[0] || spec.outcomes[1];
    
    if (!var2) {
      throw new Error("Correlation requires two variables");
    }
    
    // Get valid pairs
    const pairs = data
      .map(d => ({ x: Number(d[var1]), y: Number(d[var2]) }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));
    
    const n = pairs.length;
    if (n < 3) {
      throw new Error("Insufficient data for correlation");
    }
    
    const x = pairs.map(p => p.x);
    const y = pairs.map(p => p.y);
    
    // Calculate Pearson r
    const r = StatUtils.correlation(x, y);
    const rSquared = r * r;
    
    // Test significance using t-distribution
    const t = r * Math.sqrt((n - 2) / (1 - rSquared));
    const df = n - 2;
    const pValue = StatUtils.tPValue(t, df);
    
    // 95% CI using Fisher's z transformation
    const zr = 0.5 * Math.log((1 + r) / (1 - r));
    const seZ = 1 / Math.sqrt(n - 3);
    const zLower = zr - 1.96 * seZ;
    const zUpper = zr + 1.96 * seZ;
    const ciLower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
    const ciUpper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);
    
    const significant = pValue < spec.alpha;
    
    const parameters = [
      {
        name: "Pearson r",
        estimate: r,
        ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
        testStatistic: t,
        testType: "t",
        df,
        pValue
      },
      { name: "R-squared", estimate: rSquared },
      { name: "Sample Size", estimate: n }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "r",
        value: r,
        ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
        interpretation: StatUtils.interpretR(r)
      }],
      modelFit: { rSquared },
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: `r(${df}) = ${r.toFixed(3)}, p = ${pValue.toFixed(4)}, 95% CI [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]`,
      interpretation: `A Pearson correlation was computed to assess the relationship between ${var1} and ${var2}. There was a ${significant ? "significant" : "non-significant"} ${r > 0 ? "positive" : "negative"} correlation between the two variables, r(${df}) = ${r.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}. The correlation coefficient indicates a ${StatUtils.interpretR(r)} effect, with ${var1} explaining ${(rSquared * 100).toFixed(1)}% of the variance in ${var2}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "linearity", "homoscedasticity"];
  }
  
  getMinimumSampleSize(): number {
    return 20;
  }
}

/**
 * Spearman Rank Correlation
 */
export class SpearmanCorrelationMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const var1 = spec.outcomes[0];
    const var2 = spec.predictors?.[0] || spec.outcomes[1];
    
    if (!var2) {
      throw new Error("Correlation requires two variables");
    }
    
    // Get valid pairs
    const pairs = data
      .map(d => ({ x: Number(d[var1]), y: Number(d[var2]) }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));
    
    const n = pairs.length;
    if (n < 3) {
      throw new Error("Insufficient data for correlation");
    }
    
    // Rank the data
    const xRanks = this.rank(pairs.map(p => p.x));
    const yRanks = this.rank(pairs.map(p => p.y));
    
    // Calculate Spearman's rho (Pearson correlation of ranks)
    const rho = StatUtils.correlation(xRanks, yRanks);
    
    // Test significance
    const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
    const df = n - 2;
    const pValue = StatUtils.tPValue(t, df);
    
    // 95% CI using Fisher's z transformation
    const zr = 0.5 * Math.log((1 + rho) / (1 - rho));
    const seZ = 1.03 / Math.sqrt(n - 3); // Slightly larger SE for Spearman
    const zLower = zr - 1.96 * seZ;
    const zUpper = zr + 1.96 * seZ;
    const ciLower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
    const ciUpper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);
    
    const significant = pValue < spec.alpha;
    
    const parameters = [
      {
        name: "Spearman ρ",
        estimate: rho,
        ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
        testStatistic: t,
        testType: "t",
        df,
        pValue
      },
      { name: "Sample Size", estimate: n }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "r",
        value: rho,
        ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
        interpretation: StatUtils.interpretR(rho)
      }],
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: `ρ(${df}) = ${rho.toFixed(3)}, p = ${pValue.toFixed(4)}, 95% CI [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]`,
      interpretation: `A Spearman rank-order correlation was computed to assess the monotonic relationship between ${var1} and ${var2}. There was a ${significant ? "significant" : "non-significant"} ${rho > 0 ? "positive" : "negative"} correlation between the two variables, ρ(${df}) = ${rho.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}. The correlation indicates a ${StatUtils.interpretR(rho)} monotonic relationship.`,
      createdAt: new Date().toISOString()
    };
  }
  
  private rank(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    
    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j < indexed.length - 1 && indexed[j + 1].v === indexed[i].v) j++;
      const avgRank = (i + j + 2) / 2; // 1-indexed average rank
      for (let k = i; k <= j; k++) {
        ranks[indexed[k].i] = avgRank;
      }
      i = j + 1;
    }
    
    return ranks;
  }
  
  getRequiredAssumptions(): string[] {
    return ["independence"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}

/**
 * Correlation Matrix Analysis
 */
export class CorrelationMatrixMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const variables = [...spec.outcomes, ...(spec.predictors || [])];
    
    if (variables.length < 2) {
      throw new Error("Correlation matrix requires at least 2 variables");
    }
    
    const n = data.length;
    const k = variables.length;
    
    // Get valid data
    const validData: number[][] = [];
    for (const row of data) {
      const values = variables.map(v => Number(row[v]));
      if (values.every(v => !isNaN(v))) {
        validData.push(values);
      }
    }
    
    const validN = validData.length;
    if (validN < 10) {
      throw new Error("Insufficient valid data for correlation matrix");
    }
    
    // Calculate correlation matrix
    const corrMatrix: number[][] = [];
    const pMatrix: number[][] = [];
    
    for (let i = 0; i < k; i++) {
      corrMatrix[i] = [];
      pMatrix[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          corrMatrix[i][j] = 1;
          pMatrix[i][j] = 0;
        } else if (j < i) {
          corrMatrix[i][j] = corrMatrix[j][i];
          pMatrix[i][j] = pMatrix[j][i];
        } else {
          const x = validData.map(row => row[i]);
          const y = validData.map(row => row[j]);
          const r = StatUtils.correlation(x, y);
          corrMatrix[i][j] = r;
          
          // P-value
          const t = r * Math.sqrt((validN - 2) / (1 - r * r));
          pMatrix[i][j] = StatUtils.tPValue(t, validN - 2);
        }
      }
    }
    
    // Find significant correlations
    const significantCorrs: Array<{ var1: string; var2: string; r: number; p: number }> = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        if (pMatrix[i][j] < spec.alpha) {
          significantCorrs.push({
            var1: variables[i],
            var2: variables[j],
            r: corrMatrix[i][j],
            p: pMatrix[i][j]
          });
        }
      }
    }
    
    // Sort by absolute correlation
    significantCorrs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    
    // Build parameters
    const parameters = [
      { name: "Number of Variables", estimate: k },
      { name: "Sample Size", estimate: validN },
      { name: "Significant Correlations", estimate: significantCorrs.length }
    ];
    
    // Add top correlations
    significantCorrs.slice(0, 10).forEach((c, i) => {
      parameters.push({
        name: `${c.var1} × ${c.var2}`,
        estimate: c.r
      } as any);
    });
    
    // Average absolute correlation
    let sumAbsR = 0;
    let countR = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        sumAbsR += Math.abs(corrMatrix[i][j]);
        countR++;
      }
    }
    const avgAbsR = sumAbsR / countR;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "r",
        value: avgAbsR,
        interpretation: StatUtils.interpretR(avgAbsR)
      }],
      conclusion: `Correlation matrix: ${k} variables, ${significantCorrs.length} significant correlations (α = ${spec.alpha})`,
      interpretation: `A correlation matrix was computed for ${k} variables (n = ${validN}). ${significantCorrs.length} of ${countR} possible correlations were statistically significant at α = ${spec.alpha}. ${significantCorrs.length > 0 ? `The strongest correlation was between ${significantCorrs[0].var1} and ${significantCorrs[0].var2} (r = ${significantCorrs[0].r.toFixed(2)}, p = ${significantCorrs[0].p < 0.001 ? "< .001" : significantCorrs[0].p.toFixed(3)}).` : "No significant correlations were found."} The average absolute correlation was ${avgAbsR.toFixed(2)}, indicating ${StatUtils.interpretR(avgAbsR)} overall associations among variables.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 30;
  }
}
