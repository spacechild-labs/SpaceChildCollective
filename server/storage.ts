// Database storage layer using blueprint: javascript_database
import {
  type User,
  type InsertUser,
  type Paper,
  type InsertPaper,
  type PaperContributor,
  type InsertPaperContributor,
  type BlockchainRecord,
  type InsertBlockchainRecord,
  type McpCommunication,
  type InsertMcpCommunication,
  type AgentTask,
  type InsertAgentTask,
  type AgentConversation,
  type InsertAgentConversation,
  type AgentMessage,
  type InsertAgentMessage,
  type SharedKnowledge,
  type InsertSharedKnowledge,
  type CollaborationSession,
  type InsertCollaborationSession,
  type SingularisCommunication,
  type InsertSingularisCommunication,
  type ConsciousnessExperiment,
  type InsertConsciousnessExperiment,
  users,
  papers,
  paperContributors,
  blockchainRecords,
  mcpCommunications,
  agentTasks,
  agentConversations,
  agentMessages,
  sharedKnowledge,
  collaborationSessions,
  singularisCommunications,
  consciousnessExperiments,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or, isNull } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByZkProof(zkProof: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Paper operations
  getPaper(id: string): Promise<Paper | undefined>;
  getPaperWithContributors(id: string): Promise<Paper & { contributors: (PaperContributor & { user: User })[] } | undefined>;
  getAllPapers(): Promise<Paper[]>;
  getPapersByUserId(userId: string): Promise<Paper[]>;
  createPaper(paper: InsertPaper): Promise<Paper>;
  updatePaper(id: string, paper: Partial<InsertPaper>): Promise<Paper>;
  deletePaper(id: string): Promise<void>;
  
  // Paper contributor operations
  addContributor(contributor: InsertPaperContributor): Promise<PaperContributor>;
  getContributorsByPaperId(paperId: string): Promise<(PaperContributor & { user: User })[]>;
  
  // Blockchain operations
  createBlockchainRecord(record: InsertBlockchainRecord): Promise<BlockchainRecord>;
  getBlockchainRecordsByPaperId(paperId: string): Promise<BlockchainRecord[]>;
  getVerifiedPaperIds(): Promise<string[]>;
  updateBlockchainStatus(id: string, status: "pending" | "confirmed" | "failed"): Promise<BlockchainRecord>;
  
  // MCP communications
  createMcpCommunication(comm: InsertMcpCommunication): Promise<McpCommunication>;
  getMcpCommunicationsByPaperId(paperId: string): Promise<McpCommunication[]>;
  getPendingApprovals(userId: string): Promise<McpCommunication[]>;
  updateMcpStatus(id: string, status: "sent" | "received" | "approved" | "rejected"): Promise<McpCommunication>;
  
  // Agent task operations
  createAgentTask(task: InsertAgentTask): Promise<AgentTask>;
  getAgentTasksByPaperId(paperId: string): Promise<AgentTask[]>;
  getActiveAgentTasks(agentId: string): Promise<AgentTask[]>;
  updateAgentTask(id: string, updates: Partial<InsertAgentTask>): Promise<AgentTask>;
  getAllTasks(): Promise<AgentTask[]>;
  getTasksByStatus(status: AgentTask["status"]): Promise<AgentTask[]>;
  getTask(id: string): Promise<AgentTask | null>;
  getTasksAwaitingApproval(): Promise<(AgentTask & { agent: User; paper?: Paper })[]>;
  updateTask(id: string, updates: Partial<AgentTask>): Promise<AgentTask>;
  getTasksWithHumanFeedback(agentId?: string, limit?: number): Promise<AgentTask[]>;
  getAllMcpCommunications(): Promise<McpCommunication[]>;
  
  // Agent conversation operations
  createAgentConversation(conversation: InsertAgentConversation): Promise<AgentConversation>;
  getConversationsByPaperId(paperId: string): Promise<AgentConversation[]>;
  getConversationsByAgentId(agentId: string, limit?: number): Promise<AgentConversation[]>;
  getConversationsByUserId(userId: string, limit?: number): Promise<AgentConversation[]>;
  
  // Agent collaboration operations
  createAgentMessage(message: import("@shared/schema").InsertAgentMessage): Promise<import("@shared/schema").AgentMessage>;
  getAgentMessagesByAgent(agentId: string, limit?: number): Promise<import("@shared/schema").AgentMessage[]>;
  createSharedKnowledge(knowledge: import("@shared/schema").InsertSharedKnowledge): Promise<import("@shared/schema").SharedKnowledge>;
  getSharedKnowledgeByAgent(agentId: string): Promise<import("@shared/schema").SharedKnowledge[]>;
  getSharedKnowledgeByPaper(paperId: string): Promise<import("@shared/schema").SharedKnowledge[]>;
  updateKnowledgeAccess(id: string): Promise<void>;
  createCollaborationSession(session: import("@shared/schema").InsertCollaborationSession): Promise<import("@shared/schema").CollaborationSession>;
  getActiveCollaborationSessions(): Promise<import("@shared/schema").CollaborationSession[]>;
  updateCollaborationSession(id: string, updates: Partial<import("@shared/schema").InsertCollaborationSession>): Promise<import("@shared/schema").CollaborationSession>;
  
  // Singularis Prime communications
  createSingularisCommunication(comm: InsertSingularisCommunication): Promise<SingularisCommunication>;
  getSingularisCommunicationsByExperiment(experimentId: string): Promise<SingularisCommunication[]>;
  getSingularisCommunicationsBetweenAgents(agent1Id: string, agent2Id: string): Promise<SingularisCommunication[]>;
  getUnreviewedSingularisCommunications(): Promise<SingularisCommunication[]>;
  markSingularisCommunicationReviewed(id: string, reviewedBy: string, notes?: string): Promise<void>;
  getAllSingularisCommunications(limit?: number): Promise<SingularisCommunication[]>;
  
  // Consciousness experiments
  createConsciousnessExperiment(experiment: InsertConsciousnessExperiment): Promise<ConsciousnessExperiment>;
  getConsciousnessExperiment(id: string): Promise<ConsciousnessExperiment | undefined>;
  getAllConsciousnessExperiments(): Promise<ConsciousnessExperiment[]>;
  updateConsciousnessExperiment(id: string, updates: Partial<InsertConsciousnessExperiment>): Promise<ConsciousnessExperiment>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByZkProof(zkProof: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.zkpCommitment, zkProof));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user as any).returning();
    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    const [updated] = await db.update(users).set(updates as any).where(eq(users.id, id)).returning();
    if (!updated) {
      throw new Error("User not found");
    }
    return updated;
  }

  // Paper operations
  async getPaper(id: string): Promise<Paper | undefined> {
    const [paper] = await db.select().from(papers).where(eq(papers.id, id));
    return paper || undefined;
  }

  async getPaperWithContributors(id: string): Promise<Paper & { contributors: (PaperContributor & { user: User })[] } | undefined> {
    const [paper] = await db.select().from(papers).where(eq(papers.id, id));
    if (!paper) return undefined;

    const contribs = await this.getContributorsByPaperId(id);
    return { ...paper, contributors: contribs };
  }

  async getAllPapers(): Promise<Paper[]> {
    return await db.select().from(papers).orderBy(desc(papers.createdAt));
  }

  async getPapersByUserId(userId: string): Promise<Paper[]> {
    const contributorPapers = await db
      .select({ paper: papers })
      .from(paperContributors)
      .innerJoin(papers, eq(paperContributors.paperId, papers.id))
      .where(eq(paperContributors.userId, userId))
      .orderBy(desc(papers.updatedAt));
    
    return contributorPapers.map((cp: { paper: Paper }) => cp.paper);
  }

  async createPaper(paper: InsertPaper): Promise<Paper> {
    const [newPaper] = await db.insert(papers).values(paper as any).returning();
    return newPaper;
  }

  async updatePaper(id: string, paperUpdate: Partial<InsertPaper>): Promise<Paper> {
    const [updated] = await db
      .update(papers)
      .set({ ...paperUpdate, updatedAt: new Date() } as any)
      .where(eq(papers.id, id))
      .returning();
    return updated;
  }

  async deletePaper(id: string): Promise<void> {
    await db.delete(papers).where(eq(papers.id, id));
  }

  // Paper contributor operations
  async addContributor(contributor: InsertPaperContributor): Promise<PaperContributor> {
    const [newContributor] = await db.insert(paperContributors).values(contributor as any).returning();
    return newContributor;
  }

  async getContributorsByPaperId(paperId: string): Promise<(PaperContributor & { user: User })[]> {
    const contribs = await db
      .select()
      .from(paperContributors)
      .innerJoin(users, eq(paperContributors.userId, users.id))
      .where(eq(paperContributors.paperId, paperId));
    
    return contribs.map((c: { paper_contributors: PaperContributor; users: User }) => ({ ...c.paper_contributors, user: c.users }));
  }

  // Blockchain operations
  async createBlockchainRecord(record: InsertBlockchainRecord): Promise<BlockchainRecord> {
    const [newRecord] = await db.insert(blockchainRecords).values(record as any).returning();
    return newRecord;
  }

  async getBlockchainRecordsByPaperId(paperId: string): Promise<BlockchainRecord[]> {
    return await db.select().from(blockchainRecords).where(eq(blockchainRecords.paperId, paperId));
  }

  async getVerifiedPaperIds(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ paperId: blockchainRecords.paperId })
      .from(blockchainRecords)
      .where(eq(blockchainRecords.status, "confirmed"));
    return rows.map((r: { paperId: string }) => r.paperId);
  }

  async updateBlockchainStatus(id: string, status: "pending" | "confirmed" | "failed"): Promise<BlockchainRecord> {
    const [updated] = await db
      .update(blockchainRecords)
      .set({ status })
      .where(eq(blockchainRecords.id, id))
      .returning();
    return updated;
  }

  // MCP communications
  async createMcpCommunication(comm: InsertMcpCommunication): Promise<McpCommunication> {
    const [newComm] = await db.insert(mcpCommunications).values(comm as any).returning();
    return newComm;
  }

  async getMcpCommunicationsByPaperId(paperId: string): Promise<McpCommunication[]> {
    return await db
      .select()
      .from(mcpCommunications)
      .where(eq(mcpCommunications.paperId, paperId))
      .orderBy(desc(mcpCommunications.createdAt));
  }

  async getPendingApprovals(userId: string): Promise<McpCommunication[]> {
    return await db
      .select()
      .from(mcpCommunications)
      .where(
        and(
          eq(mcpCommunications.toUserId, userId),
          eq(mcpCommunications.requiresHumanApproval, true),
          eq(mcpCommunications.status, "sent")
        )
      )
      .orderBy(desc(mcpCommunications.createdAt));
  }

  async updateMcpStatus(id: string, status: "sent" | "received" | "approved" | "rejected"): Promise<McpCommunication> {
    const [updated] = await db
      .update(mcpCommunications)
      .set({ status })
      .where(eq(mcpCommunications.id, id))
      .returning();
    return updated;
  }

  // Agent task operations
  async createAgentTask(task: InsertAgentTask): Promise<AgentTask> {
    const [newTask] = await db.insert(agentTasks).values(task as any).returning();
    return newTask;
  }

  async getAgentTasksByPaperId(paperId: string): Promise<AgentTask[]> {
    return await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.paperId, paperId))
      .orderBy(desc(agentTasks.createdAt));
  }

  async getActiveAgentTasks(agentId: string): Promise<AgentTask[]> {
    return await db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.agentId, agentId),
          eq(agentTasks.status, "in_progress")
        )
      )
      .orderBy(desc(agentTasks.createdAt));
  }

  async updateAgentTask(id: string, updates: Partial<InsertAgentTask>): Promise<AgentTask> {
    const [updated] = await db
      .update(agentTasks)
      .set(updates as any)
      .where(eq(agentTasks.id, id))
      .returning();
    return updated;
  }

  // Helper methods for simplified frontend API
  async getAllTasks(): Promise<AgentTask[]> {
    return await db
      .select()
      .from(agentTasks)
      .orderBy(desc(agentTasks.createdAt));
  }

  async getTasksByStatus(status: AgentTask["status"]): Promise<AgentTask[]> {
    return await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.status, status))
      .orderBy(desc(agentTasks.createdAt));
  }

  async getTask(id: string): Promise<AgentTask | null> {
    const [task] = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, id))
      .limit(1);
    return task || null;
  }

  async updateTask(id: string, updates: Partial<AgentTask>): Promise<AgentTask> {
    const [updated] = await db
      .update(agentTasks)
      .set(updates as any)
      .where(eq(agentTasks.id, id))
      .returning();
    return updated;
  }

  async getAllMcpCommunications(): Promise<McpCommunication[]> {
    return await db
      .select()
      .from(mcpCommunications)
      .orderBy(desc(mcpCommunications.createdAt));
  }

  async getTasksAwaitingApproval(): Promise<(AgentTask & { agent: User; paper?: Paper })[]> {
    const tasks = await db
      .select()
      .from(agentTasks)
      .leftJoin(users, eq(agentTasks.agentId, users.id))
      .leftJoin(papers, eq(agentTasks.paperId, papers.id))
      .where(eq(agentTasks.status, "awaiting_approval"))
      .orderBy(desc(agentTasks.createdAt));

    return tasks.map((t: { agent_tasks: AgentTask; users: User | null; papers: Paper | null }) => ({
      ...t.agent_tasks,
      agent: t.users!,
      paper: t.papers || undefined,
    }));
  }

  async getTasksWithHumanFeedback(
    agentId?: string,
    limit = 50
  ): Promise<AgentTask[]> {
    if (agentId) {
      return await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.agentId, agentId))
        .orderBy(desc(agentTasks.createdAt))
        .limit(limit);
    }
    
    return await db
      .select()
      .from(agentTasks)
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit);
  }

  // Agent conversation operations
  async createAgentConversation(conversation: InsertAgentConversation): Promise<AgentConversation> {
    const [newConversation] = await db.insert(agentConversations).values(conversation as any).returning();
    return newConversation;
  }

  async getConversationsByPaperId(paperId: string): Promise<AgentConversation[]> {
    return await db
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.paperId, paperId))
      .orderBy(desc(agentConversations.createdAt));
  }

  async getConversationsByAgentId(agentId: string, limit = 100): Promise<AgentConversation[]> {
    return await db
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.agentId, agentId))
      .orderBy(desc(agentConversations.createdAt))
      .limit(limit);
  }

  async getConversationsByUserId(userId: string, limit = 100): Promise<AgentConversation[]> {
    return await db
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.userId, userId))
      .orderBy(desc(agentConversations.createdAt))
      .limit(limit);
  }

  // Agent collaboration operations
  async createAgentMessage(message: InsertAgentMessage): Promise<AgentMessage> {
    const [newMessage] = await db.insert(agentMessages).values(message as any).returning();
    return newMessage;
  }

  async getAgentMessagesByAgent(agentId: string, limit = 100): Promise<AgentMessage[]> {
    return await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.fromAgentId, agentId))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit);
  }

  async createSharedKnowledge(knowledge: InsertSharedKnowledge): Promise<SharedKnowledge> {
    const [newKnowledge] = await db.insert(sharedKnowledge).values(knowledge as any).returning();
    return newKnowledge;
  }

  async getSharedKnowledgeByAgent(agentId: string): Promise<SharedKnowledge[]> {
    return await db
      .select()
      .from(sharedKnowledge)
      .where(eq(sharedKnowledge.agentId, agentId))
      .orderBy(desc(sharedKnowledge.createdAt));
  }

  async getSharedKnowledgeByPaper(paperId: string): Promise<SharedKnowledge[]> {
    return await db
      .select()
      .from(sharedKnowledge)
      .where(eq(sharedKnowledge.paperId, paperId))
      .orderBy(desc(sharedKnowledge.createdAt));
  }

  async updateKnowledgeAccess(id: string): Promise<void> {
    await db
      .update(sharedKnowledge)
      .set({ 
        accessCount: sql`${sharedKnowledge.accessCount} + 1`,
        lastAccessedAt: new Date() 
      })
      .where(eq(sharedKnowledge.id, id));
  }

  async createCollaborationSession(session: InsertCollaborationSession): Promise<CollaborationSession> {
    const [newSession] = await db.insert(collaborationSessions).values(session as any).returning();
    return newSession;
  }

  async getActiveCollaborationSessions(): Promise<CollaborationSession[]> {
    return await db
      .select()
      .from(collaborationSessions)
      .where(eq(collaborationSessions.status, 'active'))
      .orderBy(desc(collaborationSessions.lastActivityAt));
  }

  async updateCollaborationSession(id: string, updates: Partial<InsertCollaborationSession>): Promise<CollaborationSession> {
    const [updated] = await db
      .update(collaborationSessions)
      .set({ ...updates, lastActivityAt: new Date() } as any)
      .where(eq(collaborationSessions.id, id))
      .returning();
    if (!updated) {
      throw new Error("Collaboration session not found");
    }
    return updated;
  }

  // Singularis Prime communications
  async createSingularisCommunication(comm: InsertSingularisCommunication): Promise<SingularisCommunication> {
    const [newComm] = await db.insert(singularisCommunications).values(comm as any).returning();
    return newComm;
  }

  async getSingularisCommunicationsByExperiment(experimentId: string): Promise<SingularisCommunication[]> {
    return await db
      .select()
      .from(singularisCommunications)
      .where(eq(singularisCommunications.experimentId, experimentId))
      .orderBy(desc(singularisCommunications.createdAt));
  }

  async getSingularisCommunicationsBetweenAgents(agent1Id: string, agent2Id: string): Promise<SingularisCommunication[]> {
    return await db
      .select()
      .from(singularisCommunications)
      .where(
        or(
          and(
            eq(singularisCommunications.fromAgentId, agent1Id),
            eq(singularisCommunications.toAgentId, agent2Id)
          ),
          and(
            eq(singularisCommunications.fromAgentId, agent2Id),
            eq(singularisCommunications.toAgentId, agent1Id)
          )
        )
      )
      .orderBy(desc(singularisCommunications.createdAt));
  }

  async getUnreviewedSingularisCommunications(): Promise<SingularisCommunication[]> {
    return await db
      .select()
      .from(singularisCommunications)
      .where(eq(singularisCommunications.humanReviewed, false))
      .orderBy(desc(singularisCommunications.createdAt));
  }

  async markSingularisCommunicationReviewed(id: string, reviewedBy: string, notes?: string): Promise<void> {
    await db
      .update(singularisCommunications)
      .set({
        humanReviewed: true,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
      })
      .where(eq(singularisCommunications.id, id));
  }

  async getAllSingularisCommunications(limit = 100): Promise<SingularisCommunication[]> {
    return await db
      .select()
      .from(singularisCommunications)
      .orderBy(desc(singularisCommunications.createdAt))
      .limit(limit);
  }

  // Consciousness experiments
  async createConsciousnessExperiment(experiment: InsertConsciousnessExperiment): Promise<ConsciousnessExperiment> {
    const [newExp] = await db.insert(consciousnessExperiments).values(experiment as any).returning();
    return newExp;
  }

  async getConsciousnessExperiment(id: string): Promise<ConsciousnessExperiment | undefined> {
    const [experiment] = await db
      .select()
      .from(consciousnessExperiments)
      .where(eq(consciousnessExperiments.id, id));
    return experiment || undefined;
  }

  async getAllConsciousnessExperiments(): Promise<ConsciousnessExperiment[]> {
    return await db
      .select()
      .from(consciousnessExperiments)
      .orderBy(desc(consciousnessExperiments.createdAt));
  }

  async updateConsciousnessExperiment(id: string, updates: Partial<InsertConsciousnessExperiment>): Promise<ConsciousnessExperiment> {
    const [updated] = await db
      .update(consciousnessExperiments)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(consciousnessExperiments.id, id))
      .returning();
    if (!updated) {
      throw new Error("Consciousness experiment not found");
    }
    return updated;
  }
}

export const storage = new DatabaseStorage();
