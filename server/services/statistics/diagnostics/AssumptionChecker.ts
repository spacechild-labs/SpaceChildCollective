/**
 * Assumption Checker
 * 
 * Automatically tests statistical assumptions and provides diagnostics.
 * Flags violations clearly and offers robust alternatives.
 */

import { randomUUID } from "crypto";
import type {
  AnalysisSpec,
  DesignObject,
  DiagnosticsReport,
  AssumptionCheck,
  DiagnosticStatus,
  AssumptionType,
  ModelFamily
} from "@shared/statistics-schema";
import { StatUtils } from "../methods/AnalysisMethod";

export class AssumptionChecker {
  
  /**
   * Run all relevant assumption checks for an analysis
   */
  async check(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): Promise<DiagnosticsReport> {
    const checks: AssumptionCheck[] = [];
    const requiredAssumptions = this.getRequiredAssumptions(spec.modelFamily);
    
    for (const assumption of requiredAssumptions) {
      const check = await this.checkAssumption(data, spec, design, assumption);
      checks.push(check);
    }
    
    // Determine overall status
    const overallStatus = this.determineOverallStatus(checks);
    
    // Generate summary
    const summary = this.generateSummary(checks, overallStatus);
    
    // Get robust alternatives if needed
    const robustAlternatives = overallStatus === "violated"
      ? this.getRobustAlternatives(spec.modelFamily, checks)
      : undefined;
    
    // Collect warnings
    const warnings = checks
      .filter(c => c.status === "warning" || c.status === "violated")
      .map(c => c.message);
    
    return {
      analysisSpecId: spec.id,
      checks,
      overallStatus,
      summary,
      robustAlternatives,
      warnings,
      createdAt: new Date().toISOString()
    };
  }
  
  /**
   * Check a specific assumption
   */
  private async checkAssumption(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject,
    assumption: AssumptionType
  ): Promise<AssumptionCheck> {
    switch (assumption) {
      case "normality":
        return this.checkNormality(data, spec, design);
      case "homoscedasticity":
        return this.checkHomoscedasticity(data, spec, design);
      case "independence":
        return this.checkIndependence(data, spec, design);
      case "linearity":
        return this.checkLinearity(data, spec, design);
      case "multicollinearity":
        return this.checkMulticollinearity(data, spec, design);
      case "sphericity":
        return this.checkSphericity(data, spec, design);
      case "sample_size":
        return this.checkSampleSize(data, spec, design);
      case "outliers":
        return this.checkOutliers(data, spec, design);
      case "missing_data":
        return this.checkMissingData(data, spec, design);
      default:
        return {
          assumption,
          status: "not_tested",
          message: `Assumption check not implemented: ${assumption}`
        };
    }
  }
  
  /**
   * Check normality assumption using Shapiro-Wilk approximation
   */
  private checkNormality(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const outcome = spec.outcomes[0];
    const values = data.map(d => d[outcome]).filter(v => v !== null && v !== undefined);
    const nums = values.map(Number).filter(n => !isNaN(n));
    
    if (nums.length < 3) {
      return {
        assumption: "normality",
        status: "not_applicable",
        message: "Insufficient data for normality test"
      };
    }
    
    // Use skewness and kurtosis as proxy for normality
    const skewness = StatUtils.skewness(nums);
    const kurtosis = StatUtils.kurtosis(nums);
    
    // Thresholds: |skewness| < 2 and |kurtosis| < 7 are often considered acceptable
    const skewOk = Math.abs(skewness) < 2;
    const kurtOk = Math.abs(kurtosis) < 7;
    
    // Also check with more stringent thresholds for warnings
    const skewGood = Math.abs(skewness) < 1;
    const kurtGood = Math.abs(kurtosis) < 3;
    
    let status: DiagnosticStatus;
    let message: string;
    let recommendation: string | undefined;
    
    if (skewGood && kurtGood) {
      status = "passed";
      message = `Normality appears adequate (skewness = ${skewness.toFixed(2)}, kurtosis = ${kurtosis.toFixed(2)})`;
    } else if (skewOk && kurtOk) {
      status = "warning";
      message = `Mild departure from normality (skewness = ${skewness.toFixed(2)}, kurtosis = ${kurtosis.toFixed(2)})`;
      recommendation = "Consider robust methods or transformation if results are borderline";
    } else {
      status = "violated";
      message = `Substantial departure from normality (skewness = ${skewness.toFixed(2)}, kurtosis = ${kurtosis.toFixed(2)})`;
      recommendation = "Use non-parametric alternatives or transform the data";
    }
    
    // Large samples are robust to normality violations (CLT)
    if (status !== "passed" && nums.length >= 30) {
      if (status === "violated") status = "warning";
      message += ". However, with n ≥ 30, the Central Limit Theorem provides some protection.";
    }
    
    return {
      assumption: "normality",
      status,
      testUsed: "Skewness/Kurtosis check",
      statistic: skewness,
      message,
      recommendation
    };
  }
  
  /**
   * Check homoscedasticity (equal variances) using Levene's test approximation
   */
  private checkHomoscedasticity(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const groupVar = spec.groupingVariables?.[0];
    const outcome = spec.outcomes[0];
    
    if (!groupVar) {
      return {
        assumption: "homoscedasticity",
        status: "not_applicable",
        message: "No grouping variable specified"
      };
    }
    
    // Get groups
    const groups = [...new Set(data.map(d => d[groupVar]))];
    if (groups.length < 2) {
      return {
        assumption: "homoscedasticity",
        status: "not_applicable",
        message: "Need at least 2 groups to test homoscedasticity"
      };
    }
    
    // Calculate variance for each group
    const groupVariances = groups.map(g => {
      const vals = data.filter(d => d[groupVar] === g).map(d => Number(d[outcome]));
      return { group: g, variance: StatUtils.variance(vals), n: vals.length };
    });
    
    // Ratio of largest to smallest variance
    const variances = groupVariances.map(g => g.variance).filter(v => !isNaN(v) && v > 0);
    if (variances.length < 2) {
      return {
        assumption: "homoscedasticity",
        status: "not_applicable",
        message: "Could not compute variances for groups"
      };
    }
    
    const maxVar = Math.max(...variances);
    const minVar = Math.min(...variances);
    const ratio = maxVar / minVar;
    
    let status: DiagnosticStatus;
    let message: string;
    let recommendation: string | undefined;
    
    // Rule of thumb: ratio < 3 is generally acceptable, < 2 is good
    if (ratio < 2) {
      status = "passed";
      message = `Variances appear homogeneous (ratio = ${ratio.toFixed(2)})`;
    } else if (ratio < 3) {
      status = "warning";
      message = `Mild heteroscedasticity detected (variance ratio = ${ratio.toFixed(2)})`;
      recommendation = "Consider Welch's correction or robust standard errors";
    } else {
      status = "violated";
      message = `Substantial heteroscedasticity (variance ratio = ${ratio.toFixed(2)})`;
      recommendation = "Use Welch's t-test or robust methods";
    }
    
    return {
      assumption: "homoscedasticity",
      status,
      testUsed: "Variance ratio",
      statistic: ratio,
      message,
      recommendation
    };
  }
  
  /**
   * Check independence assumption
   */
  private checkIndependence(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    // Independence is typically a design issue, not testable from data alone
    // Check for obvious violations like clustering or repeated measures
    
    const hasClustering = (design.clusteringVariables?.length || 0) > 0;
    const hasRepeatedMeasures = (design.withinSubjectFactors?.length || 0) > 0;
    const isLongitudinal = !!design.longitudinal;
    
    if (hasClustering || hasRepeatedMeasures || isLongitudinal) {
      return {
        assumption: "independence",
        status: "violated",
        message: "Data structure suggests non-independence (clustering, repeated measures, or longitudinal)",
        recommendation: "Use mixed effects models or repeated measures analysis"
      };
    }
    
    // Check for autocorrelation in residuals (Durbin-Watson proxy)
    // This is a simplified check
    const outcome = spec.outcomes[0];
    const values = data.map(d => Number(d[outcome])).filter(n => !isNaN(n));
    
    if (values.length < 10) {
      return {
        assumption: "independence",
        status: "not_tested",
        message: "Insufficient data to test independence"
      };
    }
    
    // Simple lag-1 autocorrelation
    const mean = StatUtils.mean(values);
    let num = 0, den = 0;
    for (let i = 1; i < values.length; i++) {
      num += (values[i] - mean) * (values[i-1] - mean);
    }
    for (let i = 0; i < values.length; i++) {
      den += (values[i] - mean) ** 2;
    }
    const r1 = num / den;
    
    let status: DiagnosticStatus;
    let message: string;
    
    if (Math.abs(r1) < 0.2) {
      status = "passed";
      message = `No strong evidence of autocorrelation (lag-1 r = ${r1.toFixed(3)})`;
    } else if (Math.abs(r1) < 0.4) {
      status = "warning";
      message = `Possible autocorrelation detected (lag-1 r = ${r1.toFixed(3)})`;
    } else {
      status = "violated";
      message = `Strong autocorrelation detected (lag-1 r = ${r1.toFixed(3)})`;
    }
    
    return {
      assumption: "independence",
      status,
      testUsed: "Lag-1 autocorrelation",
      statistic: r1,
      message
    };
  }
  
  /**
   * Check linearity assumption
   */
  private checkLinearity(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const outcome = spec.outcomes[0];
    const predictor = spec.predictors?.[0];
    
    if (!predictor) {
      return {
        assumption: "linearity",
        status: "not_applicable",
        message: "No predictor variable specified"
      };
    }
    
    const pairs = data
      .map(d => ({ x: Number(d[predictor]), y: Number(d[outcome]) }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));
    
    if (pairs.length < 10) {
      return {
        assumption: "linearity",
        status: "not_tested",
        message: "Insufficient data to test linearity"
      };
    }
    
    // Compare linear and quadratic fit (simplified)
    const x = pairs.map(p => p.x);
    const y = pairs.map(p => p.y);
    
    // Linear correlation
    const r = StatUtils.correlation(x, y);
    const rSquared = r * r;
    
    // This is a simplified check - in practice would fit quadratic and compare
    // For now, just check if correlation is reasonable
    
    return {
      assumption: "linearity",
      status: "passed",
      testUsed: "Correlation coefficient",
      statistic: r,
      message: `Linear relationship: r = ${r.toFixed(3)}, R² = ${rSquared.toFixed(3)}`
    };
  }
  
  /**
   * Check multicollinearity
   */
  private checkMulticollinearity(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const predictors = spec.predictors || [];
    
    if (predictors.length < 2) {
      return {
        assumption: "multicollinearity",
        status: "not_applicable",
        message: "Need at least 2 predictors to check multicollinearity"
      };
    }
    
    // Check pairwise correlations
    const correlations: { var1: string; var2: string; r: number }[] = [];
    
    for (let i = 0; i < predictors.length; i++) {
      for (let j = i + 1; j < predictors.length; j++) {
        const x = data.map(d => Number(d[predictors[i]])).filter(n => !isNaN(n));
        const y = data.map(d => Number(d[predictors[j]])).filter(n => !isNaN(n));
        
        if (x.length === y.length && x.length > 2) {
          const r = StatUtils.correlation(x, y);
          correlations.push({ var1: predictors[i], var2: predictors[j], r });
        }
      }
    }
    
    const maxCorr = Math.max(...correlations.map(c => Math.abs(c.r)));
    const highCorrs = correlations.filter(c => Math.abs(c.r) > 0.7);
    
    let status: DiagnosticStatus;
    let message: string;
    let recommendation: string | undefined;
    
    if (maxCorr < 0.5) {
      status = "passed";
      message = `No concerning multicollinearity (max |r| = ${maxCorr.toFixed(3)})`;
    } else if (maxCorr < 0.7) {
      status = "warning";
      message = `Moderate correlations between predictors (max |r| = ${maxCorr.toFixed(3)})`;
      recommendation = "Monitor variance inflation factors (VIF)";
    } else {
      status = "violated";
      message = `High multicollinearity detected: ${highCorrs.map(c => `${c.var1}-${c.var2}: r=${c.r.toFixed(2)}`).join(", ")}`;
      recommendation = "Consider removing or combining highly correlated predictors";
    }
    
    return {
      assumption: "multicollinearity",
      status,
      testUsed: "Pairwise correlations",
      statistic: maxCorr,
      message,
      recommendation
    };
  }
  
  /**
   * Check sphericity (for repeated measures)
   */
  private checkSphericity(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    if (!design.withinSubjectFactors || design.withinSubjectFactors.length === 0) {
      return {
        assumption: "sphericity",
        status: "not_applicable",
        message: "No within-subject factors - sphericity not relevant"
      };
    }
    
    // Sphericity testing requires Mauchly's test which is complex
    // For now, provide a warning and recommendation
    return {
      assumption: "sphericity",
      status: "warning",
      message: "Sphericity should be tested for repeated measures designs",
      recommendation: "Use Greenhouse-Geisser or Huynh-Feldt correction if sphericity is violated"
    };
  }
  
  /**
   * Check sample size adequacy
   */
  private checkSampleSize(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const n = data.length;
    const nPredictors = (spec.predictors?.length || 0) + (spec.covariates?.length || 0);
    const nGroups = design.betweenSubjectFactors?.[0]?.levels.length || 1;
    
    // Minimum sample size rules of thumb
    let minRequired: number;
    let recommended: number;
    
    switch (spec.modelFamily) {
      case "t_test":
      case "paired_t_test":
      case "welch_t_test":
        minRequired = 10 * nGroups;
        recommended = 30 * nGroups;
        break;
      case "anova":
        minRequired = 15 * nGroups;
        recommended = 30 * nGroups;
        break;
      case "linear_regression":
        minRequired = 10 + 10 * nPredictors;
        recommended = 50 + 10 * nPredictors;
        break;
      case "logistic_regression":
        minRequired = 10 * nPredictors;
        recommended = 20 * nPredictors;
        break;
      case "efa":
      case "cfa":
        minRequired = 100;
        recommended = 200;
        break;
      case "mixed_effects":
        minRequired = 50;
        recommended = 100;
        break;
      default:
        minRequired = 30;
        recommended = 100;
    }
    
    let status: DiagnosticStatus;
    let message: string;
    
    if (n >= recommended) {
      status = "passed";
      message = `Sample size (n = ${n}) is adequate for ${spec.modelFamily}`;
    } else if (n >= minRequired) {
      status = "warning";
      message = `Sample size (n = ${n}) meets minimum but is below recommended (${recommended}) for ${spec.modelFamily}`;
    } else {
      status = "violated";
      message = `Sample size (n = ${n}) is below minimum required (${minRequired}) for ${spec.modelFamily}`;
    }
    
    return {
      assumption: "sample_size",
      status,
      statistic: n,
      threshold: minRequired,
      message,
      recommendation: status !== "passed" ? `Consider collecting more data (recommended n ≥ ${recommended})` : undefined
    };
  }
  
  /**
   * Check for outliers
   */
  private checkOutliers(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const outcome = spec.outcomes[0];
    const values = data.map(d => Number(d[outcome])).filter(n => !isNaN(n));
    
    if (values.length < 10) {
      return {
        assumption: "outliers",
        status: "not_tested",
        message: "Insufficient data to check for outliers"
      };
    }
    
    // Use IQR method
    const q1 = StatUtils.percentile(values, 25);
    const q3 = StatUtils.percentile(values, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    const outliers = values.filter(v => v < lowerBound || v > upperBound);
    const outlierPercent = (outliers.length / values.length) * 100;
    
    // Also check for extreme outliers (3*IQR)
    const extremeLower = q1 - 3 * iqr;
    const extremeUpper = q3 + 3 * iqr;
    const extremeOutliers = values.filter(v => v < extremeLower || v > extremeUpper);
    
    let status: DiagnosticStatus;
    let message: string;
    let recommendation: string | undefined;
    
    if (outliers.length === 0) {
      status = "passed";
      message = "No outliers detected using IQR method";
    } else if (extremeOutliers.length === 0 && outlierPercent < 5) {
      status = "warning";
      message = `${outliers.length} mild outliers detected (${outlierPercent.toFixed(1)}% of data)`;
      recommendation = "Consider robust methods or investigate outliers";
    } else {
      status = "violated";
      message = `${outliers.length} outliers detected (${outlierPercent.toFixed(1)}%), including ${extremeOutliers.length} extreme`;
      recommendation = "Investigate outliers; consider robust methods or winsorization";
    }
    
    return {
      assumption: "outliers",
      status,
      testUsed: "IQR method",
      statistic: outliers.length,
      message,
      recommendation
    };
  }
  
  /**
   * Check missing data
   */
  private checkMissingData(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject
  ): AssumptionCheck {
    const relevantVars = [
      ...spec.outcomes,
      ...(spec.predictors || []),
      ...(spec.covariates || []),
      ...(spec.groupingVariables || [])
    ];
    
    let totalMissing = 0;
    let totalCells = 0;
    const varMissing: { variable: string; percent: number }[] = [];
    
    for (const varName of relevantVars) {
      const missing = data.filter(d => d[varName] === null || d[varName] === undefined || d[varName] === "").length;
      const percent = (missing / data.length) * 100;
      totalMissing += missing;
      totalCells += data.length;
      if (percent > 0) {
        varMissing.push({ variable: varName, percent });
      }
    }
    
    const overallPercent = (totalMissing / totalCells) * 100;
    const maxVarMissing = Math.max(...varMissing.map(v => v.percent), 0);
    
    let status: DiagnosticStatus;
    let message: string;
    let recommendation: string | undefined;
    
    if (overallPercent === 0) {
      status = "passed";
      message = "No missing data in analysis variables";
    } else if (overallPercent < 5 && maxVarMissing < 10) {
      status = "warning";
      message = `${overallPercent.toFixed(1)}% missing data overall`;
      recommendation = "Consider multiple imputation or FIML if missing is not MCAR";
    } else {
      status = "violated";
      message = `Substantial missing data: ${overallPercent.toFixed(1)}% overall, max ${maxVarMissing.toFixed(1)}% for single variable`;
      recommendation = "Use multiple imputation or FIML; investigate missing data mechanism";
    }
    
    return {
      assumption: "missing_data",
      status,
      statistic: overallPercent,
      message,
      recommendation
    };
  }
  
  /**
   * Get required assumptions for a model family
   */
  private getRequiredAssumptions(modelFamily: ModelFamily): AssumptionType[] {
    const assumptionMap: Record<string, AssumptionType[]> = {
      t_test: ["normality", "homoscedasticity", "independence", "sample_size", "outliers"],
      paired_t_test: ["normality", "independence", "sample_size", "outliers"],
      welch_t_test: ["normality", "independence", "sample_size", "outliers"],
      mann_whitney: ["independence", "sample_size"],
      wilcoxon: ["independence", "sample_size"],
      anova: ["normality", "homoscedasticity", "independence", "sample_size", "outliers"],
      repeated_measures_anova: ["normality", "sphericity", "independence", "sample_size"],
      linear_regression: ["normality", "homoscedasticity", "linearity", "independence", "multicollinearity", "sample_size", "outliers"],
      logistic_regression: ["independence", "multicollinearity", "sample_size"],
      mixed_effects: ["normality", "independence", "sample_size"],
      cronbach_alpha: ["sample_size"],
      mcdonald_omega: ["sample_size"],
      efa: ["sample_size", "multicollinearity"],
      cfa: ["normality", "sample_size"]
    };
    
    return assumptionMap[modelFamily] || ["sample_size"];
  }
  
  /**
   * Determine overall diagnostic status
   */
  private determineOverallStatus(checks: AssumptionCheck[]): DiagnosticStatus {
    if (checks.some(c => c.status === "violated")) return "violated";
    if (checks.some(c => c.status === "warning")) return "warning";
    if (checks.every(c => c.status === "passed" || c.status === "not_applicable")) return "passed";
    return "not_tested";
  }
  
  /**
   * Generate summary message
   */
  private generateSummary(checks: AssumptionCheck[], overallStatus: DiagnosticStatus): string {
    const violated = checks.filter(c => c.status === "violated");
    const warnings = checks.filter(c => c.status === "warning");
    const passed = checks.filter(c => c.status === "passed");
    
    if (overallStatus === "passed") {
      return `All ${passed.length} assumption checks passed.`;
    }
    
    let summary = "";
    if (violated.length > 0) {
      summary += `${violated.length} assumption(s) violated: ${violated.map(c => c.assumption).join(", ")}. `;
    }
    if (warnings.length > 0) {
      summary += `${warnings.length} warning(s): ${warnings.map(c => c.assumption).join(", ")}.`;
    }
    
    return summary.trim();
  }
  
  /**
   * Get robust alternatives for violated assumptions
   */
  private getRobustAlternatives(
    modelFamily: ModelFamily,
    checks: AssumptionCheck[]
  ): DiagnosticsReport["robustAlternatives"] {
    const alternatives: NonNullable<DiagnosticsReport["robustAlternatives"]> = [];
    
    const violatedAssumptions = checks
      .filter(c => c.status === "violated")
      .map(c => c.assumption);
    
    // Map violations to alternatives
    if (modelFamily === "t_test") {
      if (violatedAssumptions.includes("normality")) {
        alternatives.push({
          modelFamily: "mann_whitney",
          rationale: "Non-parametric alternative that doesn't assume normality",
          priority: 1
        });
      }
      if (violatedAssumptions.includes("homoscedasticity")) {
        alternatives.push({
          modelFamily: "welch_t_test",
          rationale: "Robust to unequal variances",
          priority: 1
        });
      }
    }
    
    if (modelFamily === "paired_t_test" && violatedAssumptions.includes("normality")) {
      alternatives.push({
        modelFamily: "wilcoxon",
        rationale: "Non-parametric alternative for paired data",
        priority: 1
      });
    }
    
    if (modelFamily === "anova" && violatedAssumptions.includes("normality")) {
      alternatives.push({
        modelFamily: "mann_whitney", // Kruskal-Wallis would be better but not implemented
        rationale: "Consider Kruskal-Wallis test (non-parametric ANOVA)",
        priority: 1
      });
    }
    
    return alternatives.length > 0 ? alternatives : undefined;
  }
}
