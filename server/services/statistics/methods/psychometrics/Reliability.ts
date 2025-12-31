/**
 * Reliability Methods
 * 
 * Cronbach's alpha and McDonald's omega for internal consistency.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject, ReliabilityResult } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Cronbach's Alpha
 */
export class CronbachAlphaMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 2) {
      throw new Error("Cronbach's alpha requires at least 2 items");
    }
    
    const n = data.length;
    const k = items.length;
    
    // Get item data
    const itemData = items.map(item => 
      data.map(d => Number(d[item])).filter(v => !isNaN(v))
    );
    
    // Check all items have same length
    const validN = Math.min(...itemData.map(d => d.length));
    if (validN < 10) {
      throw new Error("Insufficient valid responses for reliability analysis");
    }
    
    // Calculate item statistics
    const itemStats = items.map((item, i) => {
      const vals = itemData[i].slice(0, validN);
      return {
        item,
        mean: StatUtils.mean(vals),
        sd: StatUtils.sd(vals),
        variance: StatUtils.variance(vals)
      };
    });
    
    // Sum of item variances
    const sumItemVariances = itemStats.reduce((sum, s) => sum + s.variance, 0);
    
    // Calculate total scores
    const totals = [];
    for (let i = 0; i < validN; i++) {
      let total = 0;
      let valid = true;
      for (let j = 0; j < k; j++) {
        if (i < itemData[j].length) {
          total += itemData[j][i];
        } else {
          valid = false;
          break;
        }
      }
      if (valid) totals.push(total);
    }
    
    const totalVariance = StatUtils.variance(totals);
    
    // Cronbach's alpha
    const alpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);
    
    // Item-total correlations and alpha-if-deleted
    const itemAnalysis = items.map((item, idx) => {
      const itemVals = itemData[idx].slice(0, validN);
      
      // Rest scores (total minus this item)
      const restTotals = totals.map((t, i) => t - itemVals[i]);
      
      // Item-total correlation
      const itemTotalCorr = StatUtils.correlation(itemVals, restTotals);
      
      // Alpha if deleted
      const kMinus1 = k - 1;
      const restVariances = itemStats
        .filter((_, i) => i !== idx)
        .reduce((sum, s) => sum + s.variance, 0);
      const restTotalVar = StatUtils.variance(restTotals);
      const alphaIfDeleted = kMinus1 > 1 
        ? (kMinus1 / (kMinus1 - 1)) * (1 - restVariances / restTotalVar)
        : 0;
      
      return {
        item,
        itemTotalCorrelation: itemTotalCorr,
        alphaIfDeleted,
        mean: itemStats[idx].mean,
        sd: itemStats[idx].sd
      };
    });
    
    // Interpretation
    let interpretation: ReliabilityResult["interpretation"];
    if (alpha >= 0.9) interpretation = "excellent";
    else if (alpha >= 0.8) interpretation = "good";
    else if (alpha >= 0.7) interpretation = "acceptable";
    else if (alpha >= 0.6) interpretation = "questionable";
    else if (alpha >= 0.5) interpretation = "poor";
    else interpretation = "unacceptable";
    
    // Build parameters
    const parameters = [
      {
        name: "Cronbach's Alpha",
        estimate: alpha
      },
      {
        name: "Number of Items",
        estimate: k
      },
      {
        name: "Sample Size",
        estimate: validN
      }
    ];
    
    // Add item statistics
    itemAnalysis.forEach(ia => {
      parameters.push({
        name: `Item-Total r (${ia.item})`,
        estimate: ia.itemTotalCorrelation
      });
    });
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: alpha,
        interpretation: interpretation as any
      }],
      conclusion: `Cronbach's α = ${alpha.toFixed(3)} (${interpretation})`,
      interpretation: `Internal consistency reliability was assessed using Cronbach's alpha. The ${k}-item scale demonstrated ${interpretation} internal consistency (α = ${alpha.toFixed(2)}). ${
        itemAnalysis.some(ia => ia.alphaIfDeleted > alpha + 0.02)
          ? `Removing ${itemAnalysis.filter(ia => ia.alphaIfDeleted > alpha + 0.02).map(ia => ia.item).join(", ")} would improve reliability.`
          : "No items would substantially improve reliability if deleted."
      }`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 30;
  }
}

/**
 * McDonald's Omega (simplified implementation)
 * Note: Full omega requires factor analysis; this is an approximation
 */
export class McDonaldOmegaMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const items = spec.outcomes;
    
    if (items.length < 3) {
      throw new Error("McDonald's omega requires at least 3 items");
    }
    
    const n = data.length;
    const k = items.length;
    
    // Get item data
    const itemData = items.map(item => 
      data.map(d => Number(d[item])).filter(v => !isNaN(v))
    );
    
    const validN = Math.min(...itemData.map(d => d.length));
    if (validN < 30) {
      throw new Error("Insufficient valid responses for omega calculation");
    }
    
    // Calculate correlation matrix
    const corrMatrix: number[][] = [];
    for (let i = 0; i < k; i++) {
      corrMatrix[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          corrMatrix[i][j] = 1;
        } else if (j < i) {
          corrMatrix[i][j] = corrMatrix[j][i];
        } else {
          const xi = itemData[i].slice(0, validN);
          const xj = itemData[j].slice(0, validN);
          corrMatrix[i][j] = StatUtils.correlation(xi, xj);
        }
      }
    }
    
    // Average inter-item correlation
    let sumCorr = 0;
    let countCorr = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        sumCorr += corrMatrix[i][j];
        countCorr++;
      }
    }
    const avgCorr = sumCorr / countCorr;
    
    // Standardized alpha (approximation for omega when items are parallel)
    const stdAlpha = (k * avgCorr) / (1 + (k - 1) * avgCorr);
    
    // For a more accurate omega, we would need factor analysis
    // This is an approximation assuming essentially tau-equivalent items
    const omega = stdAlpha;  // Simplified; true omega requires factor loadings
    
    // Item statistics
    const itemStats = items.map((item, i) => {
      const vals = itemData[i].slice(0, validN);
      const avgCorrWithOthers = corrMatrix[i].reduce((s, r, j) => 
        j !== i ? s + r : s, 0) / (k - 1);
      return {
        item,
        mean: StatUtils.mean(vals),
        sd: StatUtils.sd(vals),
        avgCorrelation: avgCorrWithOthers
      };
    });
    
    // Interpretation
    let interpretation: string;
    if (omega >= 0.9) interpretation = "excellent";
    else if (omega >= 0.8) interpretation = "good";
    else if (omega >= 0.7) interpretation = "acceptable";
    else if (omega >= 0.6) interpretation = "questionable";
    else interpretation = "poor";
    
    const parameters = [
      {
        name: "McDonald's Omega",
        estimate: omega
      },
      {
        name: "Average Inter-Item Correlation",
        estimate: avgCorr
      },
      {
        name: "Number of Items",
        estimate: k
      },
      {
        name: "Sample Size",
        estimate: validN
      }
    ];
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "other",
        value: omega,
        interpretation: interpretation as any
      }],
      conclusion: `McDonald's ω = ${omega.toFixed(3)} (${interpretation})`,
      interpretation: `Composite reliability was assessed using McDonald's omega. The ${k}-item scale demonstrated ${interpretation} reliability (ω = ${omega.toFixed(2)}). The average inter-item correlation was ${avgCorr.toFixed(2)}, suggesting ${avgCorr > 0.5 ? "strong" : avgCorr > 0.3 ? "moderate" : "weak"} item homogeneity.`,
      limitations: [
        "This is a simplified omega calculation assuming essentially tau-equivalent items.",
        "For heterogeneous items, factor-based omega (omega hierarchical) is recommended."
      ],
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 50;
  }
}
