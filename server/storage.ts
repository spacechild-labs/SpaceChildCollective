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
  users,
  papers,
  paperContributors,
  blockchainRecords,
  mcpCommunications,
  agentTasks,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Paper operations
  getPaper(id: string): Promise<Paper | undefined>;
  getPaperWithContributors(id: string): Promise<Paper & { contributors: (PaperContributor & { user: User })[] } | undefined>;
  getAllPapers(): Promise<Paper[]>;
  getPapersByUserId(userId: string): Promise<Paper[]>;
  createPaper(paper: InsertPaper): Promise<Paper>;
  updatePaper(id: string, paper: Partial<InsertPaper>): Promise<Paper>;
  
  // Paper contributor operations
  addContributor(contributor: InsertPaperContributor): Promise<PaperContributor>;
  getContributorsByPaperId(paperId: string): Promise<(PaperContributor & { user: User })[]>;
  
  // Blockchain operations
  createBlockchainRecord(record: InsertBlockchainRecord): Promise<BlockchainRecord>;
  getBlockchainRecordsByPaperId(paperId: string): Promise<BlockchainRecord[]>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
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
    
    return contributorPapers.map(cp => cp.paper);
  }

  async createPaper(paper: InsertPaper): Promise<Paper> {
    const [newPaper] = await db.insert(papers).values(paper).returning();
    return newPaper;
  }

  async updatePaper(id: string, paperUpdate: Partial<InsertPaper>): Promise<Paper> {
    const [updated] = await db
      .update(papers)
      .set({ ...paperUpdate, updatedAt: new Date() })
      .where(eq(papers.id, id))
      .returning();
    return updated;
  }

  // Paper contributor operations
  async addContributor(contributor: InsertPaperContributor): Promise<PaperContributor> {
    const [newContributor] = await db.insert(paperContributors).values(contributor).returning();
    return newContributor;
  }

  async getContributorsByPaperId(paperId: string): Promise<(PaperContributor & { user: User })[]> {
    const contribs = await db
      .select()
      .from(paperContributors)
      .innerJoin(users, eq(paperContributors.userId, users.id))
      .where(eq(paperContributors.paperId, paperId));
    
    return contribs.map(c => ({ ...c.paper_contributors, user: c.users }));
  }

  // Blockchain operations
  async createBlockchainRecord(record: InsertBlockchainRecord): Promise<BlockchainRecord> {
    const [newRecord] = await db.insert(blockchainRecords).values(record).returning();
    return newRecord;
  }

  async getBlockchainRecordsByPaperId(paperId: string): Promise<BlockchainRecord[]> {
    return await db.select().from(blockchainRecords).where(eq(blockchainRecords.paperId, paperId));
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
    const [newComm] = await db.insert(mcpCommunications).values(comm).returning();
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
    const [newTask] = await db.insert(agentTasks).values(task).returning();
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
      .set(updates)
      .where(eq(agentTasks.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
