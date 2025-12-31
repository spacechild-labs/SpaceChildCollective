/**
 * Method Recommender
 * 
 * Recommends appropriate statistical methods based on study design,
 * outcome type, and sample characteristics. Always provides transparent
 * reasoning for recommendations.
 */

import { randomUUID } from "crypto";
import type {
  DesignObject,
  MethodRecommendation,
  MethodRecommendationReport,
  ModelFamily,
  VariableType
} from "@shared/statistics-schema";

interface RecommendationContext {
  outcomeType: VariableType;
  designType: MethodRecommendationReport["designType"];
  sampleSize: number;
  hasGrouping: boolean;
  hasPredictors: boolean;
  hasCovariates: boolean;
  isLongitudinal: boolean;
  hasWithinFactors: boolean;
  hasClustering: boolean;
  nGroups: number;
  isPsychometric: boolean;
}

export class MethodRecommender {
  
  /**
   * Generate method recommendations for a study design
   */
  async recommend(
    design: DesignObject,
    researchQuestion?: string,
    preferredMethod?: ModelFamily
  ): Promise<MethodRecommendationReport> {
    // Analyze design context
    const context = this.analyzeDesignContext(design);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(context, design);
    
    // Sort by suitability
    recommendations.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
    
    // Mark primary and alternatives
    if (recommendations.length > 0) {
      recommendations[0].isPrimary = true;
    }
    
    // If user has a preference, check if it's suitable
    let primaryRecommendation = recommendations[0]?.modelFamily || "linear_regression";
    if (preferredMethod) {
      const preferred = recommendations.find(r => r.modelFamily === preferredMethod);
      if (preferred && preferred.suitabilityScore >= 0.5) {
        primaryRecommendation = preferredMethod;
      }
    }
    
    // Generate warnings
    const warnings = this.generateWarnings(context, design);
    const notes = this.generateNotes(context, design);
    
    return {
      designObjectId: design.id,
      researchQuestion,
      outcomeType: context.outcomeType,
      designType: context.designType,
      recommendations,
      primaryRecommendation,
      warnings,
      notes,
      createdAt: new Date().toISOString()
    };
  }
  
  /**
   * Analyze design to determine context for recommendations
   */
  private analyzeDesignContext(design: DesignObject): RecommendationContext {
    // Determine outcome type
    const outcomeVar = design.variables.find(v => 
      design.outcomeVariables.includes(v.name)
    );
    const outcomeType = outcomeVar?.type || "continuous";
    
    // Determine design type
    const hasGrouping = (design.betweenSubjectFactors?.length || 0) > 0;
    const hasWithinFactors = (design.withinSubjectFactors?.length || 0) > 0;
    const isLongitudinal = !!design.longitudinal;
    const hasClustering = (design.clusteringVariables?.length || 0) > 0;
    const hasPredictors = (design.predictorVariables?.length || 0) > 0;
    const hasCovariates = (design.covariates?.length || 0) > 0;
    const isPsychometric = (design.instruments?.length || 0) > 0;
    
    let designType: RecommendationContext["designType"];
    
    if (isPsychometric && design.outcomeVariables.length > 2) {
      designType = "psychometric";
    } else if (isLongitudinal) {
      designType = "longitudinal";
    } else if (hasWithinFactors && hasGrouping) {
      designType = "mixed";
    } else if (hasWithinFactors) {
      designType = "within_subjects";
    } else if (hasGrouping && (design.betweenSubjectFactors?.length || 0) > 1) {
      designType = "factorial";
    } else if (hasGrouping) {
      designType = "between_subjects";
    } else if (hasClustering) {
      designType = "nested";
    } else if (hasPredictors) {
      designType = "correlational";
    } else {
      designType = "cross_sectional";
    }
    
    // Count groups
    let nGroups = 1;
    if (design.betweenSubjectFactors && design.betweenSubjectFactors.length > 0) {
      nGroups = design.betweenSubjectFactors[0].levels.length;
    }
    
    return {
      outcomeType,
      designType,
      sampleSize: design.sampleSize,
      hasGrouping,
      hasPredictors,
      hasCovariates,
      isLongitudinal,
      hasWithinFactors,
      hasClustering,
      nGroups,
      isPsychometric
    };
  }
  
  /**
   * Generate method recommendations based on context
   */
  private generateRecommendations(
    context: RecommendationContext,
    design: DesignObject
  ): MethodRecommendation[] {
    const recommendations: MethodRecommendation[] = [];
    
    // Psychometric analyses
    if (context.isPsychometric) {
      recommendations.push(...this.getPsychometricRecommendations(context, design));
    }
    
    // Group comparisons
    if (context.hasGrouping) {
      recommendations.push(...this.getGroupComparisonRecommendations(context));
    }
    
    // Regression-based analyses
    if (context.hasPredictors || context.hasCovariates) {
      recommendations.push(...this.getRegressionRecommendations(context));
    }
    
    // Longitudinal analyses
    if (context.isLongitudinal) {
      recommendations.push(...this.getLongitudinalRecommendations(context));
    }
    
    // Within-subjects analyses
    if (context.hasWithinFactors) {
      recommendations.push(...this.getWithinSubjectsRecommendations(context));
    }
    
    // If no specific recommendations, add general ones
    if (recommendations.length === 0) {
      recommendations.push(...this.getGeneralRecommendations(context));
    }
    
    return recommendations;
  }
  
  /**
   * Psychometric method recommendations
   */
  private getPsychometricRecommendations(
    context: RecommendationContext,
    design: DesignObject
  ): MethodRecommendation[] {
    const recs: MethodRecommendation[] = [];
    
    // Reliability
    recs.push({
      modelFamily: "cronbach_alpha",
      suitabilityScore: 0.9,
      isPrimary: false,
      isRobustAlternative: false,
      isBayesianAlternative: false,
      rationale: "Cronbach's alpha is the standard measure of internal consistency reliability for multi-item scales.",
      assumptions: [
        { assumption: "measurement_level", required: true },
        { assumption: "sample_size", required: true }
      ],
      pros: ["Widely understood", "Easy to compute", "Standard reporting metric"],
      cons: ["Assumes tau-equivalence", "Can underestimate reliability for multidimensional scales"],
      minimumSampleSize: 30,
      references: ["Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests."]
    });
    
    recs.push({
      modelFamily: "mcdonald_omega",
      suitabilityScore: 0.85,
      isPrimary: false,
      isRobustAlternative: true,
      isBayesianAlternative: false,
      rationale: "McDonald's omega provides a more accurate reliability estimate that doesn't assume tau-equivalence.",
      assumptions: [
        { assumption: "measurement_level", required: true },
        { assumption: "sample_size", required: true }
      ],
      pros: ["More accurate than alpha", "Handles multidimensional scales", "Based on factor model"],
      cons: ["Less widely known", "Requires factor analysis"],
      minimumSampleSize: 50,
      references: ["McDonald, R. P. (1999). Test theory: A unified treatment."]
    });
    
    // Factor analysis
    if (design.instruments && design.instruments.some(i => i.items.length >= 4)) {
      recs.push({
        modelFamily: "efa",
        suitabilityScore: 0.8,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Exploratory factor analysis can identify the underlying factor structure of your instrument.",
        assumptions: [
          { assumption: "sample_size", required: true },
          { assumption: "multicollinearity", required: false }
        ],
        pros: ["Discovers latent structure", "Data-driven", "Flexible"],
        cons: ["Multiple solutions possible", "Requires interpretation"],
        minimumSampleSize: Math.max(100, (design.instruments?.[0]?.items.length || 5) * 10),
        references: ["Fabrigar, L. R., et al. (1999). Evaluating the use of exploratory factor analysis."]
      });
      
      recs.push({
        modelFamily: "cfa",
        suitabilityScore: 0.75,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Confirmatory factor analysis tests whether your hypothesized factor structure fits the data.",
        assumptions: [
          { assumption: "sample_size", required: true },
          { assumption: "normality", required: false }
        ],
        pros: ["Tests specific hypotheses", "Provides fit indices", "Can compare models"],
        cons: ["Requires a priori structure", "Sensitive to misspecification"],
        minimumSampleSize: 200,
        references: ["Brown, T. A. (2015). Confirmatory factor analysis for applied research."]
      });
    }
    
    return recs;
  }
  
  /**
   * Group comparison recommendations
   */
  private getGroupComparisonRecommendations(context: RecommendationContext): MethodRecommendation[] {
    const recs: MethodRecommendation[] = [];
    
    if (context.nGroups === 2) {
      // Two-group comparisons
      if (context.outcomeType === "continuous") {
        recs.push({
          modelFamily: "t_test",
          suitabilityScore: context.sampleSize >= 30 ? 0.85 : 0.7,
          isPrimary: false,
          isRobustAlternative: false,
          isBayesianAlternative: false,
          rationale: "Independent samples t-test compares means between two groups when outcome is continuous.",
          assumptions: [
            { assumption: "normality", required: true },
            { assumption: "homoscedasticity", required: true },
            { assumption: "independence", required: true }
          ],
          pros: ["Simple and well-understood", "Powerful when assumptions met", "Standard effect size (Cohen's d)"],
          cons: ["Sensitive to normality violations with small samples", "Assumes equal variances"],
          minimumSampleSize: 20
        });
        
        recs.push({
          modelFamily: "welch_t_test",
          suitabilityScore: 0.8,
          isPrimary: false,
          isRobustAlternative: true,
          isBayesianAlternative: false,
          rationale: "Welch's t-test is robust to unequal variances between groups.",
          assumptions: [
            { assumption: "normality", required: true },
            { assumption: "independence", required: true }
          ],
          pros: ["Robust to unequal variances", "Similar power to t-test", "Recommended as default"],
          cons: ["Slightly less power with equal variances"],
          minimumSampleSize: 20
        });
        
        recs.push({
          modelFamily: "mann_whitney",
          suitabilityScore: 0.75,
          isPrimary: false,
          isRobustAlternative: true,
          isBayesianAlternative: false,
          rationale: "Mann-Whitney U test is a non-parametric alternative that doesn't assume normality.",
          assumptions: [
            { assumption: "independence", required: true }
          ],
          pros: ["No normality assumption", "Robust to outliers", "Works with ordinal data"],
          cons: ["Less powerful than t-test when normality holds", "Tests medians, not means"],
          minimumSampleSize: 10
        });
      }
      
      if (context.outcomeType === "binary") {
        recs.push({
          modelFamily: "chi_square",
          suitabilityScore: 0.85,
          isPrimary: false,
          isRobustAlternative: false,
          isBayesianAlternative: false,
          rationale: "Chi-square test compares proportions between two groups.",
          assumptions: [
            { assumption: "independence", required: true },
            { assumption: "sample_size", required: true }
          ],
          pros: ["Simple", "Well-understood", "Works with categorical outcomes"],
          cons: ["Requires expected cell counts ≥ 5"],
          minimumSampleSize: 20
        });
        
        recs.push({
          modelFamily: "fisher_exact",
          suitabilityScore: 0.8,
          isPrimary: false,
          isRobustAlternative: true,
          isBayesianAlternative: false,
          rationale: "Fisher's exact test is appropriate for small samples or sparse cells.",
          assumptions: [
            { assumption: "independence", required: true }
          ],
          pros: ["Exact p-values", "Works with small samples", "No minimum cell count"],
          cons: ["Computationally intensive for large samples"],
          minimumSampleSize: 5
        });
      }
    } else if (context.nGroups > 2) {
      // Multi-group comparisons
      if (context.outcomeType === "continuous") {
        recs.push({
          modelFamily: "anova",
          suitabilityScore: 0.85,
          isPrimary: false,
          isRobustAlternative: false,
          isBayesianAlternative: false,
          rationale: "One-way ANOVA compares means across multiple groups.",
          assumptions: [
            { assumption: "normality", required: true },
            { assumption: "homoscedasticity", required: true },
            { assumption: "independence", required: true }
          ],
          pros: ["Tests overall group differences", "Well-understood", "Followed by post-hoc tests"],
          cons: ["Sensitive to violations with unequal group sizes"],
          minimumSampleSize: 30
        });
      }
    }
    
    // Add covariates option
    if (context.hasCovariates && context.outcomeType === "continuous") {
      recs.push({
        modelFamily: "ancova",
        suitabilityScore: 0.8,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "ANCOVA controls for covariates when comparing group means.",
        assumptions: [
          { assumption: "normality", required: true },
          { assumption: "homoscedasticity", required: true },
          { assumption: "linearity", required: true },
          { assumption: "independence", required: true }
        ],
        pros: ["Controls for confounds", "Increases power", "Adjusts for baseline differences"],
        cons: ["Assumes homogeneity of regression slopes"],
        minimumSampleSize: 50
      });
    }
    
    return recs;
  }
  
  /**
   * Regression recommendations
   */
  private getRegressionRecommendations(context: RecommendationContext): MethodRecommendation[] {
    const recs: MethodRecommendation[] = [];
    
    if (context.outcomeType === "continuous") {
      recs.push({
        modelFamily: "linear_regression",
        suitabilityScore: 0.85,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Linear regression models the relationship between continuous predictors and a continuous outcome.",
        assumptions: [
          { assumption: "normality", required: true },
          { assumption: "homoscedasticity", required: true },
          { assumption: "linearity", required: true },
          { assumption: "independence", required: true },
          { assumption: "multicollinearity", required: false }
        ],
        pros: ["Interpretable coefficients", "Can include multiple predictors", "Well-understood"],
        cons: ["Assumes linear relationships", "Sensitive to outliers"],
        minimumSampleSize: 50
      });
    }
    
    if (context.outcomeType === "binary") {
      recs.push({
        modelFamily: "logistic_regression",
        suitabilityScore: 0.85,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Logistic regression models the probability of a binary outcome.",
        assumptions: [
          { assumption: "independence", required: true },
          { assumption: "linearity", required: true },
          { assumption: "multicollinearity", required: false }
        ],
        pros: ["Odds ratios are interpretable", "Handles binary outcomes", "Flexible"],
        cons: ["Requires sufficient events per predictor"],
        minimumSampleSize: 100
      });
    }
    
    if (context.outcomeType === "ordinal") {
      recs.push({
        modelFamily: "ordinal_regression",
        suitabilityScore: 0.8,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Ordinal regression models ordered categorical outcomes.",
        assumptions: [
          { assumption: "independence", required: true }
        ],
        pros: ["Respects ordinal nature", "Proportional odds interpretation"],
        cons: ["Proportional odds assumption may not hold"],
        minimumSampleSize: 100
      });
    }
    
    if (context.outcomeType === "count") {
      recs.push({
        modelFamily: "poisson_regression",
        suitabilityScore: 0.8,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Poisson regression models count outcomes.",
        assumptions: [
          { assumption: "independence", required: true }
        ],
        pros: ["Appropriate for count data", "Rate ratios are interpretable"],
        cons: ["Assumes mean equals variance (equidispersion)"],
        minimumSampleSize: 50
      });
      
      recs.push({
        modelFamily: "negative_binomial",
        suitabilityScore: 0.75,
        isPrimary: false,
        isRobustAlternative: true,
        isBayesianAlternative: false,
        rationale: "Negative binomial regression handles overdispersed count data.",
        assumptions: [
          { assumption: "independence", required: true }
        ],
        pros: ["Handles overdispersion", "More flexible than Poisson"],
        cons: ["More complex", "May overfit with small samples"],
        minimumSampleSize: 50
      });
    }
    
    // Mixed effects for clustered data
    if (context.hasClustering) {
      recs.push({
        modelFamily: "mixed_effects",
        suitabilityScore: 0.9,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Mixed effects models account for clustering/nesting in the data.",
        assumptions: [
          { assumption: "normality", required: true },
          { assumption: "independence", required: true }
        ],
        pros: ["Accounts for non-independence", "Handles unbalanced data", "Partitions variance"],
        cons: ["More complex", "Requires sufficient clusters"],
        minimumSampleSize: 50
      });
    }
    
    return recs;
  }
  
  /**
   * Longitudinal analysis recommendations
   */
  private getLongitudinalRecommendations(context: RecommendationContext): MethodRecommendation[] {
    const recs: MethodRecommendation[] = [];
    
    recs.push({
      modelFamily: "mixed_effects",
      suitabilityScore: 0.9,
      isPrimary: false,
      isRobustAlternative: false,
      isBayesianAlternative: false,
      rationale: "Mixed effects models are ideal for longitudinal data with repeated measures.",
      assumptions: [
        { assumption: "normality", required: true },
        { assumption: "independence", required: true }
      ],
      pros: ["Handles missing data well", "Models individual trajectories", "Flexible correlation structures"],
      cons: ["Complex to specify", "Requires sufficient time points"],
      minimumSampleSize: 50
    });
    
    recs.push({
      modelFamily: "growth_model",
      suitabilityScore: 0.85,
      isPrimary: false,
      isRobustAlternative: false,
      isBayesianAlternative: false,
      rationale: "Growth curve models capture change over time with latent growth factors.",
      assumptions: [
        { assumption: "normality", required: true },
        { assumption: "sample_size", required: true }
      ],
      pros: ["Models latent growth", "Can include predictors of change", "SEM framework"],
      cons: ["Requires 3+ time points", "Larger sample needed"],
      minimumSampleSize: 100
    });
    
    return recs;
  }
  
  /**
   * Within-subjects analysis recommendations
   */
  private getWithinSubjectsRecommendations(context: RecommendationContext): MethodRecommendation[] {
    const recs: MethodRecommendation[] = [];
    
    if (context.outcomeType === "continuous") {
      recs.push({
        modelFamily: "paired_t_test",
        suitabilityScore: 0.85,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Paired t-test compares two related measurements (e.g., pre-post).",
        assumptions: [
          { assumption: "normality", required: true },
          { assumption: "independence", required: true }
        ],
        pros: ["Simple", "Accounts for within-subject correlation", "Powerful"],
        cons: ["Only for two time points"],
        minimumSampleSize: 15
      });
      
      recs.push({
        modelFamily: "wilcoxon",
        suitabilityScore: 0.75,
        isPrimary: false,
        isRobustAlternative: true,
        isBayesianAlternative: false,
        rationale: "Wilcoxon signed-rank test is a non-parametric alternative for paired data.",
        assumptions: [
          { assumption: "independence", required: true }
        ],
        pros: ["No normality assumption", "Robust to outliers"],
        cons: ["Less powerful when normality holds"],
        minimumSampleSize: 10
      });
      
      recs.push({
        modelFamily: "repeated_measures_anova",
        suitabilityScore: 0.8,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Repeated measures ANOVA compares means across multiple within-subject conditions.",
        assumptions: [
          { assumption: "normality", required: true },
          { assumption: "sphericity", required: true },
          { assumption: "independence", required: true }
        ],
        pros: ["Handles multiple time points", "Tests interactions"],
        cons: ["Sphericity assumption", "Listwise deletion for missing data"],
        minimumSampleSize: 30
      });
    }
    
    return recs;
  }
  
  /**
   * General recommendations when no specific design detected
   */
  private getGeneralRecommendations(context: RecommendationContext): MethodRecommendation[] {
    const recs: MethodRecommendation[] = [];
    
    if (context.outcomeType === "continuous") {
      recs.push({
        modelFamily: "linear_regression",
        suitabilityScore: 0.7,
        isPrimary: false,
        isRobustAlternative: false,
        isBayesianAlternative: false,
        rationale: "Linear regression is a flexible method for continuous outcomes.",
        assumptions: [
          { assumption: "normality", required: true },
          { assumption: "homoscedasticity", required: true },
          { assumption: "linearity", required: true },
          { assumption: "independence", required: true }
        ],
        pros: ["Flexible", "Well-understood", "Interpretable"],
        cons: ["Assumes linear relationships"],
        minimumSampleSize: 50
      });
    }
    
    return recs;
  }
  
  /**
   * Generate warnings based on design
   */
  private generateWarnings(context: RecommendationContext, design: DesignObject): string[] {
    const warnings: string[] = [];
    
    if (context.sampleSize < 30) {
      warnings.push("Small sample size (n < 30) may limit statistical power and validity of parametric tests.");
    }
    
    if (context.sampleSize < 100 && context.isPsychometric) {
      warnings.push("Sample size may be insufficient for reliable factor analysis (recommend n ≥ 100).");
    }
    
    // Check for missing data
    const highMissing = design.variables.filter(v => v.missingPercent > 10);
    if (highMissing.length > 0) {
      warnings.push(`Variables with >10% missing data: ${highMissing.map(v => v.name).join(", ")}. Consider missing data handling.`);
    }
    
    // Check for potential issues
    if (context.hasClustering && context.sampleSize < 50) {
      warnings.push("Clustered data with small sample may not support mixed effects models reliably.");
    }
    
    return warnings;
  }
  
  /**
   * Generate notes based on design
   */
  private generateNotes(context: RecommendationContext, design: DesignObject): string[] {
    const notes: string[] = [];
    
    notes.push(`Design type: ${context.designType}`);
    notes.push(`Outcome type: ${context.outcomeType}`);
    notes.push(`Sample size: ${context.sampleSize}`);
    
    if (context.hasGrouping) {
      notes.push(`Number of groups: ${context.nGroups}`);
    }
    
    if (context.isLongitudinal) {
      notes.push(`Longitudinal design with ${design.longitudinal?.timePoints.length || 0} time points`);
    }
    
    if (context.isPsychometric) {
      notes.push(`${design.instruments?.length || 0} psychometric instrument(s) detected`);
    }
    
    return notes;
  }
}
