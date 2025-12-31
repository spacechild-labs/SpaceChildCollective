/**
 * Regression Methods
 * 
 * Linear regression implementation.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Simple Linear Regression
 */
export class LinearRegressionMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const predictors = spec.predictors || [];
    
    if (predictors.length === 0) {
      throw new Error("Linear regression requires at least one predictor");
    }
    
    // For now, implement simple linear regression (single predictor)
    if (predictors.length > 1) {
      throw new Error("Multiple regression not yet implemented. Use single predictor.");
    }
    
    const predictor = predictors[0];
    
    // Get valid pairs
    const pairs = data
      .map(d => ({ x: Number(d[predictor]), y: Number(d[outcome]) }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));
    
    const n = pairs.length;
    if (n < 3) {
      throw new Error("Insufficient data for regression");
    }
    
    const x = pairs.map(p => p.x);
    const y = pairs.map(p => p.y);
    
    const xMean = StatUtils.mean(x);
    const yMean = StatUtils.mean(y);
    
    // Calculate regression coefficients
    const ssXY = x.reduce((sum, xi, i) => sum + (xi - xMean) * (y[i] - yMean), 0);
    const ssX = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
    const ssY = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    
    const b1 = ssXY / ssX;  // Slope
    const b0 = yMean - b1 * xMean;  // Intercept
    
    // Predicted values and residuals
    const predicted = x.map(xi => b0 + b1 * xi);
    const residuals = y.map((yi, i) => yi - predicted[i]);
    
    // Sum of squares
    const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
    const ssReg = predicted.reduce((sum, p) => sum + Math.pow(p - yMean, 2), 0);
    
    // R-squared
    const rSquared = 1 - ssRes / ssY;
    const adjRSquared = 1 - (1 - rSquared) * (n - 1) / (n - 2);
    
    // Correlation
    const r = ssXY / Math.sqrt(ssX * ssY);
    
    // Standard errors
    const mse = ssRes / (n - 2);
    const seB1 = Math.sqrt(mse / ssX);
    const seB0 = Math.sqrt(mse * (1/n + xMean * xMean / ssX));
    
    // T-tests for coefficients
    const tB1 = b1 / seB1;
    const tB0 = b0 / seB0;
    const df = n - 2;
    
    const pB1 = StatUtils.tPValue(tB1, df);
    const pB0 = StatUtils.tPValue(tB0, df);
    
    // F-test for overall model
    const F = (ssReg / 1) / (ssRes / (n - 2));
    const pF = 1 - StatUtils.fCDF(F, 1, n - 2);
    
    // Confidence intervals
    const tCrit = 1.96;
    const ciB0 = { lower: b0 - tCrit * seB0, upper: b0 + tCrit * seB0, level: 0.95 };
    const ciB1 = { lower: b1 - tCrit * seB1, upper: b1 + tCrit * seB1, level: 0.95 };
    
    const significant = pF < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters: [
        {
          name: "Intercept",
          estimate: b0,
          se: seB0,
          ci: ciB0,
          testStatistic: tB0,
          testType: "t",
          df,
          pValue: pB0
        },
        {
          name: predictor,
          estimate: b1,
          se: seB1,
          ci: ciB1,
          testStatistic: tB1,
          testType: "t",
          df,
          pValue: pB1,
          standardized: r  // Standardized coefficient equals r for simple regression
        }
      ],
      effectSizes: [
        {
          type: "r",
          value: r,
          interpretation: StatUtils.interpretR(r)
        },
        {
          type: "r_squared",
          value: rSquared
        }
      ],
      modelFit: {
        rSquared,
        adjustedRSquared: adjRSquared,
        aic: n * Math.log(ssRes / n) + 2 * 2,  // 2 parameters
        bic: n * Math.log(ssRes / n) + 2 * Math.log(n)
      },
      testStatistic: F,
      testType: "F",
      df: [1, n - 2],
      pValue: pF,
      conclusion: `R² = ${rSquared.toFixed(3)}, F(1, ${n - 2}) = ${F.toFixed(3)}, p = ${pF.toFixed(4)}`,
      interpretation: `A simple linear regression was calculated to predict ${outcome} based on ${predictor}. A ${significant ? "significant" : "non-significant"} regression equation was found (F(1, ${n - 2}) = ${F.toFixed(2)}, p = ${pF.toFixed(3)}), with an R² of ${rSquared.toFixed(3)}. Participants' predicted ${outcome} is equal to ${b0.toFixed(3)} + ${b1.toFixed(3)}(${predictor}). ${outcome} ${b1 > 0 ? "increased" : "decreased"} ${Math.abs(b1).toFixed(3)} units for each unit increase in ${predictor}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "homoscedasticity", "linearity", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 30;
  }
}
