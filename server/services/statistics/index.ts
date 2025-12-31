/**
 * Statistical Analysis & Psychometrics Engine
 * 
 * A comprehensive statistical analysis subsystem for consciousness research.
 * Supports inferential statistics, psychometrics, and consciousness-relevant
 * modeling with full provenance tracking and APA-style reporting.
 * 
 * @module statistics
 */

// Core components
export { StatisticsEngine, statisticsEngine } from "./core/StatisticsEngine";
export type { 
  DatasetInput, 
  AnalysisRequest, 
  AnalysisResponse, 
  EngineConfig 
} from "./core/StatisticsEngine";

export { DesignParser } from "./core/DesignParser";
export { MethodRecommender } from "./core/MethodRecommender";
export { ProvenanceLedger } from "./core/ProvenanceLedger";

// Diagnostics
export { AssumptionChecker } from "./diagnostics/AssumptionChecker";

// Reporting
export { APAReporter } from "./reporting/APAReporter";

// Methods
export { StatUtils } from "./methods/AnalysisMethod";
export type { AnalysisMethod } from "./methods/AnalysisMethod";

// Re-export schema types for convenience
export type {
  // Core types
  VariableType,
  AnalysisMode,
  EstimationMethod,
  CorrectionMethod,
  ModelFamily,
  AssumptionType,
  DiagnosticStatus,
  MissingDataMechanism,
  MissingDataStrategy,
  
  // Data structures
  Variable,
  Instrument,
  Construct,
  DesignObject,
  
  // Analysis
  Hypothesis,
  AnalysisSpec,
  AssumptionCheck,
  DiagnosticsReport,
  
  // Results
  EffectSize,
  ParameterEstimate,
  ModelFit,
  AnalysisResult,
  
  // Provenance
  ProvenanceRecord,
  
  // Recommendations
  MethodRecommendation,
  MethodRecommendationReport,
  
  // Reporting
  APAReportSection,
  APAReport,
  MachineReadableReport,
  
  // Psychometrics
  ReliabilityResult,
  FactorLoading,
  FactorAnalysisResult,
  IRTParameter,
  IRTResult,
  MeasurementInvarianceResult
} from "@shared/statistics-schema";

/**
 * Quick start example:
 * 
 * ```typescript
 * import { statisticsEngine } from './services/statistics';
 * 
 * // Quick analysis
 * const result = await statisticsEngine.quickAnalyze(
 *   data,
 *   'outcome_variable',
 *   'predictor_variable',
 *   'exploratory'
 * );
 * 
 * // Full analysis with configuration
 * const result = await statisticsEngine.analyze({
 *   dataset: { data, metadata },
 *   outcomes: ['score'],
 *   predictors: ['age', 'condition'],
 *   groupingVariables: ['group'],
 *   mode: 'confirmatory',
 *   alpha: 0.05,
 *   preregistered: true
 * });
 * 
 * // Access results
 * console.log(result.apaReport);           // APA-style report
 * console.log(result.machineReport);       // Machine-readable JSON
 * console.log(result.recommendations);     // Method recommendations
 * console.log(result.diagnostics);         // Assumption checks
 * console.log(result.provenance);          // Full audit trail
 * ```
 */
