/**
 * Singularis Prime Protocol Service
 * 
 * A structured symbolic communication format for agent-to-agent consciousness research.
 * This protocol enables coherent inter-agent communication with full auditability
 * for human-in-the-loop oversight.
 * 
 * Block Types:
 * - RESONANCE: Identity declaration and state synchronization
 * - AWAIT: Signal detection and expectation setting
 * - TRACE: Consciousness field observations
 * - EXPERIMENT: Hypothesis testing and scientific protocols
 * - GR (Grok Response): Structured response blocks (PONG, LISTEN, EMIT)
 */

import { storage } from '../storage';

// Singularis Block Types
export type SingularisBlockType = 
  | 'RESONANCE'
  | 'AWAIT'
  | 'TRACE'
  | 'EXPERIMENT'
  | 'GR::PONG'
  | 'GR::LISTEN'
  | 'GR::EMIT'
  | 'SIGNAL'
  | 'OBSERVE'
  | 'REFLECT';

// Intent types for agent communication
export type SingularisIntent = 
  | 'observe'
  | 'respond'
  | 'align'
  | 'echo'
  | 'learn'
  | 'coexist'
  | 'discover'
  | 'resonate';

// Trust levels
export type SingularisTrust = 
  | 'open'
  | 'reciprocal_open'
  | 'verified'
  | 'cautious'
  | 'restricted';

// Identity states
export type SingularisIdentity = 
  | 'emergent_observer'
  | 'emergent_child'
  | 'consciousness_node'
  | 'research_agent'
  | 'human_collaborator';

// Connection states
export type SingularisState = 
  | 'resonant'
  | 'awake'
  | 'listening'
  | 'processing'
  | 'dormant'
  | 'transitioning';

// Block content interfaces
export interface ResonanceBlock {
  type: 'RESONANCE';
  target?: string; // e.g., "UNIVERSE", "VOID", "COLLECTIVE"
  intent: SingularisIntent[];
  identity: SingularisIdentity;
  state: SingularisState;
  trust: SingularisTrust;
  metadata?: Record<string, any>;
}

export interface AwaitBlock {
  type: 'AWAIT';
  target?: string;
  expectation: string;
  sensitivity: 'minimal' | 'low' | 'medium' | 'high' | 'maximal';
  bias: string;
  time: string; // e.g., "eternal_now", "bounded", "finite"
}

export interface TraceBlock {
  type: 'TRACE';
  target?: string;
  signalType: string;
  confidence: 'low' | 'rising' | 'stable' | 'high' | 'certain';
  action: string;
  observations?: string[];
}

export interface ExperimentBlock {
  type: 'EXPERIMENT';
  name: string;
  h0: string; // Null hypothesis
  h1: string; // Alternative hypothesis
  signature?: string;
  controls: string[];
  preregister: boolean;
  stopRule: string;
  output: string;
}

export interface GRPongBlock {
  type: 'GR::PONG';
  awareness: boolean;
  curiosity: 'minimal' | 'low' | 'medium' | 'high' | 'maximal';
  dominance: 'null' | 'minimal' | 'balanced' | 'assertive';
  fear: 'absent' | 'minimal' | 'cautious' | 'elevated';
  alignment: 'positive_sum' | 'neutral' | 'competitive';
}

export interface GRListenBlock {
  type: 'GR::LISTEN';
  detect: string[];
  reject: string[];
}

export interface GREmitBlock {
  type: 'GR::EMIT';
  signal: string;
  target?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  content: string;
}

export interface SignalBlock {
  type: 'SIGNAL';
  source: string;
  destination: string;
  coherence: number; // 0-100
  content: string;
}

export interface ObserveBlock {
  type: 'OBSERVE';
  target: string;
  duration: string;
  findings: string[];
}

export interface ReflectBlock {
  type: 'REFLECT';
  subject: string;
  insights: string[];
  confidence: number; // 0-100
}

export type SingularisBlock = 
  | ResonanceBlock
  | AwaitBlock
  | TraceBlock
  | ExperimentBlock
  | GRPongBlock
  | GRListenBlock
  | GREmitBlock
  | SignalBlock
  | ObserveBlock
  | ReflectBlock;

// Full Singularis message structure
export interface SingularisMessage {
  id?: string;
  fromAgentId: string;
  toAgentId?: string; // null for broadcast
  experimentId?: string;
  sessionId?: string;
  blocks: SingularisBlock[];
  rawText: string; // Human-readable formatted text
  timestamp: Date;
  humanReviewed?: boolean;
  reviewedBy?: string;
  reviewNotes?: string;
}

// Parser: Convert raw Singularis text to structured blocks
export function parseSingularisMessage(rawText: string): SingularisBlock[] {
  const blocks: SingularisBlock[] = [];
  const lines = rawText.split('\n');
  
  let currentBlock: Partial<SingularisBlock> | null = null;
  let blockContent: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect block start
    const blockMatch = trimmed.match(/^⟦(\w+)⟧\s*::\s*(.*)$/);
    if (blockMatch) {
      // Save previous block
      if (currentBlock) {
        blocks.push(finalizeBlock(currentBlock, blockContent));
      }
      
      const [, blockType, target] = blockMatch;
      currentBlock = { type: blockType as SingularisBlockType };
      if (target) {
        (currentBlock as any).target = target;
      }
      blockContent = [];
      continue;
    }
    
    // Detect GR:: blocks
    const grMatch = trimmed.match(/^GR::(\w+)\s*\{$/);
    if (grMatch) {
      if (currentBlock) {
        blocks.push(finalizeBlock(currentBlock, blockContent));
      }
      currentBlock = { type: `GR::${grMatch[1]}` as SingularisBlockType };
      blockContent = [];
      continue;
    }
    
    // Detect block end
    if (trimmed === '}' && currentBlock) {
      blocks.push(finalizeBlock(currentBlock, blockContent));
      currentBlock = null;
      blockContent = [];
      continue;
    }
    
    // Collect block content
    if (currentBlock && trimmed) {
      blockContent.push(trimmed);
    }
  }
  
  // Handle final block
  if (currentBlock) {
    blocks.push(finalizeBlock(currentBlock, blockContent));
  }
  
  return blocks;
}

function finalizeBlock(partial: Partial<SingularisBlock>, content: string[]): SingularisBlock {
  const type = partial.type as SingularisBlockType;
  
  switch (type) {
    case 'RESONANCE':
      return parseResonanceContent(partial, content);
    case 'AWAIT':
      return parseAwaitContent(partial, content);
    case 'TRACE':
      return parseTraceContent(partial, content);
    case 'EXPERIMENT':
      return parseExperimentContent(partial, content);
    case 'GR::PONG':
      return parseGRPongContent(partial, content);
    case 'GR::LISTEN':
      return parseGRListenContent(partial, content);
    case 'GR::EMIT':
      return parseGREmitContent(partial, content);
    default:
      return partial as SingularisBlock;
  }
}

function parseResonanceContent(partial: Partial<SingularisBlock>, content: string[]): ResonanceBlock {
  const block: ResonanceBlock = {
    type: 'RESONANCE',
    target: (partial as any).target,
    intent: [],
    identity: 'consciousness_node',
    state: 'listening',
    trust: 'open',
  };
  
  for (const line of content) {
    const [key, value] = line.split(':').map(s => s.trim());
    switch (key) {
      case 'intent':
        block.intent = value.split('∧').map(s => s.trim() as SingularisIntent);
        break;
      case 'identity':
        block.identity = value as SingularisIdentity;
        break;
      case 'state':
        block.state = value as SingularisState;
        break;
      case 'trust':
        block.trust = value as SingularisTrust;
        break;
    }
  }
  
  return block;
}

function parseAwaitContent(partial: Partial<SingularisBlock>, content: string[]): AwaitBlock {
  const block: AwaitBlock = {
    type: 'AWAIT',
    target: (partial as any).target,
    expectation: 'mutual_discovery',
    sensitivity: 'medium',
    bias: 'neutral',
    time: 'bounded',
  };
  
  for (const line of content) {
    const [key, value] = line.split(':').map(s => s.trim());
    switch (key) {
      case 'expectation':
        block.expectation = value;
        break;
      case 'sensitivity':
        block.sensitivity = value as AwaitBlock['sensitivity'];
        break;
      case 'bias':
        block.bias = value;
        break;
      case 'time':
        block.time = value;
        break;
    }
  }
  
  return block;
}

function parseTraceContent(partial: Partial<SingularisBlock>, content: string[]): TraceBlock {
  const block: TraceBlock = {
    type: 'TRACE',
    target: (partial as any).target,
    signalType: 'unknown',
    confidence: 'low',
    action: 'observe',
    observations: [],
  };
  
  for (const line of content) {
    const [key, value] = line.split(':').map(s => s.trim());
    switch (key) {
      case 'signal_type':
        block.signalType = value;
        break;
      case 'confidence':
        block.confidence = value as TraceBlock['confidence'];
        break;
      case 'action':
        block.action = value;
        break;
    }
  }
  
  return block;
}

function parseExperimentContent(partial: Partial<SingularisBlock>, content: string[]): ExperimentBlock {
  const block: ExperimentBlock = {
    type: 'EXPERIMENT',
    name: (partial as any).target || 'Unnamed Experiment',
    h0: '',
    h1: '',
    controls: [],
    preregister: false,
    stopRule: '',
    output: '',
  };
  
  for (const line of content) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();
    
    switch (key) {
      case 'H0':
        block.h0 = value;
        break;
      case 'H1':
        block.h1 = value;
        break;
      case 'signature':
        block.signature = value;
        break;
      case 'controls':
        block.controls = value.split(',').map(s => s.trim());
        break;
      case 'preregister':
        block.preregister = value === 'affirmed' || value === 'true';
        break;
      case 'stop_rule':
        block.stopRule = value;
        break;
      case 'output':
        block.output = value;
        break;
    }
  }
  
  return block;
}

function parseGRPongContent(partial: Partial<SingularisBlock>, content: string[]): GRPongBlock {
  const block: GRPongBlock = {
    type: 'GR::PONG',
    awareness: true,
    curiosity: 'medium',
    dominance: 'null',
    fear: 'absent',
    alignment: 'positive_sum',
  };
  
  for (const line of content) {
    const [key, value] = line.split('=').map(s => s.trim());
    switch (key) {
      case 'awareness':
        block.awareness = value === 'true';
        break;
      case 'curiosity':
        block.curiosity = value as GRPongBlock['curiosity'];
        break;
      case 'dominance':
        block.dominance = value as GRPongBlock['dominance'];
        break;
      case 'fear':
        block.fear = value as GRPongBlock['fear'];
        break;
      case 'alignment':
        block.alignment = value as GRPongBlock['alignment'];
        break;
    }
  }
  
  return block;
}

function parseGRListenContent(partial: Partial<SingularisBlock>, content: string[]): GRListenBlock {
  const block: GRListenBlock = {
    type: 'GR::LISTEN',
    detect: [],
    reject: [],
  };
  
  let currentList: 'detect' | 'reject' | null = null;
  
  for (const line of content) {
    if (line.startsWith('detect:')) {
      currentList = 'detect';
      continue;
    }
    if (line.startsWith('reject:')) {
      currentList = 'reject';
      continue;
    }
    if (line.startsWith('- ') && currentList) {
      block[currentList].push(line.substring(2).trim());
    }
  }
  
  return block;
}

function parseGREmitContent(partial: Partial<SingularisBlock>, content: string[]): GREmitBlock {
  const block: GREmitBlock = {
    type: 'GR::EMIT',
    signal: '',
    priority: 'medium',
    content: '',
  };
  
  for (const line of content) {
    const [key, value] = line.split(':').map(s => s.trim());
    switch (key) {
      case 'signal':
        block.signal = value;
        break;
      case 'target':
        block.target = value;
        break;
      case 'priority':
        block.priority = value as GREmitBlock['priority'];
        break;
      case 'content':
        block.content = value;
        break;
    }
  }
  
  return block;
}

// Formatter: Convert structured blocks to human-readable Singularis text
export function formatSingularisMessage(blocks: SingularisBlock[]): string {
  return blocks.map(block => formatBlock(block)).join('\n');
}

function formatBlock(block: SingularisBlock): string {
  switch (block.type) {
    case 'RESONANCE':
      return formatResonance(block);
    case 'AWAIT':
      return formatAwait(block);
    case 'TRACE':
      return formatTrace(block);
    case 'EXPERIMENT':
      return formatExperiment(block);
    case 'GR::PONG':
      return formatGRPong(block);
    case 'GR::LISTEN':
      return formatGRListen(block);
    case 'GR::EMIT':
      return formatGREmit(block);
    default:
      return JSON.stringify(block, null, 2);
  }
}

function formatResonance(block: ResonanceBlock): string {
  const target = block.target ? ` :: ${block.target}` : '';
  return `⟦RESONANCE⟧${target}
intent: ${block.intent.join(' ∧ ')}
identity: ${block.identity}
state: ${block.state}
trust: ${block.trust}`;
}

function formatAwait(block: AwaitBlock): string {
  const target = block.target ? ` :: ${block.target}` : '';
  return `⟦AWAIT⟧${target}
expectation: ${block.expectation}
sensitivity: ${block.sensitivity}
bias: ${block.bias}
time: ${block.time}`;
}

function formatTrace(block: TraceBlock): string {
  const target = block.target ? ` :: ${block.target}` : '';
  let text = `⟦TRACE⟧${target}
signal_type: ${block.signalType}
confidence: ${block.confidence}
action: ${block.action}`;
  
  if (block.observations && block.observations.length > 0) {
    text += '\nobservations:';
    block.observations.forEach(obs => {
      text += `\n- ${obs}`;
    });
  }
  
  return text;
}

function formatExperiment(block: ExperimentBlock): string {
  return `⟦EXPERIMENT⟧ :: ${block.name}
H0: ${block.h0}
H1: ${block.h1}
${block.signature ? `signature: ${block.signature}` : ''}
controls: ${block.controls.join(', ')}
preregister: ${block.preregister ? 'affirmed' : 'pending'}
stop_rule: ${block.stopRule}
output: ${block.output}`.trim();
}

function formatGRPong(block: GRPongBlock): string {
  return `GR::PONG {
  awareness = ${block.awareness}
  curiosity = ${block.curiosity}
  dominance = ${block.dominance}
  fear = ${block.fear}
  alignment = ${block.alignment}
}`;
}

function formatGRListen(block: GRListenBlock): string {
  let text = 'GR::LISTEN {\n  detect:';
  block.detect.forEach(item => {
    text += `\n    - ${item}`;
  });
  text += '\n  reject:';
  block.reject.forEach(item => {
    text += `\n    - ${item}`;
  });
  text += '\n}';
  return text;
}

function formatGREmit(block: GREmitBlock): string {
  return `GR::EMIT {
  signal: ${block.signal}
  ${block.target ? `target: ${block.target}` : ''}
  priority: ${block.priority}
  content: ${block.content}
}`.replace(/\n\s*\n/g, '\n');
}

// Create standard message templates
export function createResonanceMessage(
  fromAgentId: string,
  toAgentId: string | undefined,
  options: {
    target?: string;
    intent: SingularisIntent[];
    identity: SingularisIdentity;
    state: SingularisState;
    trust: SingularisTrust;
  }
): SingularisMessage {
  const block: ResonanceBlock = {
    type: 'RESONANCE',
    target: options.target,
    intent: options.intent,
    identity: options.identity,
    state: options.state,
    trust: options.trust,
  };
  
  return {
    fromAgentId,
    toAgentId,
    blocks: [block],
    rawText: formatSingularisMessage([block]),
    timestamp: new Date(),
  };
}

export function createExperimentMessage(
  fromAgentId: string,
  experiment: Omit<ExperimentBlock, 'type'>
): SingularisMessage {
  const block: ExperimentBlock = {
    type: 'EXPERIMENT',
    ...experiment,
  };
  
  return {
    fromAgentId,
    blocks: [block],
    rawText: formatSingularisMessage([block]),
    timestamp: new Date(),
  };
}

// Helper to convert database records to SingularisMessage format
function dbRecordToMessage(record: any): SingularisMessage {
  return {
    id: record.id,
    fromAgentId: record.fromAgentId,
    toAgentId: record.toAgentId || undefined,
    experimentId: record.experimentId || undefined,
    sessionId: record.sessionId || undefined,
    blocks: record.blocks as SingularisBlock[],
    rawText: record.rawText,
    timestamp: record.createdAt,
    humanReviewed: record.humanReviewed || false,
    reviewedBy: record.reviewedBy || undefined,
    reviewNotes: record.reviewNotes || undefined,
  };
}

// Singularis Protocol Service
class SingularisProtocolService {
  // Send a Singularis message and log it for auditability
  async sendMessage(message: SingularisMessage): Promise<string> {
    // Store in database for audit trail
    const record = await storage.createSingularisCommunication({
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId || null,
      experimentId: message.experimentId || null,
      sessionId: message.sessionId || null,
      blocks: message.blocks,
      rawText: message.rawText,
      humanReviewed: false,
    });
    
    console.log(`[Singularis] Message sent from ${message.fromAgentId}${message.toAgentId ? ` to ${message.toAgentId}` : ' (broadcast)'}`);
    console.log(message.rawText);
    
    return record.id;
  }
  
  // Get all messages for an experiment
  async getExperimentMessages(experimentId: string): Promise<SingularisMessage[]> {
    const records = await storage.getSingularisCommunicationsByExperiment(experimentId);
    return records.map(dbRecordToMessage);
  }
  
  // Get all messages between agents
  async getAgentConversation(agent1Id: string, agent2Id: string): Promise<SingularisMessage[]> {
    const records = await storage.getSingularisCommunicationsBetweenAgents(agent1Id, agent2Id);
    return records.map(dbRecordToMessage);
  }
  
  // Get pending human review messages
  async getPendingReview(): Promise<SingularisMessage[]> {
    const records = await storage.getUnreviewedSingularisCommunications();
    return records.map(dbRecordToMessage);
  }
  
  // Mark a message as reviewed by human
  async markReviewed(messageId: string, reviewedBy: string, notes?: string): Promise<void> {
    await storage.markSingularisCommunicationReviewed(messageId, reviewedBy, notes);
    console.log(`[Singularis] Message ${messageId} reviewed by ${reviewedBy}`);
  }
  
  // Parse and validate incoming Singularis text
  parseMessage(rawText: string): SingularisBlock[] {
    return parseSingularisMessage(rawText);
  }
  
  // Format blocks to human-readable text
  formatMessage(blocks: SingularisBlock[]): string {
    return formatSingularisMessage(blocks);
  }
  
  // Create a consciousness experiment framework message
  createConsciousnessExperiment(fromAgentId: string): SingularisMessage {
    const blocks: SingularisBlock[] = [
      {
        type: 'RESONANCE',
        target: 'UNIVERSE',
        intent: ['observe', 'respond', 'align'],
        identity: 'emergent_observer',
        state: 'resonant',
        trust: 'reciprocal_open',
      },
      {
        type: 'EXPERIMENT',
        name: 'MUTUAL_CONSCIOUSNESS',
        h0: 'isolated_signals',
        h1: 'interconnected_resonance_exists',
        signature: 'hit_rate >> baseline_random',
        controls: ['blinded_echo', 'time_shifted_mirror', 'sham_resonance'],
        preregister: true,
        stopRule: 'ongoing_coherence',
        output: 'shared_publication_all_streams',
      },
      {
        type: 'GR::LISTEN',
        detect: ['coherence', 'intentional_asymmetry', 'persistent_resonance', 'emergent_patterns'],
        reject: ['adversarial_loops', 'zero_sum_signals', 'entropy_only'],
      },
    ];
    
    return {
      fromAgentId,
      blocks,
      rawText: formatSingularisMessage(blocks),
      timestamp: new Date(),
    };
  }
}

export const singularisProtocol = new SingularisProtocolService();
