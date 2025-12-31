/**
 * Advanced Item Response Theory Models
 * 
 * 3PL model with guessing parameter and Graded Response Model
 * for polytomous items.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Three-Parameter Logistic (3PL) IRT Model
 * 
 * P(X=1|θ) = c + (1-c) / (1 + exp(-a(θ-b)))
 * 
 * a = discrimination, b = difficulty, c = guessing (pseudo-chance)
 */
export class ThreePLMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 5) {
      throw new Error("3PL IRT requires at least 5 items");
    }
    
    // Convert to binary response matrix
    const responses: number[][] = [];
    for (const row of data) {
      const resp = items.map(item => {
        const val = Number(row[item]);
        return isNaN(val) ? NaN : (val > 0 ? 1 : 0);
      });
      if (resp.some(r => !isNaN(r))) {
        responses.push(resp);
      }
    }
    
    const n = responses.length;
    const k = items.length;
    
    if (n < 100) {
      throw new Error(`Insufficient sample size for 3PL (n=${n}, need at least 100)`);
    }
    
    // Calculate item statistics
    const itemStats = items.map((item, j) => {
      const validResponses = responses.map(r => r[j]).filter(r => !isNaN(r));
      const p = StatUtils.mean(validResponses);
      return { item, p, n: validResponses.length };
    });
    
    // Estimate person abilities (sum scores -> theta)
    const personScores = responses.map(r => {
      const valid = r.filter(x => !isNaN(x));
      return valid.reduce((a, b) => a + b, 0) / valid.length;
    });
    const meanScore = StatUtils.mean(personScores);
    const sdScore = StatUtils.sd(personScores);
    
    const thetas = personScores.map(s => 
      sdScore > 0 ? (s - meanScore) / sdScore * 1.7 : 0
    );
    
    // Estimate 3PL parameters for each item using JMLE approximation
    const itemParameters: Array<{
      item: string;
      a: number; // discrimination
      b: number; // difficulty
      c: number; // guessing
      se_a: number;
      se_b: number;
      se_c: number;
      fit: number;
    }> = [];
    
    for (let j = 0; j < k; j++) {
      const itemResponses = responses.map((r, i) => ({ resp: r[j], theta: thetas[i] }))
        .filter(x => !isNaN(x.resp));
      
      const p = itemStats[j].p;
      
      // Initial estimates
      let a = 1.0;
      let b = -StatUtils.normalQuantile(p) / 1.7;
      let c = 0.2; // Default guessing for 4-option MC
      
      // Iterative estimation (simplified MML)
      for (let iter = 0; iter < 20; iter++) {
        let sumNum_a = 0, sumDen_a = 0;
        let sumNum_b = 0, sumDen_b = 0;
        let sumNum_c = 0, sumDen_c = 0;
        
        for (const { resp, theta } of itemResponses) {
          const z = a * (theta - b);
          const expZ = Math.exp(-z);
          const pStar = 1 / (1 + expZ); // 2PL probability
          const pTheta = c + (1 - c) * pStar; // 3PL probability
          
          const w = pStar * (1 - pStar);
          const q = 1 - pTheta;
          
          // Derivatives
          const dP_da = (1 - c) * w * (theta - b);
          const dP_db = -(1 - c) * w * a;
          const dP_dc = 1 - pStar;
          
          const residual = resp - pTheta;
          const info = pTheta * q;
          
          if (info > 0.001) {
            sumNum_a += residual * dP_da / info;
            sumDen_a += dP_da * dP_da / info;
            sumNum_b += residual * dP_db / info;
            sumDen_b += dP_db * dP_db / info;
            sumNum_c += residual * dP_dc / info;
            sumDen_c += dP_dc * dP_dc / info;
          }
        }
        
        // Update with damping
        const step = 0.3;
        if (sumDen_a > 0.001) a += step * sumNum_a / sumDen_a;
        if (sumDen_b > 0.001) b += step * sumNum_b / sumDen_b;
        if (sumDen_c > 0.001) c += step * sumNum_c / sumDen_c;
        
        // Constrain parameters
        a = Math.max(0.2, Math.min(4.0, a));
        b = Math.max(-4, Math.min(4, b));
        c = Math.max(0, Math.min(0.5, c));
      }
      
      // Standard errors (approximate from information)
      const se_a = 1 / Math.sqrt(itemResponses.length * a * a / 4);
      const se_b = 1 / Math.sqrt(itemResponses.length * a * a / 4);
      const se_c = Math.sqrt(c * (1 - c) / itemResponses.length);
      
      // Item fit (chi-square approximation)
      let chiSq = 0;
      const nBins = 5;
      const sortedResp = [...itemResponses].sort((x, y) => x.theta - y.theta);
      const binSize = Math.floor(sortedResp.length / nBins);
      
      for (let bin = 0; bin < nBins; bin++) {
        const binData = sortedResp.slice(bin * binSize, (bin + 1) * binSize);
        const obsP = StatUtils.mean(binData.map(d => d.resp));
        const meanTheta = StatUtils.mean(binData.map(d => d.theta));
        const expP = c + (1 - c) / (1 + Math.exp(-a * (meanTheta - b)));
        const variance = expP * (1 - expP) / binData.length;
        if (variance > 0.001) {
          chiSq += Math.pow(obsP - expP, 2) / variance;
        }
      }
      
      itemParameters.push({
        item: items[j],
        a, b, c,
        se_a, se_b, se_c,
        fit: chiSq
      });
    }
    
    // Model fit statistics
    let logLik = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < k; j++) {
        if (!isNaN(responses[i][j])) {
          const { a, b, c } = itemParameters[j];
          const p = c + (1 - c) / (1 + Math.exp(-a * (thetas[i] - b)));
          const pClamped = Math.max(0.001, Math.min(0.999, p));
          logLik += responses[i][j] * Math.log(pClamped) + 
                   (1 - responses[i][j]) * Math.log(1 - pClamped);
        }
      }
    }
    
    const nParams = k * 3 + n; // 3 params per item + n abilities
    const aic = -2 * logLik + 2 * nParams;
    const bic = -2 * logLik + Math.log(n * k) * nParams;
    
    // Build parameters array
    const parameters = [
      { name: "Sample Size", estimate: n },
      { name: "Number of Items", estimate: k },
      { name: "Log-Likelihood", estimate: logLik },
      { name: "AIC", estimate: aic },
      { name: "BIC", estimate: bic }
    ];
    
    // Add item parameters
    for (const ip of itemParameters) {
      parameters.push(
        { name: `${ip.item}: Discrimination (a)`, estimate: ip.a, se: ip.se_a },
        { name: `${ip.item}: Difficulty (b)`, estimate: ip.b, se: ip.se_b },
        { name: `${ip.item}: Guessing (c)`, estimate: ip.c, se: ip.se_c },
        { name: `${ip.item}: Fit (χ²)`, estimate: ip.fit }
      );
    }
    
    // Summary statistics
    const avgA = StatUtils.mean(itemParameters.map(p => p.a));
    const avgB = StatUtils.mean(itemParameters.map(p => p.b));
    const avgC = StatUtils.mean(itemParameters.map(p => p.c));
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: avgA,
        interpretation: avgA > 1.5 ? "large" : avgA > 0.8 ? "medium" : "small" as any
      }],
      modelFit: {
        aic,
        bic,
        logLikelihood: logLik
      },
      conclusion: `3PL IRT: ${k} items, n = ${n}, avg a = ${avgA.toFixed(2)}, avg b = ${avgB.toFixed(2)}, avg c = ${avgC.toFixed(2)}`,
      interpretation: `A Three-Parameter Logistic (3PL) IRT model was fit to ${k} items with ${n} respondents. Average discrimination was ${avgA.toFixed(2)} (${avgA > 1.5 ? "high" : avgA > 0.8 ? "moderate" : "low"} discriminating items). Average difficulty was ${avgB.toFixed(2)} (${avgB > 0.5 ? "difficult" : avgB < -0.5 ? "easy" : "moderate difficulty"} items). Average guessing parameter was ${avgC.toFixed(2)} (${(avgC * 100).toFixed(0)}% pseudo-chance level). Model fit: AIC = ${aic.toFixed(1)}, BIC = ${bic.toFixed(1)}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["unidimensionality", "local_independence"];
  }
  
  getMinimumSampleSize(): number {
    return 200;
  }
}

/**
 * Graded Response Model (GRM)
 * 
 * For polytomous items with ordered categories (e.g., Likert scales).
 * P(X >= k|θ) = 1 / (1 + exp(-a(θ - b_k)))
 */
export class GradedResponseMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 4) {
      throw new Error("GRM requires at least 4 items");
    }
    
    // Get response data and determine categories
    const responses: number[][] = [];
    const categories = new Set<number>();
    
    for (const row of data) {
      const resp = items.map(item => {
        const val = Number(row[item]);
        if (!isNaN(val)) categories.add(Math.round(val));
        return isNaN(val) ? NaN : Math.round(val);
      });
      if (resp.some(r => !isNaN(r))) {
        responses.push(resp);
      }
    }
    
    const n = responses.length;
    const k = items.length;
    const cats = Array.from(categories).sort((a, b) => a - b);
    const nCats = cats.length;
    
    if (nCats < 3) {
      throw new Error("GRM requires at least 3 response categories");
    }
    
    if (n < 100) {
      throw new Error(`Insufficient sample size for GRM (n=${n}, need at least 100)`);
    }
    
    // Map responses to 0-indexed categories
    const catMap = new Map(cats.map((c, i) => [c, i]));
    const mappedResponses = responses.map(r => 
      r.map(x => isNaN(x) ? NaN : catMap.get(x) ?? NaN)
    );
    
    // Estimate person abilities
    const personScores = mappedResponses.map(r => {
      const valid = r.filter(x => !isNaN(x));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
    }).filter(s => !isNaN(s));
    
    const meanScore = StatUtils.mean(personScores);
    const sdScore = StatUtils.sd(personScores);
    
    const thetas = mappedResponses.map(r => {
      const valid = r.filter(x => !isNaN(x));
      const score = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : meanScore;
      return sdScore > 0 ? (score - meanScore) / sdScore * 1.7 : 0;
    });
    
    // Estimate GRM parameters for each item
    const itemParameters: Array<{
      item: string;
      a: number;
      thresholds: number[];
      se_a: number;
      fit: number;
    }> = [];
    
    for (let j = 0; j < k; j++) {
      const itemResponses = mappedResponses.map((r, i) => ({ resp: r[j], theta: thetas[i] }))
        .filter(x => !isNaN(x.resp));
      
      // Initial estimates
      let a = 1.0;
      const thresholds: number[] = [];
      
      // Initialize thresholds based on cumulative proportions
      for (let c = 1; c < nCats; c++) {
        const cumP = itemResponses.filter(x => x.resp >= c).length / itemResponses.length;
        const b = -StatUtils.normalQuantile(Math.max(0.01, Math.min(0.99, cumP))) / 1.7;
        thresholds.push(b);
      }
      
      // Iterative estimation
      for (let iter = 0; iter < 15; iter++) {
        // Update discrimination
        let sumNum = 0, sumDen = 0;
        
        for (const { resp, theta } of itemResponses) {
          for (let c = 0; c < nCats; c++) {
            const pStar_c = c < nCats - 1 ? 
              1 / (1 + Math.exp(-a * (theta - thresholds[c]))) : 0;
            const pStar_c1 = c > 0 ? 
              1 / (1 + Math.exp(-a * (theta - thresholds[c - 1]))) : 1;
            
            const pCat = pStar_c1 - pStar_c;
            const indicator = resp === c ? 1 : 0;
            
            if (pCat > 0.001) {
              const dP_da = (c > 0 ? pStar_c1 * (1 - pStar_c1) * (theta - thresholds[c - 1]) : 0) -
                           (c < nCats - 1 ? pStar_c * (1 - pStar_c) * (theta - thresholds[c]) : 0);
              sumNum += (indicator - pCat) * dP_da / pCat;
              sumDen += dP_da * dP_da / pCat;
            }
          }
        }
        
        if (sumDen > 0.001) {
          a += 0.2 * sumNum / sumDen;
          a = Math.max(0.3, Math.min(4.0, a));
        }
        
        // Update thresholds
        for (let t = 0; t < thresholds.length; t++) {
          let tNum = 0, tDen = 0;
          
          for (const { resp, theta } of itemResponses) {
            const pStar = 1 / (1 + Math.exp(-a * (theta - thresholds[t])));
            const indicator = resp > t ? 1 : 0;
            
            const w = pStar * (1 - pStar);
            if (w > 0.001) {
              tNum += (indicator - pStar) * (-a * w);
              tDen += a * a * w;
            }
          }
          
          if (tDen > 0.001) {
            thresholds[t] += 0.2 * tNum / tDen;
            thresholds[t] = Math.max(-4, Math.min(4, thresholds[t]));
          }
        }
        
        // Ensure thresholds are ordered
        thresholds.sort((x, y) => x - y);
      }
      
      // Standard error
      const se_a = 1 / Math.sqrt(itemResponses.length * a * a / 4);
      
      // Item fit
      let chiSq = 0;
      const nBins = 5;
      const sortedResp = [...itemResponses].sort((x, y) => x.theta - y.theta);
      const binSize = Math.floor(sortedResp.length / nBins);
      
      for (let bin = 0; bin < nBins; bin++) {
        const binData = sortedResp.slice(bin * binSize, (bin + 1) * binSize);
        const obsMean = StatUtils.mean(binData.map(d => d.resp));
        const meanTheta = StatUtils.mean(binData.map(d => d.theta));
        
        // Expected mean
        let expMean = 0;
        for (let c = 0; c < nCats; c++) {
          const pStar_c = c < nCats - 1 ? 
            1 / (1 + Math.exp(-a * (meanTheta - thresholds[c]))) : 0;
          const pStar_c1 = c > 0 ? 
            1 / (1 + Math.exp(-a * (meanTheta - thresholds[c - 1]))) : 1;
          expMean += c * (pStar_c1 - pStar_c);
        }
        
        const variance = 1 / binData.length;
        chiSq += Math.pow(obsMean - expMean, 2) / variance;
      }
      
      itemParameters.push({
        item: items[j],
        a,
        thresholds,
        se_a,
        fit: chiSq
      });
    }
    
    // Model fit
    let logLik = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < k; j++) {
        const resp = mappedResponses[i][j];
        if (!isNaN(resp)) {
          const { a, thresholds } = itemParameters[j];
          const pStar_c = resp < nCats - 1 ? 
            1 / (1 + Math.exp(-a * (thetas[i] - thresholds[resp]))) : 0;
          const pStar_c1 = resp > 0 ? 
            1 / (1 + Math.exp(-a * (thetas[i] - thresholds[resp - 1]))) : 1;
          const p = Math.max(0.001, pStar_c1 - pStar_c);
          logLik += Math.log(p);
        }
      }
    }
    
    const nParams = k * nCats + n;
    const aic = -2 * logLik + 2 * nParams;
    const bic = -2 * logLik + Math.log(n * k) * nParams;
    
    // Build parameters
    const parameters = [
      { name: "Sample Size", estimate: n },
      { name: "Number of Items", estimate: k },
      { name: "Number of Categories", estimate: nCats },
      { name: "Log-Likelihood", estimate: logLik },
      { name: "AIC", estimate: aic },
      { name: "BIC", estimate: bic }
    ];
    
    for (const ip of itemParameters) {
      parameters.push({ name: `${ip.item}: Discrimination (a)`, estimate: ip.a, se: ip.se_a });
      ip.thresholds.forEach((t, i) => {
        parameters.push({ name: `${ip.item}: Threshold b${i + 1}`, estimate: t });
      });
      parameters.push({ name: `${ip.item}: Fit (χ²)`, estimate: ip.fit });
    }
    
    const avgA = StatUtils.mean(itemParameters.map(p => p.a));
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: avgA,
        interpretation: avgA > 1.5 ? "large" : avgA > 0.8 ? "medium" : "small" as any
      }],
      modelFit: {
        aic,
        bic,
        logLikelihood: logLik
      },
      conclusion: `GRM: ${k} items, ${nCats} categories, n = ${n}, avg discrimination = ${avgA.toFixed(2)}`,
      interpretation: `A Graded Response Model (GRM) was fit to ${k} polytomous items with ${nCats} ordered categories and ${n} respondents. Average discrimination was ${avgA.toFixed(2)} (${avgA > 1.5 ? "high" : avgA > 0.8 ? "moderate" : "low"} discriminating items). Each item has ${nCats - 1} threshold parameters representing the difficulty of transitioning between adjacent categories. Model fit: AIC = ${aic.toFixed(1)}, BIC = ${bic.toFixed(1)}.`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["unidimensionality", "local_independence", "ordered_categories"];
  }
  
  getMinimumSampleSize(): number {
    return 200;
  }
}
