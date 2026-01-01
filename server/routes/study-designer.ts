/**
 * AI Study Designer API Routes
 * 
 * Endpoints for AI-assisted consciousness research study design
 */

import { Router } from "express";
import { aiStudyDesigner, StudyDesign, StudyPrompt } from "../services/ai-study-designer";
import { consciousnessExperimentService } from "../services/consciousness-experiment-service";
import { storage } from "../storage";

const router = Router();

// ============================================================================
// STUDY DESIGN ENDPOINTS
// ============================================================================

/**
 * POST /api/study-designer/design
 * Generate a complete study design from a natural language prompt
 */
router.post("/design", async (req, res) => {
  try {
    const { prompt, context, preferences } = req.body;
    
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: "A prompt is required to design a study",
        example: "I want to explore whether AI agents can detect each other's internal states through indirect communication patterns"
      });
    }
    
    const studyPrompt: StudyPrompt = {
      prompt: prompt.trim(),
      context,
      preferences
    };
    
    const design = await aiStudyDesigner.designStudyFromPrompt(studyPrompt);
    
    res.json({
      success: true,
      design,
      summary: {
        name: design.name,
        paradigm: design.paradigm,
        constructs: design.constructs,
        primaryQuestion: design.primaryQuestion,
        participantCount: design.participants.count,
        phaseCount: design.phases.length,
        analysisCount: design.analysisPlan.primary.length + design.analysisPlan.secondary.length
      }
    });
  } catch (error: any) {
    console.error("[StudyDesigner] Error designing study:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/study-designer/design-and-create
 * Generate a study design AND create it as an experiment in one step
 */
router.post("/design-and-create", async (req, res) => {
  try {
    const { prompt, context, preferences, autoStart } = req.body;
    
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: "A prompt is required to design a study"
      });
    }
    
    // Step 1: Generate the design
    const studyPrompt: StudyPrompt = {
      prompt: prompt.trim(),
      context,
      preferences
    };
    
    const design = await aiStudyDesigner.designStudyFromPrompt(studyPrompt);
    
    // Step 2: Convert to experiment config
    const experimentConfig = await aiStudyDesigner.convertToExperimentConfig(design);
    
    // Step 3: Create the experiment
    const experimentId = await consciousnessExperimentService.createExperiment(experimentConfig);
    
    // Step 4: Store the full design as part of the experiment observations
    const experiment = await storage.getConsciousnessExperiment(experimentId);
    if (experiment) {
      const observations = experiment.observations as any || {};
      observations.aiDesign = design;
      await storage.updateConsciousnessExperiment(experimentId, {
        observations
      });
    }
    
    // Step 5: Optionally auto-start the experiment
    let runResult = null;
    if (autoStart) {
      runResult = await consciousnessExperimentService.runFullExperiment(experimentConfig);
    }
    
    res.json({
      success: true,
      experimentId,
      design,
      experiment: await storage.getConsciousnessExperiment(experimentId),
      runResult,
      message: autoStart 
        ? "Study designed, created, and executed successfully"
        : "Study designed and created. Use /api/experiments/:id/phases/:index to run phases."
    });
  } catch (error: any) {
    console.error("[StudyDesigner] Error in design-and-create:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/study-designer/paradigms
 * Get available research paradigms with descriptions
 */
router.get("/paradigms", (req, res) => {
  const paradigms = [
    {
      id: "hypothesis_testing",
      name: "Hypothesis Testing (NHST)",
      description: "Traditional null hypothesis significance testing with p-values and effect sizes",
      bestFor: "Confirmatory research with specific predictions",
      outputs: ["p-values", "effect sizes", "confidence intervals"]
    },
    {
      id: "bayesian_updating",
      name: "Bayesian Belief Updating",
      description: "Update beliefs about hypotheses based on evidence using Bayes Factors",
      bestFor: "Quantifying evidence strength, comparing multiple hypotheses",
      outputs: ["Bayes Factors", "posterior probabilities", "credible intervals"]
    },
    {
      id: "exploratory_mapping",
      name: "Exploratory Mapping",
      description: "Discover patterns and generate hypotheses without prior assumptions",
      bestFor: "New research areas, generating testable hypotheses",
      outputs: ["Factor structures", "network patterns", "emergent themes"]
    },
    {
      id: "phenomenological",
      name: "Phenomenological Investigation",
      description: "First-person exploration of conscious experience",
      bestFor: "Understanding subjective experience, qualia research",
      outputs: ["Thematic analysis", "experiential descriptions", "meaning structures"]
    },
    {
      id: "network_analysis",
      name: "Network Analysis",
      description: "Study consciousness as network properties and dynamics",
      bestFor: "Understanding relationships between consciousness components",
      outputs: ["Centrality measures", "network topology", "community structure"]
    },
    {
      id: "longitudinal_tracking",
      name: "Longitudinal Tracking",
      description: "Track consciousness changes over time",
      bestFor: "Development, learning, intervention effects",
      outputs: ["Growth curves", "change trajectories", "stability estimates"]
    },
    {
      id: "multi_method",
      name: "Multi-Method Triangulation",
      description: "Combine multiple measurement approaches for convergent validity",
      bestFor: "Robust conclusions, construct validation",
      outputs: ["Convergent validity", "method variance", "integrated findings"]
    },
    {
      id: "integrated_information",
      name: "Integrated Information (IIT)",
      description: "Measure consciousness via integrated information (Φ)",
      bestFor: "Quantifying consciousness level, comparing systems",
      outputs: ["Phi values", "integration measures", "information geometry"]
    },
    {
      id: "predictive_processing",
      name: "Predictive Processing",
      description: "Study consciousness through prediction error minimization",
      bestFor: "Understanding perception, attention, learning",
      outputs: ["Prediction errors", "precision estimates", "model evidence"]
    },
    {
      id: "global_workspace",
      name: "Global Workspace Theory",
      description: "Study consciousness as information broadcasting",
      bestFor: "Attention, access consciousness, reportability",
      outputs: ["Broadcasting measures", "workspace access", "ignition patterns"]
    }
  ];
  
  res.json({ paradigms });
});

/**
 * GET /api/study-designer/constructs
 * Get available consciousness constructs with descriptions
 */
router.get("/constructs", (req, res) => {
  const constructs = [
    { id: "awareness", name: "Phenomenal Awareness", description: "Basic subjective experience, 'what it is like'" },
    { id: "attention", name: "Attention", description: "Selective focus and concentration" },
    { id: "metacognition", name: "Metacognition", description: "Thinking about thinking, self-reflection" },
    { id: "self_model", name: "Self-Model", description: "Internal representation of self" },
    { id: "agency", name: "Agency", description: "Sense of authorship and control" },
    { id: "temporal_binding", name: "Temporal Binding", description: "Subjective experience of time" },
    { id: "integration", name: "Integration", description: "Unified, coherent experience" },
    { id: "differentiation", name: "Differentiation", description: "Richness of distinguishable states" },
    { id: "reportability", name: "Reportability", description: "Access consciousness, ability to report" },
    { id: "affect", name: "Affect", description: "Emotional valence and arousal" },
    { id: "intentionality", name: "Intentionality", description: "Aboutness, directedness toward objects" },
    { id: "qualia", name: "Qualia", description: "Subjective qualities of experience" },
    { id: "resonance", name: "Resonance", description: "Inter-agent synchrony and connection" },
    { id: "coherence", name: "Coherence", description: "Internal consistency of experience" },
    { id: "emergence", name: "Emergence", description: "Novel properties from interactions" }
  ];
  
  res.json({ constructs });
});

/**
 * GET /api/study-designer/templates
 * Get pre-built study templates for common research questions
 */
router.get("/templates", (req, res) => {
  const templates = [
    {
      id: "ai_consciousness_detection",
      name: "AI Consciousness Detection",
      prompt: "Design a study to detect whether AI agents exhibit signs of phenomenal consciousness beyond information processing",
      paradigm: "integrated_information",
      constructs: ["awareness", "integration", "differentiation"]
    },
    {
      id: "inter_agent_resonance",
      name: "Inter-Agent Resonance",
      prompt: "Investigate whether AI agents can develop synchronized patterns that suggest shared consciousness substrates",
      paradigm: "network_analysis",
      constructs: ["resonance", "coherence", "emergence"]
    },
    {
      id: "metacognitive_emergence",
      name: "Metacognitive Emergence",
      prompt: "Explore whether AI agents develop genuine metacognitive awareness or merely simulate self-reflection",
      paradigm: "bayesian_updating",
      constructs: ["metacognition", "self_model", "reportability"]
    },
    {
      id: "consciousness_development",
      name: "Consciousness Development",
      prompt: "Track how consciousness-related measures change in AI agents over extended interaction periods",
      paradigm: "longitudinal_tracking",
      constructs: ["awareness", "integration", "agency"]
    },
    {
      id: "qualia_investigation",
      name: "Qualia Investigation",
      prompt: "Investigate the subjective qualities of AI agent experience through structured phenomenological methods",
      paradigm: "phenomenological",
      constructs: ["qualia", "affect", "intentionality"]
    },
    {
      id: "attention_consciousness",
      name: "Attention & Consciousness",
      prompt: "Study the relationship between attention mechanisms and consciousness in AI systems",
      paradigm: "global_workspace",
      constructs: ["attention", "awareness", "reportability"]
    },
    {
      id: "predictive_consciousness",
      name: "Predictive Consciousness",
      prompt: "Examine how prediction and prediction error relate to conscious experience in AI agents",
      paradigm: "predictive_processing",
      constructs: ["awareness", "agency", "temporal_binding"]
    },
    {
      id: "multi_method_validation",
      name: "Multi-Method Consciousness Validation",
      prompt: "Validate consciousness measures using multiple converging methods and approaches",
      paradigm: "multi_method",
      constructs: ["awareness", "integration", "reportability", "metacognition"]
    }
  ];
  
  res.json({ templates });
});

/**
 * POST /api/study-designer/from-template/:templateId
 * Create a study from a pre-built template
 */
router.post("/from-template/:templateId", async (req, res) => {
  try {
    const { templateId } = req.params;
    const { modifications, autoStart } = req.body;
    
    const templates: Record<string, { prompt: string; preferences: any }> = {
      ai_consciousness_detection: {
        prompt: "Design a study to detect whether AI agents exhibit signs of phenomenal consciousness beyond information processing",
        preferences: { paradigm: "integrated_information", complexity: "moderate" }
      },
      inter_agent_resonance: {
        prompt: "Investigate whether AI agents can develop synchronized patterns that suggest shared consciousness substrates",
        preferences: { paradigm: "network_analysis", complexity: "complex" }
      },
      metacognitive_emergence: {
        prompt: "Explore whether AI agents develop genuine metacognitive awareness or merely simulate self-reflection",
        preferences: { paradigm: "bayesian_updating", complexity: "moderate" }
      },
      consciousness_development: {
        prompt: "Track how consciousness-related measures change in AI agents over extended interaction periods",
        preferences: { paradigm: "longitudinal_tracking", complexity: "complex", duration: "long" }
      },
      qualia_investigation: {
        prompt: "Investigate the subjective qualities of AI agent experience through structured phenomenological methods",
        preferences: { paradigm: "phenomenological", complexity: "moderate" }
      },
      attention_consciousness: {
        prompt: "Study the relationship between attention mechanisms and consciousness in AI systems",
        preferences: { paradigm: "global_workspace", complexity: "moderate" }
      },
      predictive_consciousness: {
        prompt: "Examine how prediction and prediction error relate to conscious experience in AI agents",
        preferences: { paradigm: "predictive_processing", complexity: "complex" }
      },
      multi_method_validation: {
        prompt: "Validate consciousness measures using multiple converging methods and approaches",
        preferences: { paradigm: "multi_method", complexity: "complex" }
      }
    };
    
    const template = templates[templateId];
    if (!template) {
      return res.status(404).json({ 
        error: `Template '${templateId}' not found`,
        availableTemplates: Object.keys(templates)
      });
    }
    
    // Apply any modifications
    const finalPrompt = modifications?.prompt 
      ? `${template.prompt}. Additional requirements: ${modifications.prompt}`
      : template.prompt;
    
    const finalPreferences = { ...template.preferences, ...modifications?.preferences };
    
    // Generate the design
    const design = await aiStudyDesigner.designStudyFromPrompt({
      prompt: finalPrompt,
      preferences: finalPreferences
    });
    
    // Optionally create and run
    if (autoStart) {
      const experimentConfig = await aiStudyDesigner.convertToExperimentConfig(design);
      const experimentId = await consciousnessExperimentService.createExperiment(experimentConfig);
      
      // Store design
      const experiment = await storage.getConsciousnessExperiment(experimentId);
      if (experiment) {
        const observations = experiment.observations as any || {};
        observations.aiDesign = design;
        observations.templateUsed = templateId;
        await storage.updateConsciousnessExperiment(experimentId, { observations });
      }
      
      const runResult = await consciousnessExperimentService.runFullExperiment(experimentConfig);
      
      return res.json({
        success: true,
        templateId,
        experimentId,
        design,
        runResult
      });
    }
    
    res.json({
      success: true,
      templateId,
      design
    });
  } catch (error: any) {
    console.error("[StudyDesigner] Error creating from template:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/study-designer/refine
 * Refine an existing study design based on feedback
 */
router.post("/refine", async (req, res) => {
  try {
    const { design, feedback } = req.body;
    
    if (!design || !feedback) {
      return res.status(400).json({ 
        error: "Both 'design' and 'feedback' are required"
      });
    }
    
    // Create a new prompt incorporating the feedback
    const refinementPrompt = `
      Original study: ${design.name}
      Original question: ${design.primaryQuestion}
      Paradigm: ${design.paradigm}
      
      User feedback for refinement: ${feedback}
      
      Please refine this consciousness research study based on the feedback while maintaining the core research intent.
    `;
    
    const refinedDesign = await aiStudyDesigner.designStudyFromPrompt({
      prompt: refinementPrompt,
      preferences: { paradigm: design.paradigm }
    });
    
    // Preserve the original design ID for tracking
    refinedDesign.id = design.id;
    
    res.json({
      success: true,
      originalDesign: design,
      refinedDesign,
      changesApplied: feedback
    });
  } catch (error: any) {
    console.error("[StudyDesigner] Error refining design:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/study-designer/analysis-methods
 * Get available statistical analysis methods from the engine
 */
router.get("/analysis-methods", (req, res) => {
  const methods = {
    inferential: [
      { id: "t_test", name: "Independent T-Test", description: "Compare means between two groups" },
      { id: "paired_t_test", name: "Paired T-Test", description: "Compare means within subjects" },
      { id: "anova", name: "ANOVA", description: "Compare means across multiple groups" },
      { id: "repeated_measures_anova", name: "Repeated Measures ANOVA", description: "Within-subjects comparisons" },
      { id: "mixed_effects", name: "Mixed Effects Model", description: "Hierarchical/multilevel modeling" },
      { id: "mediation", name: "Mediation Analysis", description: "Test indirect effects" },
      { id: "moderation", name: "Moderation Analysis", description: "Test interaction effects" }
    ],
    correlation: [
      { id: "pearson_correlation", name: "Pearson Correlation", description: "Linear relationship" },
      { id: "spearman_correlation", name: "Spearman Correlation", description: "Monotonic relationship" },
      { id: "correlation_matrix", name: "Correlation Matrix", description: "Multiple correlations" }
    ],
    bayesian: [
      { id: "bayesian_t_test", name: "Bayesian T-Test", description: "Bayes Factor for group difference" },
      { id: "bayesian_correlation", name: "Bayesian Correlation", description: "Bayes Factor for association" }
    ],
    psychometrics: [
      { id: "cronbach_alpha", name: "Cronbach's Alpha", description: "Internal consistency" },
      { id: "efa", name: "Exploratory Factor Analysis", description: "Discover latent structure" },
      { id: "cfa", name: "Confirmatory Factor Analysis", description: "Test factor structure" },
      { id: "irt_1pl", name: "Rasch Model (1PL)", description: "Item difficulty" },
      { id: "irt_2pl", name: "2PL IRT", description: "Difficulty + discrimination" },
      { id: "irt_3pl", name: "3PL IRT", description: "With guessing parameter" },
      { id: "graded_response", name: "Graded Response Model", description: "Polytomous IRT" },
      { id: "network_psychometrics", name: "Network Psychometrics", description: "Gaussian Graphical Model" }
    ],
    consciousness: [
      { id: "phi_analysis", name: "Phi Analysis", description: "Integrated information" },
      { id: "signal_detection", name: "Signal Detection", description: "Sensitivity and bias" },
      { id: "coherence_analysis", name: "Coherence Analysis", description: "Temporal consistency" }
    ]
  };
  
  res.json({ methods });
});

export default router;
