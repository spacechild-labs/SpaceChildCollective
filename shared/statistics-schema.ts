/**
 * Statistical Analysis & Psychometrics Engine Schema
 * 
 * Core type definitions for the Consciousness Research Automation Platform's
 * statistical analysis subsystem. Supports inferential statistics, psychometrics,
 * and consciousness-relevant modeling with full provenance tracking.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const VariableType = z.enum([
  "continuous",
  "binary", 
  "ordinal",
  "nominal",
  "count",
  "proportion",
  "interval",
  "ratio"
]);
export type VariableType = z.infer<typeof VariableType>;

export const AnalysisMode = z.enum([
  "exploratory",
  "confirmatory"
]);
export type AnalysisMode = z.infer<typeof AnalysisMode>;

export const EstimationMethod = z.enum([
  "ml",           // Maximum Likelihood
  "reml",         // Restricted Maximum Likelihood
  "ols",          // Ordinary Least Squares
  "wls",          // Weighted Least Squares
  "gls",          // Generalized Least Squares
  "robust",       // Robust estimation (Huber, etc.)
  "bayesian",     // Bayesian estimation
  "bootstrap",    // Bootstrap estimation
  "permutation"   // Permutation-based
]);
export type EstimationMethod = z.infer<typeof EstimationMethod>;

export const CorrectionMethod = z.enum([
  "none",
  "bonferroni",
  "holm",
  "hochberg",
  "hommel",
  "bh",           // Benjamini-Hochberg
  "by",           // Benjamini-Yekutieli
  "fdr",          // False Discovery Rate (alias for BH)
  "sidak"
]);
export type CorrectionMethod = z.infer<typeof CorrectionMethod>;

export const ModelFamily = z.enum([
  // Inferential
  "t_test",
  "paired_t_test",
  "welch_t_test",
  "mann_whitney",
  "wilcoxon",
  "chi_square",
  "fisher_exact",
  "anova",
  "repeated_measures_anova",
  "ancova",
  "manova",
  "linear_regression",
  "logistic_regression",
  "ordinal_regression",
  "poisson_regression",
  "negative_binomial",
  "mixed_effects",
  "mediation",
  "moderation",
  
  // Psychometrics
  "cronbach_alpha",
  "mcdonald_omega",
  "split_half",
  "test_retest",
  "icc",
  "efa",
  "cfa",
  "bifactor",
  "higher_order",
  "measurement_invariance",
  "irt_1pl",
  "irt_2pl",
  "irt_3pl",
  "irt_4pl",
  "graded_response",
  "partial_credit",
  "dif",
  
  // Consciousness-specific
  "growth_model",
  "arima",
  "var",
  "latent_class",
  "latent_profile",
  "hidden_markov",
  "network_psychometrics",
  "bayesian_hierarchical"
]);
export type ModelFamily = z.infer<typeof ModelFamily>;

export const AssumptionType = z.enum([
  "normality",
  "homoscedasticity",
  "independence",
  "linearity",
  "multicollinearity",
  "sphericity",
  "sample_size",
  "outliers",
  "missing_data",
  "measurement_level"
]);
export type AssumptionType = z.infer<typeof AssumptionType>;

export const DiagnosticStatus = z.enum([
  "passed",
  "warning",
  "violated",
  "not_applicable",
  "not_tested"
]);
export type DiagnosticStatus = z.infer<typeof DiagnosticStatus>;

export const MissingDataMechanism = z.enum([
  "mcar",   // Missing Completely At Random
  "mar",    // Missing At Random
  "mnar",   // Missing Not At Random
  "unknown"
]);
export type MissingDataMechanism = z.infer<typeof MissingDataMechanism>;

export const MissingDataStrategy = z.enum([
  "complete_case",
  "pairwise_deletion",
  "mean_imputation",
  "regression_imputation",
  "multiple_imputation",
  "fiml",   // Full Information Maximum Likelihood
  "em"      // Expectation-Maximization
]);
export type MissingDataStrategy = z.infer<typeof MissingDataStrategy>;

// ============================================================================
// VARIABLE & DATA STRUCTURES
// ============================================================================

export const VariableSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: VariableType,
  role: z.enum(["outcome", "predictor", "covariate", "grouping", "id", "time", "item", "other"]),
  levels: z.array(z.string()).optional(),  // For categorical variables
  range: z.object({
    min: z.number(),
    max: z.number()
  }).optional(),
  missingCount: z.number().default(0),
  missingPercent: z.number().default(0),
  descriptives: z.object({
    n: z.number(),
    mean: z.number().optional(),
    sd: z.number().optional(),
    median: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    skewness: z.number().optional(),
    kurtosis: z.number().optional(),
    frequencies: z.record(z.string(), z.number()).optional()
  }).optional()
});
export type Variable = z.infer<typeof VariableSchema>;

export const InstrumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  items: z.array(z.string()),  // Variable names
  subscales: z.array(z.object({
    name: z.string(),
    items: z.array(z.string())
  })).optional(),
  scoringMethod: z.enum(["sum", "mean", "weighted", "irt", "factor"]).default("mean"),
  reverseCodedItems: z.array(z.string()).optional()
});
export type Instrument = z.infer<typeof InstrumentSchema>;

export const ConstructSchema = z.object({
  id: z.string(),
  name: z.string(),
  definition: z.string().optional(),
  indicators: z.array(z.string()),  // Variable or instrument names
  latent: z.boolean().default(true)
});
export type Construct = z.infer<typeof ConstructSchema>;

// ============================================================================
// DESIGN OBJECT
// ============================================================================

export const DesignObjectSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  
  // Unit of analysis
  unitOfAnalysis: z.enum(["participant", "item", "trial", "session", "group", "other"]),
  sampleSize: z.number(),
  
  // Variables
  variables: z.array(VariableSchema),
  outcomeVariables: z.array(z.string()),
  predictorVariables: z.array(z.string()).optional(),
  covariates: z.array(z.string()).optional(),
  
  // Design factors
  betweenSubjectFactors: z.array(z.object({
    name: z.string(),
    levels: z.array(z.string()),
    variable: z.string()
  })).optional(),
  
  withinSubjectFactors: z.array(z.object({
    name: z.string(),
    levels: z.array(z.string()),
    variables: z.array(z.string())  // One variable per level
  })).optional(),
  
  // Longitudinal structure
  longitudinal: z.object({
    timeVariable: z.string(),
    timePoints: z.array(z.union([z.string(), z.number()])),
    idVariable: z.string()
  }).optional(),
  
  // Instruments and constructs
  instruments: z.array(InstrumentSchema).optional(),
  constructs: z.array(ConstructSchema).optional(),
  
  // Clustering/nesting
  clusteringVariables: z.array(z.string()).optional(),
  nestingStructure: z.array(z.object({
    level: z.number(),
    variable: z.string(),
    nClusters: z.number().optional()
  })).optional(),
  
  // Metadata
  datasetHash: z.string().optional(),
  createdAt: z.string().datetime(),
  inferredFrom: z.enum(["metadata", "data", "user_input", "hybrid"]).default("hybrid")
});
export type DesignObject = z.infer<typeof DesignObjectSchema>;

// ============================================================================
// ANALYSIS SPECIFICATION
// ============================================================================

export const HypothesisSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(["null", "alternative", "directional", "non_directional"]),
  variables: z.array(z.string()),
  expectedDirection: z.enum(["positive", "negative", "difference", "no_difference", "unspecified"]).optional()
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const AnalysisSpecSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  
  // Core specification
  hypothesisId: z.string().optional(),
  hypothesis: HypothesisSchema.optional(),
  
  // Variables
  outcomes: z.array(z.string()),
  predictors: z.array(z.string()).optional(),
  covariates: z.array(z.string()).optional(),
  groupingVariables: z.array(z.string()).optional(),
  
  // Model specification
  modelFamily: ModelFamily,
  estimationMethod: EstimationMethod.default("ml"),
  
  // For mixed models
  randomEffects: z.array(z.object({
    variable: z.string(),
    type: z.enum(["intercept", "slope", "both"])
  })).optional(),
  
  // Multiple testing
  correctionMethod: CorrectionMethod.default("none"),
  alpha: z.number().default(0.05),
  
  // Analysis mode
  mode: AnalysisMode,
  preregistered: z.boolean().default(false),
  preregistrationUrl: z.string().url().optional(),
  
  // Reproducibility
  randomSeed: z.number().optional(),
  bootstrapIterations: z.number().optional(),
  mcmcIterations: z.number().optional(),
  
  // Metadata
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(),
  designObjectId: z.string(),
  
  // Rationale
  methodRationale: z.string().optional(),
  assumptions: z.array(AssumptionType).optional()
});
export type AnalysisSpec = z.infer<typeof AnalysisSpecSchema>;

// ============================================================================
// DIAGNOSTICS & ASSUMPTIONS
// ============================================================================

export const AssumptionCheckSchema = z.object({
  assumption: AssumptionType,
  status: DiagnosticStatus,
  testUsed: z.string().optional(),
  statistic: z.number().optional(),
  pValue: z.number().optional(),
  threshold: z.number().optional(),
  message: z.string(),
  recommendation: z.string().optional(),
  visualizationData: z.any().optional()  // For plots
});
export type AssumptionCheck = z.infer<typeof AssumptionCheckSchema>;

export const DiagnosticsReportSchema = z.object({
  analysisSpecId: z.string(),
  checks: z.array(AssumptionCheckSchema),
  overallStatus: DiagnosticStatus,
  summary: z.string(),
  robustAlternatives: z.array(z.object({
    modelFamily: ModelFamily,
    rationale: z.string(),
    priority: z.number()
  })).optional(),
  warnings: z.array(z.string()),
  createdAt: z.string().datetime()
});
export type DiagnosticsReport = z.infer<typeof DiagnosticsReportSchema>;

// ============================================================================
// RESULTS
// ============================================================================

export const EffectSizeSchema = z.object({
  type: z.enum([
    "cohens_d", "hedges_g", "glass_delta",  // Standardized mean difference
    "cohens_h",                              // Proportion difference
    "eta_squared", "partial_eta_squared",    // ANOVA
    "omega_squared", "partial_omega_squared",
    "r", "r_squared", "adjusted_r_squared",  // Correlation/regression
    "odds_ratio", "risk_ratio", "hazard_ratio",
    "cramers_v", "phi",                      // Categorical
    "cohens_f", "cohens_f_squared",
    "nnt",                                   // Number needed to treat
    "other"
  ]),
  value: z.number(),
  ci: z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number().default(0.95)
  }).optional(),
  interpretation: z.enum(["negligible", "small", "medium", "large", "very_large"]).optional()
});
export type EffectSize = z.infer<typeof EffectSizeSchema>;

export const ParameterEstimateSchema = z.object({
  name: z.string(),
  estimate: z.number(),
  se: z.number().optional(),
  ci: z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number().default(0.95)
  }).optional(),
  testStatistic: z.number().optional(),
  testType: z.string().optional(),  // "t", "z", "F", "chi2", etc.
  df: z.union([z.number(), z.array(z.number())]).optional(),
  pValue: z.number().optional(),
  standardized: z.number().optional()  // Standardized coefficient
});
export type ParameterEstimate = z.infer<typeof ParameterEstimateSchema>;

export const ModelFitSchema = z.object({
  // General fit
  logLikelihood: z.number().optional(),
  deviance: z.number().optional(),
  aic: z.number().optional(),
  bic: z.number().optional(),
  
  // R-squared variants
  rSquared: z.number().optional(),
  adjustedRSquared: z.number().optional(),
  pseudoRSquared: z.record(z.string(), z.number()).optional(),
  
  // SEM/CFA fit indices
  chi2: z.number().optional(),
  chi2Df: z.number().optional(),
  chi2PValue: z.number().optional(),
  cfi: z.number().optional(),
  tli: z.number().optional(),
  rmsea: z.number().optional(),
  rmseaCi: z.object({ lower: z.number(), upper: z.number() }).optional(),
  srmr: z.number().optional(),
  
  // IRT fit
  itemFit: z.array(z.object({
    item: z.string(),
    infit: z.number().optional(),
    outfit: z.number().optional(),
    chi2: z.number().optional(),
    pValue: z.number().optional()
  })).optional()
});
export type ModelFit = z.infer<typeof ModelFitSchema>;

export const AnalysisResultSchema = z.object({
  id: z.string(),
  analysisSpecId: z.string(),
  
  // Core results
  parameters: z.array(ParameterEstimateSchema),
  effectSizes: z.array(EffectSizeSchema).optional(),
  modelFit: ModelFitSchema.optional(),
  
  // Test results
  testStatistic: z.number().optional(),
  testType: z.string().optional(),
  df: z.union([z.number(), z.array(z.number())]).optional(),
  pValue: z.number().optional(),
  pValueCorrected: z.number().optional(),
  
  // Bayesian results
  bayesianResults: z.object({
    bayesFactor: z.number().optional(),
    posteriorProbability: z.number().optional(),
    hdi: z.object({
      lower: z.number(),
      upper: z.number(),
      level: z.number()
    }).optional(),
    rope: z.object({
      lower: z.number(),
      upper: z.number(),
      percentInRope: z.number()
    }).optional()
  }).optional(),
  
  // Diagnostics
  diagnostics: DiagnosticsReportSchema.optional(),
  convergence: z.object({
    converged: z.boolean(),
    iterations: z.number().optional(),
    message: z.string().optional()
  }).optional(),
  
  // Interpretation
  conclusion: z.string().optional(),
  interpretation: z.string().optional(),
  limitations: z.array(z.string()).optional(),
  
  // Metadata
  computationTime: z.number().optional(),  // milliseconds
  softwareVersion: z.string().optional(),
  createdAt: z.string().datetime()
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ============================================================================
// PROVENANCE & REPRODUCIBILITY
// ============================================================================

export const ProvenanceRecordSchema = z.object({
  id: z.string(),
  analysisRunId: z.string(),
  
  // Data provenance
  datasetHash: z.string(),
  datasetFilters: z.array(z.object({
    variable: z.string(),
    operation: z.string(),
    value: z.any()
  })).optional(),
  datasetRowCount: z.number(),
  datasetColumnCount: z.number(),
  
  // Analysis specification
  analysisSpec: AnalysisSpecSchema,
  
  // Execution details
  softwareVersions: z.record(z.string(), z.string()),
  randomSeeds: z.record(z.string(), z.number()).optional(),
  executionStartTime: z.string().datetime(),
  executionEndTime: z.string().datetime(),
  executionDuration: z.number(),  // milliseconds
  
  // Results
  resultId: z.string(),
  resultHash: z.string(),
  
  // Artifacts
  artifacts: z.array(z.object({
    type: z.enum(["log", "plot", "table", "model_object", "raw_output"]),
    name: z.string(),
    hash: z.string(),
    path: z.string().optional()
  })).optional(),
  
  // Audit trail
  createdBy: z.string().optional(),
  createdAt: z.string().datetime(),
  parentRunId: z.string().optional(),  // For re-analyses
  notes: z.string().optional()
});
export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

// ============================================================================
// METHOD RECOMMENDATION
// ============================================================================

export const MethodRecommendationSchema = z.object({
  modelFamily: ModelFamily,
  suitabilityScore: z.number().min(0).max(1),
  isPrimary: z.boolean(),
  isRobustAlternative: z.boolean(),
  isBayesianAlternative: z.boolean(),
  
  rationale: z.string(),
  assumptions: z.array(z.object({
    assumption: AssumptionType,
    required: z.boolean(),
    status: DiagnosticStatus.optional()
  })),
  
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  
  minimumSampleSize: z.number().optional(),
  powerAnalysis: z.object({
    achievablePower: z.number(),
    requiredN: z.number(),
    effectSizeAssumed: z.number()
  }).optional(),
  
  references: z.array(z.string()).optional()
});
export type MethodRecommendation = z.infer<typeof MethodRecommendationSchema>;

export const MethodRecommendationReportSchema = z.object({
  designObjectId: z.string(),
  researchQuestion: z.string().optional(),
  outcomeType: VariableType,
  designType: z.enum([
    "between_subjects",
    "within_subjects", 
    "mixed",
    "correlational",
    "longitudinal",
    "cross_sectional",
    "factorial",
    "nested",
    "psychometric"
  ]),
  
  recommendations: z.array(MethodRecommendationSchema),
  primaryRecommendation: ModelFamily,
  
  warnings: z.array(z.string()),
  notes: z.array(z.string()),
  
  createdAt: z.string().datetime()
});
export type MethodRecommendationReport = z.infer<typeof MethodRecommendationReportSchema>;

// ============================================================================
// REPORTING
// ============================================================================

export const APAReportSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  tables: z.array(z.object({
    title: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    notes: z.string().optional()
  })).optional(),
  figures: z.array(z.object({
    title: z.string(),
    caption: z.string(),
    data: z.any()  // Visualization data
  })).optional()
});
export type APAReportSection = z.infer<typeof APAReportSectionSchema>;

export const APAReportSchema = z.object({
  id: z.string(),
  analysisResultId: z.string(),
  
  sections: z.object({
    purpose: APAReportSectionSchema,
    methodSelection: APAReportSectionSchema,
    assumptionChecks: APAReportSectionSchema,
    results: APAReportSectionSchema,
    interpretation: APAReportSectionSchema,
    limitations: APAReportSectionSchema
  }),
  
  inlineStatistics: z.array(z.object({
    context: z.string(),
    apaString: z.string()  // e.g., "t(45) = 2.34, p = .023, d = 0.45"
  })),
  
  createdAt: z.string().datetime()
});
export type APAReport = z.infer<typeof APAReportSchema>;

export const MachineReadableReportSchema = z.object({
  id: z.string(),
  version: z.string().default("1.0"),
  
  design: DesignObjectSchema,
  specification: AnalysisSpecSchema,
  diagnostics: DiagnosticsReportSchema.optional(),
  result: AnalysisResultSchema,
  provenance: ProvenanceRecordSchema,
  
  flags: z.array(z.object({
    type: z.enum(["warning", "error", "info"]),
    code: z.string(),
    message: z.string()
  })),
  
  createdAt: z.string().datetime()
});
export type MachineReadableReport = z.infer<typeof MachineReadableReportSchema>;

// ============================================================================
// PSYCHOMETRICS-SPECIFIC
// ============================================================================

export const ReliabilityResultSchema = z.object({
  type: z.enum(["cronbach_alpha", "mcdonald_omega", "omega_hierarchical", "omega_total", "split_half", "test_retest", "icc"]),
  value: z.number(),
  ci: z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number()
  }).optional(),
  itemStatistics: z.array(z.object({
    item: z.string(),
    itemTotalCorrelation: z.number().optional(),
    alphaIfDeleted: z.number().optional(),
    mean: z.number().optional(),
    sd: z.number().optional()
  })).optional(),
  interpretation: z.enum(["unacceptable", "poor", "questionable", "acceptable", "good", "excellent"]).optional()
});
export type ReliabilityResult = z.infer<typeof ReliabilityResultSchema>;

export const FactorLoadingSchema = z.object({
  item: z.string(),
  factor: z.string(),
  loading: z.number(),
  se: z.number().optional(),
  communality: z.number().optional(),
  uniqueness: z.number().optional()
});
export type FactorLoading = z.infer<typeof FactorLoadingSchema>;

export const FactorAnalysisResultSchema = z.object({
  type: z.enum(["efa", "cfa", "bifactor", "higher_order"]),
  nFactors: z.number(),
  rotation: z.string().optional(),
  loadings: z.array(FactorLoadingSchema),
  factorCorrelations: z.array(z.array(z.number())).optional(),
  eigenvalues: z.array(z.number()).optional(),
  varianceExplained: z.array(z.object({
    factor: z.string(),
    variance: z.number(),
    cumulative: z.number()
  })).optional(),
  fit: ModelFitSchema.optional()
});
export type FactorAnalysisResult = z.infer<typeof FactorAnalysisResultSchema>;

export const IRTParameterSchema = z.object({
  item: z.string(),
  discrimination: z.number().optional(),  // a parameter
  difficulty: z.number().optional(),       // b parameter
  guessing: z.number().optional(),         // c parameter
  upperAsymptote: z.number().optional(),   // d parameter
  thresholds: z.array(z.number()).optional(),  // For polytomous
  se: z.object({
    discrimination: z.number().optional(),
    difficulty: z.number().optional(),
    guessing: z.number().optional()
  }).optional()
});
export type IRTParameter = z.infer<typeof IRTParameterSchema>;

export const IRTResultSchema = z.object({
  model: z.enum(["1pl", "2pl", "3pl", "4pl", "grm", "pcm", "gpcm", "rsm"]),
  parameters: z.array(IRTParameterSchema),
  personParameters: z.array(z.object({
    id: z.string(),
    theta: z.number(),
    se: z.number().optional()
  })).optional(),
  fit: ModelFitSchema.optional(),
  reliability: z.object({
    marginal: z.number().optional(),
    empirical: z.number().optional()
  }).optional()
});
export type IRTResult = z.infer<typeof IRTResultSchema>;

export const MeasurementInvarianceResultSchema = z.object({
  groups: z.array(z.string()),
  levels: z.array(z.object({
    level: z.enum(["configural", "metric", "scalar", "strict"]),
    fit: ModelFitSchema,
    comparison: z.object({
      deltaChi2: z.number().optional(),
      deltaDf: z.number().optional(),
      pValue: z.number().optional(),
      deltaCfi: z.number().optional(),
      deltaRmsea: z.number().optional()
    }).optional(),
    supported: z.boolean()
  })),
  highestSupportedLevel: z.enum(["configural", "metric", "scalar", "strict", "none"]),
  interpretation: z.string()
});
export type MeasurementInvarianceResult = z.infer<typeof MeasurementInvarianceResultSchema>;

// ============================================================================
// DATABASE TABLES (for Drizzle integration)
// ============================================================================

// These would be used to create database tables for persistence
export const analysisSpecsTableFields = {
  id: "varchar",
  name: "text",
  description: "text",
  hypothesisId: "varchar",
  outcomes: "jsonb",
  predictors: "jsonb",
  covariates: "jsonb",
  groupingVariables: "jsonb",
  modelFamily: "text",
  estimationMethod: "text",
  correctionMethod: "text",
  alpha: "real",
  mode: "text",
  preregistered: "boolean",
  randomSeed: "integer",
  designObjectId: "varchar",
  methodRationale: "text",
  createdAt: "timestamp",
  createdBy: "varchar"
} as const;

export const analysisResultsTableFields = {
  id: "varchar",
  analysisSpecId: "varchar",
  parameters: "jsonb",
  effectSizes: "jsonb",
  modelFit: "jsonb",
  testStatistic: "real",
  testType: "text",
  df: "jsonb",
  pValue: "real",
  pValueCorrected: "real",
  bayesianResults: "jsonb",
  diagnostics: "jsonb",
  convergence: "jsonb",
  conclusion: "text",
  interpretation: "text",
  limitations: "jsonb",
  computationTime: "integer",
  softwareVersion: "text",
  createdAt: "timestamp"
} as const;

export const provenanceRecordsTableFields = {
  id: "varchar",
  analysisRunId: "varchar",
  datasetHash: "text",
  datasetFilters: "jsonb",
  datasetRowCount: "integer",
  datasetColumnCount: "integer",
  analysisSpec: "jsonb",
  softwareVersions: "jsonb",
  randomSeeds: "jsonb",
  executionStartTime: "timestamp",
  executionEndTime: "timestamp",
  executionDuration: "integer",
  resultId: "varchar",
  resultHash: "text",
  artifacts: "jsonb",
  createdBy: "varchar",
  createdAt: "timestamp",
  parentRunId: "varchar",
  notes: "text"
} as const;
