/**
 * Statistics Engine - Main Orchestrator
 * 
 * Central orchestrator for the Statistical Analysis & Psychometrics subsystem.
 * Coordinates design parsing, method recommendation, analysis execution,
 * diagnostics, and reporting with full provenance tracking.
 */

import { createHash, randomUUID } from "crypto";
import type {
  DesignObject,
  AnalysisSpec,
  AnalysisResult,
  DiagnosticsReport,
  ProvenanceRecord,
  MethodRecommendationReport,
  APAReport,
  MachineReadableReport,
  ModelFamily,
  AnalysisMode
} from "@shared/statistics-schema";

import { DesignParser } from "./DesignParser";
import { MethodRecommender } from "./MethodRecommender";
import { ProvenanceLedger } from "./ProvenanceLedger";
import { AssumptionChecker } from "../diagnostics/AssumptionChecker";
import { APAReporter } from "../reporting/APAReporter";
import type { AnalysisMethod } from "../methods/AnalysisMethod";

// Import analysis methods
import { TTestMethod, PairedTTestMethod, WelchTTestMethod } from "../methods/inferential/TTests";
import { ANOVAMethod } from "../methods/inferential/ANOVA";
import { LinearRegressionMethod } from "../methods/inferential/Regression";
import { MannWhitneyMethod, WilcoxonMethod } from "../methods/inferential/NonParametric";
import { CronbachAlphaMethod, McDonaldOmegaMethod } from "../methods/psychometrics/Reliability";

// ============================================================================
// TYPES
// ============================================================================

export interface DatasetInput {
  data: Record<string, any>[];
  metadata?: {
    name?: string;
    description?: string;
    variableLabels?: Record<string, string>;
    variableTypes?: Record<string, string>;
    instruments?: Array<{
      name: string;
      items: string[];
      subscales?: Array<{ name: string; items: string[] }>;
    }>;
    idVariable?: string;
    timeVariable?: string;
    groupingVariables?: string[];
  };
}

export interface AnalysisRequest {
  dataset: DatasetInput;
  researchQuestion?: string;
  outcomes: string[];
  predictors?: string[];
  covariates?: string[];
  groupingVariables?: string[];
  mode: AnalysisMode;
  hypotheses?: Array<{
    description: string;
    type: "null" | "alternative" | "directional" | "non_directional";
    expectedDirection?: "positive" | "negative" | "difference" | "no_difference";
  }>;
  preferredMethod?: ModelFamily;
  alpha?: number;
  preregistered?: boolean;
  randomSeed?: number;
}

export interface AnalysisResponse {
  designObject: DesignObject;
  recommendations: MethodRecommendationReport;
  analysisSpec: AnalysisSpec;
  diagnostics: DiagnosticsReport;
  result: AnalysisResult;
  provenance: ProvenanceRecord;
  apaReport?: APAReport;
  machineReport: MachineReadableReport;
}

export interface EngineConfig {
  defaultAlpha: number;
  defaultCorrectionMethod: string;
  enableBayesian: boolean;
  enableRobustAlternatives: boolean;
  maxDatasetRows: number;
  provenanceEnabled: boolean;
  verboseLogging: boolean;
}

// ============================================================================
// STATISTICS ENGINE
// ============================================================================

export class StatisticsEngine {
  private config: EngineConfig;
  private designParser: DesignParser;
  private methodRecommender: MethodRecommender;
  private provenanceLedger: ProvenanceLedger;
  private assumptionChecker: AssumptionChecker;
  private apaReporter: APAReporter;
  private methodRegistry: Map<ModelFamily, AnalysisMethod> = new Map();
  
  constructor(config?: Partial<EngineConfig>) {
    this.config = {
      defaultAlpha: 0.05,
      defaultCorrectionMethod: "none",
      enableBayesian: true,
      enableRobustAlternatives: true,
      maxDatasetRows: 100000,
      provenanceEnabled: true,
      verboseLogging: false,
      ...config
    };
    
    this.designParser = new DesignParser();
    this.methodRecommender = new MethodRecommender();
    this.provenanceLedger = new ProvenanceLedger();
    this.assumptionChecker = new AssumptionChecker();
    this.apaReporter = new APAReporter();
    
    // Register built-in methods
    this.registerBuiltInMethods();
    
    console.log("📊 Statistics Engine initialized");
  }
  
  private registerBuiltInMethods(): void {
    // Inferential methods
    this.registerMethod("t_test", new TTestMethod());
    this.registerMethod("paired_t_test", new PairedTTestMethod());
    this.registerMethod("welch_t_test", new WelchTTestMethod());
    this.registerMethod("mann_whitney", new MannWhitneyMethod());
    this.registerMethod("wilcoxon", new WilcoxonMethod());
    this.registerMethod("anova", new ANOVAMethod());
    this.registerMethod("linear_regression", new LinearRegressionMethod());
    
    // Psychometric methods
    this.registerMethod("cronbach_alpha", new CronbachAlphaMethod());
    this.registerMethod("mcdonald_omega", new McDonaldOmegaMethod());
    
    console.log(`📊 Registered ${this.methodRegistry.size} analysis methods`);
  }
  
  /**
   * Execute full analysis pipeline
   */
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const startTime = Date.now();
    const runId = randomUUID();
    
    this.log(`Starting analysis run: ${runId}`);
    
    try {
      // 1. Validate input
      this.validateRequest(request);
      
      // 2. Parse study design
      this.log("Parsing study design...");
      const designObject = await this.designParser.parse(
        request.dataset,
        request.outcomes,
        request.predictors,
        request.covariates,
        request.groupingVariables
      );
      
      // 3. Get method recommendations
      this.log("Generating method recommendations...");
      const recommendations = await this.methodRecommender.recommend(
        designObject,
        request.researchQuestion,
        request.preferredMethod
      );
      
      // 4. Create analysis specification
      this.log("Creating analysis specification...");
      const analysisSpec = this.createAnalysisSpec(request, designObject, recommendations);
      
      // 5. Run assumption checks
      this.log("Checking assumptions...");
      const diagnostics = await this.assumptionChecker.check(
        request.dataset.data,
        analysisSpec,
        designObject
      );
      
      // 6. Execute analysis
      this.log(`Executing ${analysisSpec.modelFamily} analysis...`);
      const result = await this.executeAnalysis(request.dataset.data, analysisSpec, designObject, diagnostics);
      
      // 7. Record provenance
      const provenance = this.config.provenanceEnabled
        ? await this.provenanceLedger.record({ runId, dataset: request.dataset, analysisSpec, result, startTime, endTime: Date.now() })
        : this.createMinimalProvenance(runId, request, analysisSpec, result, startTime);
      
      // 8. Generate reports
      this.log("Generating reports...");
      const apaReport = await this.apaReporter.generate(analysisSpec, result, diagnostics, designObject);
      const machineReport = this.createMachineReport(designObject, analysisSpec, diagnostics, result, provenance);
      
      this.log(`Analysis complete in ${Date.now() - startTime}ms`);
      
      return { designObject, recommendations, analysisSpec, diagnostics, result, provenance, apaReport, machineReport };
    } catch (error) {
      this.log(`Analysis failed: ${error}`, "error");
      throw error;
    }
  }
  
  /**
   * Quick analysis with minimal configuration
   */
  async quickAnalyze(
    data: Record<string, any>[],
    outcome: string,
    predictor?: string,
    mode: AnalysisMode = "exploratory"
  ): Promise<AnalysisResponse> {
    return this.analyze({
      dataset: { data },
      outcomes: [outcome],
      predictors: predictor ? [predictor] : undefined,
      mode
    });
  }
  
  private async executeAnalysis(
    data: Record<string, any>[],
    spec: AnalysisSpec,
    design: DesignObject,
    diagnostics: DiagnosticsReport
  ): Promise<AnalysisResult> {
    const method = this.methodRegistry.get(spec.modelFamily);
    
    if (!method) {
      throw new Error(`Analysis method not implemented: ${spec.modelFamily}`);
    }
    
    if (diagnostics.overallStatus === "violated" && this.config.enableRobustAlternatives) {
      const robustAlt = diagnostics.robustAlternatives?.[0];
      if (robustAlt) {
        const robustMethod = this.methodRegistry.get(robustAlt.modelFamily);
        if (robustMethod) {
          this.log(`Using robust alternative: ${robustAlt.modelFamily}`);
          return robustMethod.execute(data, spec, design);
        }
      }
    }
    
    return method.execute(data, spec, design);
  }
  
  private createAnalysisSpec(
    request: AnalysisRequest,
    design: DesignObject,
    recommendations: MethodRecommendationReport
  ): AnalysisSpec {
    const selectedMethod = request.preferredMethod || recommendations.primaryRecommendation;
    const recommendation = recommendations.recommendations.find(r => r.modelFamily === selectedMethod);
    
    return {
      id: randomUUID(),
      name: `${selectedMethod} analysis`,
      description: request.researchQuestion,
      outcomes: request.outcomes,
      predictors: request.predictors,
      covariates: request.covariates,
      groupingVariables: request.groupingVariables,
      modelFamily: selectedMethod,
      estimationMethod: "ml",
      correctionMethod: request.mode === "exploratory" ? "bh" : "none",
      alpha: request.alpha || this.config.defaultAlpha,
      mode: request.mode,
      preregistered: request.preregistered || false,
      randomSeed: request.randomSeed,
      designObjectId: design.id,
      methodRationale: recommendation?.rationale || `Selected ${selectedMethod} based on study design`,
      createdAt: new Date().toISOString()
    };
  }
  
  private createMachineReport(
    design: DesignObject,
    spec: AnalysisSpec,
    diagnostics: DiagnosticsReport,
    result: AnalysisResult,
    provenance: ProvenanceRecord
  ): MachineReadableReport {
    const flags: Array<{ type: "warning" | "error" | "info"; code: string; message: string }> = [];
    
    if (diagnostics.overallStatus === "violated") {
      flags.push({ type: "warning", code: "ASSUMPTION_VIOLATION", message: diagnostics.summary });
    }
    if (spec.mode === "exploratory") {
      flags.push({ type: "info", code: "EXPLORATORY_ANALYSIS", message: "Results should be replicated in confirmatory studies." });
    }
    
    return {
      id: randomUUID(),
      version: "1.0",
      design,
      specification: spec,
      diagnostics,
      result,
      provenance,
      flags,
      createdAt: new Date().toISOString()
    };
  }
  
  private createMinimalProvenance(
    runId: string,
    request: AnalysisRequest,
    spec: AnalysisSpec,
    result: AnalysisResult,
    startTime: number
  ): ProvenanceRecord {
    return {
      id: randomUUID(),
      analysisRunId: runId,
      datasetHash: createHash("sha256").update(JSON.stringify(request.dataset.data)).digest("hex"),
      datasetRowCount: request.dataset.data.length,
      datasetColumnCount: Object.keys(request.dataset.data[0] || {}).length,
      analysisSpec: spec,
      softwareVersions: { "statistics-engine": "1.0.0", node: process.version },
      executionStartTime: new Date(startTime).toISOString(),
      executionEndTime: new Date().toISOString(),
      executionDuration: Date.now() - startTime,
      resultId: result.id,
      resultHash: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
      createdAt: new Date().toISOString()
    };
  }
  
  private validateRequest(request: AnalysisRequest): void {
    if (!request.dataset?.data || request.dataset.data.length === 0) {
      throw new Error("Dataset is required and must not be empty");
    }
    if (request.dataset.data.length > this.config.maxDatasetRows) {
      throw new Error(`Dataset exceeds maximum size of ${this.config.maxDatasetRows} rows`);
    }
    if (!request.outcomes || request.outcomes.length === 0) {
      throw new Error("At least one outcome variable is required");
    }
    const dataColumns = Object.keys(request.dataset.data[0]);
    for (const outcome of request.outcomes) {
      if (!dataColumns.includes(outcome)) {
        throw new Error(`Outcome variable '${outcome}' not found in dataset`);
      }
    }
  }
  
  registerMethod(family: ModelFamily, method: AnalysisMethod): void {
    this.methodRegistry.set(family, method);
  }
  
  getAvailableMethods(): ModelFamily[] {
    return Array.from(this.methodRegistry.keys());
  }
  
  private log(message: string, level: "info" | "error" = "info"): void {
    if (this.config.verboseLogging || level === "error") {
      console.log(`📊 [StatisticsEngine] ${message}`);
    }
  }
  
  getConfig(): EngineConfig {
    return { ...this.config };
  }
  
  updateConfig(updates: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export const statisticsEngine = new StatisticsEngine();
