/**
 * APA Reporter
 * 
 * Generates APA-style statistical reports with proper formatting,
 * effect sizes, confidence intervals, and interpretation.
 */

import { randomUUID } from "crypto";
import type {
  AnalysisSpec,
  AnalysisResult,
  DiagnosticsReport,
  DesignObject,
  APAReport,
  APAReportSection,
  EffectSize
} from "@shared/statistics-schema";

export class APAReporter {
  
  /**
   * Generate a complete APA-style report
   */
  async generate(
    spec: AnalysisSpec,
    result: AnalysisResult,
    diagnostics: DiagnosticsReport,
    design: DesignObject
  ): Promise<APAReport> {
    const sections = {
      purpose: this.generatePurposeSection(spec, design),
      methodSelection: this.generateMethodSelectionSection(spec),
      assumptionChecks: this.generateAssumptionSection(diagnostics),
      results: this.generateResultsSection(spec, result, design),
      interpretation: this.generateInterpretationSection(spec, result),
      limitations: this.generateLimitationsSection(diagnostics, design)
    };
    
    const inlineStatistics = this.generateInlineStatistics(spec, result);
    
    return {
      id: randomUUID(),
      analysisResultId: result.id,
      sections,
      inlineStatistics,
      createdAt: new Date().toISOString()
    };
  }
  
  /**
   * Generate purpose section
   */
  private generatePurposeSection(spec: AnalysisSpec, design: DesignObject): APAReportSection {
    const outcomeDesc = spec.outcomes.join(", ");
    const predictorDesc = spec.predictors?.join(", ") || "N/A";
    const groupDesc = spec.groupingVariables?.join(", ") || "N/A";
    
    let purposeText = `The purpose of this analysis was to examine `;
    
    if (spec.groupingVariables && spec.groupingVariables.length > 0) {
      purposeText += `differences in ${outcomeDesc} across groups defined by ${groupDesc}`;
    } else if (spec.predictors && spec.predictors.length > 0) {
      purposeText += `the relationship between ${predictorDesc} and ${outcomeDesc}`;
    } else {
      purposeText += `the distribution of ${outcomeDesc}`;
    }
    
    purposeText += `. This analysis was conducted as ${spec.mode === "exploratory" ? "an exploratory" : "a confirmatory"} investigation`;
    
    if (spec.preregistered) {
      purposeText += " with preregistered hypotheses";
    }
    
    purposeText += `.`;
    
    return {
      title: "Purpose of Analysis",
      content: purposeText,
      tables: [{
        title: "Study Design Summary",
        headers: ["Characteristic", "Value"],
        rows: [
          ["Sample Size", design.sampleSize.toString()],
          ["Unit of Analysis", design.unitOfAnalysis],
          ["Outcome Variable(s)", outcomeDesc],
          ["Predictor Variable(s)", predictorDesc],
          ["Grouping Variable(s)", groupDesc],
          ["Analysis Mode", spec.mode]
        ]
      }]
    };
  }
  
  /**
   * Generate method selection section
   */
  private generateMethodSelectionSection(spec: AnalysisSpec): APAReportSection {
    const methodName = this.getMethodDisplayName(spec.modelFamily);
    
    let content = `A ${methodName} was selected for this analysis. `;
    
    if (spec.methodRationale) {
      content += spec.methodRationale + " ";
    }
    
    content += `The analysis was conducted with α = ${spec.alpha}`;
    
    if (spec.correctionMethod && spec.correctionMethod !== "none") {
      content += ` using ${this.getCorrectionDisplayName(spec.correctionMethod)} correction for multiple comparisons`;
    }
    
    content += ".";
    
    return {
      title: "Method Selection",
      content
    };
  }
  
  /**
   * Generate assumption checks section
   */
  private generateAssumptionSection(diagnostics: DiagnosticsReport): APAReportSection {
    let content = "";
    
    if (diagnostics.overallStatus === "passed") {
      content = "All statistical assumptions were evaluated and met. ";
    } else if (diagnostics.overallStatus === "warning") {
      content = "Statistical assumptions were evaluated with some concerns noted. ";
    } else if (diagnostics.overallStatus === "violated") {
      content = "One or more statistical assumptions were violated. ";
    }
    
    content += diagnostics.summary;
    
    const rows = diagnostics.checks.map(check => [
      check.assumption.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      this.getStatusSymbol(check.status),
      check.message
    ]);
    
    return {
      title: "Assumption Checks",
      content,
      tables: [{
        title: "Assumption Check Results",
        headers: ["Assumption", "Status", "Details"],
        rows,
        notes: diagnostics.warnings.length > 0 
          ? `Warnings: ${diagnostics.warnings.join("; ")}`
          : undefined
      }]
    };
  }
  
  /**
   * Generate results section
   */
  private generateResultsSection(
    spec: AnalysisSpec,
    result: AnalysisResult,
    design: DesignObject
  ): APAReportSection {
    let content = "";
    
    // Main test result
    if (result.testStatistic !== undefined && result.pValue !== undefined) {
      const apaString = this.formatTestResult(result);
      content += `The ${this.getMethodDisplayName(spec.modelFamily)} revealed ${result.pValue < spec.alpha ? "a significant" : "no significant"} effect, ${apaString}. `;
    }
    
    // Effect sizes
    if (result.effectSizes && result.effectSizes.length > 0) {
      const primaryEffect = result.effectSizes[0];
      content += `The effect size was ${primaryEffect.interpretation || "not classified"} (${this.formatEffectSize(primaryEffect)}). `;
    }
    
    // Model fit (if applicable)
    if (result.modelFit?.rSquared !== undefined) {
      content += `The model explained ${(result.modelFit.rSquared * 100).toFixed(1)}% of the variance in the outcome. `;
    }
    
    // Parameter estimates table
    const paramRows = result.parameters.map(p => {
      const row = [p.name, p.estimate.toFixed(3)];
      if (p.se !== undefined) row.push(p.se.toFixed(3));
      if (p.ci) row.push(`[${p.ci.lower.toFixed(3)}, ${p.ci.upper.toFixed(3)}]`);
      if (p.pValue !== undefined) row.push(this.formatPValue(p.pValue));
      return row;
    });
    
    const paramHeaders = ["Parameter", "Estimate"];
    if (result.parameters.some(p => p.se !== undefined)) paramHeaders.push("SE");
    if (result.parameters.some(p => p.ci)) paramHeaders.push("95% CI");
    if (result.parameters.some(p => p.pValue !== undefined)) paramHeaders.push("p");
    
    return {
      title: "Results",
      content,
      tables: [{
        title: "Parameter Estimates",
        headers: paramHeaders,
        rows: paramRows
      }]
    };
  }
  
  /**
   * Generate interpretation section
   */
  private generateInterpretationSection(spec: AnalysisSpec, result: AnalysisResult): APAReportSection {
    let content = "";
    
    if (result.conclusion) {
      content += result.conclusion + " ";
    }
    
    if (result.interpretation) {
      content += result.interpretation + " ";
    }
    
    // Add standard interpretation based on p-value
    if (result.pValue !== undefined) {
      if (result.pValue < spec.alpha) {
        content += `Given the significant result (p < ${spec.alpha}), we ${spec.mode === "confirmatory" ? "reject the null hypothesis" : "note evidence against the null hypothesis"}. `;
      } else {
        content += `The non-significant result (p ≥ ${spec.alpha}) ${spec.mode === "confirmatory" ? "fails to reject the null hypothesis" : "does not provide evidence against the null hypothesis"}. `;
      }
    }
    
    // Effect size interpretation
    if (result.effectSizes && result.effectSizes.length > 0) {
      const effect = result.effectSizes[0];
      if (effect.interpretation) {
        content += `The ${effect.interpretation} effect size suggests ${this.getEffectSizeInterpretation(effect)}. `;
      }
    }
    
    // Exploratory analysis caveat
    if (spec.mode === "exploratory") {
      content += "As this was an exploratory analysis, these findings should be interpreted with caution and replicated in confirmatory studies.";
    }
    
    return {
      title: "Interpretation",
      content
    };
  }
  
  /**
   * Generate limitations section
   */
  private generateLimitationsSection(
    diagnostics: DiagnosticsReport,
    design: DesignObject
  ): APAReportSection {
    const limitations: string[] = [];
    
    // Add limitations from diagnostics
    if (diagnostics.overallStatus === "violated") {
      limitations.push("One or more statistical assumptions were violated, which may affect the validity of the results.");
    }
    
    // Sample size limitations
    if (design.sampleSize < 50) {
      limitations.push("The relatively small sample size may limit statistical power and generalizability.");
    }
    
    // Missing data
    const highMissing = design.variables.filter(v => v.missingPercent > 5);
    if (highMissing.length > 0) {
      limitations.push(`Missing data was present in some variables (${highMissing.map(v => v.name).join(", ")}), which may introduce bias.`);
    }
    
    // Add specific assumption violations
    const violated = diagnostics.checks.filter(c => c.status === "violated");
    for (const check of violated) {
      if (check.recommendation) {
        limitations.push(check.recommendation);
      }
    }
    
    if (limitations.length === 0) {
      limitations.push("No major methodological limitations were identified.");
    }
    
    return {
      title: "Limitations",
      content: limitations.map((l, i) => `${i + 1}. ${l}`).join("\n")
    };
  }
  
  /**
   * Generate inline statistics for copy-paste
   */
  private generateInlineStatistics(spec: AnalysisSpec, result: AnalysisResult): APAReport["inlineStatistics"] {
    const stats: APAReport["inlineStatistics"] = [];
    
    // Main test result
    if (result.testStatistic !== undefined && result.pValue !== undefined) {
      stats.push({
        context: "Main test result",
        apaString: this.formatTestResult(result)
      });
    }
    
    // Effect sizes
    if (result.effectSizes) {
      for (const effect of result.effectSizes) {
        stats.push({
          context: `Effect size (${effect.type})`,
          apaString: this.formatEffectSize(effect)
        });
      }
    }
    
    // Individual parameter tests
    for (const param of result.parameters) {
      if (param.testStatistic !== undefined && param.pValue !== undefined) {
        stats.push({
          context: `Parameter: ${param.name}`,
          apaString: this.formatParameterTest(param)
        });
      }
    }
    
    return stats;
  }
  
  /**
   * Format test result in APA style
   */
  private formatTestResult(result: AnalysisResult): string {
    const testType = result.testType || "test";
    const stat = result.testStatistic!;
    const p = result.pValue!;
    
    let dfString = "";
    if (result.df !== undefined) {
      if (Array.isArray(result.df)) {
        dfString = `(${result.df.join(", ")})`;
      } else {
        dfString = `(${result.df})`;
      }
    }
    
    const pString = this.formatPValue(p);
    
    switch (testType.toLowerCase()) {
      case "t":
        return `t${dfString} = ${stat.toFixed(2)}, ${pString}`;
      case "f":
        return `F${dfString} = ${stat.toFixed(2)}, ${pString}`;
      case "z":
        return `z = ${stat.toFixed(2)}, ${pString}`;
      case "chi2":
      case "χ²":
        return `χ²${dfString} = ${stat.toFixed(2)}, ${pString}`;
      case "u":
        return `U = ${stat.toFixed(0)}, ${pString}`;
      case "w":
        return `W = ${stat.toFixed(0)}, ${pString}`;
      default:
        return `${testType}${dfString} = ${stat.toFixed(2)}, ${pString}`;
    }
  }
  
  /**
   * Format effect size in APA style
   */
  private formatEffectSize(effect: EffectSize): string {
    const value = effect.value;
    
    let symbol: string;
    switch (effect.type) {
      case "cohens_d":
        symbol = "d";
        break;
      case "hedges_g":
        symbol = "g";
        break;
      case "cohens_h":
        symbol = "h";
        break;
      case "r":
        symbol = "r";
        break;
      case "r_squared":
        symbol = "R²";
        break;
      case "eta_squared":
        symbol = "η²";
        break;
      case "partial_eta_squared":
        symbol = "η²p";
        break;
      case "omega_squared":
        symbol = "ω²";
        break;
      case "cramers_v":
        symbol = "V";
        break;
      case "odds_ratio":
        symbol = "OR";
        break;
      default:
        symbol = effect.type;
    }
    
    let result = `${symbol} = ${value.toFixed(2)}`;
    
    if (effect.ci) {
      result += `, ${(effect.ci.level * 100).toFixed(0)}% CI [${effect.ci.lower.toFixed(2)}, ${effect.ci.upper.toFixed(2)}]`;
    }
    
    return result;
  }
  
  /**
   * Format parameter test in APA style
   */
  private formatParameterTest(param: { name: string; estimate: number; se?: number; testStatistic?: number; testType?: string; df?: number | number[]; pValue?: number; ci?: { lower: number; upper: number; level: number } }): string {
    let result = `b = ${param.estimate.toFixed(2)}`;
    
    if (param.se !== undefined) {
      result += `, SE = ${param.se.toFixed(2)}`;
    }
    
    if (param.ci) {
      result += `, ${(param.ci.level * 100).toFixed(0)}% CI [${param.ci.lower.toFixed(2)}, ${param.ci.upper.toFixed(2)}]`;
    }
    
    if (param.testStatistic !== undefined && param.pValue !== undefined) {
      const testType = param.testType || "t";
      let dfString = "";
      if (param.df !== undefined) {
        dfString = Array.isArray(param.df) ? `(${param.df.join(", ")})` : `(${param.df})`;
      }
      result += `, ${testType}${dfString} = ${param.testStatistic.toFixed(2)}, ${this.formatPValue(param.pValue)}`;
    }
    
    return result;
  }
  
  /**
   * Format p-value in APA style
   */
  private formatPValue(p: number): string {
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      return "p = NA";
    }
    if (p < 0.001) {
      return "p < .001";
    } else if (p < 0.01) {
      return `p = ${p.toFixed(3).replace("0.", ".")}`;
    } else {
      return `p = ${p.toFixed(2).replace("0.", ".")}`;
    }
  }
  
  /**
   * Get display name for method
   */
  private getMethodDisplayName(modelFamily: string): string {
    const names: Record<string, string> = {
      t_test: "independent samples t-test",
      paired_t_test: "paired samples t-test",
      welch_t_test: "Welch's t-test",
      mann_whitney: "Mann-Whitney U test",
      wilcoxon: "Wilcoxon signed-rank test",
      chi_square: "chi-square test",
      fisher_exact: "Fisher's exact test",
      anova: "one-way ANOVA",
      repeated_measures_anova: "repeated measures ANOVA",
      ancova: "ANCOVA",
      manova: "MANOVA",
      linear_regression: "linear regression",
      logistic_regression: "logistic regression",
      ordinal_regression: "ordinal regression",
      poisson_regression: "Poisson regression",
      negative_binomial: "negative binomial regression",
      mixed_effects: "mixed effects model",
      cronbach_alpha: "Cronbach's alpha reliability analysis",
      mcdonald_omega: "McDonald's omega reliability analysis",
      efa: "exploratory factor analysis",
      cfa: "confirmatory factor analysis"
    };
    
    return names[modelFamily] || modelFamily.replace(/_/g, " ");
  }
  
  /**
   * Get display name for correction method
   */
  private getCorrectionDisplayName(method: string): string {
    const names: Record<string, string> = {
      bonferroni: "Bonferroni",
      holm: "Holm",
      hochberg: "Hochberg",
      hommel: "Hommel",
      bh: "Benjamini-Hochberg",
      by: "Benjamini-Yekutieli",
      fdr: "FDR",
      sidak: "Šidák"
    };
    
    return names[method] || method;
  }
  
  /**
   * Get status symbol for display
   */
  private getStatusSymbol(status: string): string {
    switch (status) {
      case "passed": return "✓";
      case "warning": return "⚠";
      case "violated": return "✗";
      case "not_applicable": return "—";
      case "not_tested": return "?";
      default: return status;
    }
  }
  
  /**
   * Get interpretation text for effect size
   */
  private getEffectSizeInterpretation(effect: EffectSize): string {
    switch (effect.interpretation) {
      case "negligible":
        return "the practical significance is minimal";
      case "small":
        return "a small but potentially meaningful practical effect";
      case "medium":
        return "a moderate practical effect that is likely noticeable";
      case "large":
        return "a substantial practical effect";
      case "very_large":
        return "a very large practical effect";
      default:
        return "the practical significance should be evaluated in context";
    }
  }
}
