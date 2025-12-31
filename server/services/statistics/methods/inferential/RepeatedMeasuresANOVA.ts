/**
 * Repeated Measures ANOVA
 * 
 * Within-subjects ANOVA for comparing means across multiple conditions
 * with the same participants.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Repeated Measures ANOVA (One-Way Within-Subjects)
 */
export class RepeatedMeasuresANOVAMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    // For repeated measures, outcomes should be the different conditions/timepoints
    const conditions = spec.outcomes;
    
    if (conditions.length < 2) {
      throw new Error("Repeated measures ANOVA requires at least 2 conditions");
    }
    
    const k = conditions.length; // Number of conditions
    
    // Get valid subjects (complete cases)
    const validSubjects: number[][] = [];
    for (const row of data) {
      const values = conditions.map(c => Number(row[c]));
      if (values.every(v => !isNaN(v))) {
        validSubjects.push(values);
      }
    }
    
    const n = validSubjects.length; // Number of subjects
    
    if (n < 5) {
      throw new Error(`Insufficient subjects for repeated measures ANOVA (n=${n}, need at least 5)`);
    }
    
    // Calculate means
    const grandMean = validSubjects.flat().reduce((a, b) => a + b, 0) / (n * k);
    
    const conditionMeans = conditions.map((_, j) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += validSubjects[i][j];
      return sum / n;
    });
    
    const subjectMeans = validSubjects.map(row => 
      row.reduce((a, b) => a + b, 0) / k
    );
    
    // Calculate Sum of Squares
    // SS_total
    let ssTotal = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < k; j++) {
        ssTotal += Math.pow(validSubjects[i][j] - grandMean, 2);
      }
    }
    
    // SS_between (conditions)
    let ssBetween = 0;
    for (let j = 0; j < k; j++) {
      ssBetween += n * Math.pow(conditionMeans[j] - grandMean, 2);
    }
    
    // SS_subjects
    let ssSubjects = 0;
    for (let i = 0; i < n; i++) {
      ssSubjects += k * Math.pow(subjectMeans[i] - grandMean, 2);
    }
    
    // SS_error (residual)
    const ssError = ssTotal - ssBetween - ssSubjects;
    
    // Degrees of freedom
    const dfBetween = k - 1;
    const dfSubjects = n - 1;
    const dfError = (k - 1) * (n - 1);
    const dfTotal = n * k - 1;
    
    // Mean Squares
    const msBetween = ssBetween / dfBetween;
    const msError = ssError / dfError;
    
    // F-statistic
    const F = msBetween / msError;
    
    // P-value
    const pValue = 1 - StatUtils.fCDF(F, dfBetween, dfError);
    
    // Effect sizes
    // Partial eta-squared
    const partialEtaSq = ssBetween / (ssBetween + ssError);
    
    // Generalized eta-squared
    const genEtaSq = ssBetween / (ssBetween + ssError + ssSubjects);
    
    // Omega-squared (less biased)
    const omegaSq = (ssBetween - dfBetween * msError) / (ssTotal + msError);
    
    // Sphericity check (Mauchly's test approximation)
    // Calculate variance-covariance matrix
    const covMatrix: number[][] = [];
    for (let j1 = 0; j1 < k; j1++) {
      covMatrix[j1] = [];
      for (let j2 = 0; j2 < k; j2++) {
        let cov = 0;
        for (let i = 0; i < n; i++) {
          cov += (validSubjects[i][j1] - conditionMeans[j1]) * 
                 (validSubjects[i][j2] - conditionMeans[j2]);
        }
        covMatrix[j1][j2] = cov / (n - 1);
      }
    }
    
    // Greenhouse-Geisser epsilon (approximation)
    const variances = covMatrix.map((row, i) => row[i]);
    const avgVariance = variances.reduce((a, b) => a + b, 0) / k;
    
    let sumCov = 0;
    for (let j1 = 0; j1 < k; j1++) {
      for (let j2 = 0; j2 < k; j2++) {
        sumCov += covMatrix[j1][j2];
      }
    }
    const avgCov = sumCov / (k * k);
    
    // Simplified GG epsilon calculation
    const numerator = Math.pow(avgVariance - avgCov, 2) * k * k;
    let denominator = 0;
    for (let j1 = 0; j1 < k; j1++) {
      for (let j2 = 0; j2 < k; j2++) {
        denominator += Math.pow(covMatrix[j1][j2] - avgCov, 2);
      }
    }
    denominator *= (k - 1);
    
    const ggEpsilon = Math.min(1, Math.max(1 / (k - 1), numerator / (denominator || 1)));
    
    // Corrected degrees of freedom
    const dfBetweenCorrected = dfBetween * ggEpsilon;
    const dfErrorCorrected = dfError * ggEpsilon;
    const pValueCorrected = 1 - StatUtils.fCDF(F, dfBetweenCorrected, dfErrorCorrected);
    
    const significant = pValue < spec.alpha;
    const sphericityViolated = ggEpsilon < 0.75;
    
    const parameters = [
      { name: "F", estimate: F, testStatistic: F, testType: "F", df: dfBetween, pValue },
      { name: "df (between)", estimate: dfBetween },
      { name: "df (error)", estimate: dfError },
      { name: "SS (between)", estimate: ssBetween },
      { name: "SS (error)", estimate: ssError },
      { name: "MS (between)", estimate: msBetween },
      { name: "MS (error)", estimate: msError },
      { name: "Greenhouse-Geisser ε", estimate: ggEpsilon },
      { name: "Corrected p-value (GG)", estimate: pValueCorrected }
    ];
    
    // Add condition means
    conditions.forEach((cond, i) => {
      parameters.push({ name: `Mean (${cond})`, estimate: conditionMeans[i] });
    });
    
    // Interpretation of effect size
    let effectInterpretation: string;
    if (partialEtaSq >= 0.14) effectInterpretation = "large";
    else if (partialEtaSq >= 0.06) effectInterpretation = "medium";
    else effectInterpretation = "small";
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "eta_squared",
          value: partialEtaSq,
          interpretation: effectInterpretation as any
        },
        {
          type: "omega_squared",
          value: omegaSq
        }
      ],
      testStatistic: F,
      testType: "F",
      df: [dfBetween, dfError],
      pValue: sphericityViolated ? pValueCorrected : pValue,
      conclusion: `F(${dfBetween}, ${dfError}) = ${F.toFixed(3)}, p = ${(sphericityViolated ? pValueCorrected : pValue).toFixed(4)}, η²p = ${partialEtaSq.toFixed(3)}${sphericityViolated ? " (GG corrected)" : ""}`,
      interpretation: `A repeated measures ANOVA was conducted to compare ${conditions.join(", ")}. ${sphericityViolated ? `Mauchly's test indicated that sphericity was violated (ε = ${ggEpsilon.toFixed(2)}), so Greenhouse-Geisser corrected values are reported. ` : ""}There was a ${significant ? "statistically significant" : "non-significant"} effect of condition on the outcome, F(${sphericityViolated ? dfBetweenCorrected.toFixed(1) + ", " + dfErrorCorrected.toFixed(1) : dfBetween + ", " + dfError}) = ${F.toFixed(2)}, p = ${(sphericityViolated ? pValueCorrected : pValue) < 0.001 ? "< .001" : (sphericityViolated ? pValueCorrected : pValue).toFixed(3)}, partial η² = ${partialEtaSq.toFixed(2)}. This represents a ${effectInterpretation} effect.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "sphericity", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}
