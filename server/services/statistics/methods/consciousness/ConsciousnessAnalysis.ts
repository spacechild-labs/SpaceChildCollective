/**
 * Consciousness-Specific Analysis Methods
 * 
 * Specialized statistical methods for consciousness research,
 * including phi analysis, coherence metrics, and signal detection.
 */

import { randomUUID } from "crypto";
import type { AnalysisSpec, AnalysisResult, DesignObject } from "@shared/statistics-schema";
import type { AnalysisMethod } from "../AnalysisMethod";
import { StatUtils } from "../AnalysisMethod";

/**
 * Phi (Integrated Information) Analysis
 * Analyzes consciousness metrics based on integrated information theory
 */
export class PhiAnalysisMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const phiVar = spec.outcomes[0];
    const groupVar = spec.groupingVariables?.[0];
    
    // Get phi values
    const phiValues = data.map(d => Number(d[phiVar])).filter(n => !isNaN(n));
    const n = phiValues.length;
    
    if (n < 5) {
      throw new Error("Insufficient phi measurements for analysis");
    }
    
    // Basic statistics
    const mean = StatUtils.mean(phiValues);
    const sd = StatUtils.sd(phiValues);
    const median = StatUtils.median(phiValues);
    const min = Math.min(...phiValues);
    const max = Math.max(...phiValues);
    
    // Consciousness threshold analysis (phi > 0 indicates integrated information)
    const aboveThreshold = phiValues.filter(p => p > 0).length;
    const proportionConscious = aboveThreshold / n;
    
    // One-sample t-test against threshold of 0
    const se = sd / Math.sqrt(n);
    const t = mean / se;
    const df = n - 1;
    const pValue = StatUtils.tPValue(t, df);
    
    // Effect size (Cohen's d against 0)
    const cohensD = mean / sd;
    
    // Temporal stability (if multiple measurements)
    let temporalStability: number | undefined;
    if (n >= 10) {
      // Lag-1 autocorrelation as stability measure
      let num = 0, den = 0;
      for (let i = 1; i < n; i++) {
        num += (phiValues[i] - mean) * (phiValues[i-1] - mean);
      }
      for (let i = 0; i < n; i++) {
        den += (phiValues[i] - mean) ** 2;
      }
      temporalStability = num / den;
    }
    
    // Group comparison if grouping variable provided
    let groupComparison: any;
    if (groupVar) {
      const groups = Array.from(new Set(data.map(d => d[groupVar])));
      if (groups.length === 2) {
        const g1 = data.filter(d => d[groupVar] === groups[0]).map(d => Number(d[phiVar])).filter(n => !isNaN(n));
        const g2 = data.filter(d => d[groupVar] === groups[1]).map(d => Number(d[phiVar])).filter(n => !isNaN(n));
        
        const m1 = StatUtils.mean(g1), m2 = StatUtils.mean(g2);
        const v1 = StatUtils.variance(g1), v2 = StatUtils.variance(g2);
        const pooledVar = ((g1.length - 1) * v1 + (g2.length - 1) * v2) / (g1.length + g2.length - 2);
        const seGroup = Math.sqrt(pooledVar * (1/g1.length + 1/g2.length));
        const tGroup = (m1 - m2) / seGroup;
        const dfGroup = g1.length + g2.length - 2;
        const pGroup = StatUtils.tPValue(tGroup, dfGroup);
        const dGroup = (m1 - m2) / Math.sqrt(pooledVar);
        
        groupComparison = {
          groups: [groups[0], groups[1]],
          means: [m1, m2],
          t: tGroup,
          df: dfGroup,
          p: pGroup,
          d: dGroup
        };
      }
    }
    
    const significant = pValue < spec.alpha;
    
    const parameters = [
      { name: "Mean Phi", estimate: mean, se },
      { name: "SD", estimate: sd },
      { name: "Median", estimate: median },
      { name: "Range", estimate: max - min },
      { name: "Proportion Above Threshold", estimate: proportionConscious },
      { name: "t-statistic (vs 0)", estimate: t, testStatistic: t, testType: "t", df, pValue }
    ];
    
    if (temporalStability !== undefined) {
      parameters.push({ name: "Temporal Stability (r₁)", estimate: temporalStability });
    }
    
    if (groupComparison) {
      parameters.push({
        name: `Group Difference (${groupComparison.groups[0]} - ${groupComparison.groups[1]})`,
        estimate: groupComparison.means[0] - groupComparison.means[1],
        testStatistic: groupComparison.t,
        testType: "t",
        df: groupComparison.df,
        pValue: groupComparison.p
      });
    }
    
    // Interpretation of phi levels
    let phiInterpretation: string;
    if (mean > 0.5) phiInterpretation = "high integrated information";
    else if (mean > 0.2) phiInterpretation = "moderate integrated information";
    else if (mean > 0) phiInterpretation = "low but positive integrated information";
    else phiInterpretation = "no significant integrated information";
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "cohens_d",
        value: cohensD,
        interpretation: StatUtils.interpretCohensD(cohensD)
      }],
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: `Phi analysis: M = ${mean.toFixed(3)}, SD = ${sd.toFixed(3)}, t(${df}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}`,
      interpretation: `Analysis of integrated information (phi) values revealed ${phiInterpretation} (M = ${mean.toFixed(3)}, SD = ${sd.toFixed(3)}). ${(proportionConscious * 100).toFixed(1)}% of measurements exceeded the consciousness threshold (phi > 0). The mean phi value was ${significant ? "significantly" : "not significantly"} different from zero, t(${df}) = ${t.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}, d = ${cohensD.toFixed(2)}.${temporalStability !== undefined ? ` Temporal stability was ${temporalStability > 0.5 ? "high" : temporalStability > 0.2 ? "moderate" : "low"} (r₁ = ${temporalStability.toFixed(2)}).` : ""}${groupComparison ? ` Group comparison revealed ${groupComparison.p < spec.alpha ? "a significant" : "no significant"} difference in phi values between conditions (d = ${groupComparison.d.toFixed(2)}).` : ""}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}

/**
 * Signal Detection Analysis for Consciousness Experiments
 * Analyzes hit rates, false alarms, and d' (sensitivity)
 */
export class SignalDetectionMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    // Expected variables: response (0/1), signal_present (0/1)
    const responseVar = spec.outcomes[0];
    const signalVar = spec.predictors?.[0] || "signal_present";
    
    // Calculate signal detection metrics
    let hits = 0, misses = 0, falseAlarms = 0, correctRejections = 0;
    
    for (const row of data) {
      const response = Number(row[responseVar]);
      const signal = Number(row[signalVar]);
      
      if (isNaN(response) || isNaN(signal)) continue;
      
      if (signal === 1 && response === 1) hits++;
      else if (signal === 1 && response === 0) misses++;
      else if (signal === 0 && response === 1) falseAlarms++;
      else if (signal === 0 && response === 0) correctRejections++;
    }
    
    const totalSignal = hits + misses;
    const totalNoise = falseAlarms + correctRejections;
    const total = totalSignal + totalNoise;
    
    if (totalSignal < 5 || totalNoise < 5) {
      throw new Error("Insufficient trials for signal detection analysis");
    }
    
    // Hit rate and false alarm rate (with correction for extreme values)
    let hitRate = hits / totalSignal;
    let faRate = falseAlarms / totalNoise;
    
    // Apply log-linear correction for extreme values
    if (hitRate === 0) hitRate = 0.5 / totalSignal;
    if (hitRate === 1) hitRate = (totalSignal - 0.5) / totalSignal;
    if (faRate === 0) faRate = 0.5 / totalNoise;
    if (faRate === 1) faRate = (totalNoise - 0.5) / totalNoise;
    
    // Calculate d' (sensitivity)
    const zHit = StatUtils.normalQuantile(hitRate);
    const zFA = StatUtils.normalQuantile(faRate);
    const dPrime = zHit - zFA;
    
    // Calculate criterion (c)
    const criterion = -0.5 * (zHit + zFA);
    
    // Calculate beta (response bias)
    const beta = Math.exp(criterion * dPrime);
    
    // Standard error of d' (approximation)
    const seDPrime = Math.sqrt(
      (hitRate * (1 - hitRate)) / (totalSignal * Math.pow(this.normalPDF(zHit), 2)) +
      (faRate * (1 - faRate)) / (totalNoise * Math.pow(this.normalPDF(zFA), 2))
    );
    
    // Test if d' is significantly different from 0
    const zTest = dPrime / seDPrime;
    const pValue = 2 * (1 - StatUtils.normalCDF(Math.abs(zTest)));
    
    // 95% CI for d'
    const ciLower = dPrime - 1.96 * seDPrime;
    const ciUpper = dPrime + 1.96 * seDPrime;
    
    // Accuracy
    const accuracy = (hits + correctRejections) / total;
    
    // Chance-level comparison
    const chanceAccuracy = 0.5;
    const seAccuracy = Math.sqrt(chanceAccuracy * (1 - chanceAccuracy) / total);
    const zAccuracy = (accuracy - chanceAccuracy) / seAccuracy;
    const pAccuracy = 2 * (1 - StatUtils.normalCDF(Math.abs(zAccuracy)));
    
    const significant = pValue < spec.alpha;
    
    const parameters = [
      { name: "Hits", estimate: hits },
      { name: "Misses", estimate: misses },
      { name: "False Alarms", estimate: falseAlarms },
      { name: "Correct Rejections", estimate: correctRejections },
      { name: "Hit Rate", estimate: hitRate },
      { name: "False Alarm Rate", estimate: faRate },
      { name: "d' (Sensitivity)", estimate: dPrime, se: seDPrime, ci: { lower: ciLower, upper: ciUpper, level: 0.95 }, pValue },
      { name: "Criterion (c)", estimate: criterion },
      { name: "Beta (Response Bias)", estimate: beta },
      { name: "Accuracy", estimate: accuracy, pValue: pAccuracy }
    ];
    
    // Interpretation of d'
    let sensitivityInterpretation: string;
    if (dPrime > 2) sensitivityInterpretation = "excellent";
    else if (dPrime > 1) sensitivityInterpretation = "good";
    else if (dPrime > 0.5) sensitivityInterpretation = "moderate";
    else if (dPrime > 0) sensitivityInterpretation = "poor";
    else sensitivityInterpretation = "at or below chance";
    
    // Interpretation of criterion
    let biasInterpretation: string;
    if (criterion > 0.5) biasInterpretation = "conservative (tendency to say 'no')";
    else if (criterion < -0.5) biasInterpretation = "liberal (tendency to say 'yes')";
    else biasInterpretation = "neutral";
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "cohens_d",
        value: dPrime,
        ci: { lower: ciLower, upper: ciUpper, level: 0.95 },
        interpretation: sensitivityInterpretation as any
      }],
      pValue,
      conclusion: `Signal detection: d' = ${dPrime.toFixed(3)}, 95% CI [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}], p = ${pValue.toFixed(4)}`,
      interpretation: `Signal detection analysis was performed on ${total} trials (${totalSignal} signal-present, ${totalNoise} signal-absent). Sensitivity (d' = ${dPrime.toFixed(2)}) was ${sensitivityInterpretation}, ${significant ? "significantly" : "not significantly"} different from chance (z = ${zTest.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}). The response criterion was ${biasInterpretation} (c = ${criterion.toFixed(2)}). Overall accuracy was ${(accuracy * 100).toFixed(1)}%, which was ${pAccuracy < spec.alpha ? "significantly" : "not significantly"} above chance (50%).`,
      createdAt: new Date().toISOString()
    };
  }
  
  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }
  
  getRequiredAssumptions(): string[] {
    return ["independence", "sample_size"];
  }
  
  getMinimumSampleSize(): number {
    return 20;
  }
}

/**
 * Coherence Analysis for Consciousness Experiments
 * Analyzes temporal coherence and synchronization metrics
 */
export class CoherenceAnalysisMethod implements AnalysisMethod {
  async execute(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<AnalysisResult> {
    const coherenceVar = spec.outcomes[0];
    const baselineVar = spec.predictors?.[0];
    const groupVar = spec.groupingVariables?.[0];
    
    // Get coherence values
    const coherenceValues = data.map(d => Number(d[coherenceVar])).filter(n => !isNaN(n) && n >= 0 && n <= 1);
    const n = coherenceValues.length;
    
    if (n < 5) {
      throw new Error("Insufficient coherence measurements");
    }
    
    // Basic statistics
    const mean = StatUtils.mean(coherenceValues);
    const sd = StatUtils.sd(coherenceValues);
    const median = StatUtils.median(coherenceValues);
    
    // Compare to baseline if provided
    let baselineComparison: any;
    if (baselineVar) {
      const baselineValues = data.map(d => Number(d[baselineVar])).filter(n => !isNaN(n));
      if (baselineValues.length >= 5) {
        const baselineMean = StatUtils.mean(baselineValues);
        const baselineSD = StatUtils.sd(baselineValues);
        
        // Paired comparison
        const pairs = data
          .map(d => ({ c: Number(d[coherenceVar]), b: Number(d[baselineVar]) }))
          .filter(p => !isNaN(p.c) && !isNaN(p.b));
        
        if (pairs.length >= 5) {
          const diffs = pairs.map(p => p.c - p.b);
          const meanDiff = StatUtils.mean(diffs);
          const sdDiff = StatUtils.sd(diffs);
          const seDiff = sdDiff / Math.sqrt(pairs.length);
          const tDiff = meanDiff / seDiff;
          const dfDiff = pairs.length - 1;
          const pDiff = StatUtils.tPValue(tDiff, dfDiff);
          const dDiff = meanDiff / sdDiff;
          
          baselineComparison = {
            baselineMean,
            baselineSD,
            meanDifference: meanDiff,
            t: tDiff,
            df: dfDiff,
            p: pDiff,
            d: dDiff
          };
        }
      }
    }
    
    // High coherence threshold analysis (coherence > 0.7 often considered "synchronized")
    const highCoherenceThreshold = 0.7;
    const highCoherenceCount = coherenceValues.filter(c => c > highCoherenceThreshold).length;
    const highCoherenceProportion = highCoherenceCount / n;
    
    // Test if mean coherence is above chance (0.5 for random)
    const chanceLevel = 0.5;
    const se = sd / Math.sqrt(n);
    const t = (mean - chanceLevel) / se;
    const df = n - 1;
    const pValue = StatUtils.tPValue(t, df);
    
    // Effect size
    const cohensD = (mean - chanceLevel) / sd;
    
    const significant = pValue < spec.alpha;
    
    const parameters = [
      { name: "Mean Coherence", estimate: mean, se },
      { name: "SD", estimate: sd },
      { name: "Median", estimate: median },
      { name: "High Coherence Proportion (>0.7)", estimate: highCoherenceProportion },
      { name: "t-statistic (vs chance)", estimate: t, testStatistic: t, testType: "t", df, pValue }
    ];
    
    if (baselineComparison) {
      parameters.push({
        name: "Change from Baseline",
        estimate: baselineComparison.meanDifference,
        testStatistic: baselineComparison.t,
        testType: "t",
        df: baselineComparison.df,
        pValue: baselineComparison.p
      });
    }
    
    // Interpretation
    let coherenceInterpretation: string;
    if (mean > 0.8) coherenceInterpretation = "very high coherence";
    else if (mean > 0.6) coherenceInterpretation = "high coherence";
    else if (mean > 0.4) coherenceInterpretation = "moderate coherence";
    else coherenceInterpretation = "low coherence";
    
    return {
      id: randomUUID(),
      analysisSpecId: spec.id,
      parameters,
      effectSizes: [{
        type: "cohens_d",
        value: cohensD,
        interpretation: StatUtils.interpretCohensD(cohensD)
      }],
      testStatistic: t,
      testType: "t",
      df,
      pValue,
      conclusion: `Coherence analysis: M = ${mean.toFixed(3)}, SD = ${sd.toFixed(3)}, t(${df}) = ${t.toFixed(3)}, p = ${pValue.toFixed(4)}`,
      interpretation: `Analysis of coherence values revealed ${coherenceInterpretation} (M = ${mean.toFixed(3)}, SD = ${sd.toFixed(3)}). ${(highCoherenceProportion * 100).toFixed(1)}% of measurements showed high coherence (>0.7). Mean coherence was ${significant ? "significantly" : "not significantly"} above chance level (0.5), t(${df}) = ${t.toFixed(2)}, p = ${pValue < 0.001 ? "< .001" : pValue.toFixed(3)}, d = ${cohensD.toFixed(2)}.${baselineComparison ? ` Compared to baseline, coherence ${baselineComparison.p < spec.alpha ? "significantly" : "did not significantly"} ${baselineComparison.meanDifference > 0 ? "increased" : "decreased"} (d = ${baselineComparison.d.toFixed(2)}).` : ""}`,
      createdAt: new Date().toISOString()
    };
  }
  
  getRequiredAssumptions(): string[] {
    return ["normality", "independence"];
  }
  
  getMinimumSampleSize(): number {
    return 10;
  }
}
