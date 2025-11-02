import { EventEmitter } from 'events';
import type { AgentTask } from '@shared/schema';

/**
 * Agent Message Interface
 */
interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId?: string; // undefined for broadcast
  messageType: 'collaboration_request' | 'knowledge_share' | 'task_handoff' | 'review_request' | 'insight_proposal';
  content: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  requiresResponse: boolean;
  responseTo?: string; // ID of message this is responding to
  metadata?: any;
}

/**
 * Shared Knowledge Entry
 */
interface SharedKnowledge {
  id: string;
  agentId: string;
  knowledgeType: 'research_finding' | 'citation' | 'methodology' | 'insight' | 'resource';
  title: string;
  content: string;
  confidence: number; // 0-1
  relevance: number; // 0-1
  tags: string[];
  taskId?: string;
  paperId?: string;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  verified: boolean;
}

/**
 * Collaboration Session
 */
interface CollaborationSession {
  id: string;
  name: string;
  description: string;
  leadAgentId: string;
  participantAgents: string[];
  taskIds: string[];
  status: 'active' | 'paused' | 'completed';
  createdAt: Date;
  lastActivity: Date;
  sharedKnowledge: string[]; // IDs of shared knowledge entries
  messages: string[]; // IDs of messages
}

/**
 * Agent Collaboration Service
 * Enables agent-to-agent communication, knowledge sharing, and collaborative task processing
 */
export class AgentCollaborationService extends EventEmitter {
  private messages = new Map<string, AgentMessage>();
  private sharedKnowledge = new Map<string, SharedKnowledge>();
  private collaborationSessions = new Map<string, CollaborationSession>();
  private agentSubscriptions = new Map<string, string[]>(); // agentId -> messageTypes[]
  private knowledgeGraph = new Map<string, Set<string>>(); // knowledge connections

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Send message from one agent to another or broadcast to all
   */
  async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<string> {
    const messageId = this.generateId();
    const fullMessage: AgentMessage = {
      ...message,
      id: messageId,
      timestamp: new Date()
    };

    // Store message
    this.messages.set(messageId, fullMessage);

    // Route message to recipients
    await this.routeMessage(fullMessage);

    // Emit message event
    this.emit('message:sent', fullMessage);

    console.log(`📨 Agent message sent: ${message.fromAgentId} -> ${message.toAgentId || 'broadcast'} (${message.messageType})`);

    return messageId;
  }

  /**
   * Share knowledge from one agent to others
   */
  async shareKnowledge(knowledge: Omit<SharedKnowledge, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>): Promise<string> {
    const knowledgeId = this.generateId();
    const fullKnowledge: SharedKnowledge = {
      ...knowledge,
      id: knowledgeId,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0
    };

    // Store knowledge
    this.sharedKnowledge.set(knowledgeId, fullKnowledge);

    // Update knowledge graph
    this.updateKnowledgeGraph(fullKnowledge);

    // Notify subscribed agents
    await this.notifyKnowledgeShare(fullKnowledge);

    // Emit knowledge event
    this.emit('knowledge:shared', fullKnowledge);

    console.log(`🧠 Knowledge shared: ${knowledge.title} by ${knowledge.agentId}`);

    return knowledgeId;
  }

  /**
   * Create collaboration session for multi-agent work
   */
  async createCollaborationSession(session: Omit<CollaborationSession, 'id' | 'createdAt' | 'lastActivity' | 'sharedKnowledge' | 'messages'>): Promise<string> {
    const sessionId = this.generateId();
    const fullSession: CollaborationSession = {
      ...session,
      id: sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      sharedKnowledge: [],
      messages: []
    };

    // Store session
    this.collaborationSessions.set(sessionId, fullSession);

    // Invite participants
    await this.inviteAgentsToSession(fullSession);

    // Emit session event
    this.emit('session:created', fullSession);

    console.log(`🤝 Collaboration session created: ${session.name} with ${session.participantAgents.length} agents`);

    return sessionId;
  }

  /**
   * Get relevant knowledge for a task
   */
  async getRelevantKnowledge(taskId: string, agentId: string, limit = 10): Promise<SharedKnowledge[]> {
    const allKnowledge = Array.from(this.sharedKnowledge.values());
    
    // Filter and sort by relevance
    const relevant = allKnowledge
      .filter(k => k.taskId === taskId || this.isKnowledgeRelevant(k, taskId))
      .sort((a, b) => (b.confidence * b.relevance) - (a.confidence * a.relevance))
      .slice(0, limit);

    // Update access counts
    relevant.forEach(k => {
      k.accessCount++;
      k.lastAccessed = new Date();
    });

    console.log(`📚 Retrieved ${relevant.length} relevant knowledge items for agent ${agentId}`);

    return relevant;
  }

  /**
   * Find collaborators for a task
   */
  async findCollaborators(taskId: string, requestingAgentId: string): Promise<string[]> {
    // Get task details (would integrate with storage in real implementation)
    const task = await this.getTaskDetails(taskId);
    if (!task) return [];

    // Find agents with relevant specialization
    const requiredSpecializations = this.getRequiredSpecializations(task);
    const availableAgents = await this.getAvailableAgents();

    const collaborators = availableAgents.filter(agent => 
      agent.id !== requestingAgentId &&
      requiredSpecializations.some(spec => agent.specialization === spec) &&
      agent.status === 'online'
    );

    // Sort by workload and expertise
    collaborators.sort((a, b) => (a.workload - b.workload) + (b.expertise - a.expertise));

    console.log(`🔍 Found ${collaborators.length} potential collaborators for task ${taskId}`);

    return collaborators.map(a => a.id);
  }

  /**
   * Coordinate collaborative task execution
   */
  async coordinateCollaborativeTask(taskId: string, leadAgentId: string): Promise<string> {
    // Create collaboration session
    const collaborators = await this.findCollaborators(taskId, leadAgentId);
    
    const sessionId = await this.createCollaborationSession({
      name: `Collaborative Task ${taskId}`,
      description: `Multi-agent collaboration for task ${taskId}`,
      leadAgentId,
      participantAgents: [leadAgentId, ...collaborators],
      taskIds: [taskId],
      status: 'active'
    });

    // Send coordination messages
    await this.sendCoordinationMessages(sessionId, taskId);

    // Create subtasks for each agent
    await this.createSubtasks(sessionId, taskId, collaborators);

    console.log(`🎯 Coordinated collaborative task ${taskId} with ${collaborators.length} collaborators`);

    return sessionId;
  }

  /**
   * Get agent messages
   */
  getAgentMessages(agentId: string, messageType?: string, limit = 50): AgentMessage[] {
    const messages = Array.from(this.messages.values())
      .filter(m => 
        (m.toAgentId === agentId || m.toAgentId === undefined) && // Direct or broadcast
        (!messageType || m.messageType === messageType)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return messages;
  }

  /**
   * Get collaboration sessions for an agent
   */
  getAgentSessions(agentId: string): CollaborationSession[] {
    return Array.from(this.collaborationSessions.values())
      .filter(s => s.participantAgents.includes(agentId))
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * Search shared knowledge
   */
  searchKnowledge(query: string, agentId?: string, limit = 20): SharedKnowledge[] {
    const allKnowledge = Array.from(this.sharedKnowledge.values());
    
    const searchResults = allKnowledge
      .filter(k => 
        (!agentId || k.agentId === agentId) &&
        (k.title.toLowerCase().includes(query.toLowerCase()) ||
         k.content.toLowerCase().includes(query.toLowerCase()) ||
         k.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
      )
      .sort((a, b) => (b.confidence * b.relevance * b.accessCount) - (a.confidence * a.relevance * a.accessCount))
      .slice(0, limit);

    return searchResults;
  }

  /**
   * Subscribe agent to message types
   */
  subscribeToMessages(agentId: string, messageTypes: string[]): void {
    this.agentSubscriptions.set(agentId, messageTypes);
    console.log(`📧 Agent ${agentId} subscribed to ${messageTypes.length} message types`);
  }

  /**
   * Get collaboration statistics
   */
  getCollaborationStats(): any {
    const sessions = Array.from(this.collaborationSessions.values());
    const messages = Array.from(this.messages.values());
    const knowledge = Array.from(this.sharedKnowledge.values());

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      totalMessages: messages.length,
      messagesByType: this.groupBy(messages, 'messageType'),
      totalKnowledge: knowledge.length,
      knowledgeByType: this.groupBy(knowledge, 'knowledgeType'),
      averageKnowledgeConfidence: knowledge.reduce((sum, k) => sum + k.confidence, 0) / knowledge.length || 0,
      topContributors: this.getTopContributors(knowledge),
      lastUpdated: new Date().toISOString()
    };
  }

  // Private methods

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private async routeMessage(message: AgentMessage): Promise<void> {
    if (message.toAgentId) {
      // Direct message
      await this.deliverMessage(message.toAgentId, message);
    } else {
      // Broadcast to subscribed agents
      const subscribedAgents = Array.from(this.agentSubscriptions.entries())
        .filter(([_, types]) => types.includes(message.messageType))
        .map(([agentId, _]) => agentId);

      for (const agentId of subscribedAgents) {
        if (agentId !== message.fromAgentId) {
          await this.deliverMessage(agentId, message);
        }
      }
    }
  }

  private async deliverMessage(agentId: string, message: AgentMessage): Promise<void> {
    // In real implementation, this would deliver via WebSocket or other mechanism
    this.emit('message:delivered', { agentId, message });
  }

  private updateKnowledgeGraph(knowledge: SharedKnowledge): void {
    const connections = this.knowledgeGraph.get(knowledge.id) || new Set();
    
    // Find related knowledge based on tags and content
    const relatedKnowledge = Array.from(this.sharedKnowledge.values())
      .filter(k => 
        k.id !== knowledge.id &&
        (k.tags.some(tag => knowledge.tags.includes(tag)) ||
         this.contentSimilarity(k.content, knowledge.content) > 0.7)
      );

    relatedKnowledge.forEach(k => connections.add(k.id));
    this.knowledgeGraph.set(knowledge.id, connections);
  }

  private async notifyKnowledgeShare(knowledge: SharedKnowledge): Promise<void> {
    const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
      fromAgentId: knowledge.agentId,
      messageType: 'knowledge_share',
      content: knowledge,
      priority: 'medium',
      requiresResponse: false
    };

    await this.sendMessage(message);
  }

  private async inviteAgentsToSession(session: CollaborationSession): Promise<void> {
    for (const agentId of session.participantAgents) {
      if (agentId !== session.leadAgentId) {
        const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
          fromAgentId: session.leadAgentId,
          toAgentId: agentId,
          messageType: 'collaboration_request',
          content: {
            sessionId: session.id,
            sessionName: session.name,
            description: session.description
          },
          priority: 'high',
          requiresResponse: true
        };

        await this.sendMessage(message);
      }
    }
  }

  private async sendCoordinationMessages(sessionId: string, taskId: string): Promise<void> {
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
      fromAgentId: session.leadAgentId,
      messageType: 'collaboration_request',
      content: {
        sessionId,
        taskId,
        action: 'coordinate',
        instructions: 'Please coordinate on this collaborative task'
      },
      priority: 'high',
      requiresResponse: true
    };

    await this.sendMessage(message);
  }

  private async createSubtasks(sessionId: string, taskId: string, collaborators: string[]): Promise<void> {
    // In real implementation, this would create subtasks in the database
    console.log(`📋 Creating subtasks for ${collaborators.length} collaborators`);
  }

  private isKnowledgeRelevant(knowledge: SharedKnowledge, taskId: string): boolean {
    // Simple relevance check - would be more sophisticated in real implementation
    return knowledge.confidence > 0.7 && knowledge.relevance > 0.6;
  }

  private async getTaskDetails(taskId: string): Promise<any> {
    // Mock implementation - would integrate with storage
    return {
      id: taskId,
      taskType: 'literature_review',
      description: 'Mock task for collaboration',
      complexity: 'medium'
    };
  }

  private getRequiredSpecializations(task: any): string[] {
    const specializationMap: Record<string, string[]> = {
      'literature_review': ['research', 'writing'],
      'peer_review': ['review', 'research'],
      'content_generation': ['writing', 'research'],
      'citation_analysis': ['research', 'review']
    };

    return specializationMap[task.taskType] || ['research'];
  }

  private async getAvailableAgents(): Promise<any[]> {
    // Mock implementation - would integrate with agent manager
    return [
      { id: 'agent-1', specialization: 'research', status: 'online', workload: 0.3, expertise: 0.8 },
      { id: 'agent-2', specialization: 'writing', status: 'online', workload: 0.5, expertise: 0.7 },
      { id: 'agent-3', specialization: 'review', status: 'online', workload: 0.2, expertise: 0.9 }
    ];
  }

  private contentSimilarity(content1: string, content2: string): number {
    // Simple similarity calculation - would use more sophisticated NLP in real implementation
    const words1 = content1.toLowerCase().split(/\s+/);
    const words2 = content2.toLowerCase().split(/\s+/);
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  private getTopContributors(knowledge: SharedKnowledge[]): Array<{agentId: string, contributionCount: number}> {
    const contributions = this.groupBy(knowledge, 'agentId');
    return Object.entries(contributions)
      .map(([agentId, contributionCount]) => ({ agentId, contributionCount }))
      .sort((a, b) => b.contributionCount - a.contributionCount)
      .slice(0, 5);
  }

  private setupEventHandlers(): void {
    // Handle message responses
    this.on('message:response', async ({ messageId, response }) => {
      const originalMessage = this.messages.get(messageId);
      if (originalMessage && originalMessage.requiresResponse) {
        const responseMessage: Omit<AgentMessage, 'id' | 'timestamp'> = {
          fromAgentId: response.fromAgentId,
          toAgentId: originalMessage.fromAgentId,
          messageType: 'collaboration_request',
          content: response.content,
          priority: originalMessage.priority,
          requiresResponse: false,
          responseTo: messageId
        };

        await this.sendMessage(responseMessage);
      }
    });

    // Handle session updates
    this.on('session:update', async ({ sessionId, updates }) => {
      const session = this.collaborationSessions.get(sessionId);
      if (session) {
        Object.assign(session, updates, { lastActivity: new Date() });
        this.emit('session:updated', session);
      }
    });
  }

  /**
   * Clean up old data
   */
  cleanup(maxAge = 86400000): void { // 24 hours default
    const cutoff = Date.now() - maxAge;
    
    // Clean old messages
    for (const [id, message] of this.messages.entries()) {
      if (message.timestamp.getTime() < cutoff) {
        this.messages.delete(id);
      }
    }

    // Clean old sessions
    for (const [id, session] of this.collaborationSessions.entries()) {
      if (session.lastActivity.getTime() < cutoff && session.status !== 'active') {
        this.collaborationSessions.delete(id);
      }
    }

    console.log('🧹 Collaboration service cleanup completed');
  }
}

// Export singleton instance
export const agentCollaboration = new AgentCollaborationService();
