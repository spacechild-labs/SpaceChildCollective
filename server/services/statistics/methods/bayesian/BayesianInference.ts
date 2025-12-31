/**
 * Bayesian Inference Methods
 * 
 * Bayesian alternatives to frequentist tests with Bayes Factors
 * and posterior distributions.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Bayesian Independent Samples T-Test
 * 
 * Computes Bayes Factor for comparing two group means using JZS prior.
 * BF10 > 1 supports H1 (difference), BF10 < 1 supports H0 (no difference).
 */
export class BayesianTTestMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const groupVar = spec.groupingVariables?.[0] || spec.predictors?.[0];
    
    if (!outcome || !groupVar) {
      throw new Error("Bayesian t-test requires outcome and grouping variable");
    }
    
    // Split by groups
    const groups = new Map<string, number[]>();
    for (const row of data) {
      const val = Number(row[outcome]);
      const group = String(row[groupVar]);
      if (!isNaN(val) && group) {
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(val);
      }
    }
    
    const groupNames = Array.from(groups.keys());
    if (groupNames.length !== 2) {
      throw new Error(`Bayesian t-test requires exactly 2 groups (found ${groupNames.length})`);
    }
    
    const group1 = groups.get(groupNames[0])!;
    const group2 = groups.get(groupNames[1])!;
    const n1 = group1.length;
    const n2 = group2.length;
    const n = n1 + n2;
    
    if (n1 < 3 || n2 < 3) {
      throw new Error("Each group needs at least 3 observations");
    }
    
    // Calculate statistics
    const mean1 = StatUtils.mean(group1);
    const mean2 = StatUtils.mean(group2);
    const var1 = StatUtils.variance(group1);
    const var2 = StatUtils.variance(group2);
    
    // Pooled variance
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const pooledSD = Math.sqrt(pooledVar);
    
    // Effect size (Cohen's d)
    const d = (mean1 - mean2) / pooledSD;
    
    // T-statistic
    const se = pooledSD * Math.sqrt(1/n1 + 1/n2);
    const t = (mean1 - mean2) / se;
    const df = n1 + n2 - 2;
    
    // Bayes Factor using JZS prior (Rouder et al., 2009)
    // Simplified approximation using BIC method
    const r = 0.707; // Default Cauchy prior scale (medium effect)
    
    // BF10 approximation using Savage-Dickey density ratio
    // For t-test: BF10 ≈ (1 + t²/df)^(-(df+1)/2) * sqrt(n1*n2/(n1+n2)) / (r * sqrt(2*pi))
    // Simplified using Wagenmakers approximation
    const nEff = (n1 * n2) / (n1 + n2);
    const tSq = t * t;
    
    // Log BF10 using approximation
    const logBF10 = 0.5 * Math.log(nEff / (nEff + 1)) + 
                    0.5 * (df + 1) * Math.log(1 + tSq / df) -
                    0.5 * (df + 1) * Math.log(1 + tSq / (df * (1 + nEff)));
    
    const bf10 = Math.exp(logBF10);
    const bf01 = 1 / bf10;
    
    // Posterior probability (assuming equal prior odds)
    const posteriorH1 = bf10 / (1 + bf10);
    const posteriorH0 = 1 - posteriorH1;
    
    // Interpret Bayes Factor (Jeffreys scale)
    let bfInterpretation: string;
    if (bf10 > 100) bfInterpretation = "extreme evidence for H1";
    else if (bf10 > 30) bfInterpretation = "very strong evidence for H1";
    else if (bf10 > 10) bfInterpretation = "strong evidence for H1";
    else if (bf10 > 3) bfInterpretation = "moderate evidence for H1";
    else if (bf10 > 1) bfInterpretation = "anecdotal evidence for H1";
    else if (bf10 > 1/3) bfInterpretation = "anecdotal evidence for H0";
    else if (bf10 > 1/10) bfInterpretation = "moderate evidence for H0";
    else if (bf10 > 1/30) bfInterpretation = "strong evidence for H0";
    else if (bf10 > 1/100) bfInterpretation = "very strong evidence for H0";
    else bfInterpretation = "extreme evidence for H0";
    
    // Credible interval for effect size (approximate)
    // Using normal approximation to posterior
    const dSE = Math.sqrt((n1 + n2) / (n1 * n2) + d * d / (2 * (n1 + n2)));
    const ciLower = d - 1.96 * dSE;
    const ciUpper = d + 1.96 * dSE;
    
    // Frequentist p-value for comparison
    const pValue = 2 * StatUtils.tPValue(Math.abs(t), df);
    
    const parameters = [
      { name: "BF₁₀", estimate: bf10 },
      { name: "BF₀₁", estimate: bf01 },
      { name: "Posterior P(H1|data)", estimate: posteriorH1 },
      { name: "Posterior P(H0|data)", estimate: posteriorH0 },
      { name: `Mean (${groupNames[0]})`, estimate: mean1 },
      { name: `Mean (${groupNames[1]})`, estimate: mean2 },
      { name: "Mean Difference", estimate: mean1 - mean2 },
      { name: "Cohen's d", estimate: d },
      { name: "95% Credible Interval Lower", estimate: ciLower },
      { name: "95% Credible Interval Upper", estimate: ciUpper },
      { name: "t-statistic", estimate: t, testStatistic: t, testType: "t", df, pValue },
      { name: "n₁", estimate: n1 },
      { name: "n₂", estimate: n2 }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "cohens_d",
        value: d,
        interpretation: StatUtils.interpretCohensD(d) as any
      }],
      testStatistic: bf10,
      testType: "BF",
      pValue, // For reference
      conclusion: `BF₁₀ = ${bf10.toFixed(2)}, d = ${d.toFixed(2)} [95% CI: ${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]`,
      interpretation: `A Bayesian independent samples t-test compared ${outcome} between ${groupNames[0]} (M = ${mean1.toFixed(2)}, n = ${n1}) and ${groupNames[1]} (M = ${mean2.toFixed(2)}, n = ${n2}). The Bayes Factor (BF₁₀ = ${bf10.toFixed(2)}) indicates ${bfInterpretation}. The posterior probability of a difference is ${(posteriorH1 * 100).toFixed(1)}%. The effect size was d = ${d.toFixed(2)} [95% credible interval: ${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}], a ${StatUtils.interpretCohensD(d)} effect.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}

/**
 * Bayesian Paired Samples T-Test
 */
export class BayesianPairedTTestMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const var1 = spec.outcomes[0];
    const var2 = spec.outcomes[1] || spec.predictors?.[0];
    
    if (!var1 || !var2) {
      throw new Error("Bayesian paired t-test requires two variables");
    }
    
    // Calculate differences
    const differences: number[] = [];
    for (const row of data) {
      const v1 = Number(row[var1]);
      const v2 = Number(row[var2]);
      if (!isNaN(v1) && !isNaN(v2)) {
        differences.push(v1 - v2);
      }
    }
    
    const n = differences.length;
    if (n < 5) {
      throw new Error(`Insufficient paired observations (n=${n})`);
    }
    
    const meanDiff = StatUtils.mean(differences);
    const sdDiff = StatUtils.sd(differences);
    const seDiff = sdDiff / Math.sqrt(n);
    
    // T-statistic
    const t = meanDiff / seDiff;
    const df = n - 1;
    
    // Effect size (Cohen's dz)
    const dz = meanDiff / sdDiff;
    
    // Bayes Factor (one-sample t-test on differences)
    const r = 0.707;
    const tSq = t * t;
    
    const logBF10 = 0.5 * Math.log(n / (n + 1)) +
                    0.5 * df * Math.log(1 + tSq / df) -
                    0.5 * df * Math.log(1 + tSq / (df * (1 + n)));
    
    const bf10 = Math.exp(logBF10);
    const bf01 = 1 / bf10;
    
    const posteriorH1 = bf10 / (1 + bf10);
    
    // Interpret
    let bfInterpretation: string;
    if (bf10 > 100) bfInterpretation = "extreme evidence for H1";
    else if (bf10 > 30) bfInterpretation = "very strong evidence for H1";
    else if (bf10 > 10) bfInterpretation = "strong evidence for H1";
    else if (bf10 > 3) bfInterpretation = "moderate evidence for H1";
    else if (bf10 > 1) bfInterpretation = "anecdotal evidence for H1";
    else if (bf10 > 1/3) bfInterpretation = "anecdotal evidence for H0";
    else if (bf10 > 1/10) bfInterpretation = "moderate evidence for H0";
    else bfInterpretation = "strong evidence for H0";
    
    // Credible interval
    const dzSE = Math.sqrt(1/n + dz * dz / (2 * n));
    const ciLower = dz - 1.96 * dzSE;
    const ciUpper = dz + 1.96 * dzSE;
    
    const pValue = 2 * StatUtils.tPValue(Math.abs(t), df);
    
    const parameters = [
      { name: "BF₁₀", estimate: bf10 },
      { name: "BF₀₁", estimate: bf01 },
      { name: "Posterior P(H1|data)", estimate: posteriorH1 },
      { name: "Mean Difference", estimate: meanDiff },
      { name: "SD of Differences", estimate: sdDiff },
      { name: "Cohen's dz", estimate: dz },
      { name: "95% Credible Interval Lower", estimate: ciLower },
      { name: "95% Credible Interval Upper", estimate: ciUpper },
      { name: "t-statistic", estimate: t, testStatistic: t, testType: "t", df, pValue },
      { name: "n (pairs)", estimate: n }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "cohens_d",
        value: dz,
        interpretation: StatUtils.interpretCohensD(dz) as any
      }],
      testStatistic: bf10,
      testType: "BF",
      pValue,
      conclusion: `BF₁₀ = ${bf10.toFixed(2)}, dz = ${dz.toFixed(2)} [95% CI: ${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]`,
      interpretation: `A Bayesian paired samples t-test compared ${var1} and ${var2} (n = ${n} pairs). The mean difference was ${meanDiff.toFixed(2)} (SD = ${sdDiff.toFixed(2)}). The Bayes Factor (BF₁₀ = ${bf10.toFixed(2)}) indicates ${bfInterpretation}. The posterior probability of a difference is ${(posteriorH1 * 100).toFixed(1)}%. The effect size was dz = ${dz.toFixed(2)} [95% credible interval: ${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}].`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}

/**
 * Bayesian Correlation
 * 
 * Tests correlation with Bayes Factor using stretched beta prior.
 */
export class BayesianCorrelationMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const var1 = spec.outcomes[0];
    const var2 = spec.predictors?.[0] || spec.outcomes[1];
    
    if (!var1 || !var2) {
      throw new Error("Bayesian correlation requires two variables");
    }
    
    // Get paired data
    const pairs: { x: number; y: number }[] = [];
    for (const row of data) {
      const x = Number(row[var1]);
      const y = Number(row[var2]);
      if (!isNaN(x) && !isNaN(y)) {
        pairs.push({ x, y });
      }
    }
    
    const n = pairs.length;
    if (n < 5) {
      throw new Error(`Insufficient observations (n=${n})`);
    }
    
    const xs = pairs.map(p => p.x);
    const ys = pairs.map(p => p.y);
    
    // Pearson correlation
    const r = StatUtils.correlation(xs, ys);
    
    // Bayes Factor for correlation (Wetzels & Wagenmakers, 2012)
    // Using Jeffrey's approximation
    const rSq = r * r;
    const logBF10 = StatUtils.logGamma((n - 1) / 2) - 
                    StatUtils.logGamma(n / 2) +
                    0.5 * Math.log(Math.PI) +
                    ((n - 1) / 2) * Math.log(1 - rSq);
    
    // Simplified approximation
    const bf10Approx = Math.sqrt((n - 3) / 2) * 
                       Math.pow(1 - rSq, (n - 3) / 2) *
                       this.hypergeometric2F1(0.5, 0.5, (n - 1) / 2, rSq);
    
    const bf10 = Math.max(0.001, Math.min(1000, bf10Approx));
    const bf01 = 1 / bf10;
    
    const posteriorH1 = bf10 / (1 + bf10);
    
    // Interpret
    let bfInterpretation: string;
    if (bf10 > 100) bfInterpretation = "extreme evidence for correlation";
    else if (bf10 > 30) bfInterpretation = "very strong evidence for correlation";
    else if (bf10 > 10) bfInterpretation = "strong evidence for correlation";
    else if (bf10 > 3) bfInterpretation = "moderate evidence for correlation";
    else if (bf10 > 1) bfInterpretation = "anecdotal evidence for correlation";
    else if (bf10 > 1/3) bfInterpretation = "anecdotal evidence for no correlation";
    else if (bf10 > 1/10) bfInterpretation = "moderate evidence for no correlation";
    else bfInterpretation = "strong evidence for no correlation";
    
    // Credible interval using Fisher z transformation
    const zr = 0.5 * Math.log((1 + r) / (1 - r));
    const zrSE = 1 / Math.sqrt(n - 3);
    const zrLower = zr - 1.96 * zrSE;
    const zrUpper = zr + 1.96 * zrSE;
    const ciLower = (Math.exp(2 * zrLower) - 1) / (Math.exp(2 * zrLower) + 1);
    const ciUpper = (Math.exp(2 * zrUpper) - 1) / (Math.exp(2 * zrUpper) + 1);
    
    // Frequentist p-value
    const t = r * Math.sqrt((n - 2) / (1 - rSq));
    const pValue = 2 * StatUtils.tPValue(Math.abs(t), n - 2);
    
    const parameters = [
      { name: "BF₁₀", estimate: bf10 },
      { name: "BF₀₁", estimate: bf01 },
      { name: "Posterior P(correlation|data)", estimate: posteriorH1 },
      { name: "Pearson r", estimate: r },
      { name: "95% Credible Interval Lower", estimate: ciLower },
      { name: "95% Credible Interval Upper", estimate: ciUpper },
      { name: "R²", estimate: rSq },
      { name: "n", estimate: n },
      { name: "t-statistic", estimate: t, testStatistic: t, testType: "t", df: n - 2, pValue }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "r",
        value: r,
        interpretation: StatUtils.interpretR(r) as any
      }],
      testStatistic: bf10,
      testType: "BF",
      pValue,
      conclusion: `BF₁₀ = ${bf10.toFixed(2)}, r = ${r.toFixed(3)} [95% CI: ${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]`,
      interpretation: `A Bayesian correlation analysis examined the relationship between ${var1} and ${var2} (n = ${n}). The correlation was r = ${r.toFixed(2)} [95% credible interval: ${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]. The Bayes Factor (BF₁₀ = ${bf10.toFixed(2)}) indicates ${bfInterpretation}. The posterior probability of a non-zero correlation is ${(posteriorH1 * 100).toFixed(1)}%.`,
      createdAt: new Date().toISOString()
    };
  }
  
  // Hypergeometric 2F1 approximation for small arguments
  private hypergeometric2F1(a: number, b: number, c: number, z: number): number {
    if (Math.abs(z) > 0.9) return 1; // Avoid divergence
    let sum = 1;
    let term = 1;
    for (let k = 1; k <= 50; k++) {
      term *= (a + k - 1) * (b + k - 1) / ((c + k - 1) * k) * z;
      sum += term;
      if (Math.abs(term) < 1e-10) break;
    }
    return sum;
  }
  
  getRequiredAssumptions(): string[] {
    return ["linearity"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}
