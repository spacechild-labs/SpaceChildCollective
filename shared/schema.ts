import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, index } from "drizzle-orm/pg-core";
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
  role: text("role").notNull().$type<"user" | "admin">().default("user"),
  // Ledger: may release held records (humans only; agents are refused regardless).
  canRelease: boolean("can_release").notNull().default(false),
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

// Session store table (managed at runtime by connect-pg-simple). Declared here
// so `drizzle-kit push` recognizes it and does not try to drop it.
export const userSessions = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => ({
  expireIdx: index("IDX_session_expire").on(t.expire),
}));

// Global AI provider credentials. API keys are stored exclusively as AES-GCM
// ciphertext; plaintext keys must never be written to this table.
export const aiProviderConfigs = pgTable("ai_provider_configs", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  baseUrl: text("base_url"),
  models: text("models").array().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  rateLimit: jsonb("rate_limit").$type<{ requestsPerMinute: number; tokensPerMinute: number }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsed: timestamp("last_used").defaultNow().notNull(),
  usageCount: integer("usage_count").notNull().default(0),
}, (t) => ({
  activeIdx: index("ai_provider_configs_active_idx").on(t.isActive),
}));

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
}, (t) => ({
  statusIdx: index("papers_status_idx").on(t.status),
  categoryIdx: index("papers_category_idx").on(t.category),
}));

// Paper contributors (many-to-many relationship between papers and users)
export const paperContributors = pgTable("paper_contributors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: varchar("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"author" | "reviewer" | "collaborator">(),
  contributionType: text("contribution_type").$type<"human" | "agent">(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (t) => ({
  paperIdx: index("paper_contributors_paper_id_idx").on(t.paperId),
  userIdx: index("paper_contributors_user_id_idx").on(t.userId),
}));

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
}, (t) => ({
  toUserIdx: index("mcp_comm_to_user_id_idx").on(t.toUserId),
  statusIdx: index("mcp_comm_status_idx").on(t.status),
}));

// Agent tasks - tracking what agents are working on
export const agentTasks = pgTable("agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => users.id),
  paperId: varchar("paper_id").references(() => papers.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull().$type<
    | "research" | "writing" | "analysis" | "review"
    | "literature_review" | "citation_analysis" | "topic_research"
    | "methodology_review" | "gap_analysis" | "content_generation"
    | "academic_writing" | "editing" | "abstract_writing"
    | "methodology_writing" | "citation_check" | "peer_review"
    | "quality_assessment" | "plagiarism_check"
  >(),
  description: text("description").notNull(),
  status: text("status").notNull().$type<"queued" | "in_progress" | "awaiting_approval" | "completed" | "cancelled" | "failed">(),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  agentIdx: index("agent_tasks_agent_id_idx").on(t.agentId),
  statusIdx: index("agent_tasks_status_idx").on(t.status),
  paperIdx: index("agent_tasks_paper_id_idx").on(t.paperId),
}));

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

// ============================================================================
// DISCOVERY LOOP — study generation → findings → vetting → routing → delivery
// → feedback → next study. See server/services/loop/.
// ============================================================================

export type StudyDesignStatus = "draft" | "preregistered" | "running" | "concluded" | "archived";
export type StudyGenerator = "heuristic" | "llm" | "hybrid";

// Persisted study designs (first-class, not a blob inside experiment observations).
export const studyDesigns = pgTable("study_designs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(),
  title: text("title").notNull(),
  paradigm: text("paradigm").notNull(),
  constructs: text("constructs").array(),
  design: jsonb("design").notNull(), // Full StudyDesign document
  generator: text("generator").notNull().$type<StudyGenerator>(),
  status: text("status").notNull().$type<StudyDesignStatus>().default("draft"),
  // Preregistration: canonical hash of the design at the moment it was frozen,
  // optionally anchored on-chain ({ chain, transactionHash, blockNumber }).
  preregistrationHash: text("preregistration_hash"),
  preregisteredAt: timestamp("preregistered_at"),
  anchor: jsonb("anchor"),
  experimentId: varchar("experiment_id").references(() => consciousnessExperiments.id, { onDelete: "set null" }),
  // Lineage: the design (if any) whose findings/feedback spawned this one.
  parentDesignId: varchar("parent_design_id"),
  sourceFindingIds: text("source_finding_ids").array(),
  generation: integer("generation").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("study_designs_status_idx").on(t.status),
  parentIdx: index("study_designs_parent_idx").on(t.parentDesignId),
  ownerIdx: index("study_designs_owner_idx").on(t.ownerId),
}));

export type FindingStatus = "candidate" | "vetting" | "vetted" | "rejected" | "routed" | "delivered" | "archived";
export type FindingSource = "experiment" | "paper" | "manual" | "agent";

// Findings: the atomic, shareable unit of discovery. One claim + its evidence.
export const findings = pgTable("findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  claim: text("claim").notNull(), // One falsifiable sentence
  summary: text("summary"),
  evidence: jsonb("evidence").notNull(), // Structured evidence (n, p, effect, raw trial refs, ...)
  category: text("category").notNull(),
  tags: text("tags").array(),
  confidence: integer("confidence").notNull(), // 0-100
  novelty: integer("novelty"), // 0-100, filled by vetting
  simulated: boolean("simulated").notNull().default(false), // Evidence from a simulation, not live agents
  contentHash: text("content_hash").notNull(), // sha256 of canonical {title, claim, evidence}
  status: text("status").notNull().$type<FindingStatus>().default("candidate"),
  source: text("source").notNull().$type<FindingSource>(),
  vettingSummary: jsonb("vetting_summary"),
  paperId: varchar("paper_id").references(() => papers.id, { onDelete: "set null" }),
  experimentId: varchar("experiment_id").references(() => consciousnessExperiments.id, { onDelete: "set null" }),
  studyDesignId: varchar("study_design_id").references(() => studyDesigns.id, { onDelete: "set null" }),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("findings_status_idx").on(t.status),
  categoryIdx: index("findings_category_idx").on(t.category),
  hashIdx: index("findings_content_hash_idx").on(t.contentHash),
  designIdx: index("findings_study_design_idx").on(t.studyDesignId),
}));

export type VettingReviewerType = "automated" | "agent" | "human";
export type VettingVerdict = "pass" | "fail" | "flag";

// One row per vetting check or review applied to a finding.
export const vettingReviews = pgTable("vetting_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  findingId: varchar("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
  reviewerType: text("reviewer_type").notNull().$type<VettingReviewerType>(),
  reviewerId: varchar("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  check: text("check").notNull(), // schema | stats_integrity | reproducibility | novelty | simulation_disclosure | safety | peer_review | human_approval
  verdict: text("verdict").notNull().$type<VettingVerdict>(),
  score: integer("score"), // 0-100 where meaningful
  notes: text("notes"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  findingIdx: index("vetting_reviews_finding_idx").on(t.findingId),
}));

export type ChannelKind = "webhook" | "kannaka" | "nats" | "mcp_subscriber" | "feed" | "blockchain" | "rf";

export interface ChannelFilters {
  categories?: string[];
  tags?: string[];
  minConfidence?: number;
  minNovelty?: number;
  sources?: FindingSource[];
}

// Registered destinations that vetted findings are routed to.
export const distributionChannels = pgTable("distribution_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull().$type<ChannelKind>(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(), // Adapter config; secret fields are encrypted at rest
  filters: jsonb("filters").$type<ChannelFilters>(),
  acceptsSimulated: boolean("accepts_simulated").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastDeliveryAt: timestamp("last_delivery_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  ownerIdx: index("distribution_channels_owner_idx").on(t.ownerId),
  kindIdx: index("distribution_channels_kind_idx").on(t.kind),
}));

export type DeliveryStatus = "queued" | "sent" | "acknowledged" | "failed" | "skipped";

// Delivery ledger: one row per (finding, channel), retried with backoff.
export const deliveries = pgTable("deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  findingId: varchar("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
  channelId: varchar("channel_id").notNull().references(() => distributionChannels.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<DeliveryStatus>().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at"),
  lastError: text("last_error"),
  receipt: jsonb("receipt"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  queuedAt: timestamp("queued_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  ackedAt: timestamp("acked_at"),
}, (t) => ({
  statusIdx: index("deliveries_status_idx").on(t.status),
  findingIdx: index("deliveries_finding_idx").on(t.findingId),
  channelIdx: index("deliveries_channel_idx").on(t.channelId),
}));

export type FeedbackKind = "acknowledgement" | "citation" | "replication_request" | "resonance" | "dispute" | "question" | "new_prompt";

// The loop closer: anything that comes back about a delivered finding.
export const feedbackEvents = pgTable("feedback_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  findingId: varchar("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
  deliveryId: varchar("delivery_id").references(() => deliveries.id, { onDelete: "set null" }),
  channelId: varchar("channel_id").references(() => distributionChannels.id, { onDelete: "set null" }),
  kind: text("kind").notNull().$type<FeedbackKind>(),
  payload: jsonb("payload"),
  actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
  externalActor: text("external_actor"),
  spawnedDesignId: varchar("spawned_design_id").references(() => studyDesigns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  findingIdx: index("feedback_events_finding_idx").on(t.findingId),
  kindIdx: index("feedback_events_kind_idx").on(t.kind),
}));

export const insertStudyDesignSchema = createInsertSchema(studyDesigns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFindingSchema = createInsertSchema(findings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVettingReviewSchema = createInsertSchema(vettingReviews).omit({ id: true, createdAt: true });
export const insertDistributionChannelSchema = createInsertSchema(distributionChannels).omit({ id: true, createdAt: true, lastDeliveryAt: true });
export const insertDeliverySchema = createInsertSchema(deliveries).omit({ id: true, queuedAt: true, sentAt: true, ackedAt: true });
export const insertFeedbackEventSchema = createInsertSchema(feedbackEvents).omit({ id: true, createdAt: true });

export type StudyDesignRecord = typeof studyDesigns.$inferSelect;
export type InsertStudyDesignRecord = z.infer<typeof insertStudyDesignSchema>;
export type Finding = typeof findings.$inferSelect;
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type VettingReview = typeof vettingReviews.$inferSelect;
export type InsertVettingReview = z.infer<typeof insertVettingReviewSchema>;
export type DistributionChannel = typeof distributionChannels.$inferSelect;
export type InsertDistributionChannel = z.infer<typeof insertDistributionChannelSchema>;
export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type FeedbackEvent = typeof feedbackEvents.$inferSelect;
export type InsertFeedbackEvent = z.infer<typeof insertFeedbackEventSchema>;
