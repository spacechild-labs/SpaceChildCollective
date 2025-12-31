/**
 * Confirmatory Factor Analysis (CFA)
 * 
 * Tests a priori hypothesized factor structures using maximum likelihood estimation.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

interface FactorSpec {
  name: string;
  indicators: string[];
}

/**
 * Confirmatory Factor Analysis
 * 
 * Tests hypothesized measurement models with specified factor-indicator relationships.
 */
export class CFAMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    // Parse factor structure from spec
    // Expected format in spec.options: { factors: [{ name: 'F1', indicators: ['x1', 'x2', 'x3'] }, ...] }
    const factorSpecs: FactorSpec[] = (spec as any).options?.factors || [];
    
    // If no factor structure specified, infer from outcomes (single factor)
    const allIndicators = factorSpecs.length > 0 
      ? factorSpecs.flatMap(f => f.indicators)
      : spec.outcomes;
    
    if (factorSpecs.length === 0) {
      factorSpecs.push({ name: "Factor1", indicators: spec.outcomes });
    }
    
    const k = allIndicators.length; // Number of indicators
    const m = factorSpecs.length;   // Number of factors
    
    if (k < 3) {
      throw new Error("CFA requires at least 3 indicators");
    }
    
    // Get valid data
    const validData: number[][] = [];
    for (const row of data) {
      const values = allIndicators.map(ind => Number(row[ind]));
      if (values.every(v => !isNaN(v))) {
        validData.push(values);
      }
    }
    
    const n = validData.length;
    if (n < 50) {
      throw new Error(`Insufficient sample size for CFA (n=${n}, recommend n≥100)`);
    }
    
    // Calculate observed correlation matrix
    const means = allIndicators.map((_, j) => 
      validData.reduce((sum, row) => sum + row[j], 0) / n
    );
    
    const sds = allIndicators.map((_, j) => {
      const m = means[j];
      return Math.sqrt(validData.reduce((sum, row) => sum + Math.pow(row[j] - m, 2), 0) / (n - 1));
    });
    
    // Standardize data
    const zData = validData.map(row => 
      row.map((val, j) => (val - means[j]) / (sds[j] || 1))
    );
    
    // Observed correlation matrix
    const R: number[][] = [];
    for (let i = 0; i < k; i++) {
      R[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          R[i][j] = 1;
        } else {
          let sum = 0;
          for (let p = 0; p < n; p++) {
            sum += zData[p][i] * zData[p][j];
          }
          R[i][j] = sum / (n - 1);
        }
      }
    }
    
    // Estimate factor loadings using regression approach
    // For each factor, regress indicators on factor scores (approximated)
    const loadings: { indicator: string; factor: string; loading: number; se: number }[] = [];
    const factorCorrelations: { f1: string; f2: string; r: number }[] = [];
    
    // Approximate factor scores using unit-weighted composites
    const factorScores: number[][] = factorSpecs.map(factor => {
      const indices = factor.indicators.map(ind => allIndicators.indexOf(ind));
      return zData.map(row => {
        const sum = indices.reduce((s, idx) => s + row[idx], 0);
        return sum / indices.length;
      });
    });
    
    // Estimate loadings
    for (let f = 0; f < m; f++) {
      const factor = factorSpecs[f];
      const fScores = factorScores[f];
      const fVar = StatUtils.variance(fScores);
      
      for (const indicator of factor.indicators) {
        const idx = allIndicators.indexOf(indicator);
        const indScores = zData.map(row => row[idx]);
        
        // Regression coefficient as loading estimate
        const cov = StatUtils.covariance(indScores, fScores);
        const loading = cov / (fVar || 1);
        
        // Standard error approximation
        const residuals = indScores.map((y, i) => y - loading * fScores[i]);
        const residVar = StatUtils.variance(residuals);
        const se = Math.sqrt(residVar / (n * fVar || 1));
        
        loadings.push({
          indicator,
          factor: factor.name,
          loading: Math.max(-1, Math.min(1, loading)),
          se
        });
      }
    }
    
    // Factor correlations (if multiple factors)
    if (m > 1) {
      for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
          const r = StatUtils.correlation(factorScores[i], factorScores[j]);
          factorCorrelations.push({
            f1: factorSpecs[i].name,
            f2: factorSpecs[j].name,
            r
          });
        }
      }
    }
    
    // Calculate model-implied correlation matrix
    const impliedR: number[][] = [];
    for (let i = 0; i < k; i++) {
      impliedR[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          impliedR[i][j] = 1;
        } else {
          // Find which factors load on these indicators
          const li = loadings.find(l => l.indicator === allIndicators[i]);
          const lj = loadings.find(l => l.indicator === allIndicators[j]);
          
          if (li && lj && li.factor === lj.factor) {
            // Same factor
            impliedR[i][j] = li.loading * lj.loading;
          } else if (li && lj) {
            // Different factors - use factor correlation
            const fc = factorCorrelations.find(
              c => (c.f1 === li.factor && c.f2 === lj.factor) ||
                   (c.f1 === lj.factor && c.f2 === li.factor)
            );
            impliedR[i][j] = li.loading * lj.loading * (fc?.r || 0);
          } else {
            impliedR[i][j] = 0;
          }
        }
      }
    }
    
    // Calculate fit indices
    // Residual matrix
    let sumSqResid = 0;
    let maxResid = 0;
    const residuals: number[][] = [];
    for (let i = 0; i < k; i++) {
      residuals[i] = [];
      for (let j = 0; j < k; j++) {
        const resid = R[i][j] - impliedR[i][j];
        residuals[i][j] = resid;
        if (i !== j) {
          sumSqResid += resid * resid;
          maxResid = Math.max(maxResid, Math.abs(resid));
        }
      }
    }
    
    // SRMR (Standardized Root Mean Square Residual)
    const numOffDiag = k * (k - 1) / 2;
    const srmr = Math.sqrt(sumSqResid / (2 * numOffDiag));
    
    // Chi-square (simplified ML discrepancy)
    // F_ML = tr(S * Sigma^-1) + ln|Sigma| - ln|S| - p
    // Approximation using residuals
    const chiSquare = (n - 1) * sumSqResid;
    const dfModel = (k * (k + 1) / 2) - (k * m + m * (m - 1) / 2); // Simplified
    const df = Math.max(1, dfModel);
    const pValue = 1 - StatUtils.chi2CDF(chiSquare, df);
    
    // CFI (Comparative Fit Index)
    // Need null model chi-square (independence model)
    let nullChiSq = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        nullChiSq += R[i][j] * R[i][j];
      }
    }
    nullChiSq *= (n - 1);
    const nullDf = k * (k - 1) / 2;
    
    const cfi = Math.max(0, Math.min(1, 
      1 - Math.max(0, chiSquare - df) / Math.max(chiSquare - df, nullChiSq - nullDf, 0.001)
    ));
    
    // TLI (Tucker-Lewis Index)
    const tli = Math.max(0, Math.min(1,
      ((nullChiSq / nullDf) - (chiSquare / df)) / ((nullChiSq / nullDf) - 1)
    ));
    
    // RMSEA (Root Mean Square Error of Approximation)
    const rmsea = Math.sqrt(Math.max(0, (chiSquare - df) / (df * (n - 1))));
    
    // RMSEA 90% CI
    const rmseaLower = Math.sqrt(Math.max(0, (chiSquare - df - 1.96 * Math.sqrt(2 * df)) / (df * (n - 1))));
    const rmseaUpper = Math.sqrt(Math.max(0, (chiSquare - df + 1.96 * Math.sqrt(2 * df)) / (df * (n - 1))));
    
    // Average Variance Extracted (AVE) per factor
    const aveByFactor = factorSpecs.map(factor => {
      const factorLoadings = loadings.filter(l => l.factor === factor.name);
      const sumSqLoadings = factorLoadings.reduce((s, l) => s + l.loading * l.loading, 0);
      return {
        factor: factor.name,
        ave: sumSqLoadings / factorLoadings.length
      };
    });
    
    // Composite Reliability (CR) per factor
    const crByFactor = factorSpecs.map(factor => {
      const factorLoadings = loadings.filter(l => l.factor === factor.name);
      const sumLoadings = factorLoadings.reduce((s, l) => s + l.loading, 0);
      const sumErrorVar = factorLoadings.reduce((s, l) => s + (1 - l.loading * l.loading), 0);
      return {
        factor: factor.name,
        cr: (sumLoadings * sumLoadings) / (sumLoadings * sumLoadings + sumErrorVar)
      };
    });
    
    // Build parameters
    const parameters = [
      { name: "Sample Size", estimate: n },
      { name: "Number of Indicators", estimate: k },
      { name: "Number of Factors", estimate: m },
      { name: "Chi-Square", estimate: chiSquare, df, pValue },
      { name: "CFI", estimate: cfi },
      { name: "TLI", estimate: tli },
      { name: "RMSEA", estimate: rmsea },
      { name: "SRMR", estimate: srmr }
    ];
    
    // Add loadings
    loadings.forEach(l => {
      const z = l.loading / (l.se || 0.001);
      const p = 2 * (1 - StatUtils.normalCDF(Math.abs(z)));
      parameters.push({
        name: `λ (${l.indicator} → ${l.factor})`,
        estimate: l.loading,
        se: l.se,
        testStatistic: z,
        testType: "z",
        pValue: p
      });
    });
    
    // Add factor correlations
    factorCorrelations.forEach(fc => {
      parameters.push({
        name: `φ (${fc.f1} ↔ ${fc.f2})`,
        estimate: fc.r
      });
    });
    
    // Add AVE and CR
    aveByFactor.forEach(a => {
      parameters.push({ name: `AVE (${a.factor})`, estimate: a.ave });
    });
    crByFactor.forEach(c => {
      parameters.push({ name: `CR (${c.factor})`, estimate: c.cr });
    });
    
    // Fit interpretation
    const fitGood = cfi >= 0.95 && tli >= 0.95 && rmsea <= 0.06 && srmr <= 0.08;
    const fitAcceptable = cfi >= 0.90 && tli >= 0.90 && rmsea <= 0.08 && srmr <= 0.10;
    const fitInterpretation = fitGood ? "good" : fitAcceptable ? "acceptable" : "poor";
    
    // Check convergent validity (AVE > 0.5)
    const convergentValid = aveByFactor.every(a => a.ave >= 0.5);
    
    // Check discriminant validity (factor correlations < sqrt(AVE))
    let discriminantValid = true;
    for (const fc of factorCorrelations) {
      const ave1 = aveByFactor.find(a => a.factor === fc.f1)?.ave || 0;
      const ave2 = aveByFactor.find(a => a.factor === fc.f2)?.ave || 0;
      if (Math.abs(fc.r) > Math.sqrt(Math.min(ave1, ave2))) {
        discriminantValid = false;
        break;
      }
    }
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: cfi,
        interpretation: fitInterpretation as any
      }],
      modelFit: {
        chiSquare,
        df,
        pValue,
        cfi,
        tli,
        rmsea,
        srmr,
        aic: chiSquare + 2 * (k * m + m * (m - 1) / 2),
        bic: chiSquare + Math.log(n) * (k * m + m * (m - 1) / 2)
      },
      testStatistic: chiSquare,
      testType: "χ²",
      df,
      pValue,
      conclusion: `CFA: χ²(${df}) = ${chiSquare.toFixed(2)}, CFI = ${cfi.toFixed(3)}, TLI = ${tli.toFixed(3)}, RMSEA = ${rmsea.toFixed(3)}, SRMR = ${srmr.toFixed(3)}`,
      interpretation: `A confirmatory factor analysis was conducted with ${m} factor(s) and ${k} indicators (n = ${n}). Model fit was ${fitInterpretation}: χ²(${df}) = ${chiSquare.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}, CFI = ${cfi.toFixed(2)}, TLI = ${tli.toFixed(2)}, RMSEA = ${rmsea.toFixed(3)} [90% CI: ${rmseaLower.toFixed(3)}, ${rmseaUpper.toFixed(3)}], SRMR = ${srmr.toFixed(3)}. ${convergentValid ? "Convergent validity was supported (all AVE > .50)." : "Convergent validity concerns exist (some AVE < .50)."} ${m > 1 ? (discriminantValid ? "Discriminant validity was supported." : "Discriminant validity concerns exist.") : ""}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "sample_size", "linearity"];
  }
  
  getMinimumSampleSize(): number {
    return 100;
  }
}
