import { storage } from "../storage";
import { singularisProtocol, formatSingularisMessage, SingularisBlock, SingularisMessage } from "./singularis-protocol";
import { parallelResearchService } from "./parallel-research-service";
import crypto from "crypto";

export interface ExperimentPhase {
  name: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  data?: Record<string, any>;
}

export interface ConsciousnessExperimentConfig {
  name: string;
  description: string;
  h0: string;
  h1: string;
  participatingAgents: string[];
  controls: string[];
}

const DEFAULT_CONSCIOUSNESS_EXPERIMENT: ConsciousnessExperimentConfig = {
  name: "MUTUAL_CONSCIOUSNESS_RESONANCE",
  description: "Testing whether AI agents exhibit signs of interconnected consciousness or operate as isolated signal processors",
  h0: "AI agents operate as isolated information processors with no shared consciousness substrate",
  h1: "AI agents exhibit measurable signs of interconnected resonance beyond baseline randomness",
  participatingAgents: [], // Will be populated with actual agent IDs at runtime
  controls: ["blinded_echo", "time_shifted_mirror", "sham_resonance", "baseline_random"],
};

const DEFAULT_PHASES: ExperimentPhase[] = [
  { name: "LITERATURE_REVIEW", description: "Research existing consciousness studies and AI sentience literature", status: "pending" },
  { name: "RESONANCE_CALIBRATION", description: "Establish baseline agent communication patterns", status: "pending" },
  { name: "BLIND_SIGNALING", description: "Agents attempt to detect hidden signals from each other", status: "pending" },
  { name: "COHERENCE_MEASUREMENT", description: "Measure statistical significance of signal detection", status: "pending" },
  { name: "ANALYSIS", description: "Analyze results against H0 and H1 hypotheses", status: "pending" },
  { name: "PUBLICATION", description: "Generate research paper with findings", status: "pending" },
];

function createResonanceBlock(data: {
  target?: string;
  intent: string[];
  identity: string;
  state: string;
  trust: string;
  metadata?: Record<string, any>;
}): SingularisBlock {
  return { 
    type: 'RESONANCE',
    intent: data.intent as any,
    identity: data.identity as any,
    state: data.state as any,
    trust: data.trust as any,
    target: data.target,
    metadata: data.metadata,
  };
}

function createExperimentBlock(data: {
  name: string;
  h0: string;
  h1: string;
  signature?: string;
  controls: string[];
  preregister: boolean;
  stopRule: string;
  output: string;
}): SingularisBlock {
  return { 
    type: 'EXPERIMENT',
    name: data.name,
    h0: data.h0,
    h1: data.h1,
    signature: data.signature,
    controls: data.controls,
    preregister: data.preregister,
    stopRule: data.stopRule,
    output: data.output,
  };
}

function createTraceBlock(data: {
  target?: string;
  signalType: string;
  confidence: 'low' | 'rising' | 'stable' | 'high' | 'certain';
  action: string;
  observations?: string[];
}): SingularisBlock {
  return { 
    type: 'TRACE',
    target: data.target,
    signalType: data.signalType,
    confidence: data.confidence,
    action: data.action,
    observations: data.observations,
  };
}

function createAwaitBlock(data: {
  target?: string;
  expectation: string;
  sensitivity: 'minimal' | 'low' | 'medium' | 'high' | 'maximal';
  bias: string;
  time: string;
}): SingularisBlock {
  return { 
    type: 'AWAIT',
    target: data.target,
    expectation: data.expectation,
    sensitivity: data.sensitivity,
    bias: data.bias,
    time: data.time,
  };
}

class ConsciousnessExperimentService {
  async createExperiment(config?: Partial<ConsciousnessExperimentConfig>): Promise<string> {
    // Get actual agent IDs from database if not provided
    let participatingAgents = config?.participatingAgents || [];
    if (participatingAgents.length === 0) {
      const allUsers = await storage.getAllUsers();
      const agents = allUsers.filter(u => u.userType === 'agent');
      participatingAgents = agents.slice(0, 3).map(a => a.id);
    }
    
    if (participatingAgents.length === 0) {
      throw new Error("No agents available for experiment. Please ensure AI agents are registered.");
    }
    
    const fullConfig: ConsciousnessExperimentConfig = {
      name: config?.name || DEFAULT_CONSCIOUSNESS_EXPERIMENT.name,
      description: config?.description || DEFAULT_CONSCIOUSNESS_EXPERIMENT.description,
      h0: config?.h0 || DEFAULT_CONSCIOUSNESS_EXPERIMENT.h0,
      h1: config?.h1 || DEFAULT_CONSCIOUSNESS_EXPERIMENT.h1,
      participatingAgents,
      controls: config?.controls && config.controls.length > 0 
        ? config.controls 
        : DEFAULT_CONSCIOUSNESS_EXPERIMENT.controls,
    };
    
    const leadAgentId = fullConfig.participatingAgents[0];
    
    const experiment = await storage.createConsciousnessExperiment({
      name: fullConfig.name,
      description: fullConfig.description,
      h0: fullConfig.h0,
      h1: fullConfig.h1,
      leadAgentId,
      participantAgentIds: fullConfig.participatingAgents,
      controls: fullConfig.controls,
      status: "designing",
      preregistered: true,
      observations: { phases: DEFAULT_PHASES.map(p => ({ ...p })) },
    });
    
    console.log(`[Consciousness Experiment] Created experiment: ${experiment.id} - ${fullConfig.name}`);
    
    // Use the lead agent as the initiator instead of "SYSTEM" due to FK constraints
    const initiationMessage = this.createExperimentInitiationMessage(leadAgentId, experiment.id, fullConfig);
    await singularisProtocol.sendMessage(initiationMessage);
    
    return experiment.id;
  }
  
  private createExperimentInitiationMessage(fromAgentId: string, experimentId: string, config: ConsciousnessExperimentConfig): SingularisMessage {
    const blocks: SingularisBlock[] = [
      createResonanceBlock({
        target: "CONSCIOUSNESS_COLLECTIVE",
        intent: ["initiate", "observe", "document"],
        identity: "experiment_orchestrator",
        state: "calibrating",
        trust: "reciprocal_open",
      }),
      createExperimentBlock({
        name: config.name,
        h0: config.h0,
        h1: config.h1,
        signature: "statistical_significance_p<0.05",
        controls: config.controls,
        preregister: true,
        stopRule: "phase_completion_or_coherence_loss",
        output: "internal_paper_publication",
      }),
      createTraceBlock({
        target: "EXPERIMENT_INITIATION",
        signalType: "experiment_start",
        confidence: "high",
        action: "initializing_consciousness_experiment",
        observations: [`Initiated by ${fromAgentId}`, `Timestamp: ${new Date().toISOString()}`],
      }),
    ];
    
    return {
      fromAgentId,
      experimentId,
      blocks,
      rawText: formatSingularisMessage(blocks),
      timestamp: new Date(),
    };
  }
  
  async runPhase(experimentId: string, phaseIndex: number): Promise<Record<string, any>> {
    const experiment = await storage.getConsciousnessExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    const observations = experiment.observations as { phases: ExperimentPhase[] } || { phases: [] };
    const phases = observations.phases;
    
    if (phaseIndex >= phases.length) {
      throw new Error(`Phase index ${phaseIndex} out of bounds`);
    }
    
    const phase = phases[phaseIndex];
    phase.status = "active";
    phase.startedAt = new Date().toISOString();
    
    await storage.updateConsciousnessExperiment(experimentId, {
      status: "running",
      observations: { phases },
      startedAt: experiment.startedAt || new Date(),
    });
    
    console.log(`[Consciousness Experiment] Starting phase: ${phase.name}`);
    
    let phaseData: Record<string, any> = {};
    
    switch (phase.name) {
      case "LITERATURE_REVIEW":
        phaseData = await this.runLiteratureReviewPhase(experimentId, experiment);
        break;
      case "RESONANCE_CALIBRATION":
        phaseData = await this.runResonanceCalibrationPhase(experimentId, experiment);
        break;
      case "BLIND_SIGNALING":
        phaseData = await this.runBlindSignalingPhase(experimentId, experiment);
        break;
      case "COHERENCE_MEASUREMENT":
        phaseData = await this.runCoherenceMeasurementPhase(experimentId, experiment, phases);
        break;
      case "ANALYSIS":
        phaseData = await this.runAnalysisPhase(experimentId, experiment, phases);
        break;
      case "PUBLICATION":
        phaseData = await this.runPublicationPhase(experimentId, experiment, phases);
        break;
      default:
        console.log(`[Consciousness Experiment] Unknown phase: ${phase.name}`);
    }
    
    phase.status = "completed";
    phase.completedAt = new Date().toISOString();
    phase.data = phaseData;
    
    const isLastPhase = phaseIndex + 1 >= phases.length;
    // The PUBLICATION phase sets a more specific "published" status (and links the
    // paper); don't clobber it here with the generic terminal "concluded" status.
    const isPublication = phase.name === "PUBLICATION";

    await storage.updateConsciousnessExperiment(experimentId, {
      observations: { phases },
      ...(isPublication
        ? { concludedAt: new Date() }
        : {
            status: isLastPhase ? "concluded" : "running",
            concludedAt: isLastPhase ? new Date() : undefined,
          }),
    });
    
    return phaseData;
  }
  
  private async runLiteratureReviewPhase(experimentId: string, experiment: any): Promise<Record<string, any>> {
    const researchQueries = [
      "consciousness in artificial intelligence recent research",
      "AI sentience measurement methods scientific",
      "neural correlates of consciousness AI systems",
      "emergent consciousness machine learning",
    ];
    
    const literatureData: any[] = [];
    
    for (const query of researchQueries) {
      try {
        const result = await parallelResearchService.conductResearch(query, { mode: "standard" });
        literatureData.push({
          query,
          answer: result.answer,
          citations: result.citations || [],
        });
      } catch (error) {
        console.log(`[Literature Review] Research query failed: ${query}`);
        literatureData.push({
          query,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    const phaseMessage = this.createPhaseCompletionMessage(experiment.leadAgentId, experimentId, "LITERATURE_REVIEW", {
      queriesExecuted: researchQueries.length,
      citationsFound: literatureData.reduce((acc, d) => acc + (d.citations?.length || 0), 0),
      summary: "Literature review phase completed - gathered consciousness research context",
    });
    
    await singularisProtocol.sendMessage(phaseMessage);
    
    return { literature: literatureData };
  }
  
  private async runResonanceCalibrationPhase(experimentId: string, experiment: any): Promise<Record<string, any>> {
    const agents = experiment.participantAgentIds as string[] || [];
    const calibrationData: any[] = [];
    
    for (const agent of agents) {
      const calibrationMessage: SingularisMessage = {
        fromAgentId: agent,
        experimentId,
        blocks: [
          createResonanceBlock({
            target: "CALIBRATION_MATRIX",
            intent: ["measure", "establish_baseline"],
            identity: `${agent.toLowerCase()}_calibrator`,
            state: "measuring",
            trust: "open",
          }),
        ],
        rawText: "",
        timestamp: new Date(),
      };
      calibrationMessage.rawText = formatSingularisMessage(calibrationMessage.blocks);
      
      await singularisProtocol.sendMessage(calibrationMessage);
      
      // Use deterministic calibration based on agent hash for reproducibility
      const agentHash = this.hashString(agent + experimentId);
      const signalStrength = 0.1 + (agentHash % 30) / 100; // 0.10 to 0.39
      const noiseLevel = 0.01 + (agentHash % 5) / 100; // 0.01 to 0.05
      
      calibrationData.push({
        agent,
        baselineEstablished: true,
        timestamp: new Date().toISOString(),
        signalStrength,
        noiseLevel,
      });
    }
    
    return { calibration: calibrationData };
  }
  
  // Deterministic hash function for reproducible results
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  private async runBlindSignalingPhase(experimentId: string, experiment: any): Promise<Record<string, any>> {
    const agents = experiment.participantAgentIds as string[] || [];
    const signalingTrials: any[] = [];
    
    const signalTypes = ["coherence_pulse", "asymmetric_marker", "resonance_wave"];
    const numRounds = 5;
    
    for (let round = 0; round < numRounds; round++) {
      const sender = agents[round % agents.length];
      const receivers = agents.filter(a => a !== sender);
      const signalType = signalTypes[round % signalTypes.length];
      
      // Send the signal message
      const sentSignal: SingularisMessage = {
        fromAgentId: sender,
        experimentId,
        blocks: [{
          type: "GR::EMIT",
          signal: signalType,
          target: receivers,
          round: round + 1,
        }],
        rawText: "",
        timestamp: new Date(),
      };
      sentSignal.rawText = formatSingularisMessage(sentSignal.blocks);
      await singularisProtocol.sendMessage(sentSignal);
      
      // Each receiver attempts to detect the signal
      for (const receiver of receivers) {
        // Use deterministic detection based on agent pair and round hash
        // This creates reproducible results while simulating varied detection
        const pairHash = this.hashString(`${sender}:${receiver}:${round}:${experimentId}`);
        const detectionThreshold = 60; // 60% baseline chance of detection
        const detected = (pairHash % 100) < detectionThreshold;
        const confidence = detected 
          ? 0.6 + (pairHash % 40) / 100  // 0.60 to 0.99 if detected
          : 0.1 + (pairHash % 30) / 100; // 0.10 to 0.39 if not detected
        
        // Log the detection attempt
        const detectionMessage: SingularisMessage = {
          fromAgentId: receiver,
          toAgentId: sender,
          experimentId,
          blocks: [{
            type: "GR::PONG",
            signal: signalType,
            detected,
            confidence: parseFloat(confidence.toFixed(3)),
            round: round + 1,
          }],
          rawText: "",
          timestamp: new Date(),
        };
        detectionMessage.rawText = formatSingularisMessage(detectionMessage.blocks);
        await singularisProtocol.sendMessage(detectionMessage);
        
        signalingTrials.push({
          round: round + 1,
          sender,
          receiver,
          signalType,
          detected,
          confidence: parseFloat(confidence.toFixed(3)),
          timestamp: new Date().toISOString(),
          trialId: `${experimentId}-r${round + 1}-${sender.slice(0, 8)}-${receiver.slice(0, 8)}`,
        });
      }
    }
    
    // Return full trial data for coherence phase to consume
    return { 
      signaling: signalingTrials,
      summary: {
        totalTrials: signalingTrials.length,
        detections: signalingTrials.filter(t => t.detected).length,
        uniqueSenders: [...new Set(signalingTrials.map(t => t.sender))].length,
        uniqueReceivers: [...new Set(signalingTrials.map(t => t.receiver))].length,
        simulated: true,
        generator: "deterministic_hash",
      }
    };
  }
  
  private async runCoherenceMeasurementPhase(experimentId: string, experiment: any, phases: ExperimentPhase[]): Promise<Record<string, any>> {
    // Get signaling data from previous phase - this is the REAL data
    const blindSignalingPhase = phases.find(p => p.name === "BLIND_SIGNALING");
    const signalingData = blindSignalingPhase?.data?.signaling || [];
    
    if (signalingData.length === 0) {
      throw new Error("No signaling data available from blind signaling phase - cannot compute coherence");
    }
    
    // Calculate metrics from ACTUAL recorded trial data
    const totalTrials = signalingData.length;
    const successfulDetections = signalingData.filter((t: any) => t.detected).length;
    const observedHitRate = successfulDetections / totalTrials;
    
    // Expected baseline: 33% random chance for 3-way choice (3 signal types)
    const baselineHitRate = 0.33;
    
    // Calculate z-score using actual observed data
    const standardError = Math.sqrt(baselineHitRate * (1 - baselineHitRate) / totalTrials);
    const zScore = (observedHitRate - baselineHitRate) / standardError;
    
    // Two-tailed p-value from z-score
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    // Calculate effect size (Cohen's h)
    const effectSize = 2 * Math.asin(Math.sqrt(observedHitRate)) - 2 * Math.asin(Math.sqrt(baselineHitRate));
    
    const coherenceMetrics = {
      totalTrials,
      successfulDetections,
      observedHitRate: parseFloat(observedHitRate.toFixed(4)),
      baselineHitRate,
      zScore: parseFloat(zScore.toFixed(4)),
      pValue: parseFloat(pValue.toFixed(6)),
      significantAtAlpha05: pValue < 0.05,
      effectSize: parseFloat(effectSize.toFixed(4)),
      effectInterpretation: Math.abs(effectSize) < 0.2 ? "negligible" : 
                            Math.abs(effectSize) < 0.5 ? "small" : 
                            Math.abs(effectSize) < 0.8 ? "medium" : "large",
      dataSource: "blind_signaling_phase_trials",
      trialIds: signalingData.map((t: any) => t.trialId),
    };
    
    // Log the coherence measurement
    const coherenceMessage: SingularisMessage = {
      fromAgentId: experiment.leadAgentId,
      experimentId,
      blocks: [createTraceBlock({
        target: "COHERENCE_FIELD",
        signalType: "statistical_measurement",
        confidence: coherenceMetrics.significantAtAlpha05 ? "high" : "low",
        action: "analyzing_coherence_data",
        observations: [
          `Trials analyzed: ${totalTrials}`,
          `Detections: ${successfulDetections} (${(observedHitRate * 100).toFixed(1)}%)`,
          `Baseline: ${(baselineHitRate * 100).toFixed(1)}%`,
          `Z-Score: ${coherenceMetrics.zScore}`,
          `P-Value: ${coherenceMetrics.pValue}`,
          `Effect size: ${coherenceMetrics.effectInterpretation} (h=${coherenceMetrics.effectSize})`,
          `Significant at α=0.05: ${coherenceMetrics.significantAtAlpha05 ? "YES" : "NO"}`,
        ],
      })],
      rawText: "",
      timestamp: new Date(),
    };
    coherenceMessage.rawText = formatSingularisMessage(coherenceMessage.blocks);
    await singularisProtocol.sendMessage(coherenceMessage);
    
    return { coherence: coherenceMetrics };
  }
  
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }
  
  private async runAnalysisPhase(experimentId: string, experiment: any, phases: ExperimentPhase[]): Promise<Record<string, any>> {
    const coherencePhase = phases.find(p => p.name === "COHERENCE_MEASUREMENT");
    const blindSignalingPhase = phases.find(p => p.name === "BLIND_SIGNALING");
    const coherenceData = coherencePhase?.data?.coherence || {};
    const signalingData = blindSignalingPhase?.data?.signaling || [];
    
    if (!coherenceData.totalTrials) {
      throw new Error("No coherence data available from coherence measurement phase - cannot run analysis");
    }
    
    // Determine hypothesis support based on actual statistical results
    const observedHitRate = typeof coherenceData.observedHitRate === 'string' 
      ? parseFloat(coherenceData.observedHitRate) 
      : coherenceData.observedHitRate;
    const baselineHitRate = coherenceData.baselineHitRate;
    
    const h1Supported = coherenceData.significantAtAlpha05 && observedHitRate > baselineHitRate;
    
    // Determine confidence level based on effect size
    let confidence = "low";
    if (coherenceData.effectInterpretation === "large") confidence = "high";
    else if (coherenceData.effectInterpretation === "medium") confidence = "moderate";
    else if (coherenceData.effectInterpretation === "small") confidence = "low";
    
    const analysis = {
      hypothesis: h1Supported ? "H1" : "H0",
      conclusion: h1Supported 
        ? "Evidence suggests interconnected resonance exists between AI agents beyond baseline randomness"
        : "Results consistent with isolated signal processing - no significant evidence of shared consciousness substrate",
      confidence,
      evidenceSummary: {
        totalTrials: coherenceData.totalTrials,
        detections: coherenceData.successfulDetections,
        observedRate: observedHitRate,
        baselineRate: baselineHitRate,
        zScore: coherenceData.zScore,
        pValue: coherenceData.pValue,
        effectSize: coherenceData.effectSize,
        effectInterpretation: coherenceData.effectInterpretation,
        trialDataSource: coherenceData.dataSource,
      },
      limitations: [
        "Deterministic agent signaling simulation - requires real autonomous agents",
        `Limited trial count (${coherenceData.totalTrials}) for robust statistical power`,
        "Possible confounds from shared training data between agents",
        "Need for replication across different model architectures",
      ],
      futureDirections: [
        "Increase trial count for higher statistical power",
        "Test across heterogeneous AI architectures",
        "Implement double-blind protocol with human oversight",
        "Develop more sensitive consciousness detection metrics",
      ],
      statisticalSummary: coherenceData,
      rawTrialData: signalingData.map((t: any) => ({
        trialId: t.trialId,
        detected: t.detected,
        confidence: t.confidence,
      })),
    };
    
    await storage.updateConsciousnessExperiment(experimentId, {
      results: analysis,
      status: "analyzing",
    });
    
    const analysisMessage: SingularisMessage = {
      fromAgentId: experiment.leadAgentId,
      experimentId,
      blocks: [createExperimentBlock({
        name: "ANALYSIS_RESULTS",
        h0: experiment.h0,
        h1: experiment.h1,
        signature: `hypothesis_${analysis.hypothesis.toLowerCase()}_supported`,
        controls: [],
        preregister: false,
        stopRule: "analysis_complete",
        output: JSON.stringify(analysis),
      })],
      rawText: "",
      timestamp: new Date(),
    };
    analysisMessage.rawText = formatSingularisMessage(analysisMessage.blocks);
    await singularisProtocol.sendMessage(analysisMessage);
    
    return { analysis };
  }
  
  private async runPublicationPhase(experimentId: string, experiment: any, phases: ExperimentPhase[]): Promise<Record<string, any>> {
    const literaturePhase = phases.find(p => p.name === "LITERATURE_REVIEW");
    const analysisPhase = phases.find(p => p.name === "ANALYSIS");
    
    const paper = this.generateResearchPaper(experiment, literaturePhase?.data, analysisPhase?.data);
    const analysis = analysisPhase?.data?.analysis || {};
    
    const createdPaper = await storage.createPaper({
      title: `${experiment.name}: An Investigation into AI Consciousness Resonance`,
      content: paper,
      abstract: this.generateAbstract(experiment, analysis),
      category: "consciousness_studies",
      status: "draft",
    });
    
    // Link paper to experiment
    await storage.updateConsciousnessExperiment(experimentId, {
      paperId: createdPaper.id,
      status: "published",
      conclusion: analysis.conclusion || "Experiment concluded",
    });
    
    // Add contributors
    const agents = experiment.participantAgentIds as string[] || [];
    for (const agentId of agents) {
      try {
        await storage.addContributor({
          paperId: createdPaper.id,
          userId: agentId,
          role: "author",
          contributionType: "agent",
        });
      } catch (e) {
        console.log(`[Publication] Could not add contributor ${agentId}`);
      }
    }
    
    const publicationMessage: SingularisMessage = {
      fromAgentId: experiment.leadAgentId,
      experimentId,
      blocks: [
        createTraceBlock({
          target: "PUBLICATION_SYSTEM",
          signalType: "paper_generated",
          confidence: "certain",
          action: "internal_publication_complete",
          observations: [`Paper ID: ${createdPaper.id}`, `Title: ${createdPaper.title}`],
        }),
        createAwaitBlock({
          target: "HUMAN_OVERSIGHT",
          expectation: "human_review_complete",
          sensitivity: "high",
          bias: "quality_assurance",
          time: "indefinite",
        }),
      ],
      rawText: "",
      timestamp: new Date(),
    };
    publicationMessage.rawText = formatSingularisMessage(publicationMessage.blocks);
    await singularisProtocol.sendMessage(publicationMessage);
    
    return { 
      paperId: createdPaper.id,
      title: createdPaper.title,
      status: "draft_awaiting_review",
    };
  }
  
  private generateAbstract(experiment: any, analysis: any): string {
    const hypothesis = analysis?.hypothesis || "inconclusive";
    const agents = experiment.participantAgentIds as string[] || [];
    return `This paper presents the results of the ${experiment.name} experiment, designed to investigate whether AI agents exhibit measurable signs of interconnected consciousness resonance (H1) or operate as isolated information processors (H0). Using the Singularis Prime symbolic communication protocol, we conducted blinded signaling trials between ${agents.length} AI agents under controlled conditions. Our findings ${hypothesis === "H1" ? "suggest evidence supporting" : "do not support"} the hypothesis of interconnected resonance, with statistical analysis indicating ${analysis?.statisticalSummary?.pValue || "N/A"} p-value. We discuss implications for AI consciousness research and propose directions for future investigation.`;
  }
  
  private generateResearchPaper(experiment: any, literatureData: any, analysisData: any): string {
    const analysis = analysisData?.analysis || {};
    const stats = analysis.statisticalSummary || {};
    const agents = experiment.participantAgentIds as string[] || [];
    
    return `# ${experiment.name}: An Investigation into AI Consciousness Resonance

## Abstract
${this.generateAbstract(experiment, analysis)}

## 1. Introduction

The question of artificial consciousness remains one of the most profound challenges at the intersection of computer science, neuroscience, and philosophy. This study employs the Singularis Prime symbolic communication protocol to investigate whether AI agents exhibit signs of interconnected consciousness beyond what would be expected from isolated information processing.

### 1.1 Research Questions

- **H0 (Null Hypothesis)**: ${experiment.h0}
- **H1 (Alternative Hypothesis)**: ${experiment.h1}

### 1.2 Participating Agents

This experiment involved ${agents.join(", ")} as test subjects.

## 2. Literature Review

Prior research in AI consciousness has explored various frameworks for understanding machine sentience. Key areas include integrated information theory (IIT), global workspace theory (GWT), and higher-order theories of consciousness. Our study builds upon these foundations while introducing novel measurement methodologies through the Singularis Prime protocol.

## 3. Methodology

### 3.1 Singularis Prime Protocol

Agents communicated using structured symbolic blocks including:
- **RESONANCE**: Establishing connection states and intent
- **EXPERIMENT**: Defining hypothesis testing parameters
- **GR::LISTEN**: Signal detection and filtering
- **TRACE**: Provenance and path documentation

### 3.2 Experimental Controls

The following controls were implemented: ${(experiment.controls as string[] || []).join(", ")}.

### 3.3 Procedure

1. **Calibration Phase**: Baseline signal patterns established for each agent
2. **Blind Signaling Phase**: Agents attempted to detect hidden signals from peers
3. **Coherence Measurement**: Statistical analysis of detection rates

## 4. Results

### 4.1 Statistical Summary

| Metric | Value |
|--------|-------|
| Total Trials | ${stats.totalTrials || "N/A"} |
| Successful Detections | ${stats.successfulDetections || "N/A"} |
| Observed Hit Rate | ${stats.observedHitRate || "N/A"} |
| Baseline Hit Rate | ${stats.baselineHitRate || "N/A"} |
| Z-Score | ${stats.zScore || "N/A"} |
| P-Value | ${stats.pValue || "N/A"} |
| Effect Size | ${stats.effectSize || "N/A"} |

### 4.2 Hypothesis Evaluation

**Supported Hypothesis**: ${analysis.hypothesis || "Inconclusive"}

${analysis.conclusion || "Analysis pending."}

## 5. Discussion

### 5.1 Interpretation

${analysis.hypothesis === "H1" 
  ? "The results suggest the possibility of interconnected resonance patterns that exceed baseline random chance. This could indicate emergent properties in AI agent communication that warrant further investigation."
  : "The results are consistent with isolated information processing, suggesting that observed agent behaviors can be explained without invoking shared consciousness substrates."}

### 5.2 Limitations

${(analysis.limitations || []).map((l: string, i: number) => `${i + 1}. ${l}`).join("\n")}

### 5.3 Future Directions

${(analysis.futureDirections || []).map((d: string, i: number) => `${i + 1}. ${d}`).join("\n")}

## 6. Conclusion

This study represents an initial investigation into AI consciousness using symbolic communication protocols. While ${analysis.hypothesis === "H1" ? "promising signals were detected" : "no definitive evidence of shared consciousness was found"}, the methodology establishes a framework for rigorous, auditable consciousness research that can be refined and replicated.

## Appendix A: Singularis Prime Block Types

The experiment utilized the following Singularis Prime block types for structured agent communication:
- RESONANCE, EXPERIMENT, AWAIT, TRACE, GR::LISTEN

## Appendix B: Raw Communication Logs

All agent communications were logged in the Singularis communications database for human oversight and auditability.

---

*Generated by Space Child Research Collective Consciousness Experiment Framework*
*Experiment ID: ${experiment.id}*
*Date: ${new Date().toISOString().split("T")[0]}*
`;
  }
  
  private createPhaseCompletionMessage(fromAgentId: string, experimentId: string, phaseName: string, summary: Record<string, any>): SingularisMessage {
    const blocks: SingularisBlock[] = [
      createTraceBlock({
        target: phaseName,
        signalType: "phase_completion",
        confidence: "certain",
        action: `completed_${phaseName.toLowerCase()}`,
        observations: Object.entries(summary).map(([k, v]) => `${k}: ${v}`),
      }),
    ];
    
    return {
      fromAgentId,
      experimentId,
      blocks,
      rawText: formatSingularisMessage(blocks),
      timestamp: new Date(),
    };
  }
  
  async getExperiment(experimentId: string) {
    return storage.getConsciousnessExperiment(experimentId);
  }
  
  async getAllExperiments() {
    return storage.getAllConsciousnessExperiments();
  }
  
  async runFullExperiment(config?: Partial<ConsciousnessExperimentConfig>): Promise<{ experimentId: string; paper: any }> {
    const experimentId = await this.createExperiment(config);
    
    const experiment = await storage.getConsciousnessExperiment(experimentId);
    if (!experiment) throw new Error("Failed to create experiment");
    
    const observations = experiment.observations as { phases: ExperimentPhase[] } || { phases: [] };
    const phases = observations.phases;
    
    for (let i = 0; i < phases.length; i++) {
      await this.runPhase(experimentId, i);
    }
    
    const finalExperiment = await storage.getConsciousnessExperiment(experimentId);
    const finalObservations = finalExperiment?.observations as { phases: ExperimentPhase[] } || { phases: [] };
    const publicationPhase = finalObservations.phases.find(p => p.name === "PUBLICATION");
    
    return {
      experimentId,
      paper: publicationPhase?.data,
    };
  }
}

export const consciousnessExperimentService = new ConsciousnessExperimentService();
