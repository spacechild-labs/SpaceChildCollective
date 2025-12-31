/**
 * Chi-Square and Categorical Tests
 * 
 * Chi-square test of independence and Fisher's exact test.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Chi-Square Test of Independence
 */
export class ChiSquareMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const var1 = spec.outcomes[0];
    const var2 = spec.groupingVariables?.[0] || spec.predictors?.[0];
    
    if (!var2) {
      throw new Error("Chi-square test requires two categorical variables");
    }
    
    // Build contingency table
    const levels1 = Array.from(new Set(data.map(d => d[var1]).filter(v => v != null)));
    const levels2 = Array.from(new Set(data.map(d => d[var2]).filter(v => v != null)));
    
    if (levels1.length < 2 || levels2.length < 2) {
      throw new Error("Both variables must have at least 2 levels");
    }
    
    // Create observed frequency table
    const observed: number[][] = [];
    for (let i = 0; i < levels1.length; i++) {
      observed[i] = [];
      for (let j = 0; j < levels2.length; j++) {
        observed[i][j] = data.filter(d => d[var1] === levels1[i] && d[var2] === levels2[j]).length;
      }
    }
    
    // Calculate row and column totals
    const rowTotals = observed.map(row => row.reduce((a, b) => a + b, 0));
    const colTotals = levels2.map((_, j) => observed.reduce((sum, row) => sum + row[j], 0));
    const grandTotal = rowTotals.reduce((a, b) => a + b, 0);
    
    // Calculate expected frequencies
    const expected: number[][] = [];
    for (let i = 0; i < levels1.length; i++) {
      expected[i] = [];
      for (let j = 0; j < levels2.length; j++) {
        expected[i][j] = (rowTotals[i] * colTotals[j]) / grandTotal;
      }
    }
    
    // Check minimum expected frequency
    const minExpected = Math.min(...expected.flat());
    const cellsBelow5 = expected.flat().filter(e => e < 5).length;
    
    // Calculate chi-square statistic
    let chiSquare = 0;
    for (let i = 0; i < levels1.length; i++) {
      for (let j = 0; j < levels2.length; j++) {
        chiSquare += Math.pow(observed[i][j] - expected[i][j], 2) / expected[i][j];
      }
    }
    
    // Degrees of freedom
    const df = (levels1.length - 1) * (levels2.length - 1);
    
    // P-value
    const pValue = 1 - StatUtils.chi2CDF(chiSquare, df);
    
    // Effect size (Cramér's V)
    const minDim = Math.min(levels1.length - 1, levels2.length - 1);
    const cramersV = Math.sqrt(chiSquare / (grandTotal * minDim));
    
    // Phi coefficient (for 2x2 tables)
    let phi: number | undefined;
    if (levels1.length === 2 && levels2.length === 2) {
      phi = Math.sqrt(chiSquare / grandTotal);
    }
    
    const significant = pValue < spec.alpha;
    
    // Build contingency table for output
    const contingencyTable = {
      rows: levels1.map(String),
      cols: levels2.map(String),
      observed,
      expected,
      rowTotals,
      colTotals,
      grandTotal
    };
    
    const parameters = [
      { name: "Chi-Square", estimate: chiSquare, testStatistic: chiSquare, testType: "χ²", df, pValue },
      { name: "Degrees of Freedom", estimate: df },
      { name: "Sample Size", estimate: grandTotal },
      { name: "Cramér's V", estimate: cramersV }
    ];
    
    if (phi !== undefined) {
      parameters.push({ name: "Phi Coefficient", estimate: phi });
    }
    
    // Interpretation of Cramér's V
    let vInterpretation: string;
    if (cramersV < 0.1) vInterpretation = "negligible";
    else if (cramersV < 0.3) vInterpretation = "small";
    else if (cramersV < 0.5) vInterpretation = "medium";
    else vInterpretation = "large";
    
    const warnings: string[] = [];
    if (minExpected < 5) {
      warnings.push(`Minimum expected frequency (${minExpected.toFixed(2)}) is below 5. Consider Fisher's exact test.`);
    }
    if (cellsBelow5 > 0) {
      warnings.push(`${cellsBelow5} cell(s) have expected frequency below 5.`);
    }
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "cramers_v",
          value: cramersV,
          interpretation: vInterpretation as any
        }
      ],
      testStatistic: chiSquare,
      testType: "χ²",
      df,
      pValue,
      conclusion: `χ²(${df}) = ${chiSquare.toFixed(3)}, p = ${pValue.toFixed(4)}, V = ${cramersV.toFixed(3)}`,
      interpretation: `A chi-square test of independence was performed to examine the relationship between ${var1} and ${var2}. The relationship was ${significant ? "statistically significant" : "not statistically significant"}, χ²(${df}) = ${chiSquare.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}. The effect size (Cramér's V = ${cramersV.toFixed(2)}) indicates a ${vInterpretation} association between the variables.${warnings.length > 0 ? " Note: " + warnings.join(" ") : ""}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["independence", "sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 20;
  }
}

/**
 * Fisher's Exact Test (for 2x2 tables)
 */
export class FisherExactMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const var1 = spec.outcomes[0];
    const var2 = spec.groupingVariables?.[0] || spec.predictors?.[0];
    
    if (!var2) {
      throw new Error("Fisher's exact test requires two categorical variables");
    }
    
    // Build contingency table
    const levels1 = Array.from(new Set(data.map(d => d[var1]).filter(v => v != null)));
    const levels2 = Array.from(new Set(data.map(d => d[var2]).filter(v => v != null)));
    
    if (levels1.length !== 2 || levels2.length !== 2) {
      throw new Error("Fisher's exact test requires 2x2 contingency table");
    }
    
    // Get cell counts
    const a = data.filter(d => d[var1] === levels1[0] && d[var2] === levels2[0]).length;
    const b = data.filter(d => d[var1] === levels1[0] && d[var2] === levels2[1]).length;
    const c = data.filter(d => d[var1] === levels1[1] && d[var2] === levels2[0]).length;
    const d_ = data.filter(d => d[var1] === levels1[1] && d[var2] === levels2[1]).length;
    
    const n = a + b + c + d_;
    
    // Calculate exact p-value using hypergeometric distribution
    const pValue = this.fisherExactP(a, b, c, d_);
    
    // Odds ratio
    const oddsRatio = (a * d_) / (b * c);
    
    // 95% CI for odds ratio (Woolf method)
    const logOR = Math.log(oddsRatio);
    const seLogOR = Math.sqrt(1/a + 1/b + 1/c + 1/d_);
    const ciLower = Math.exp(logOR - 1.96 * seLogOR);
    const ciUpper = Math.exp(logOR + 1.96 * seLogOR);
    
    // Phi coefficient
    const phi = (a * d_ - b * c) / Math.sqrt((a + b) * (c + d_) * (a + c) * (b + d_));
    
    const significant = pValue < spec.alpha;
    
    const parameters = [
      { name: "Cell (1,1)", estimate: a },
      { name: "Cell (1,2)", estimate: b },
      { name: "Cell (2,1)", estimate: c },
      { name: "Cell (2,2)", estimate: d_ },
      { name: "Odds Ratio", estimate: oddsRatio, ci: { lower: ciLower, upper: ciUpper, level: 0.95 } },
      { name: "Phi Coefficient", estimate: phi }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "odds_ratio",
          value: oddsRatio,
          ci: { lower: ciLower, upper: ciUpper, level: 0.95 }
        },
        {
          type: "r",
          value: phi,
          interpretation: StatUtils.interpretR(phi)
        }
      ],
      pValue,
      conclusion: `Fisher's exact test: p = ${pValue.toFixed(4)}, OR = ${oddsRatio.toFixed(2)} [${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]`,
      interpretation: `Fisher's exact test was used to examine the association between ${var1} and ${var2}. The association was ${significant ? "statistically significant" : "not statistically significant"} (p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}). The odds ratio was ${oddsRatio.toFixed(2)} (95% CI: ${ciLower.toFixed(2)} - ${ciUpper.toFixed(2)}), indicating that ${oddsRatio > 1 ? `${levels1[0]} was associated with higher odds of ${levels2[0]}` : oddsRatio < 1 ? `${levels1[0]} was associated with lower odds of ${levels2[0]}` : "no association"}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  private fisherExactP(a: number, b: number, c: number, d: number): number {
    // Two-tailed Fisher's exact test
    const n = a + b + c + d;
    const row1 = a + b;
    const row2 = c + d;
    const col1 = a + c;
    const col2 = b + d;
    
    // Calculate probability of observed table
    const pObserved = this.hypergeometricP(a, row1, col1, n);
    
    // Sum probabilities of tables as or more extreme
    let pValue = 0;
    for (let i = 0; i <= Math.min(row1, col1); i++) {
      const p = this.hypergeometricP(i, row1, col1, n);
      if (p <= pObserved + 1e-10) {
        pValue += p;
      }
    }
    
    return Math.min(pValue, 1);
  }
  
  private hypergeometricP(k: number, n1: number, n2: number, n: number): number {
    // P(X = k) for hypergeometric distribution
    const logP = this.logChoose(n1, k) + this.logChoose(n - n1, n2 - k) - this.logChoose(n, n2);
    return Math.exp(logP);
  }
  
  private logChoose(n: number, k: number): number {
    if (k < 0 || k > n) return -Infinity;
    if (k === 0 || k === n) return 0;
    return StatUtils.logGamma(n + 1) - StatUtils.logGamma(k + 1) - StatUtils.logGamma(n - k + 1);
  }
  
  getRequiredAssumptions(): string[] {
    return ["independence"];
  }
  
  getMinimumSampleSize(): number {
    return 5;
  }
}
