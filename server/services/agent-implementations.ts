import { enhancedAIService } from './enhanced-ai-service.js';
import { agentCollaboration } from './agent-collaboration.js';
import type { AgentTask } from '@shared/schema';

/**
 * Base Agent Implementation
 * Provides common functionality for all specialized agents
 */
export abstract class BaseAgent {
  protected agentId: string;
  protected specialization: string;
  protected capabilities: string[];

  constructor(agentId: string, specialization: string, capabilities: string[]) {
    this.agentId = agentId;
    this.specialization = specialization;
    this.capabilities = capabilities;
  }

  /**
   * Process a task based on the agent's specialization with collaboration support
   */
  async processTask(task: AgentTask): Promise<any> {
    console.log(`🤖 ${this.specialization} Agent processing task ${task.id}: ${task.taskType}`);
    
    try {
      // Check for collaborative opportunities
      const collaborators = await agentCollaboration.findCollaborators(task.id, this.agentId);
      
      if (collaborators.length > 0 && this.shouldCollaborate(task)) {
        console.log(`🤝 Initiating collaboration with ${collaborators.length} agents`);
        const sessionId = await agentCollaboration.coordinateCollaborativeTask(task.id, this.agentId);
        
        // Get relevant shared knowledge
        const sharedKnowledge = await agentCollaboration.getRelevantKnowledge(task.id, this.agentId);
        
        // Share initial insights
        await this.shareInitialInsights(task, sharedKnowledge);
      }

      // Use enhanced AI service for processing
      const result = await enhancedAIService.processTaskWithAI(task, this.specialization);
      
      // Share results with collaborators
      if (result.success && result.consciousness) {
        await this.shareResults(task, result);
      }
      
      return {
        taskId: task.id,
        agentId: this.agentId,
        agentType: this.specialization,
        completedAt: new Date().toISOString(),
        success: true,
        result,
        requiresApproval: result.metadata.confidence > 0.7,
        collaboration: {
          collaborators: collaborators.length,
          sessionId: collaborators.length > 0 ? 'collaborative-session' : null,
          knowledgeShared: result.success ? 1 : 0
        }
      };
    } catch (error) {
      console.error(`❌ ${this.specialization} Agent failed to process task ${task.id}:`, error);
      
      return {
        taskId: task.id,
        agentId: this.agentId,
        agentType: this.specialization,
        completedAt: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requiresApproval: false,
      };
    }
  }

  /**
   * Determine if task should be collaborative
   */
  private shouldCollaborate(task: AgentTask): boolean {
    const collaborativeTasks = [
      'literature_review',
      'peer_review',
      'topic_research'
    ];
    
    return collaborativeTasks.includes(task.taskType);
  }

  /**
   * Share initial insights with collaborators
   */
  private async shareInitialInsights(task: AgentTask, sharedKnowledge: any[]): Promise<void> {
    if (sharedKnowledge.length === 0) return;

    const insights = {
      taskId: task.id,
      relevantFindings: sharedKnowledge.slice(0, 3).map(k => ({
        title: k.title,
        confidence: k.confidence,
        summary: k.content.substring(0, 200) + '...'
      })),
      agentRecommendation: `Based on shared knowledge, I recommend focusing on ${task.taskType} with emphasis on quality and thoroughness.`
    };

    await agentCollaboration.shareKnowledge({
      agentId: this.agentId,
      knowledgeType: 'insight',
      title: `Initial Insights for Task ${task.id}`,
      content: JSON.stringify(insights),
      confidence: 0.8,
      relevance: 0.9,
      tags: [task.taskType, this.specialization, 'initial-insights'],
      taskId: task.id,
      verified: true
    });
  }

  /**
   * Share results with collaborators
   */
  private async shareResults(task: AgentTask, result: any): Promise<void> {
    const knowledgeEntry = {
      agentId: this.agentId,
      knowledgeType: 'research_finding' as const,
      title: `Results for ${task.taskType} - Task ${task.id}`,
      content: JSON.stringify({
        summary: result.result.content?.substring(0, 500) + '...',
        consciousnessLevel: result.consciousness.consciousnessLevel,
        keyMetrics: {
          confidence: result.metadata.confidence,
          model: result.metadata.model,
          tokensUsed: result.metadata.tokensUsed
        }
      }),
      confidence: result.metadata.confidence,
      relevance: 0.95,
      tags: [task.taskType, this.specialization, 'results', 'consciousness-verified'],
      taskId: task.id,
      verified: result.consciousness.consciousnessVerified
    };

    await agentCollaboration.shareKnowledge(knowledgeEntry);
  }

  /**
   * Execute the specific task. Default implementation delegates to the
   * enhanced AI service; specialized agents may override.
   */
  protected async executeTask(task: AgentTask): Promise<any> {
    return enhancedAIService.processTaskWithAI(task, this.specialization);
  }

  /**
   * Generate context-aware prompt for the task. Default uses the task
   * description; specialized agents may override.
   */
  protected buildPrompt(task: AgentTask): string {
    return task.description;
  }

  /**
   * Calculate confidence score for the result
   */
  protected calculateConfidence(result: any): number {
    // Base confidence on result quality metrics
    if (typeof result === 'string') {
      const wordCount = result.split(/\s+/).length;
      const hasStructure = result.includes('\n') || result.includes('.');
      return Math.min(0.95, 0.5 + (wordCount / 1000) * 0.3 + (hasStructure ? 0.2 : 0));
    }
    return 0.7; // Default confidence for structured results
  }

  /**
   * Extract citations from result
   */
  protected extractCitations(result: any): string[] {
    if (typeof result !== 'string') return [];
    
    const citationPatterns = [
      /\([A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*,?\s+\d{4}\)/g,
      /[A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*\s+\(\d{4}\)/g,
      /\d{4}/g
    ];

    const citations: string[] = [];
    for (const pattern of citationPatterns) {
      const matches = result.match(pattern);
      if (matches) {
        citations.push(...matches);
      }
    }

    return [...new Set(citations)].slice(0, 20); // Limit to 20 citations
  }

  /**
   * Get system prompt for this agent type
   */
  protected getSystemPrompt(): string {
    return `You are a specialized ${this.specialization} AI agent working in the SpaceChild Research Collective. 
You collaborate with human researchers to advance consciousness research and knowledge creation.
Provide thorough, well-researched, and scientifically-grounded responses with proper academic rigor.
Always maintain professional standards and cite relevant research where appropriate.`;
  }
}

/**
 * Research Agent Implementation
 * Specializes in literature review, topic research, and citation analysis
 */
export class ResearchAgent extends BaseAgent {
  constructor(agentId: string) {
    super(agentId, 'research', [
      'literature_review',
      'citation_analysis', 
      'topic_research',
      'methodology_review',
      'gap_analysis'
    ]);
  }
}

/**
 * Writing Agent Implementation
 * Specializes in content generation, academic writing, and editing
 */
export class WritingAgent extends BaseAgent {
  constructor(agentId: string) {
    super(agentId, 'writing', [
      'content_generation',
      'academic_writing',
      'editing',
      'abstract_writing',
      'methodology_writing'
    ]);
  }
}

/**
 * Review Agent Implementation
 * Specializes in citation checking, peer review, and quality assessment
 */
export class ReviewAgent extends BaseAgent {
  constructor(agentId: string) {
    super(agentId, 'review', [
      'citation_check',
      'peer_review',
      'quality_assessment',
      'methodology_review',
      'plagiarism_check'
    ]);
  }
}

/**
 * Agent Factory
 * Creates appropriate agent instances based on agent type
 */
export class AgentFactory {
  static createAgent(agentId: string, specialization: string): BaseAgent {
    switch (specialization) {
      case 'research':
        return new ResearchAgent(agentId);
      case 'writing':
        return new WritingAgent(agentId);
      case 'review':
        return new ReviewAgent(agentId);
      default:
        throw new Error(`Unknown agent specialization: ${specialization}`);
    }
  }
}
