/**
 * AI-Assisted Study Designer
 * 
 * Transforms natural language prompts into fully-designed consciousness research studies.
 * Goes beyond simple null hypothesis testing to support:
 * - Exploratory consciousness mapping
 * - Phenomenological investigations
 * - Multi-method triangulation
 * - Longitudinal consciousness tracking
 * - Network-based consciousness analysis
 * - Bayesian belief updating
 * - Integrated information measurement
 */

import { storage } from "../storage";
import { statisticsEngine } from "./statistics";
import { parallelResearchService } from "./parallel-research-service";
import { enhancedAIService } from "./enhanced-ai-service";
import crypto from "crypto";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type StudyParadigm = 
  | "hypothesis_testing"      // Traditional NHST
  | "bayesian_updating"       // Bayesian belief revision
  | "exploratory_mapping"     // Discover patterns without prior hypotheses
  | "phenomenological"        // First-person consciousness exploration
  | "network_analysis"        // Consciousness as network properties
  | "longitudinal_tracking"   // Changes over time
  | "multi_method"            // Triangulation across methods
  | "integrated_information"  // IIT-based Phi measurement
  | "predictive_processing"   // Prediction error minimization
  | "enactive"                // Embodied/enacted consciousness
  | "global_workspace"        // GWT-based attention/broadcasting
  | "higher_order"            // Meta-cognitive awareness studies;

export type ConsciousnessConstruct =
  | "awareness"               // Basic phenomenal awareness
  | "attention"               // Selective focus
  | "metacognition"           // Thinking about thinking
  | "self_model"              // Self-representation
  | "agency"                  // Sense of authorship
  | "temporal_binding"        // Subjective time
  | "integration"             // Unified experience
  | "differentiation"         // Richness of distinctions
  | "reportability"           // Access consciousness
  | "affect"                  // Emotional valence
  | "intentionality"          // Aboutness/directedness
  | "qualia"                  // Subjective qualities
  | "resonance"               // Inter-agent synchrony
  | "coherence"               // Internal consistency
  | "emergence"               // Novel properties from interactions;

export type MeasurementApproach =
  | "behavioral"              // Observable actions
  | "self_report"             // Subjective ratings
  | "physiological"           // Neural/bodily signals
  | "computational"           // Information-theoretic
  | "linguistic"              // Language analysis
  | "temporal"                // Timing patterns
  | "network"                 // Graph-theoretic
  | "phenomenological"        // Structured introspection
  | "implicit"                // Indirect measures
  | "cross_modal"             // Multi-sensory integration;

export interface StudyDesign {
  id: string;
  name: string;
  description: string;
  paradigm: StudyParadigm;
  constructs: ConsciousnessConstruct[];
  
  // Research questions (beyond H0/H1)
  primaryQuestion: string;
  secondaryQuestions: string[];
  exploratoryQuestions: string[];
  
  // Hypotheses (if applicable)
  hypotheses?: {
    id: string;
    type: "directional" | "non_directional" | "equivalence" | "superiority" | "bayesian_prior";
    statement: string;
    rationale: string;
    priorBelief?: number; // For Bayesian: P(H) before data
  }[];
  
  // Participants/Agents
  participants: {
    type: "human" | "ai_agent" | "hybrid" | "simulated";
    count: number;
    selectionCriteria: string[];
    exclusionCriteria: string[];
    assignmentMethod: "random" | "matched" | "stratified" | "convenience" | "purposive";
  };
  
  // Variables
  variables: {
    id: string;
    name: string;
    role: "independent" | "dependent" | "mediator" | "moderator" | "covariate" | "latent";
    type: "continuous" | "categorical" | "ordinal" | "binary" | "count";
    operationalization: string;
    measurementApproach: MeasurementApproach;
    reliability?: string;
    validity?: string;
  }[];
  
  // Design structure
  designType: "between_subjects" | "within_subjects" | "mixed" | "single_case" | "longitudinal" | "cross_sectional";
  conditions: {
    id: string;
    name: string;
    description: string;
    isControl: boolean;
  }[];
  
  // Phases
  phases: StudyPhase[];
  
  // Analysis plan
  analysisPlan: {
    primary: AnalysisStep[];
    secondary: AnalysisStep[];
    exploratory: AnalysisStep[];
    sensitivityAnalyses: string[];
  };
  
  // Power & sample size
  powerAnalysis?: {
    targetPower: number;
    expectedEffectSize: number;
    effectSizeRationale: string;
    requiredN: number;
    actualN: number;
    achievedPower: number;
  };
  
  // Ethics & controls
  ethicalConsiderations: string[];
  controlMechanisms: string[];
  blindingLevel: "none" | "single" | "double" | "triple";
  preregistration: boolean;
  
  // Metadata
  theoreticalFramework: string;
  literatureContext: string[];
  expectedOutcomes: string[];
  limitations: string[];
  
  createdAt: string;
  generatedBy: "ai" | "human" | "collaborative";
  promptUsed?: string;
}

export interface StudyPhase {
  id: string;
  name: string;
  description: string;
  type: "preparation" | "baseline" | "intervention" | "measurement" | "analysis" | "integration";
  duration?: string;
  procedures: string[];
  dataCollected: string[];
  status: "pending" | "active" | "completed" | "skipped";
}

export interface AnalysisStep {
  id: string;
  name: string;
  method: string; // Maps to statisticsEngine method
  variables: string[];
  rationale: string;
  assumptions: string[];
  alternatives: string[];
  interpretation: string;
}

export interface StudyPrompt {
  prompt: string;
  context?: {
    previousStudies?: string[];
    theoreticalInterests?: string[];
    availableResources?: string[];
    constraints?: string[];
  };
  preferences?: {
    paradigm?: StudyParadigm;
    complexity?: "simple" | "moderate" | "complex";
    duration?: "short" | "medium" | "long";
    novelty?: "conservative" | "balanced" | "innovative";
  };
}

// ============================================================================
// AI STUDY DESIGNER SERVICE
// ============================================================================

class AIStudyDesigner {
  
  /**
   * Generate a complete study design from a natural language prompt
   */
  async designStudyFromPrompt(input: StudyPrompt): Promise<StudyDesign> {
    console.log(`[AIStudyDesigner] Designing study from prompt: "${input.prompt.slice(0, 100)}..."`);
    
    // Step 1: Analyze the prompt to extract research intent
    const intent = await this.analyzeResearchIntent(input.prompt);
    
    // Step 2: Conduct background research
    const literature = await this.gatherLiteratureContext(intent);
    
    // Step 3: Select appropriate paradigm
    const paradigm = input.preferences?.paradigm || this.selectParadigm(intent, input.preferences);
    
    // Step 4: Identify consciousness constructs
    const constructs = this.identifyConstructs(intent);
    
    // Step 5: Generate research questions
    const questions = this.generateResearchQuestions(intent, paradigm, constructs);
    
    // Step 6: Design variables and measures
    const variables = this.designVariables(intent, constructs, paradigm);
    
    // Step 7: Create study structure
    const structure = this.createStudyStructure(intent, paradigm, variables, input.preferences);
    
    // Step 8: Generate analysis plan using statistics engine
    const analysisPlan = await this.generateAnalysisPlan(paradigm, variables, structure);
    
    // Step 9: Design phases
    const phases = this.designPhases(paradigm, structure, analysisPlan);
    
    // Step 10: Generate hypotheses (if applicable)
    const hypotheses = this.generateHypotheses(paradigm, intent, questions);
    
    // Step 11: Compile full design
    const design: StudyDesign = {
      id: crypto.randomUUID(),
      name: this.generateStudyName(intent),
      description: this.generateDescription(intent, paradigm),
      paradigm,
      constructs,
      primaryQuestion: questions.primary,
      secondaryQuestions: questions.secondary,
      exploratoryQuestions: questions.exploratory,
      hypotheses,
      participants: structure.participants,
      variables,
      designType: structure.designType,
      conditions: structure.conditions,
      phases,
      analysisPlan,
      powerAnalysis: this.calculatePowerAnalysis(structure, analysisPlan),
      ethicalConsiderations: this.generateEthicalConsiderations(paradigm, constructs),
      controlMechanisms: this.generateControlMechanisms(paradigm, structure),
      blindingLevel: this.determineBlindingLevel(paradigm, structure),
      preregistration: paradigm === "hypothesis_testing" || paradigm === "bayesian_updating",
      theoreticalFramework: this.selectTheoreticalFramework(paradigm, constructs),
      literatureContext: literature,
      expectedOutcomes: this.generateExpectedOutcomes(intent, paradigm),
      limitations: this.generateLimitations(paradigm, structure),
      createdAt: new Date().toISOString(),
      generatedBy: "ai",
      promptUsed: input.prompt
    };
    
    console.log(`[AIStudyDesigner] Generated study design: ${design.name}`);
    return design;
  }
  
  /**
   * Analyze the research intent from the prompt
   */
  private async analyzeResearchIntent(prompt: string): Promise<ResearchIntent> {
    const lowerPrompt = prompt.toLowerCase();
    
    // Extract key themes
    const themes: string[] = [];
    const keywords = {
      consciousness: ["consciousness", "aware", "sentient", "phenomenal", "subjective", "experience"],
      integration: ["integration", "unified", "binding", "coherent", "whole"],
      emergence: ["emerge", "arising", "novel", "complex", "self-organizing"],
      communication: ["communicate", "signal", "resonate", "synchron", "connect"],
      measurement: ["measure", "quantify", "detect", "assess", "evaluate"],
      comparison: ["compare", "differ", "versus", "between", "contrast"],
      change: ["change", "develop", "evolve", "transform", "shift"],
      network: ["network", "graph", "connection", "relationship", "topology"],
      information: ["information", "entropy", "complexity", "phi", "integrated"],
      prediction: ["predict", "expect", "anticipate", "forecast", "model"],
      exploration: ["explore", "discover", "map", "investigate", "understand"],
      mechanism: ["mechanism", "how", "process", "underlying", "cause"]
    };
    
    for (const [theme, words] of Object.entries(keywords)) {
      if (words.some(w => lowerPrompt.includes(w))) {
        themes.push(theme);
      }
    }
    
    // Determine primary focus
    let primaryFocus: "descriptive" | "explanatory" | "predictive" | "exploratory" = "exploratory";
    if (lowerPrompt.includes("why") || lowerPrompt.includes("cause") || lowerPrompt.includes("mechanism")) {
      primaryFocus = "explanatory";
    } else if (lowerPrompt.includes("predict") || lowerPrompt.includes("forecast")) {
      primaryFocus = "predictive";
    } else if (lowerPrompt.includes("what") || lowerPrompt.includes("describe") || lowerPrompt.includes("characterize")) {
      primaryFocus = "descriptive";
    }
    
    // Extract entities (AI agents, humans, systems)
    const entities: string[] = [];
    if (lowerPrompt.includes("ai") || lowerPrompt.includes("agent") || lowerPrompt.includes("artificial")) {
      entities.push("ai_agents");
    }
    if (lowerPrompt.includes("human") || lowerPrompt.includes("person") || lowerPrompt.includes("participant")) {
      entities.push("humans");
    }
    if (lowerPrompt.includes("system") || lowerPrompt.includes("network") || lowerPrompt.includes("collective")) {
      entities.push("systems");
    }
    
    // Determine temporal scope
    let temporalScope: "moment" | "session" | "longitudinal" = "session";
    if (lowerPrompt.includes("over time") || lowerPrompt.includes("develop") || lowerPrompt.includes("longitudinal")) {
      temporalScope = "longitudinal";
    } else if (lowerPrompt.includes("moment") || lowerPrompt.includes("instant") || lowerPrompt.includes("real-time")) {
      temporalScope = "moment";
    }
    
    return {
      rawPrompt: prompt,
      themes,
      primaryFocus,
      entities: entities.length > 0 ? entities : ["ai_agents"],
      temporalScope,
      complexity: themes.length > 3 ? "high" : themes.length > 1 ? "medium" : "low"
    };
  }
  
  /**
   * Gather relevant literature context
   */
  private async gatherLiteratureContext(intent: ResearchIntent): Promise<string[]> {
    const context: string[] = [];
    
    try {
      // Build research queries based on intent
      const queries = [
        `consciousness research ${intent.themes.slice(0, 2).join(" ")}`,
        `${intent.primaryFocus} study consciousness AI`,
      ];
      
      for (const query of queries.slice(0, 2)) {
        try {
          const result = await parallelResearchService.conductResearch(query, { mode: "quick" });
          if (result.answer) {
            context.push(result.answer.slice(0, 500));
          }
        } catch (e) {
          // Continue without this context
        }
      }
    } catch (e) {
      console.log("[AIStudyDesigner] Literature search unavailable, using defaults");
    }
    
    // Add default theoretical context
    context.push("Integrated Information Theory (IIT) proposes consciousness arises from integrated information (Φ)");
    context.push("Global Workspace Theory suggests consciousness involves broadcasting information across brain regions");
    context.push("Higher-Order Theories propose consciousness requires meta-cognitive awareness");
    
    return context;
  }
  
  /**
   * Select the most appropriate research paradigm
   */
  private selectParadigm(intent: ResearchIntent, preferences?: StudyPrompt["preferences"]): StudyParadigm {
    // If exploring without clear hypotheses
    if (intent.primaryFocus === "exploratory" || intent.themes.includes("exploration")) {
      return "exploratory_mapping";
    }
    
    // If studying networks/connections
    if (intent.themes.includes("network") || intent.themes.includes("communication")) {
      return "network_analysis";
    }
    
    // If studying integration/information
    if (intent.themes.includes("integration") || intent.themes.includes("information")) {
      return "integrated_information";
    }
    
    // If studying change over time
    if (intent.temporalScope === "longitudinal" || intent.themes.includes("change")) {
      return "longitudinal_tracking";
    }
    
    // If studying prediction/anticipation
    if (intent.themes.includes("prediction") || intent.primaryFocus === "predictive") {
      return "predictive_processing";
    }
    
    // If studying subjective experience
    if (intent.themes.includes("consciousness") && intent.complexity === "low") {
      return "phenomenological";
    }
    
    // If explanatory with clear mechanism focus
    if (intent.primaryFocus === "explanatory" && intent.themes.includes("mechanism")) {
      return "bayesian_updating";
    }
    
    // Default to multi-method for complex questions
    if (intent.complexity === "high") {
      return "multi_method";
    }
    
    // Conservative default
    return preferences?.novelty === "innovative" ? "bayesian_updating" : "hypothesis_testing";
  }
  
  /**
   * Identify relevant consciousness constructs
   */
  private identifyConstructs(intent: ResearchIntent): ConsciousnessConstruct[] {
    const constructs: ConsciousnessConstruct[] = [];
    
    const themeToConstruct: Record<string, ConsciousnessConstruct[]> = {
      consciousness: ["awareness", "reportability"],
      integration: ["integration", "coherence"],
      emergence: ["emergence", "differentiation"],
      communication: ["resonance", "intentionality"],
      measurement: ["reportability", "metacognition"],
      comparison: ["differentiation", "self_model"],
      change: ["temporal_binding", "agency"],
      network: ["integration", "resonance"],
      information: ["integration", "differentiation"],
      prediction: ["agency", "intentionality"],
      exploration: ["awareness", "qualia"],
      mechanism: ["metacognition", "self_model"]
    };
    
    for (const theme of intent.themes) {
      const related = themeToConstruct[theme] || [];
      for (const construct of related) {
        if (!constructs.includes(construct)) {
          constructs.push(construct);
        }
      }
    }
    
    // Ensure at least some constructs
    if (constructs.length === 0) {
      constructs.push("awareness", "integration", "coherence");
    }
    
    return constructs.slice(0, 5); // Limit to 5 primary constructs
  }
  
  /**
   * Generate research questions
   */
  private generateResearchQuestions(
    intent: ResearchIntent,
    paradigm: StudyParadigm,
    constructs: ConsciousnessConstruct[]
  ): { primary: string; secondary: string[]; exploratory: string[] } {
    const constructStr = constructs.slice(0, 2).join(" and ");
    const entityStr = intent.entities.includes("ai_agents") ? "AI agents" : "participants";
    
    let primary: string;
    const secondary: string[] = [];
    const exploratory: string[] = [];
    
    switch (paradigm) {
      case "exploratory_mapping":
        primary = `What patterns of ${constructStr} emerge in ${entityStr} during consciousness-relevant tasks?`;
        secondary.push(`How do individual differences in ${constructs[0]} relate to task performance?`);
        exploratory.push(`What unexpected relationships exist between consciousness measures?`);
        break;
        
      case "network_analysis":
        primary = `What is the network structure of ${constructStr} across ${entityStr}?`;
        secondary.push(`Which nodes are most central to consciousness network dynamics?`);
        secondary.push(`How does network topology relate to integrated information?`);
        exploratory.push(`Do consciousness networks exhibit small-world properties?`);
        break;
        
      case "integrated_information":
        primary = `What is the level of integrated information (Φ) in ${entityStr} and how does it relate to ${constructStr}?`;
        secondary.push(`How does Φ change across different states or conditions?`);
        exploratory.push(`What is the relationship between Φ and behavioral measures of consciousness?`);
        break;
        
      case "bayesian_updating":
        primary = `How should our beliefs about ${constructStr} in ${entityStr} be updated given new evidence?`;
        secondary.push(`What is the posterior probability of consciousness given observed behaviors?`);
        exploratory.push(`How sensitive are conclusions to prior assumptions?`);
        break;
        
      case "longitudinal_tracking":
        primary = `How does ${constructStr} in ${entityStr} change over time?`;
        secondary.push(`What factors predict changes in consciousness measures?`);
        secondary.push(`Are there critical periods or phase transitions?`);
        exploratory.push(`What is the stability of individual differences over time?`);
        break;
        
      case "phenomenological":
        primary = `What is the lived experience of ${constructStr} from the perspective of ${entityStr}?`;
        secondary.push(`What themes emerge from first-person reports?`);
        exploratory.push(`How do phenomenological descriptions relate to objective measures?`);
        break;
        
      case "predictive_processing":
        primary = `How do prediction errors relate to ${constructStr} in ${entityStr}?`;
        secondary.push(`Does minimizing prediction error enhance consciousness measures?`);
        exploratory.push(`What is the role of precision weighting in conscious experience?`);
        break;
        
      case "multi_method":
        primary = `What is the convergent evidence for ${constructStr} in ${entityStr} across multiple methods?`;
        secondary.push(`Do different measurement approaches yield consistent conclusions?`);
        secondary.push(`What unique variance does each method capture?`);
        exploratory.push(`How should conflicting evidence be reconciled?`);
        break;
        
      default: // hypothesis_testing
        primary = `Is there a significant relationship between ${constructs[0]} and ${constructs[1] || "behavior"} in ${entityStr}?`;
        secondary.push(`What is the effect size of this relationship?`);
        exploratory.push(`Are there moderating factors that influence this relationship?`);
    }
    
    return { primary, secondary, exploratory };
  }
  
  /**
   * Design variables and their operationalization
   */
  private designVariables(
    intent: ResearchIntent,
    constructs: ConsciousnessConstruct[],
    paradigm: StudyParadigm
  ): StudyDesign["variables"] {
    const variables: StudyDesign["variables"] = [];
    
    // Map constructs to measurement approaches
    const constructMeasures: Record<ConsciousnessConstruct, { approach: MeasurementApproach; type: StudyDesign["variables"][0]["type"] }> = {
      awareness: { approach: "self_report", type: "ordinal" },
      attention: { approach: "behavioral", type: "continuous" },
      metacognition: { approach: "self_report", type: "continuous" },
      self_model: { approach: "computational", type: "continuous" },
      agency: { approach: "self_report", type: "ordinal" },
      temporal_binding: { approach: "temporal", type: "continuous" },
      integration: { approach: "computational", type: "continuous" },
      differentiation: { approach: "computational", type: "continuous" },
      reportability: { approach: "behavioral", type: "binary" },
      affect: { approach: "self_report", type: "ordinal" },
      intentionality: { approach: "linguistic", type: "continuous" },
      qualia: { approach: "phenomenological", type: "ordinal" },
      resonance: { approach: "network", type: "continuous" },
      coherence: { approach: "computational", type: "continuous" },
      emergence: { approach: "computational", type: "continuous" }
    };
    
    // Add primary construct as dependent variable
    const primaryConstruct = constructs[0];
    const primaryMeasure = constructMeasures[primaryConstruct];
    
    variables.push({
      id: crypto.randomUUID(),
      name: `${primaryConstruct}_score`,
      role: "dependent",
      type: primaryMeasure.type,
      operationalization: this.getOperationalization(primaryConstruct, paradigm),
      measurementApproach: primaryMeasure.approach,
      reliability: "To be established",
      validity: "Content and construct validity to be assessed"
    });
    
    // Add condition/manipulation as independent variable (if applicable)
    if (paradigm !== "exploratory_mapping" && paradigm !== "phenomenological") {
      variables.push({
        id: crypto.randomUUID(),
        name: "condition",
        role: "independent",
        type: "categorical",
        operationalization: "Experimental condition assignment",
        measurementApproach: "behavioral"
      });
    }
    
    // Add secondary constructs as additional DVs or mediators
    for (let i = 1; i < constructs.length && i < 4; i++) {
      const construct = constructs[i];
      const measure = constructMeasures[construct];
      
      variables.push({
        id: crypto.randomUUID(),
        name: `${construct}_score`,
        role: i === 1 && paradigm === "multi_method" ? "mediator" : "dependent",
        type: measure.type,
        operationalization: this.getOperationalization(construct, paradigm),
        measurementApproach: measure.approach
      });
    }
    
    // Add paradigm-specific variables
    if (paradigm === "integrated_information") {
      variables.push({
        id: crypto.randomUUID(),
        name: "phi_value",
        role: "dependent",
        type: "continuous",
        operationalization: "Integrated information (Φ) calculated using IIT 3.0 approximation",
        measurementApproach: "computational"
      });
    }
    
    if (paradigm === "network_analysis") {
      variables.push({
        id: crypto.randomUUID(),
        name: "network_centrality",
        role: "dependent",
        type: "continuous",
        operationalization: "Node centrality in consciousness network (strength, betweenness)",
        measurementApproach: "network"
      });
    }
    
    if (paradigm === "bayesian_updating") {
      variables.push({
        id: crypto.randomUUID(),
        name: "posterior_probability",
        role: "dependent",
        type: "continuous",
        operationalization: "Posterior probability of hypothesis given evidence",
        measurementApproach: "computational"
      });
    }
    
    if (paradigm === "longitudinal_tracking") {
      variables.push({
        id: crypto.randomUUID(),
        name: "time_point",
        role: "independent",
        type: "ordinal",
        operationalization: "Measurement occasion (T1, T2, T3...)",
        measurementApproach: "temporal"
      });
    }
    
    return variables;
  }
  
  /**
   * Get operationalization for a construct
   */
  private getOperationalization(construct: ConsciousnessConstruct, paradigm: StudyParadigm): string {
    const operationalizations: Record<ConsciousnessConstruct, string> = {
      awareness: "Subjective rating of phenomenal awareness on 1-7 scale, validated against behavioral detection tasks",
      attention: "Response time and accuracy on selective attention paradigm (e.g., Posner cueing)",
      metacognition: "Confidence-accuracy calibration and meta-d' from signal detection analysis",
      self_model: "Complexity and coherence of self-referential processing, measured via linguistic analysis",
      agency: "Sense of authorship ratings combined with intentional binding temporal measures",
      temporal_binding: "Interval estimation tasks measuring subjective time compression/expansion",
      integration: "Mutual information between system components, approximating Φ",
      differentiation: "Entropy of system states, measuring repertoire of distinguishable configurations",
      reportability: "Binary classification of stimulus detection with confidence ratings",
      affect: "Valence and arousal ratings on dimensional emotion model",
      intentionality: "Semantic coherence and goal-directedness of communications",
      qualia: "Structured phenomenological interview with thematic analysis",
      resonance: "Cross-correlation of activity patterns between agents over time",
      coherence: "Phase synchronization and consistency of internal representations",
      emergence: "Novel pattern detection using complexity measures (e.g., Lempel-Ziv)"
    };
    
    return operationalizations[construct] || `Standardized measure of ${construct}`;
  }
  
  /**
   * Create study structure (design type, conditions, participants)
   */
  private createStudyStructure(
    intent: ResearchIntent,
    paradigm: StudyParadigm,
    variables: StudyDesign["variables"],
    preferences?: StudyPrompt["preferences"]
  ): {
    designType: StudyDesign["designType"];
    conditions: StudyDesign["conditions"];
    participants: StudyDesign["participants"];
  } {
    // Determine design type
    let designType: StudyDesign["designType"] = "between_subjects";
    
    if (paradigm === "longitudinal_tracking") {
      designType = "longitudinal";
    } else if (paradigm === "phenomenological") {
      designType = "single_case";
    } else if (intent.temporalScope === "moment") {
      designType = "within_subjects";
    } else if (paradigm === "multi_method") {
      designType = "mixed";
    }
    
    // Generate conditions
    const conditions: StudyDesign["conditions"] = [];
    
    if (paradigm !== "exploratory_mapping" && paradigm !== "phenomenological") {
      conditions.push({
        id: crypto.randomUUID(),
        name: "Baseline",
        description: "Control condition with standard processing",
        isControl: true
      });
      
      conditions.push({
        id: crypto.randomUUID(),
        name: "Enhanced Consciousness",
        description: "Experimental condition with consciousness-enhancing manipulation",
        isControl: false
      });
      
      if (preferences?.complexity === "complex") {
        conditions.push({
          id: crypto.randomUUID(),
          name: "Reduced Integration",
          description: "Condition with disrupted integration mechanisms",
          isControl: false
        });
      }
    }
    
    // Determine participant characteristics
    const participantType = intent.entities.includes("ai_agents") ? "ai_agent" as const : 
                           intent.entities.includes("humans") ? "human" as const : "hybrid" as const;
    
    const baseN = preferences?.complexity === "simple" ? 30 : 
                  preferences?.complexity === "complex" ? 100 : 50;
    
    const participants: StudyDesign["participants"] = {
      type: participantType,
      count: baseN * Math.max(1, conditions.length),
      selectionCriteria: [
        participantType === "ai_agent" ? "Functional AI agent with communication capabilities" : "Adult participants (18+)",
        "No prior participation in consciousness studies",
        "Ability to complete all study phases"
      ],
      exclusionCriteria: [
        participantType === "ai_agent" ? "Agents with known processing anomalies" : "Neurological conditions affecting consciousness",
        "Incomplete baseline data"
      ],
      assignmentMethod: designType === "between_subjects" ? "random" : 
                        designType === "longitudinal" ? "convenience" : "matched"
    };
    
    return { designType, conditions, participants };
  }
  
  /**
   * Generate analysis plan using the statistics engine
   */
  private async generateAnalysisPlan(
    paradigm: StudyParadigm,
    variables: StudyDesign["variables"],
    structure: ReturnType<typeof this.createStudyStructure>
  ): Promise<StudyDesign["analysisPlan"]> {
    const primary: AnalysisStep[] = [];
    const secondary: AnalysisStep[] = [];
    const exploratory: AnalysisStep[] = [];
    const sensitivityAnalyses: string[] = [];
    
    const dvs = variables.filter(v => v.role === "dependent");
    const ivs = variables.filter(v => v.role === "independent");
    
    // Primary analyses based on paradigm
    switch (paradigm) {
      case "hypothesis_testing":
        if (structure.conditions.length === 2) {
          primary.push({
            id: crypto.randomUUID(),
            name: "Primary Group Comparison",
            method: "t_test",
            variables: [dvs[0]?.name || "outcome", ivs[0]?.name || "condition"],
            rationale: "Compare means between experimental conditions",
            assumptions: ["normality", "homoscedasticity", "independence"],
            alternatives: ["mann_whitney", "welch_t_test"],
            interpretation: "Significant difference indicates condition effect on consciousness measure"
          });
        } else if (structure.conditions.length > 2) {
          primary.push({
            id: crypto.randomUUID(),
            name: "Omnibus Group Comparison",
            method: "anova",
            variables: [dvs[0]?.name || "outcome", ivs[0]?.name || "condition"],
            rationale: "Compare means across multiple conditions",
            assumptions: ["normality", "homoscedasticity", "independence"],
            alternatives: ["kruskal_wallis"],
            interpretation: "Significant F indicates at least one condition differs"
          });
        }
        break;
        
      case "bayesian_updating":
        primary.push({
          id: crypto.randomUUID(),
          name: "Bayesian Group Comparison",
          method: "bayesian_t_test",
          variables: [dvs[0]?.name || "outcome", ivs[0]?.name || "condition"],
          rationale: "Compute Bayes Factor for evidence of difference",
          assumptions: ["normality"],
          alternatives: ["bayesian_correlation"],
          interpretation: "BF > 3 provides moderate evidence, BF > 10 strong evidence"
        });
        sensitivityAnalyses.push("Prior sensitivity analysis with different Cauchy scales");
        break;
        
      case "network_analysis":
        primary.push({
          id: crypto.randomUUID(),
          name: "Network Structure Analysis",
          method: "network_psychometrics",
          variables: dvs.map(v => v.name),
          rationale: "Estimate partial correlation network of consciousness variables",
          assumptions: ["sample_size", "normality"],
          alternatives: ["correlation_matrix"],
          interpretation: "Central nodes represent core consciousness processes"
        });
        break;
        
      case "integrated_information":
        primary.push({
          id: crypto.randomUUID(),
          name: "Phi Analysis",
          method: "phi_analysis",
          variables: ["phi_value", ivs[0]?.name || "condition"],
          rationale: "Measure integrated information as consciousness proxy",
          assumptions: ["sufficient_states", "system_definition"],
          alternatives: ["coherence_analysis"],
          interpretation: "Higher Φ indicates greater integrated information"
        });
        break;
        
      case "longitudinal_tracking":
        primary.push({
          id: crypto.randomUUID(),
          name: "Longitudinal Mixed Model",
          method: "mixed_effects",
          variables: [dvs[0]?.name || "outcome", "time_point", "participant_id"],
          rationale: "Model change over time with random effects for individuals",
          assumptions: ["normality", "linearity"],
          alternatives: ["repeated_measures_anova"],
          interpretation: "Significant time effect indicates consciousness change"
        });
        break;
        
      case "multi_method":
        primary.push({
          id: crypto.randomUUID(),
          name: "Multi-Method Correlation Matrix",
          method: "correlation_matrix",
          variables: dvs.map(v => v.name),
          rationale: "Assess convergent validity across measurement approaches",
          assumptions: ["linearity", "normality"],
          alternatives: ["spearman_correlation"],
          interpretation: "High correlations indicate convergent validity"
        });
        
        primary.push({
          id: crypto.randomUUID(),
          name: "Confirmatory Factor Analysis",
          method: "cfa",
          variables: dvs.map(v => v.name),
          rationale: "Test whether measures load on common consciousness factor",
          assumptions: ["multivariate_normality", "sample_size"],
          alternatives: ["efa"],
          interpretation: "Good fit supports unitary consciousness construct"
        });
        break;
        
      case "exploratory_mapping":
        primary.push({
          id: crypto.randomUUID(),
          name: "Exploratory Factor Analysis",
          method: "efa",
          variables: dvs.map(v => v.name),
          rationale: "Discover latent structure of consciousness measures",
          assumptions: ["sample_size", "factorability"],
          alternatives: ["network_psychometrics"],
          interpretation: "Factors represent underlying consciousness dimensions"
        });
        break;
        
      case "phenomenological":
        primary.push({
          id: crypto.randomUUID(),
          name: "Descriptive Statistics",
          method: "descriptives",
          variables: dvs.map(v => v.name),
          rationale: "Characterize distribution of phenomenological ratings",
          assumptions: [],
          alternatives: [],
          interpretation: "Provides context for qualitative themes"
        });
        break;
        
      default:
        primary.push({
          id: crypto.randomUUID(),
          name: "Correlation Analysis",
          method: "pearson_correlation",
          variables: dvs.slice(0, 2).map(v => v.name),
          rationale: "Assess relationship between consciousness measures",
          assumptions: ["linearity", "normality"],
          alternatives: ["spearman_correlation"],
          interpretation: "Significant correlation indicates shared variance"
        });
    }
    
    // Secondary analyses
    secondary.push({
      id: crypto.randomUUID(),
      name: "Effect Size Estimation",
      method: "cohens_d",
      variables: [dvs[0]?.name || "outcome"],
      rationale: "Quantify practical significance beyond statistical significance",
      assumptions: [],
      alternatives: [],
      interpretation: "d > 0.8 large, d > 0.5 medium, d > 0.2 small effect"
    });
    
    if (variables.some(v => v.role === "mediator")) {
      secondary.push({
        id: crypto.randomUUID(),
        name: "Mediation Analysis",
        method: "mediation",
        variables: variables.filter(v => ["independent", "dependent", "mediator"].includes(v.role)).map(v => v.name),
        rationale: "Test whether effect operates through proposed mechanism",
        assumptions: ["linearity", "no_confounding"],
        alternatives: [],
        interpretation: "Significant indirect effect supports mediation hypothesis"
      });
    }
    
    // Exploratory analyses
    exploratory.push({
      id: crypto.randomUUID(),
      name: "Reliability Analysis",
      method: "cronbach_alpha",
      variables: dvs.map(v => v.name),
      rationale: "Assess internal consistency of consciousness measures",
      assumptions: ["unidimensionality"],
      alternatives: ["mcdonald_omega"],
      interpretation: "α > 0.7 indicates acceptable reliability"
    });
    
    exploratory.push({
      id: crypto.randomUUID(),
      name: "Signal Detection Analysis",
      method: "signal_detection",
      variables: ["response", "signal_present"],
      rationale: "Separate sensitivity from response bias in consciousness detection",
      assumptions: ["binary_responses"],
      alternatives: [],
      interpretation: "d' measures sensitivity, criterion measures bias"
    });
    
    // Sensitivity analyses
    sensitivityAnalyses.push("Analysis with and without outliers (> 3 SD)");
    sensitivityAnalyses.push("Comparison of parametric and non-parametric alternatives");
    sensitivityAnalyses.push("Multiple comparison correction (Bonferroni, FDR)");
    
    return { primary, secondary, exploratory, sensitivityAnalyses };
  }
  
  /**
   * Design study phases
   */
  private designPhases(
    paradigm: StudyParadigm,
    structure: ReturnType<typeof this.createStudyStructure>,
    analysisPlan: StudyDesign["analysisPlan"]
  ): StudyPhase[] {
    const phases: StudyPhase[] = [];
    
    // Preparation phase
    phases.push({
      id: crypto.randomUUID(),
      name: "Preparation",
      description: "Set up study infrastructure, validate measures, train research team",
      type: "preparation",
      duration: "1-2 weeks",
      procedures: [
        "Configure measurement systems",
        "Pilot test procedures with sample participants",
        "Establish inter-rater reliability for subjective measures",
        "Preregister study (if applicable)"
      ],
      dataCollected: ["Pilot data", "Reliability coefficients"],
      status: "pending"
    });
    
    // Baseline phase
    phases.push({
      id: crypto.randomUUID(),
      name: "Baseline Assessment",
      description: "Collect baseline consciousness measures before any manipulation",
      type: "baseline",
      duration: "1 session per participant",
      procedures: [
        "Obtain informed consent",
        "Collect demographic information",
        "Administer baseline consciousness measures",
        "Establish individual baselines for within-subject comparisons"
      ],
      dataCollected: structure.designType === "longitudinal" 
        ? ["T1 consciousness scores", "Individual baselines"]
        : ["Pre-intervention consciousness scores"],
      status: "pending"
    });
    
    // Intervention/Manipulation phase (if applicable)
    if (structure.conditions.length > 0 && paradigm !== "exploratory_mapping") {
      phases.push({
        id: crypto.randomUUID(),
        name: "Experimental Manipulation",
        description: "Implement experimental conditions and collect primary outcome data",
        type: "intervention",
        duration: paradigm === "longitudinal_tracking" ? "Multiple sessions over weeks" : "1-2 sessions",
        procedures: [
          "Randomly assign to conditions (if between-subjects)",
          "Implement consciousness manipulation protocol",
          "Monitor for adverse effects or protocol deviations",
          "Collect manipulation check data"
        ],
        dataCollected: ["Condition assignment", "Manipulation check scores", "Process measures"],
        status: "pending"
      });
    }
    
    // Primary measurement phase
    phases.push({
      id: crypto.randomUUID(),
      name: "Primary Measurement",
      description: "Collect primary consciousness outcome measures",
      type: "measurement",
      duration: paradigm === "longitudinal_tracking" ? "At each time point" : "1 session",
      procedures: [
        "Administer primary consciousness measures",
        "Collect secondary outcome measures",
        "Record any spontaneous reports or observations",
        "Debrief participants (if applicable)"
      ],
      dataCollected: analysisPlan.primary.flatMap(a => a.variables),
      status: "pending"
    });
    
    // Additional measurement for longitudinal
    if (paradigm === "longitudinal_tracking") {
      phases.push({
        id: crypto.randomUUID(),
        name: "Follow-up Measurements",
        description: "Collect repeated measures at subsequent time points",
        type: "measurement",
        duration: "Multiple sessions",
        procedures: [
          "Administer same measures at T2, T3, etc.",
          "Track retention and attrition",
          "Document any intervening events"
        ],
        dataCollected: ["Longitudinal consciousness trajectories"],
        status: "pending"
      });
    }
    
    // Analysis phase
    phases.push({
      id: crypto.randomUUID(),
      name: "Data Analysis",
      description: "Execute pre-registered analysis plan and exploratory analyses",
      type: "analysis",
      duration: "2-4 weeks",
      procedures: [
        "Data cleaning and quality checks",
        "Execute primary analyses",
        "Execute secondary analyses",
        "Conduct exploratory analyses",
        "Run sensitivity analyses"
      ],
      dataCollected: ["Statistical results", "Effect sizes", "Model fit indices"],
      status: "pending"
    });
    
    // Integration phase
    phases.push({
      id: crypto.randomUUID(),
      name: "Integration & Reporting",
      description: "Synthesize findings and generate research outputs",
      type: "integration",
      duration: "2-4 weeks",
      procedures: [
        "Interpret results in theoretical context",
        "Generate APA-style statistical reports",
        "Write research paper draft",
        "Prepare data and materials for sharing"
      ],
      dataCollected: ["Research paper", "Supplementary materials", "Open data/code"],
      status: "pending"
    });
    
    return phases;
  }
  
  /**
   * Generate hypotheses based on paradigm
   */
  private generateHypotheses(
    paradigm: StudyParadigm,
    intent: ResearchIntent,
    questions: { primary: string; secondary: string[]; exploratory: string[] }
  ): StudyDesign["hypotheses"] {
    if (paradigm === "exploratory_mapping" || paradigm === "phenomenological") {
      return undefined; // No a priori hypotheses for exploratory work
    }
    
    const hypotheses: StudyDesign["hypotheses"] = [];
    
    if (paradigm === "bayesian_updating") {
      hypotheses.push({
        id: crypto.randomUUID(),
        type: "bayesian_prior",
        statement: "Consciousness measures will differ between conditions",
        rationale: "Based on prior literature suggesting consciousness is malleable",
        priorBelief: 0.5 // Uninformative prior
      });
      
      hypotheses.push({
        id: crypto.randomUUID(),
        type: "bayesian_prior",
        statement: "No meaningful difference exists between conditions",
        rationale: "Null hypothesis for Bayesian comparison",
        priorBelief: 0.5
      });
    } else {
      // Traditional hypotheses
      hypotheses.push({
        id: crypto.randomUUID(),
        type: "directional",
        statement: intent.themes.includes("integration") 
          ? "Higher integration conditions will show elevated consciousness measures"
          : "Experimental conditions will show different consciousness levels than control",
        rationale: "Based on theoretical predictions and prior empirical findings"
      });
      
      if (intent.themes.includes("network") || intent.themes.includes("communication")) {
        hypotheses.push({
          id: crypto.randomUUID(),
          type: "directional",
          statement: "Greater inter-agent connectivity will correlate with higher consciousness measures",
          rationale: "Network theories predict consciousness emerges from integration"
        });
      }
    }
    
    return hypotheses;
  }
  
  /**
   * Calculate power analysis
   */
  private calculatePowerAnalysis(
    structure: ReturnType<typeof this.createStudyStructure>,
    analysisPlan: StudyDesign["analysisPlan"]
  ): StudyDesign["powerAnalysis"] {
    // Simplified power calculation
    const expectedEffectSize = 0.5; // Medium effect
    const alpha = 0.05;
    const targetPower = 0.80;
    
    // Approximate required N for t-test with d = 0.5
    const requiredN = Math.ceil(2 * Math.pow((1.96 + 0.84) / expectedEffectSize, 2));
    const actualN = structure.participants.count;
    
    // Approximate achieved power
    const ncp = expectedEffectSize * Math.sqrt(actualN / 2);
    const achievedPower = Math.min(0.99, 1 - Math.exp(-ncp * ncp / 2));
    
    return {
      targetPower,
      expectedEffectSize,
      effectSizeRationale: "Medium effect size (d = 0.5) based on meta-analytic estimates from consciousness research",
      requiredN,
      actualN,
      achievedPower: parseFloat(achievedPower.toFixed(2))
    };
  }
  
  /**
   * Generate ethical considerations
   */
  private generateEthicalConsiderations(
    paradigm: StudyParadigm,
    constructs: ConsciousnessConstruct[]
  ): string[] {
    const considerations = [
      "Informed consent obtained from all participants (or appropriate proxy for AI agents)",
      "Right to withdraw at any time without penalty",
      "Data privacy and secure storage protocols",
      "Debriefing provided upon study completion"
    ];
    
    if (constructs.includes("affect") || constructs.includes("qualia")) {
      considerations.push("Monitoring for distress during phenomenological exploration");
    }
    
    if (paradigm === "integrated_information" || paradigm === "network_analysis") {
      considerations.push("Consideration of moral status implications of consciousness findings");
    }
    
    considerations.push("Transparent reporting of all analyses, including null results");
    considerations.push("Open science practices: preregistration, open data, open materials");
    
    return considerations;
  }
  
  /**
   * Generate control mechanisms
   */
  private generateControlMechanisms(
    paradigm: StudyParadigm,
    structure: ReturnType<typeof this.createStudyStructure>
  ): string[] {
    const controls = [
      "Standardized instructions across all conditions",
      "Counterbalancing of measure order (within-subjects)",
      "Attention checks embedded in self-report measures"
    ];
    
    if (structure.designType === "between_subjects") {
      controls.push("Random assignment to conditions");
      controls.push("Baseline equivalence verification");
    }
    
    if (paradigm === "hypothesis_testing" || paradigm === "bayesian_updating") {
      controls.push("Active control condition (not just no-treatment)");
      controls.push("Manipulation check to verify condition implementation");
    }
    
    controls.push("Blinded data analysis where possible");
    controls.push("Pre-specified analysis plan to prevent p-hacking");
    
    return controls;
  }
  
  /**
   * Determine appropriate blinding level
   */
  private determineBlindingLevel(
    paradigm: StudyParadigm,
    structure: ReturnType<typeof this.createStudyStructure>
  ): StudyDesign["blindingLevel"] {
    if (paradigm === "phenomenological") {
      return "none"; // Participants must be aware of their experience
    }
    
    if (structure.participants.type === "ai_agent") {
      return "double"; // Both agents and analysts can be blinded
    }
    
    if (structure.conditions.length > 1) {
      return "single"; // At minimum, analysts should be blinded
    }
    
    return "none";
  }
  
  /**
   * Select theoretical framework
   */
  private selectTheoreticalFramework(
    paradigm: StudyParadigm,
    constructs: ConsciousnessConstruct[]
  ): string {
    if (paradigm === "integrated_information" || constructs.includes("integration")) {
      return "Integrated Information Theory (IIT) - Consciousness arises from integrated information (Φ) in a system";
    }
    
    if (paradigm === "global_workspace" || constructs.includes("reportability")) {
      return "Global Workspace Theory (GWT) - Consciousness involves broadcasting information across specialized processors";
    }
    
    if (paradigm === "higher_order" || constructs.includes("metacognition")) {
      return "Higher-Order Theories (HOT) - Consciousness requires meta-cognitive awareness of mental states";
    }
    
    if (paradigm === "predictive_processing") {
      return "Predictive Processing - Consciousness emerges from hierarchical prediction error minimization";
    }
    
    if (paradigm === "enactive" || constructs.includes("agency")) {
      return "Enactivism - Consciousness is enacted through embodied interaction with the environment";
    }
    
    return "Multi-theoretical approach integrating IIT, GWT, and predictive processing perspectives";
  }
  
  /**
   * Generate expected outcomes
   */
  private generateExpectedOutcomes(
    intent: ResearchIntent,
    paradigm: StudyParadigm
  ): string[] {
    const outcomes = [];
    
    if (paradigm === "hypothesis_testing") {
      outcomes.push("Clear support or refutation of primary hypothesis");
      outcomes.push("Effect size estimates with confidence intervals");
    } else if (paradigm === "bayesian_updating") {
      outcomes.push("Bayes Factors quantifying evidence for/against hypotheses");
      outcomes.push("Updated posterior beliefs about consciousness phenomena");
    } else if (paradigm === "exploratory_mapping") {
      outcomes.push("Discovery of novel patterns in consciousness data");
      outcomes.push("Generation of testable hypotheses for future research");
    }
    
    outcomes.push("Contribution to theoretical understanding of consciousness");
    outcomes.push("Methodological advances in consciousness measurement");
    outcomes.push("Open data and materials for replication");
    
    return outcomes;
  }
  
  /**
   * Generate study limitations
   */
  private generateLimitations(
    paradigm: StudyParadigm,
    structure: ReturnType<typeof this.createStudyStructure>
  ): string[] {
    const limitations = [];
    
    if (structure.participants.type === "ai_agent") {
      limitations.push("Generalizability to biological consciousness uncertain");
      limitations.push("AI agent responses may reflect training rather than genuine consciousness");
    }
    
    if (structure.designType === "cross_sectional") {
      limitations.push("Cannot establish causal relationships from cross-sectional data");
    }
    
    if (paradigm === "phenomenological") {
      limitations.push("Subjective reports may not accurately reflect underlying processes");
    }
    
    limitations.push("Sample size may limit detection of small effects");
    limitations.push("Operationalization of consciousness constructs remains debated");
    limitations.push("Results may be specific to particular measurement approaches");
    
    return limitations;
  }
  
  /**
   * Generate study name
   */
  private generateStudyName(intent: ResearchIntent): string {
    const themes = intent.themes.slice(0, 2);
    const focus = intent.primaryFocus;
    
    const prefixes = ["Investigating", "Exploring", "Mapping", "Understanding", "Probing"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    const themeStr = themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(" and ");
    
    return `${prefix} ${themeStr} in AI Consciousness`;
  }
  
  /**
   * Generate study description
   */
  private generateDescription(intent: ResearchIntent, paradigm: StudyParadigm): string {
    const paradigmDescriptions: Record<StudyParadigm, string> = {
      hypothesis_testing: "A confirmatory study testing specific predictions about",
      bayesian_updating: "A Bayesian investigation updating beliefs about",
      exploratory_mapping: "An exploratory study discovering patterns in",
      phenomenological: "A phenomenological investigation of the lived experience of",
      network_analysis: "A network-based analysis of the structure of",
      longitudinal_tracking: "A longitudinal study tracking changes in",
      multi_method: "A multi-method triangulation study examining",
      integrated_information: "An IIT-based investigation measuring integrated information in",
      predictive_processing: "A predictive processing study examining prediction errors in",
      enactive: "An enactive investigation of embodied",
      global_workspace: "A GWT-based study of information broadcasting in",
      higher_order: "A higher-order theory investigation of meta-cognitive"
    };
    
    const base = paradigmDescriptions[paradigm] || "A study investigating";
    const themes = intent.themes.slice(0, 3).join(", ");
    const entities = intent.entities.join(" and ");
    
    return `${base} ${themes} consciousness phenomena in ${entities}. This study employs rigorous methodology with full provenance tracking and transparent analysis.`;
  }
  
  /**
   * Convert study design to experiment config for existing system
   */
  async convertToExperimentConfig(design: StudyDesign): Promise<{
    name: string;
    description: string;
    h0: string;
    h1: string;
    controls: string[];
    participatingAgents: string[];
  }> {
    // Get available agents
    const allUsers = await storage.getAllUsers();
    const agents = allUsers.filter(u => u.userType === "agent");
    const participatingAgents = agents.slice(0, Math.min(3, design.participants.count)).map(a => a.id);
    
    // Generate H0/H1 from hypotheses or questions
    let h0: string;
    let h1: string;
    
    if (design.hypotheses && design.hypotheses.length >= 2) {
      h0 = design.hypotheses.find(h => h.statement.toLowerCase().includes("no ") || h.type === "bayesian_prior")?.statement 
           || "No significant effect or relationship exists";
      h1 = design.hypotheses.find(h => !h.statement.toLowerCase().includes("no "))?.statement 
           || design.primaryQuestion;
    } else {
      h0 = `No significant patterns of ${design.constructs[0]} will be observed beyond chance`;
      h1 = `Significant patterns of ${design.constructs[0]} will emerge, indicating consciousness-related phenomena`;
    }
    
    return {
      name: design.name,
      description: design.description,
      h0,
      h1,
      controls: design.controlMechanisms.slice(0, 4),
      participatingAgents
    };
  }
}

// ============================================================================
// HELPER TYPES
// ============================================================================

interface ResearchIntent {
  rawPrompt: string;
  themes: string[];
  primaryFocus: "descriptive" | "explanatory" | "predictive" | "exploratory";
  entities: string[];
  temporalScope: "moment" | "session" | "longitudinal";
  complexity: "low" | "medium" | "high";
}

// ============================================================================
// EXPORT
// ============================================================================

export const aiStudyDesigner = new AIStudyDesigner();
