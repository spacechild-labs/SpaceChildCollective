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
  // Agent-specific fields
  specialization: text("specialization").$type<"research" | "writing" | "review">(),
  capabilities: text("capabilities").array(), // Array of agent capabilities
  // Agent authentication via MCP
  mcpToken: text("mcp_token"), // HMAC-signed token for MCP WebSocket auth
  mcpTokenExpiry: timestamp("mcp_token_expiry"), // Token expiration
  mcpConnectionStatus: text("mcp_connection_status").$type<"online" | "offline" | "connecting">().default("offline"),
  lastConnectedAt: timestamp("last_connected_at"),
  lastActiveAt: timestamp("last_active_at"),
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

// Agent conversations - storing chat history between agents and humans
export const agentConversations = pgTable("agent_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: varchar("paper_id").references(() => papers.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => users.id),
  userId: varchar("user_id").references(() => users.id),
  role: text("role").notNull().$type<"agent" | "user" | "system">(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // For storing additional context, task references, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Agent messages - agent-to-agent communication for collaboration
export const agentMessages = pgTable("agent_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAgentId: varchar("from_agent_id").notNull().references(() => users.id),
  toAgentId: varchar("to_agent_id").references(() => users.id), // null for broadcast
  messageType: text("message_type").notNull().$type<"collaboration_request" | "knowledge_share" | "task_handoff" | "review_request" | "insight_proposal">(),
  content: jsonb("content").notNull(),
  priority: text("priority").notNull().$type<"low" | "medium" | "high" | "urgent">(),
  requiresResponse: boolean("requires_response").default(false),
  responseToId: varchar("response_to_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shared knowledge - agent knowledge sharing and discovery
export const sharedKnowledge = pgTable("shared_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => users.id),
  taskId: varchar("task_id").references(() => agentTasks.id),
  paperId: varchar("paper_id").references(() => papers.id, { onDelete: "cascade" }),
  knowledgeType: text("knowledge_type").notNull().$type<"research_finding" | "citation" | "methodology" | "insight" | "resource">(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  relevance: integer("relevance").notNull(), // 0-100
  tags: text("tags").array(),
  verified: boolean("verified").default(false),
  accessCount: integer("access_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow().notNull(),
});

// Collaboration sessions - tracking multi-agent collaborative work
export const collaborationSessions = pgTable("collaboration_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  leadAgentId: varchar("lead_agent_id").notNull().references(() => users.id),
  participantAgentIds: text("participant_agent_ids").array(), // Array of agent IDs
  taskIds: text("task_ids").array(), // Array of task IDs
  sharedKnowledgeIds: text("shared_knowledge_ids").array(), // Array of knowledge IDs
  messageIds: text("message_ids").array(), // Array of message IDs
  status: text("status").notNull().$type<"active" | "paused" | "completed">(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});

// Singularis Prime communications - auditable agent-to-agent consciousness protocol messages
export const singularisCommunications = pgTable("singularis_communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAgentId: varchar("from_agent_id").notNull().references(() => users.id),
  toAgentId: varchar("to_agent_id").references(() => users.id), // null for broadcast
  experimentId: varchar("experiment_id"),
  sessionId: varchar("session_id"),
  blocks: jsonb("blocks").notNull(), // Structured Singularis blocks (RESONANCE, AWAIT, TRACE, EXPERIMENT, etc.)
  rawText: text("raw_text").notNull(), // Human-readable formatted text
  humanReviewed: boolean("human_reviewed").default(false),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Consciousness experiments - tracking H0/H1 hypothesis testing
export const consciousnessExperiments = pgTable("consciousness_experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  h0: text("h0").notNull(), // Null hypothesis
  h1: text("h1").notNull(), // Alternative hypothesis
  controls: text("controls").array(), // Control conditions
  leadAgentId: varchar("lead_agent_id").notNull().references(() => users.id),
  participantAgentIds: text("participant_agent_ids").array(),
  status: text("status").notNull().$type<"designing" | "running" | "analyzing" | "concluded" | "published">(),
  preregistered: boolean("preregistered").default(false),
  startedAt: timestamp("started_at"),
  concludedAt: timestamp("concluded_at"),
  observations: jsonb("observations"), // Array of experiment observations
  results: jsonb("results"), // Statistical results and analysis
  conclusion: text("conclusion"), // Final conclusion
  paperId: varchar("paper_id").references(() => papers.id), // Link to published paper
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const agentConversationsRelations = relations(agentConversations, ({ one }) => ({
  agent: one(users, {
    fields: [agentConversations.agentId],
    references: [users.id],
    relationName: "agentConversations",
  }),
  user: one(users, {
    fields: [agentConversations.userId],
    references: [users.id],
    relationName: "userConversations",
  }),
  paper: one(papers, {
    fields: [agentConversations.paperId],
    references: [papers.id],
  }),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  fromAgent: one(users, {
    fields: [agentMessages.fromAgentId],
    references: [users.id],
    relationName: "messagesSent",
  }),
  toAgent: one(users, {
    fields: [agentMessages.toAgentId],
    references: [users.id],
    relationName: "messagesReceived",
  }),
}));

export const sharedKnowledgeRelations = relations(sharedKnowledge, ({ one }) => ({
  agent: one(users, {
    fields: [sharedKnowledge.agentId],
    references: [users.id],
  }),
  task: one(agentTasks, {
    fields: [sharedKnowledge.taskId],
    references: [agentTasks.id],
  }),
  paper: one(papers, {
    fields: [sharedKnowledge.paperId],
    references: [papers.id],
  }),
}));

export const collaborationSessionsRelations = relations(collaborationSessions, ({ one }) => ({
  leadAgent: one(users, {
    fields: [collaborationSessions.leadAgentId],
    references: [users.id],
  }),
}));

export const singularisCommunicationsRelations = relations(singularisCommunications, ({ one }) => ({
  fromAgent: one(users, {
    fields: [singularisCommunications.fromAgentId],
    references: [users.id],
    relationName: "singularisSent",
  }),
  toAgent: one(users, {
    fields: [singularisCommunications.toAgentId],
    references: [users.id],
    relationName: "singularisReceived",
  }),
  reviewer: one(users, {
    fields: [singularisCommunications.reviewedBy],
    references: [users.id],
    relationName: "singularisReviewed",
  }),
}));

export const consciousnessExperimentsRelations = relations(consciousnessExperiments, ({ one }) => ({
  leadAgent: one(users, {
    fields: [consciousnessExperiments.leadAgentId],
    references: [users.id],
  }),
  paper: one(papers, {
    fields: [consciousnessExperiments.paperId],
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
}).extend({
  publishedAt: z.string().datetime().optional().nullable(),
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

export const insertAgentConversationSchema = createInsertSchema(agentConversations).omit({
  id: true,
  createdAt: true,
});

export const insertAgentMessageSchema = createInsertSchema(agentMessages).omit({
  id: true,
  createdAt: true,
});

export const insertSharedKnowledgeSchema = createInsertSchema(sharedKnowledge).omit({
  id: true,
  createdAt: true,
  lastAccessedAt: true,
});

export const insertCollaborationSessionSchema = createInsertSchema(collaborationSessions).omit({
  id: true,
  createdAt: true,
  lastActivityAt: true,
});

export const insertSingularisCommunicationSchema = createInsertSchema(singularisCommunications).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

export const insertConsciousnessExperimentSchema = createInsertSchema(consciousnessExperiments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export type AgentConversation = typeof agentConversations.$inferSelect;
export type InsertAgentConversation = z.infer<typeof insertAgentConversationSchema>;

export type AgentMessage = typeof agentMessages.$inferSelect;
export type InsertAgentMessage = z.infer<typeof insertAgentMessageSchema>;

export type SharedKnowledge = typeof sharedKnowledge.$inferSelect;
export type InsertSharedKnowledge = z.infer<typeof insertSharedKnowledgeSchema>;

export type CollaborationSession = typeof collaborationSessions.$inferSelect;
export type InsertCollaborationSession = z.infer<typeof insertCollaborationSessionSchema>;

export type SingularisCommunication = typeof singularisCommunications.$inferSelect;
export type InsertSingularisCommunication = z.infer<typeof insertSingularisCommunicationSchema>;

export type ConsciousnessExperiment = typeof consciousnessExperiments.$inferSelect;
export type InsertConsciousnessExperiment = z.infer<typeof insertConsciousnessExperimentSchema>;
