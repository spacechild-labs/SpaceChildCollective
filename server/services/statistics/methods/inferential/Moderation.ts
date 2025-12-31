/**
 * Moderation Analysis
 * 
 * Tests interaction effects where a moderator variable affects
 * the relationship between predictor and outcome.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Moderation Analysis (Interaction Effects)
 * 
 * Tests whether W moderates the relationship between X and Y.
 * Y = b0 + b1*X + b2*W + b3*X*W + e
 * 
 * If b3 is significant, moderation is present.
 */
export class ModerationMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0]; // Y
    const predictor = spec.predictors?.[0]; // X
    const moderator = spec.predictors?.[1] || (spec as any).options?.moderator; // W
    
    if (!outcome || !predictor || !moderator) {
      throw new Error("Moderation analysis requires outcome (Y), predictor (X), and moderator (W)");
    }
    
    // Get valid data
    const validData: { x: number; w: number; y: number }[] = [];
    for (const row of data) {
      const x = Number(row[predictor]);
      const w = Number(row[moderator]);
      const y = Number(row[outcome]);
      
      if (!isNaN(x) && !isNaN(w) && !isNaN(y)) {
        validData.push({ x, w, y });
      }
    }
    
    const n = validData.length;
    if (n < 30) {
      throw new Error(`Insufficient sample size for moderation (n=${n}, need at least 30)`);
    }
    
    // Center predictors (mean-centering for interpretability)
    const meanX = StatUtils.mean(validData.map(d => d.x));
    const meanW = StatUtils.mean(validData.map(d => d.w));
    const meanY = StatUtils.mean(validData.map(d => d.y));
    
    const centeredData = validData.map(d => ({
      x: d.x - meanX,
      w: d.w - meanW,
      y: d.y,
      xw: (d.x - meanX) * (d.w - meanW) // Interaction term
    }));
    
    // Multiple regression: Y = b0 + b1*X + b2*W + b3*X*W
    // Using normal equations (X'X)^-1 * X'Y
    
    // Build design matrix columns
    const ones = centeredData.map(() => 1);
    const xs = centeredData.map(d => d.x);
    const ws = centeredData.map(d => d.w);
    const xws = centeredData.map(d => d.xw);
    const ys = centeredData.map(d => d.y);
    
    // Calculate X'X matrix (4x4)
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumW = ws.reduce((a, b) => a + b, 0);
    const sumXW = xws.reduce((a, b) => a + b, 0);
    const sumXX = xs.reduce((a, b, i) => a + b * xs[i], 0);
    const sumWW = ws.reduce((a, b, i) => a + b * ws[i], 0);
    const sumXWXW = xws.reduce((a, b, i) => a + b * xws[i], 0);
    const sumXXW = xs.reduce((a, b, i) => a + b * xws[i], 0);
    const sumWXW = ws.reduce((a, b, i) => a + b * xws[i], 0);
    const sumXW_cross = xs.reduce((a, b, i) => a + b * ws[i], 0);
    
    // X'Y vector
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, b, i) => a + b * ys[i], 0);
    const sumWY = ws.reduce((a, b, i) => a + b * ys[i], 0);
    const sumXWY = xws.reduce((a, b, i) => a + b * ys[i], 0);
    
    // Solve using simplified approach (since X and W are centered, some terms simplify)
    // For centered predictors: sumX ≈ 0, sumW ≈ 0
    
    // Variance-covariance matrix elements
    const varX = sumXX / n;
    const varW = sumWW / n;
    const varXW = sumXWXW / n;
    const covXW = sumXW_cross / n;
    const covXXW = sumXXW / n;
    const covWXW = sumWXW / n;
    
    // Simplified regression coefficients
    const b0 = meanY; // Intercept (at mean of X and W)
    
    // For main effects and interaction, solve 3x3 system
    // Using matrix inversion approximation
    const det3 = varX * varW * varXW + 2 * covXW * covXXW * covWXW -
                 varX * covWXW * covWXW - varW * covXXW * covXXW - varXW * covXW * covXW;
    
    // If near-singular, use simpler approach
    let b1: number, b2: number, b3: number;
    
    if (Math.abs(det3) < 1e-10) {
      // Fallback: sequential regression
      b1 = sumXY / sumXX;
      b2 = sumWY / sumWW;
      b3 = sumXWY / sumXWXW;
    } else {
      // Full solution
      const covXY = sumXY / n;
      const covWY = sumWY / n;
      const covXWY = sumXWY / n;
      
      // Approximate solution
      b3 = (covXWY - b1 * covXXW - b2 * covWXW) / (varXW || 0.001);
      b1 = (covXY - b3 * covXXW) / (varX || 0.001);
      b2 = (covWY - b3 * covWXW) / (varW || 0.001);
      
      // Iterative refinement
      for (let iter = 0; iter < 5; iter++) {
        b1 = (covXY - b2 * covXW - b3 * covXXW) / (varX || 0.001);
        b2 = (covWY - b1 * covXW - b3 * covWXW) / (varW || 0.001);
        b3 = (covXWY - b1 * covXXW - b2 * covWXW) / (varXW || 0.001);
      }
    }
    
    // Calculate residuals and MSE
    const predicted = centeredData.map(d => b0 + b1 * d.x + b2 * d.w + b3 * d.xw);
    const residuals = ys.map((y, i) => y - predicted[i]);
    const sse = residuals.reduce((a, r) => a + r * r, 0);
    const mse = sse / (n - 4);
    
    // Total SS
    const sst = ys.reduce((a, y) => a + Math.pow(y - meanY, 2), 0);
    const rSquared = 1 - sse / sst;
    
    // Standard errors (approximate)
    const seB1 = Math.sqrt(mse / (sumXX || 1));
    const seB2 = Math.sqrt(mse / (sumWW || 1));
    const seB3 = Math.sqrt(mse / (sumXWXW || 1));
    
    // T-tests
    const tB1 = b1 / seB1;
    const tB2 = b2 / seB2;
    const tB3 = b3 / seB3;
    const df = n - 4;
    
    const pB1 = 2 * StatUtils.tPValue(Math.abs(tB1), df);
    const pB2 = 2 * StatUtils.tPValue(Math.abs(tB2), df);
    const pB3 = 2 * StatUtils.tPValue(Math.abs(tB3), df);
    
    // F-test for overall model
    const ssr = sst - sse;
    const F = (ssr / 3) / mse;
    const pF = 1 - StatUtils.fCDF(F, 3, df);
    
    // F-test for interaction (change in R² when adding interaction)
    // Model without interaction
    const b1_main = sumXY / sumXX;
    const b2_main = sumWY / sumWW;
    const predicted_main = centeredData.map(d => meanY + b1_main * d.x + b2_main * d.w);
    const sse_main = ys.reduce((a, y, i) => a + Math.pow(y - predicted_main[i], 2), 0);
    const rSq_main = 1 - sse_main / sst;
    
    const deltaR2 = rSquared - rSq_main;
    const fInteraction = (deltaR2 / (1 - rSquared)) * (df / 1);
    const pInteraction = 1 - StatUtils.fCDF(fInteraction, 1, df);
    
    // Simple slopes analysis (at ±1 SD of moderator)
    const sdW = StatUtils.sd(validData.map(d => d.w));
    const slopeAtLowW = b1 + b3 * (-sdW);
    const slopeAtMeanW = b1;
    const slopeAtHighW = b1 + b3 * sdW;
    
    // SE for simple slopes
    const seSimpleSlope = Math.sqrt(seB1 * seB1 + sdW * sdW * seB3 * seB3);
    const tLowW = slopeAtLowW / seSimpleSlope;
    const tHighW = slopeAtHighW / seSimpleSlope;
    const pLowW = 2 * StatUtils.tPValue(Math.abs(tLowW), df);
    const pHighW = 2 * StatUtils.tPValue(Math.abs(tHighW), df);
    
    const moderationSignificant = pB3 < spec.alpha;
    
    const parameters = [
      { name: "Intercept (b₀)", estimate: b0 },
      { name: `Main Effect: ${predictor} (b₁)`, estimate: b1, se: seB1, testStatistic: tB1, testType: "t", df, pValue: pB1 },
      { name: `Main Effect: ${moderator} (b₂)`, estimate: b2, se: seB2, testStatistic: tB2, testType: "t", df, pValue: pB2 },
      { name: `Interaction: ${predictor}×${moderator} (b₃)`, estimate: b3, se: seB3, testStatistic: tB3, testType: "t", df, pValue: pB3 },
      { name: "R²", estimate: rSquared },
      { name: "ΔR² (interaction)", estimate: deltaR2 },
      { name: "F (interaction)", estimate: fInteraction, testStatistic: fInteraction, testType: "F", df: 1, pValue: pInteraction },
      { name: `Simple Slope at Low ${moderator} (-1 SD)`, estimate: slopeAtLowW, pValue: pLowW },
      { name: `Simple Slope at Mean ${moderator}`, estimate: slopeAtMeanW, pValue: pB1 },
      { name: `Simple Slope at High ${moderator} (+1 SD)`, estimate: slopeAtHighW, pValue: pHighW },
      { name: "Sample Size", estimate: n }
    ];
    
    // Effect size for interaction (f²)
    const f2 = deltaR2 / (1 - rSquared);
    let f2Interpretation: string;
    if (f2 >= 0.35) f2Interpretation = "large";
    else if (f2 >= 0.15) f2Interpretation = "medium";
    else if (f2 >= 0.02) f2Interpretation = "small";
    else f2Interpretation = "negligible";
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "r_squared",
          value: rSquared,
          interpretation: rSquared > 0.26 ? "large" : rSquared > 0.13 ? "medium" : "small" as any
        },
        {
          type: "other",
          value: f2,
          interpretation: f2Interpretation as any
        }
      ],
      modelFit: {
        rSquared,
        fStatistic: F,
        pValue: pF
      },
      testStatistic: tB3,
      testType: "t",
      df,
      pValue: pB3,
      conclusion: `Moderation: b₃ = ${b3.toFixed(4)}, t(${df}) = ${tB3.toFixed(2)}, p = ${pB3.toFixed(4)}, ΔR² = ${deltaR2.toFixed(3)}`,
      interpretation: `A moderation analysis tested whether ${moderator} moderates the effect of ${predictor} on ${outcome}. The overall model was significant, F(3, ${df}) = ${F.toFixed(2)}, p ${pF < 0.001 ? "< .001" : "= " + pF.toFixed(3)}, R² = ${rSquared.toFixed(2)}. The interaction effect was ${moderationSignificant ? "statistically significant" : "not statistically significant"}, b = ${b3.toFixed(3)}, t(${df}) = ${tB3.toFixed(2)}, p = ${pB3 < 0.001 ? "< .001" : pB3.toFixed(3)}, ΔR² = ${deltaR2.toFixed(3)} (f² = ${f2.toFixed(3)}, ${f2Interpretation} effect). ${moderationSignificant ? `Simple slopes analysis revealed that the effect of ${predictor} on ${outcome} was ${pLowW < spec.alpha ? "significant" : "non-significant"} at low levels of ${moderator} (b = ${slopeAtLowW.toFixed(3)}, p = ${pLowW.toFixed(3)}) and ${pHighW < spec.alpha ? "significant" : "non-significant"} at high levels (b = ${slopeAtHighW.toFixed(3)}, p = ${pHighW.toFixed(3)}).` : ""}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "linearity", "homoscedasticity", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 50;
  }
}
