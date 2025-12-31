/**
 * Item Response Theory (IRT) Methods
 * 
 * Basic IRT models for psychometric analysis of test items.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Rasch Model (1PL IRT)
 * 
 * Simplest IRT model assuming equal discrimination across items.
 * Only estimates item difficulty (b parameter).
 */
export class RaschModelMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 3) {
      throw new Error("Rasch model requires at least 3 items");
    }
    
    const k = items.length;
    
    // Get binary response data (0/1)
    const responses: number[][] = [];
    for (const row of data) {
      const itemResponses = items.map(item => {
        const val = Number(row[item]);
        if (isNaN(val)) return NaN;
        return val > 0 ? 1 : 0; // Dichotomize if needed
      });
      if (itemResponses.every(r => !isNaN(r))) {
        responses.push(itemResponses);
      }
    }
    
    const n = responses.length;
    if (n < 50) {
      throw new Error(`Insufficient sample size for IRT (n=${n}, recommend n≥100)`);
    }
    
    // Calculate item difficulties using JMLE (Joint Maximum Likelihood Estimation)
    // Simplified implementation using proportion correct transformation
    
    // Item statistics
    const itemStats = items.map((item, j) => {
      const correct = responses.reduce((sum, r) => sum + r[j], 0);
      const pCorrect = correct / n;
      
      // Convert to logit scale (item difficulty)
      // b = -ln(p / (1-p)) for Rasch model
      const pAdj = Math.max(0.01, Math.min(0.99, pCorrect)); // Avoid extreme values
      const difficulty = -Math.log(pAdj / (1 - pAdj));
      
      return {
        item,
        pCorrect,
        difficulty,
        nCorrect: correct,
        nIncorrect: n - correct
      };
    });
    
    // Person abilities (theta)
    const personStats = responses.map((r, i) => {
      const totalScore = r.reduce((a, b) => a + b, 0);
      const pCorrect = totalScore / k;
      const pAdj = Math.max(0.01, Math.min(0.99, pCorrect));
      const theta = Math.log(pAdj / (1 - pAdj));
      return { personId: i, totalScore, theta };
    });
    
    // Calculate model fit statistics
    // Item-total correlations (point-biserial)
    const itemTotalCorrs = items.map((_, j) => {
      const itemScores = responses.map(r => r[j]);
      const totalScores = responses.map(r => r.reduce((a, b) => a + b, 0));
      return StatUtils.correlation(itemScores, totalScores);
    });
    
    // Infit and Outfit statistics (simplified)
    const fitStats = items.map((item, j) => {
      let infitNum = 0, infitDen = 0;
      let outfitSum = 0;
      
      for (let i = 0; i < n; i++) {
        const theta = personStats[i].theta;
        const b = itemStats[j].difficulty;
        const p = 1 / (1 + Math.exp(-(theta - b)));
        const variance = p * (1 - p);
        const residual = responses[i][j] - p;
        const stdResidual = residual / Math.sqrt(variance || 0.01);
        
        infitNum += residual * residual;
        infitDen += variance;
        outfitSum += stdResidual * stdResidual;
      }
      
      const infit = infitNum / (infitDen || 1);
      const outfit = outfitSum / n;
      
      return { infit, outfit };
    });
    
    // Reliability (Person Separation Reliability)
    const thetaVariance = StatUtils.variance(personStats.map(p => p.theta));
    const avgSE = Math.sqrt(1 / (k * 0.25)); // Approximate average SE
    const personSeparation = Math.sqrt(Math.max(0, thetaVariance - avgSE * avgSE)) / avgSE;
    const reliability = personSeparation * personSeparation / (1 + personSeparation * personSeparation);
    
    // Item Separation
    const difficultyVariance = StatUtils.variance(itemStats.map(s => s.difficulty));
    const itemSE = Math.sqrt(1 / (n * 0.25));
    const itemSeparation = Math.sqrt(Math.max(0, difficultyVariance - itemSE * itemSE)) / itemSE;
    const itemReliability = itemSeparation * itemSeparation / (1 + itemSeparation * itemSeparation);
    
    // Build parameters
    const parameters = [
      { name: "Number of Items", estimate: k },
      { name: "Sample Size", estimate: n },
      { name: "Person Separation Reliability", estimate: reliability },
      { name: "Item Separation Reliability", estimate: itemReliability },
      { name: "Person Separation Index", estimate: personSeparation },
      { name: "Item Separation Index", estimate: itemSeparation }
    ];
    
    // Add item parameters
    itemStats.forEach((stat, i) => {
      parameters.push({
        name: `Difficulty (${stat.item})`,
        estimate: stat.difficulty
      });
    });
    
    // Flag misfitting items
    const misfittingItems = items.filter((_, i) => 
      fitStats[i].infit > 1.3 || fitStats[i].infit < 0.7 ||
      fitStats[i].outfit > 1.3 || fitStats[i].outfit < 0.7
    );
    
    // Interpretation
    let reliabilityInterpretation: string;
    if (reliability >= 0.9) reliabilityInterpretation = "excellent";
    else if (reliability >= 0.8) reliabilityInterpretation = "good";
    else if (reliability >= 0.7) reliabilityInterpretation = "acceptable";
    else if (reliability >= 0.6) reliabilityInterpretation = "questionable";
    else reliabilityInterpretation = "poor";
    
    // Difficulty range
    const difficulties = itemStats.map(s => s.difficulty);
    const minDiff = Math.min(...difficulties);
    const maxDiff = Math.max(...difficulties);
    const diffRange = maxDiff - minDiff;
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: reliability,
        interpretation: reliabilityInterpretation as any
      }],
      modelFit: {
        rSquared: reliability
      },
      conclusion: `Rasch model: ${k} items, n = ${n}, Person Separation Reliability = ${reliability.toFixed(3)} (${reliabilityInterpretation})`,
      interpretation: `A Rasch (1PL) model was fitted to ${k} items with ${n} respondents. Person separation reliability was ${reliability.toFixed(2)} (${reliabilityInterpretation}), indicating ${reliability >= 0.8 ? "the scale reliably distinguishes between persons of different ability levels" : "limited ability to distinguish between persons"}. Item difficulties ranged from ${minDiff.toFixed(2)} to ${maxDiff.toFixed(2)} logits (range = ${diffRange.toFixed(2)}). ${misfittingItems.length > 0 ? `${misfittingItems.length} item(s) showed misfit (infit/outfit outside 0.7-1.3): ${misfittingItems.join(", ")}.` : "All items showed acceptable fit (infit/outfit within 0.7-1.3)."}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 100;
  }
}

/**
 * 2PL IRT Model
 * 
 * Estimates both item difficulty (b) and discrimination (a) parameters.
 */
export class TwoPLMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 3) {
      throw new Error("2PL model requires at least 3 items");
    }
    
    const k = items.length;
    
    // Get binary response data
    const responses: number[][] = [];
    for (const row of data) {
      const itemResponses = items.map(item => {
        const val = Number(row[item]);
        if (isNaN(val)) return NaN;
        return val > 0 ? 1 : 0;
      });
      if (itemResponses.every(r => !isNaN(r))) {
        responses.push(itemResponses);
      }
    }
    
    const n = responses.length;
    if (n < 100) {
      throw new Error(`Insufficient sample size for 2PL (n=${n}, recommend n≥200)`);
    }
    
    // Calculate total scores for initial theta estimates
    const totalScores = responses.map(r => r.reduce((a, b) => a + b, 0));
    const meanScore = StatUtils.mean(totalScores);
    const sdScore = StatUtils.sd(totalScores);
    
    // Initial theta estimates (standardized)
    const thetas = totalScores.map(s => (s - meanScore) / (sdScore || 1));
    
    // Estimate item parameters using simplified approach
    const itemParams = items.map((item, j) => {
      const itemScores = responses.map(r => r[j]);
      const pCorrect = itemScores.reduce((a, b) => a + b, 0) / n;
      
      // Point-biserial correlation as discrimination proxy
      const rpb = StatUtils.correlation(itemScores, thetas);
      
      // Convert to IRT discrimination (approximation)
      const a = rpb * 1.7 / Math.sqrt(1 - rpb * rpb);
      
      // Difficulty
      const pAdj = Math.max(0.01, Math.min(0.99, pCorrect));
      const b = -Math.log(pAdj / (1 - pAdj)) / Math.max(0.5, a);
      
      return {
        item,
        a: Math.max(0.2, Math.min(3, a)), // Constrain discrimination
        b,
        pCorrect,
        rpb
      };
    });
    
    // Calculate fit statistics
    const fitStats = items.map((_, j) => {
      let chi2 = 0;
      const a = itemParams[j].a;
      const b = itemParams[j].b;
      
      // Group by ability quintiles
      const sortedIdx = thetas.map((t, i) => ({ t, i })).sort((x, y) => x.t - y.t);
      const groupSize = Math.floor(n / 5);
      
      for (let g = 0; g < 5; g++) {
        const start = g * groupSize;
        const end = g === 4 ? n : (g + 1) * groupSize;
        const groupIdx = sortedIdx.slice(start, end).map(x => x.i);
        
        const observed = groupIdx.reduce((sum, i) => sum + responses[i][j], 0) / groupIdx.length;
        const avgTheta = groupIdx.reduce((sum, i) => sum + thetas[i], 0) / groupIdx.length;
        const expected = 1 / (1 + Math.exp(-a * (avgTheta - b)));
        
        const variance = expected * (1 - expected) / groupIdx.length;
        if (variance > 0.001) {
          chi2 += Math.pow(observed - expected, 2) / variance;
        }
      }
      
      return { chi2, df: 3, pValue: 1 - StatUtils.chi2CDF(chi2, 3) };
    });
    
    // Model-level statistics
    const avgDiscrimination = StatUtils.mean(itemParams.map(p => p.a));
    const difficulties = itemParams.map(p => p.b);
    const minDiff = Math.min(...difficulties);
    const maxDiff = Math.max(...difficulties);
    
    // Information function at theta = 0
    const infoAtZero = itemParams.reduce((sum, p) => {
      const prob = 1 / (1 + Math.exp(-p.a * (0 - p.b)));
      return sum + p.a * p.a * prob * (1 - prob);
    }, 0);
    
    // Marginal reliability
    const reliability = 1 - 1 / (1 + infoAtZero);
    
    // Build parameters
    const parameters = [
      { name: "Number of Items", estimate: k },
      { name: "Sample Size", estimate: n },
      { name: "Average Discrimination", estimate: avgDiscrimination },
      { name: "Difficulty Range", estimate: maxDiff - minDiff },
      { name: "Test Information at θ=0", estimate: infoAtZero },
      { name: "Marginal Reliability", estimate: reliability }
    ];
    
    // Add item parameters
    itemParams.forEach(p => {
      parameters.push({ name: `a (${p.item})`, estimate: p.a });
      parameters.push({ name: `b (${p.item})`, estimate: p.b });
    });
    
    // Flag items with poor discrimination
    const lowDiscrimItems = itemParams.filter(p => p.a < 0.5).map(p => p.item);
    const highDiscrimItems = itemParams.filter(p => p.a > 2.5).map(p => p.item);
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: reliability,
        interpretation: reliability >= 0.8 ? "good" : reliability >= 0.7 ? "acceptable" : "poor" as any
      }],
      modelFit: {
        rSquared: reliability
      },
      conclusion: `2PL model: ${k} items, n = ${n}, avg a = ${avgDiscrimination.toFixed(2)}, reliability = ${reliability.toFixed(3)}`,
      interpretation: `A 2-parameter logistic (2PL) IRT model was fitted to ${k} items with ${n} respondents. Average item discrimination was ${avgDiscrimination.toFixed(2)} (range: ${Math.min(...itemParams.map(p => p.a)).toFixed(2)} - ${Math.max(...itemParams.map(p => p.a)).toFixed(2)}). Item difficulties ranged from ${minDiff.toFixed(2)} to ${maxDiff.toFixed(2)} logits. Test information at θ = 0 was ${infoAtZero.toFixed(2)}, yielding marginal reliability of ${reliability.toFixed(2)}.${lowDiscrimItems.length > 0 ? ` Items with low discrimination (a < 0.5): ${lowDiscrimItems.join(", ")}.` : ""}${highDiscrimItems.length > 0 ? ` Items with very high discrimination (a > 2.5): ${highDiscrimItems.join(", ")}.` : ""}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 200;
  }
}
