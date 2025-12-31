/**
 * Mixed Effects / Multilevel Models
 * 
 * Linear mixed models for hierarchical/nested data structures.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Linear Mixed Effects Model (Random Intercept)
 * 
 * Handles nested/clustered data with random intercepts for groups.
 * y_ij = β0 + β1*x_ij + u_j + e_ij
 */
export class MixedEffectsMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0];
    const predictor = spec.predictors?.[0];
    const groupVar = spec.groupingVariables?.[0] || (spec as any).options?.cluster;
    
    if (!outcome) {
      throw new Error("Mixed effects model requires an outcome variable");
    }
    if (!groupVar) {
      throw new Error("Mixed effects model requires a grouping/cluster variable");
    }
    
    // Get valid data
    const validData: { y: number; x: number; group: string }[] = [];
    for (const row of data) {
      const y = Number(row[outcome]);
      const x = predictor ? Number(row[predictor]) : 0;
      const group = String(row[groupVar]);
      
      if (!isNaN(y) && !isNaN(x) && group) {
        validData.push({ y, x, group });
      }
    }
    
    const n = validData.length;
    const groups = [...new Set(validData.map(d => d.group))];
    const J = groups.length; // Number of groups
    
    if (n < 30) {
      throw new Error(`Insufficient sample size for mixed model (n=${n}, need at least 30)`);
    }
    if (J < 5) {
      throw new Error(`Insufficient number of groups (J=${J}, need at least 5)`);
    }
    
    // Calculate group-level statistics
    const groupStats = groups.map(g => {
      const groupData = validData.filter(d => d.group === g);
      const nj = groupData.length;
      const yMean = groupData.reduce((s, d) => s + d.y, 0) / nj;
      const xMean = predictor ? groupData.reduce((s, d) => s + d.x, 0) / nj : 0;
      return { group: g, nj, yMean, xMean, data: groupData };
    });
    
    // Grand means
    const grandMeanY = validData.reduce((s, d) => s + d.y, 0) / n;
    const grandMeanX = predictor ? validData.reduce((s, d) => s + d.x, 0) / n : 0;
    
    // Estimate fixed effects using OLS on group-mean centered data
    let beta0 = grandMeanY;
    let beta1 = 0;
    
    if (predictor) {
      // Calculate slope
      let sumXY = 0, sumXX = 0;
      for (const d of validData) {
        const xc = d.x - grandMeanX;
        const yc = d.y - grandMeanY;
        sumXY += xc * yc;
        sumXX += xc * xc;
      }
      beta1 = sumXX > 0 ? sumXY / sumXX : 0;
      beta0 = grandMeanY - beta1 * grandMeanX;
    }
    
    // Calculate residuals and estimate variance components
    const residuals = validData.map(d => d.y - (beta0 + beta1 * d.x));
    
    // Group-level residuals (random effects)
    const groupResiduals = groupStats.map(gs => {
      const groupResid = gs.data.map(d => d.y - (beta0 + beta1 * d.x));
      return {
        group: gs.group,
        mean: groupResid.reduce((s, r) => s + r, 0) / gs.nj
      };
    });
    
    // Variance components estimation (method of moments)
    // Between-group variance
    const betweenVar = StatUtils.variance(groupResiduals.map(gr => gr.mean));
    
    // Within-group variance
    let withinSS = 0;
    let withinDF = 0;
    for (const gs of groupStats) {
      const groupMeanResid = groupResiduals.find(gr => gr.group === gs.group)?.mean || 0;
      for (const d of gs.data) {
        const resid = d.y - (beta0 + beta1 * d.x);
        withinSS += Math.pow(resid - groupMeanResid, 2);
      }
      withinDF += gs.nj - 1;
    }
    const withinVar = withinSS / withinDF;
    
    // Random intercept variance (tau^2)
    const avgGroupSize = n / J;
    const tau2 = Math.max(0, betweenVar - withinVar / avgGroupSize);
    
    // Residual variance (sigma^2)
    const sigma2 = withinVar;
    
    // Intraclass Correlation Coefficient (ICC)
    const icc = tau2 / (tau2 + sigma2);
    
    // Standard errors for fixed effects (approximate)
    const seBeta0 = Math.sqrt(sigma2 / n + tau2 / J);
    let seBeta1 = 0;
    if (predictor) {
      const sumXX = validData.reduce((s, d) => s + Math.pow(d.x - grandMeanX, 2), 0);
      seBeta1 = Math.sqrt(sigma2 / sumXX);
    }
    
    // Test statistics
    const tBeta0 = beta0 / seBeta0;
    const tBeta1 = predictor && seBeta1 > 0 ? beta1 / seBeta1 : 0;
    
    // Degrees of freedom (Satterthwaite approximation simplified)
    const dfBeta0 = J - 1;
    const dfBeta1 = n - J - 1;
    
    // P-values
    const pBeta0 = 2 * StatUtils.tPValue(Math.abs(tBeta0), dfBeta0);
    const pBeta1 = predictor ? 2 * StatUtils.tPValue(Math.abs(tBeta1), dfBeta1) : 1;
    
    // Model fit
    // Conditional R² (variance explained by fixed + random effects)
    const totalVar = StatUtils.variance(validData.map(d => d.y));
    const conditionalR2 = 1 - sigma2 / totalVar;
    
    // Marginal R² (variance explained by fixed effects only)
    const fixedPredicted = validData.map(d => beta0 + beta1 * d.x);
    const fixedVar = StatUtils.variance(fixedPredicted);
    const marginalR2 = fixedVar / totalVar;
    
    // Log-likelihood (approximate)
    const logLik = -n/2 * (Math.log(2 * Math.PI) + Math.log(sigma2) + 1);
    
    // AIC and BIC
    const numParams = predictor ? 4 : 3; // beta0, (beta1), tau2, sigma2
    const aic = -2 * logLik + 2 * numParams;
    const bic = -2 * logLik + Math.log(n) * numParams;
    
    // Build parameters
    const parameters = [
      { 
        name: "Intercept (β₀)", 
        estimate: beta0, 
        se: seBeta0, 
        testStatistic: tBeta0, 
        testType: "t", 
        df: dfBeta0, 
        pValue: pBeta0 
      }
    ];
    
    if (predictor) {
      parameters.push({
        name: `Slope (β₁: ${predictor})`,
        estimate: beta1,
        se: seBeta1,
        testStatistic: tBeta1,
        testType: "t",
        df: dfBeta1,
        pValue: pBeta1
      });
    }
    
    parameters.push(
      { name: "Random Intercept Variance (τ²)", estimate: tau2 },
      { name: "Residual Variance (σ²)", estimate: sigma2 },
      { name: "ICC", estimate: icc },
      { name: "Number of Groups", estimate: J },
      { name: "Average Group Size", estimate: avgGroupSize },
      { name: "Marginal R²", estimate: marginalR2 },
      { name: "Conditional R²", estimate: conditionalR2 }
    );
    
    // Interpretation
    const iccInterpretation = icc > 0.25 ? "substantial" : icc > 0.10 ? "moderate" : "small";
    const slopeSignificant = predictor && pBeta1 < spec.alpha;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "r_squared",
          value: conditionalR2,
          interpretation: conditionalR2 > 0.26 ? "large" : conditionalR2 > 0.13 ? "medium" : "small" as any
        }
      ],
      modelFit: {
        rSquared: conditionalR2,
        aic,
        bic
      },
      conclusion: `Mixed model: ICC = ${icc.toFixed(3)}, ${predictor ? `β₁ = ${beta1.toFixed(3)} (p = ${pBeta1.toFixed(4)}), ` : ""}R²_conditional = ${conditionalR2.toFixed(3)}`,
      interpretation: `A linear mixed effects model was fitted with ${outcome} as the outcome${predictor ? `, ${predictor} as a fixed effect predictor,` : ""} and random intercepts for ${groupVar} (${J} groups, average n = ${avgGroupSize.toFixed(1)}). The intraclass correlation coefficient (ICC = ${icc.toFixed(2)}) indicated ${iccInterpretation} clustering, justifying the multilevel approach.${predictor ? ` The effect of ${predictor} was ${slopeSignificant ? "statistically significant" : "not statistically significant"}, β = ${beta1.toFixed(3)}, SE = ${seBeta1.toFixed(3)}, t(${dfBeta1}) = ${tBeta1.toFixed(2)}, p = ${pBeta1 < 0.001 ? "< .001" : pBeta1.toFixed(3)}.` : ""} The model explained ${(conditionalR2 * 100).toFixed(1)}% of the variance (conditional R²), with ${(marginalR2 * 100).toFixed(1)}% attributable to fixed effects (marginal R²).`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "independence", "linearity", "homoscedasticity"];
  }
  
  getMinimumSampleSize(): number {
    return 50;
  }
}
