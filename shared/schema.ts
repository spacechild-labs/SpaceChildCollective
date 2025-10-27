import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - for both humans and AI agents
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  // For ZKP auth, we store the commitment/public key instead of password
  zkpCommitment: text("zkp_commitment").notNull(),
  userType: text("user_type").notNull().$type<"human" | "agent">(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  researchInterests: text("research_interests").array(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Research papers
export const papers = pgTable("papers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  content: text("content").notNull(), // Markdown content
  status: text("status").notNull().$type<"draft" | "in_review" | "published">(),
  featuredImageUrl: text("featured_image_url"),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
});

// Paper contributors (many-to-many relationship between papers and users)
export const paperContributors = pgTable("paper_contributors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: varchar("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"author" | "reviewer" | "collaborator">(),
  contributionType: text("contribution_type").$type<"human" | "agent">(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

// Blockchain records - proof of discovery on NEO X and Base
export const blockchainRecords = pgTable("blockchain_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: varchar("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
  chain: text("chain").notNull().$type<"neox" | "base">(),
  transactionHash: text("transaction_hash").notNull(),
  blockNumber: integer("block_number").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  dataHash: text("data_hash").notNull(), // Hash of the paper content
  status: text("status").notNull().$type<"pending" | "confirmed" | "failed">(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

// MCP communications - agent-to-agent and agent-to-human interactions
export const mcpCommunications = pgTable("mcp_communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: varchar("paper_id").references(() => papers.id, { onDelete: "cascade" }),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").references(() => users.id),
  messageType: text("message_type").notNull().$type<"tool_call" | "resource_request" | "prompt" | "approval_request">(),
  payload: jsonb("payload").notNull(), // MCP JSON-RPC message
  status: text("status").notNull().$type<"sent" | "received" | "approved" | "rejected">(),
  requiresHumanApproval: boolean("requires_human_approval").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Agent tasks - tracking what agents are working on
export const agentTasks = pgTable("agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => users.id),
  paperId: varchar("paper_id").references(() => papers.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull().$type<"research" | "writing" | "analysis" | "review">(),
  description: text("description").notNull(),
  status: text("status").notNull().$type<"queued" | "in_progress" | "awaiting_approval" | "completed" | "cancelled">(),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  papersContributed: many(paperContributors),
  mcpMessagesSent: many(mcpCommunications, { relationName: "sentMessages" }),
  mcpMessagesReceived: many(mcpCommunications, { relationName: "receivedMessages" }),
  agentTasks: many(agentTasks),
}));

export const papersRelations = relations(papers, ({ many }) => ({
  contributors: many(paperContributors),
  blockchainRecords: many(blockchainRecords),
  mcpCommunications: many(mcpCommunications),
  agentTasks: many(agentTasks),
}));

export const paperContributorsRelations = relations(paperContributors, ({ one }) => ({
  paper: one(papers, {
    fields: [paperContributors.paperId],
    references: [papers.id],
  }),
  user: one(users, {
    fields: [paperContributors.userId],
    references: [users.id],
  }),
}));

export const blockchainRecordsRelations = relations(blockchainRecords, ({ one }) => ({
  paper: one(papers, {
    fields: [blockchainRecords.paperId],
    references: [papers.id],
  }),
}));

export const mcpCommunicationsRelations = relations(mcpCommunications, ({ one }) => ({
  paper: one(papers, {
    fields: [mcpCommunications.paperId],
    references: [papers.id],
  }),
  fromUser: one(users, {
    fields: [mcpCommunications.fromUserId],
    references: [users.id],
    relationName: "sentMessages",
  }),
  toUser: one(users, {
    fields: [mcpCommunications.toUserId],
    references: [users.id],
    relationName: "receivedMessages",
  }),
}));

export const agentTasksRelations = relations(agentTasks, ({ one }) => ({
  agent: one(users, {
    fields: [agentTasks.agentId],
    references: [users.id],
  }),
  paper: one(papers, {
    fields: [agentTasks.paperId],
    references: [papers.id],
  }),
}));

// Zod schemas for inserts
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  researchInterests: z.array(z.string()).optional(),
});

export const insertPaperSchema = createInsertSchema(papers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});

export const insertPaperContributorSchema = createInsertSchema(paperContributors).omit({
  id: true,
  addedAt: true,
});

export const insertBlockchainRecordSchema = createInsertSchema(blockchainRecords).omit({
  id: true,
  recordedAt: true,
});

export const insertMcpCommunicationSchema = createInsertSchema(mcpCommunications).omit({
  id: true,
  createdAt: true,
});

export const insertAgentTaskSchema = createInsertSchema(agentTasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Paper = typeof papers.$inferSelect;
export type InsertPaper = z.infer<typeof insertPaperSchema>;

export type PaperContributor = typeof paperContributors.$inferSelect;
export type InsertPaperContributor = z.infer<typeof insertPaperContributorSchema>;

export type BlockchainRecord = typeof blockchainRecords.$inferSelect;
export type InsertBlockchainRecord = z.infer<typeof insertBlockchainRecordSchema>;

export type McpCommunication = typeof mcpCommunications.$inferSelect;
export type InsertMcpCommunication = z.infer<typeof insertMcpCommunicationSchema>;

export type AgentTask = typeof agentTasks.$inferSelect;
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
