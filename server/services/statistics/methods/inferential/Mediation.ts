/**
 * Mediation Analysis
 * 
 * Tests indirect effects through mediating variables using Baron & Kenny approach
 * and Sobel test, with bootstrap confidence intervals.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Simple Mediation Analysis
 * 
 * Tests whether M mediates the relationship between X and Y.
 * X → M → Y (indirect effect = a * b)
 * X → Y (direct effect = c')
 * Total effect = c = c' + a*b
 */
export class MediationMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const outcome = spec.outcomes[0]; // Y
    const predictor = spec.predictors?.[0]; // X
    const mediator = spec.predictors?.[1] || (spec as any).options?.mediator; // M
    
    if (!outcome || !predictor || !mediator) {
      throw new Error("Mediation analysis requires outcome (Y), predictor (X), and mediator (M)");
    }
    
    // Get valid data
    const validData: { x: number; m: number; y: number }[] = [];
    for (const row of data) {
      const x = Number(row[predictor]);
      const m = Number(row[mediator]);
      const y = Number(row[outcome]);
      
      if (!isNaN(x) && !isNaN(m) && !isNaN(y)) {
        validData.push({ x, m, y });
      }
    }
    
    const n = validData.length;
    if (n < 30) {
      throw new Error(`Insufficient sample size for mediation (n=${n}, need at least 30)`);
    }
    
    const xs = validData.map(d => d.x);
    const ms = validData.map(d => d.m);
    const ys = validData.map(d => d.y);
    
    // Calculate means
    const meanX = StatUtils.mean(xs);
    const meanM = StatUtils.mean(ms);
    const meanY = StatUtils.mean(ys);
    
    // Path a: X → M
    const covXM = StatUtils.covariance(xs, ms);
    const varX = StatUtils.variance(xs);
    const a = covXM / varX;
    const aIntercept = meanM - a * meanX;
    
    // Residuals for path a
    const residA = ms.map((m, i) => m - (aIntercept + a * xs[i]));
    const seA = Math.sqrt(StatUtils.variance(residA) / ((n - 2) * varX));
    const tA = a / seA;
    const pA = StatUtils.tPValue(Math.abs(tA), n - 2);
    
    // Path c (total effect): X → Y
    const covXY = StatUtils.covariance(xs, ys);
    const c = covXY / varX;
    const cIntercept = meanY - c * meanX;
    
    // Residuals for path c
    const residC = ys.map((y, i) => y - (cIntercept + c * xs[i]));
    const seC = Math.sqrt(StatUtils.variance(residC) / ((n - 2) * varX));
    const tC = c / seC;
    const pC = StatUtils.tPValue(Math.abs(tC), n - 2);
    
    // Paths b and c' (direct effect): X, M → Y (multiple regression)
    // Y = intercept + c'*X + b*M
    // Using normal equations
    const varM = StatUtils.variance(ms);
    const covMY = StatUtils.covariance(ms, ys);
    
    // Solve 2x2 system for b and c'
    const det = varX * varM - covXM * covXM;
    const b = (varX * covMY - covXM * covXY) / det;
    const cPrime = (varM * covXY - covXM * covMY) / det;
    const bcIntercept = meanY - cPrime * meanX - b * meanM;
    
    // Residuals for multiple regression
    const residBC = ys.map((y, i) => y - (bcIntercept + cPrime * xs[i] + b * ms[i]));
    const mseBC = StatUtils.variance(residBC) * (n - 1) / (n - 3);
    
    // Standard errors (from covariance matrix of coefficients)
    // Simplified calculation
    const seB = Math.sqrt(mseBC / (varM * (1 - Math.pow(covXM, 2) / (varX * varM)) * (n - 3)));
    const seCPrime = Math.sqrt(mseBC / (varX * (1 - Math.pow(covXM, 2) / (varX * varM)) * (n - 3)));
    
    const tB = b / seB;
    const pB = StatUtils.tPValue(Math.abs(tB), n - 3);
    
    const tCPrime = cPrime / seCPrime;
    const pCPrime = StatUtils.tPValue(Math.abs(tCPrime), n - 3);
    
    // Indirect effect: a * b
    const indirect = a * b;
    
    // Sobel test for indirect effect
    const seIndirect = Math.sqrt(a * a * seB * seB + b * b * seA * seA);
    const zSobel = indirect / seIndirect;
    const pSobel = 2 * (1 - StatUtils.normalCDF(Math.abs(zSobel)));
    
    // Bootstrap confidence interval for indirect effect (simplified percentile method)
    const nBoot = 1000;
    const bootIndirects: number[] = [];
    
    for (let boot = 0; boot < nBoot; boot++) {
      // Resample with replacement
      const bootSample: typeof validData = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * n);
        bootSample.push(validData[idx]);
      }
      
      const bootX = bootSample.map(d => d.x);
      const bootM = bootSample.map(d => d.m);
      const bootY = bootSample.map(d => d.y);
      
      // Path a
      const bootCovXM = StatUtils.covariance(bootX, bootM);
      const bootVarX = StatUtils.variance(bootX);
      const bootA = bootCovXM / (bootVarX || 0.001);
      
      // Path b (controlling for X)
      const bootVarM = StatUtils.variance(bootM);
      const bootCovMY = StatUtils.covariance(bootM, bootY);
      const bootCovXY = StatUtils.covariance(bootX, bootY);
      const bootDet = bootVarX * bootVarM - bootCovXM * bootCovXM;
      const bootB = bootDet !== 0 ? (bootVarX * bootCovMY - bootCovXM * bootCovXY) / bootDet : 0;
      
      bootIndirects.push(bootA * bootB);
    }
    
    // Sort for percentile CI
    bootIndirects.sort((a, b) => a - b);
    const ciLower = bootIndirects[Math.floor(0.025 * nBoot)];
    const ciUpper = bootIndirects[Math.floor(0.975 * nBoot)];
    
    // Effect size: proportion mediated
    const proportionMediated = c !== 0 ? indirect / c : 0;
    
    // Completely standardized indirect effect
    const sdX = Math.sqrt(varX);
    const sdY = Math.sqrt(StatUtils.variance(ys));
    const stdIndirect = indirect * sdX / sdY;
    
    // Baron & Kenny criteria
    const step1 = Math.abs(tC) > 1.96; // X → Y significant
    const step2 = Math.abs(tA) > 1.96; // X → M significant
    const step3 = Math.abs(tB) > 1.96; // M → Y significant (controlling for X)
    const step4 = Math.abs(cPrime) < Math.abs(c); // c' < c
    
    const fullMediation = step1 && step2 && step3 && Math.abs(tCPrime) < 1.96;
    const partialMediation = step1 && step2 && step3 && step4 && !fullMediation;
    const noMediation = !step2 || !step3;
    
    // Build parameters
    const parameters = [
      { name: "Sample Size", estimate: n },
      { name: "Path a (X → M)", estimate: a, se: seA, testStatistic: tA, testType: "t", df: n - 2, pValue: pA },
      { name: "Path b (M → Y | X)", estimate: b, se: seB, testStatistic: tB, testType: "t", df: n - 3, pValue: pB },
      { name: "Path c (Total: X → Y)", estimate: c, se: seC, testStatistic: tC, testType: "t", df: n - 2, pValue: pC },
      { name: "Path c' (Direct: X → Y | M)", estimate: cPrime, se: seCPrime, testStatistic: tCPrime, testType: "t", df: n - 3, pValue: pCPrime },
      { name: "Indirect Effect (a × b)", estimate: indirect, se: seIndirect, testStatistic: zSobel, testType: "z", pValue: pSobel },
      { name: "Bootstrap 95% CI Lower", estimate: ciLower },
      { name: "Bootstrap 95% CI Upper", estimate: ciUpper },
      { name: "Proportion Mediated", estimate: proportionMediated },
      { name: "Standardized Indirect Effect", estimate: stdIndirect }
    ];
    
    // Determine mediation type
    let mediationType: string;
    if (fullMediation) mediationType = "full mediation";
    else if (partialMediation) mediationType = "partial mediation";
    else if (indirect !== 0 && pSobel < spec.alpha) mediationType = "indirect-only mediation";
    else mediationType = "no mediation";
    
    // CI excludes zero?
    const ciExcludesZero = ciLower > 0 || ciUpper < 0;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [
        {
          type: "other",
          value: stdIndirect,
          interpretation: Math.abs(stdIndirect) > 0.14 ? "large" : Math.abs(stdIndirect) > 0.06 ? "medium" : "small" as any
        }
      ],
      testStatistic: zSobel,
      testType: "z",
      pValue: pSobel,
      conclusion: `Mediation: indirect = ${indirect.toFixed(4)}, 95% CI [${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}], z = ${zSobel.toFixed(3)}, p = ${pSobel.toFixed(4)}`,
      interpretation: `A mediation analysis tested whether ${mediator} mediates the effect of ${predictor} on ${outcome}. The total effect of ${predictor} on ${outcome} was ${pC < spec.alpha ? "significant" : "non-significant"} (c = ${c.toFixed(3)}, p = ${pC < 0.001 ? "< .001" : pC.toFixed(3)}). The path from ${predictor} to ${mediator} was ${pA < spec.alpha ? "significant" : "non-significant"} (a = ${a.toFixed(3)}, p = ${pA < 0.001 ? "< .001" : pA.toFixed(3)}). The path from ${mediator} to ${outcome}, controlling for ${predictor}, was ${pB < spec.alpha ? "significant" : "non-significant"} (b = ${b.toFixed(3)}, p = ${pB < 0.001 ? "< .001" : pB.toFixed(3)}). The indirect effect (a × b = ${indirect.toFixed(4)}) was ${ciExcludesZero ? "statistically significant" : "not statistically significant"} based on ${nBoot} bootstrap samples (95% CI [${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}]). The direct effect was ${pCPrime < spec.alpha ? "significant" : "non-significant"} (c' = ${cPrime.toFixed(3)}, p = ${pCPrime < 0.001 ? "< .001" : pCPrime.toFixed(3)}). Results indicate ${mediationType}${proportionMediated > 0 && proportionMediated < 1 ? `, with ${(proportionMediated * 100).toFixed(1)}% of the total effect mediated` : ""}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "linearity", "independence", "homoscedasticity"];
  }
  
  getMinimumSampleSize(): number {
    return 50;
  }
}
