/**
 * Statistics API Routes
 * 
 * REST API endpoints for the Statistical Analysis & Psychometrics Engine.
 * Provides endpoints for running analyses, getting recommendations,
 * and accessing provenance records.
 */

import { Router } from "express";
import { statisticsEngine } from "../services/statistics";
import type { AnalysisRequest } from "../services/statistics";

const router = Router();

/**
 * POST /api/statistics/analyze
 * Run a full statistical analysis
 */
router.post("/analyze", async (req, res) => {
  try {
    const request: AnalysisRequest = req.body;
    
    // Validate required fields
    if (!request.dataset?.data || !Array.isArray(request.dataset.data)) {
      return res.status(400).json({ 
        error: "Invalid request: dataset.data must be an array" 
      });
    }
    
    if (!request.outcomes || !Array.isArray(request.outcomes) || request.outcomes.length === 0) {
      return res.status(400).json({ 
        error: "Invalid request: outcomes must be a non-empty array" 
      });
    }
    
    if (!request.mode || !["exploratory", "confirmatory"].includes(request.mode)) {
      return res.status(400).json({ 
        error: "Invalid request: mode must be 'exploratory' or 'confirmatory'" 
      });
    }
    
    const result = await statisticsEngine.analyze(request);
    
    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error("Statistics analysis error:", error);
    res.status(500).json({ 
      error: error.message || "Analysis failed" 
    });
  }
});

/**
 * POST /api/statistics/quick-analyze
 * Run a quick analysis with minimal configuration
 */
router.post("/quick-analyze", async (req, res) => {
  try {
    const { data, outcome, predictor, mode = "exploratory" } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        error: "Invalid request: data must be an array" 
      });
    }
    
    if (!outcome || typeof outcome !== "string") {
      return res.status(400).json({ 
        error: "Invalid request: outcome must be a string" 
      });
    }
    
    const result = await statisticsEngine.quickAnalyze(data, outcome, predictor, mode);
    
    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error("Quick analysis error:", error);
    res.status(500).json({ 
      error: error.message || "Analysis failed" 
    });
  }
});

/**
 * POST /api/statistics/recommend
 * Get method recommendations for a dataset
 */
router.post("/recommend", async (req, res) => {
  try {
    const { dataset, outcomes, predictors, covariates, groupingVariables, researchQuestion } = req.body;
    
    if (!dataset?.data || !Array.isArray(dataset.data)) {
      return res.status(400).json({ 
        error: "Invalid request: dataset.data must be an array" 
      });
    }
    
    if (!outcomes || !Array.isArray(outcomes) || outcomes.length === 0) {
      return res.status(400).json({ 
        error: "Invalid request: outcomes must be a non-empty array" 
      });
    }
    
    // Import components directly for recommendation-only endpoint
    const { DesignParser } = await import("../services/statistics/core/DesignParser");
    const { MethodRecommender } = await import("../services/statistics/core/MethodRecommender");
    
    const designParser = new DesignParser();
    const methodRecommender = new MethodRecommender();
    
    const design = await designParser.parse(dataset, outcomes, predictors, covariates, groupingVariables);
    const recommendations = await methodRecommender.recommend(design, researchQuestion);
    
    res.json({
      success: true,
      design,
      recommendations
    });
  } catch (error: any) {
    console.error("Recommendation error:", error);
    res.status(500).json({ 
      error: error.message || "Recommendation failed" 
    });
  }
});

/**
 * POST /api/statistics/check-assumptions
 * Run assumption checks for a proposed analysis
 */
router.post("/check-assumptions", async (req, res) => {
  try {
    const { dataset, outcomes, predictors, covariates, groupingVariables, modelFamily } = req.body;
    
    if (!dataset?.data || !Array.isArray(dataset.data)) {
      return res.status(400).json({ 
        error: "Invalid request: dataset.data must be an array" 
      });
    }
    
    if (!outcomes || !Array.isArray(outcomes) || outcomes.length === 0) {
      return res.status(400).json({ 
        error: "Invalid request: outcomes must be a non-empty array" 
      });
    }
    
    const { DesignParser } = await import("../services/statistics/core/DesignParser");
    const { AssumptionChecker } = await import("../services/statistics/diagnostics/AssumptionChecker");
    const { randomUUID } = await import("crypto");
    
    const designParser = new DesignParser();
    const assumptionChecker = new AssumptionChecker();
    
    const design = await designParser.parse(dataset, outcomes, predictors, covariates, groupingVariables);
    
    // Create minimal spec for assumption checking
    const spec = {
      id: randomUUID(),
      outcomes,
      predictors,
      covariates,
      groupingVariables,
      modelFamily: modelFamily || "linear_regression",
      estimationMethod: "ml" as const,
      correctionMethod: "none" as const,
      alpha: 0.05,
      mode: "exploratory" as const,
      preregistered: false,
      designObjectId: design.id,
      createdAt: new Date().toISOString()
    };
    
    const diagnostics = await assumptionChecker.check(dataset.data, spec, design);
    
    res.json({
      success: true,
      design,
      diagnostics
    });
  } catch (error: any) {
    console.error("Assumption check error:", error);
    res.status(500).json({ 
      error: error.message || "Assumption check failed" 
    });
  }
});

/**
 * POST /api/statistics/parse-design
 * Parse dataset to infer study design
 */
router.post("/parse-design", async (req, res) => {
  try {
    const { dataset, outcomes, predictors, covariates, groupingVariables } = req.body;
    
    if (!dataset?.data || !Array.isArray(dataset.data)) {
      return res.status(400).json({ 
        error: "Invalid request: dataset.data must be an array" 
      });
    }
    
    if (!outcomes || !Array.isArray(outcomes) || outcomes.length === 0) {
      return res.status(400).json({ 
        error: "Invalid request: outcomes must be a non-empty array" 
      });
    }
    
    const { DesignParser } = await import("../services/statistics/core/DesignParser");
    const designParser = new DesignParser();
    
    const design = await designParser.parse(dataset, outcomes, predictors, covariates, groupingVariables);
    
    res.json({
      success: true,
      design
    });
  } catch (error: any) {
    console.error("Design parsing error:", error);
    res.status(500).json({ 
      error: error.message || "Design parsing failed" 
    });
  }
});

/**
 * GET /api/statistics/methods
 * Get list of available analysis methods
 */
router.get("/methods", async (req, res) => {
  try {
    const methods = statisticsEngine.getAvailableMethods();
    
    // Provide descriptions for each method
    const methodDescriptions: Record<string, { name: string; description: string; category: string }> = {
      t_test: { name: "Independent Samples T-Test", description: "Compare means between two independent groups", category: "Inferential" },
      paired_t_test: { name: "Paired Samples T-Test", description: "Compare means between two related measurements", category: "Inferential" },
      welch_t_test: { name: "Welch's T-Test", description: "Compare means with unequal variances", category: "Inferential" },
      mann_whitney: { name: "Mann-Whitney U Test", description: "Non-parametric comparison of two groups", category: "Non-parametric" },
      wilcoxon: { name: "Wilcoxon Signed-Rank Test", description: "Non-parametric paired comparison", category: "Non-parametric" },
      anova: { name: "One-Way ANOVA", description: "Compare means across multiple groups", category: "Inferential" },
      repeated_measures_anova: { name: "Repeated Measures ANOVA", description: "Compare means across within-subject conditions", category: "Inferential" },
      ancova: { name: "ANCOVA", description: "Compare means controlling for covariates", category: "Inferential" },
      linear_regression: { name: "Linear Regression", description: "Model continuous outcome from predictors", category: "Regression" },
      logistic_regression: { name: "Logistic Regression", description: "Model binary outcome from predictors", category: "Regression" },
      mixed_effects: { name: "Mixed Effects Model", description: "Model with random and fixed effects", category: "Advanced" },
      cronbach_alpha: { name: "Cronbach's Alpha", description: "Internal consistency reliability", category: "Psychometrics" },
      mcdonald_omega: { name: "McDonald's Omega", description: "Composite reliability", category: "Psychometrics" },
      efa: { name: "Exploratory Factor Analysis", description: "Discover latent factor structure", category: "Psychometrics" },
      cfa: { name: "Confirmatory Factor Analysis", description: "Test hypothesized factor structure", category: "Psychometrics" }
    };
    
    const methodList = methods.map(m => ({
      id: m,
      ...methodDescriptions[m] || { name: m, description: "Statistical analysis method", category: "Other" }
    }));
    
    res.json({
      success: true,
      methods: methodList,
      count: methods.length
    });
  } catch (error: any) {
    console.error("Methods list error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to get methods" 
    });
  }
});

/**
 * GET /api/statistics/config
 * Get current engine configuration
 */
router.get("/config", async (req, res) => {
  try {
    const config = statisticsEngine.getConfig();
    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message || "Failed to get config" 
    });
  }
});

/**
 * PATCH /api/statistics/config
 * Update engine configuration
 */
router.patch("/config", async (req, res) => {
  try {
    const updates = req.body;
    statisticsEngine.updateConfig(updates);
    const config = statisticsEngine.getConfig();
    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message || "Failed to update config" 
    });
  }
});

/**
 * POST /api/statistics/descriptives
 * Get descriptive statistics for variables
 */
router.post("/descriptives", async (req, res) => {
  try {
    const { data, variables } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        error: "Invalid request: data must be an array" 
      });
    }
    
    const { StatUtils } = await import("../services/statistics/methods/AnalysisMethod");
    
    const varsToAnalyze = variables || Object.keys(data[0] || {});
    const descriptives: Record<string, any> = {};
    
    for (const varName of varsToAnalyze) {
      const values = data.map((d: any) => d[varName]).filter((v: any) => v !== null && v !== undefined && v !== "");
      const nums = values.map(Number).filter((n: number) => !isNaN(n));
      
      if (nums.length > 0) {
        descriptives[varName] = {
          n: nums.length,
          missing: data.length - nums.length,
          mean: StatUtils.mean(nums),
          sd: StatUtils.sd(nums),
          median: StatUtils.median(nums),
          min: Math.min(...nums),
          max: Math.max(...nums),
          skewness: nums.length >= 3 ? StatUtils.skewness(nums) : null,
          kurtosis: nums.length >= 4 ? StatUtils.kurtosis(nums) : null
        };
      } else {
        // Categorical variable
        const frequencies: Record<string, number> = {};
        values.forEach((v: any) => {
          const key = String(v);
          frequencies[key] = (frequencies[key] || 0) + 1;
        });
        descriptives[varName] = {
          n: values.length,
          missing: data.length - values.length,
          type: "categorical",
          levels: Object.keys(frequencies).length,
          frequencies
        };
      }
    }
    
    res.json({
      success: true,
      descriptives,
      sampleSize: data.length
    });
  } catch (error: any) {
    console.error("Descriptives error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to compute descriptives" 
    });
  }
});

export default router;
