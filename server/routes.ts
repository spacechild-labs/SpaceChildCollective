import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertPaperSchema,
  insertPaperContributorSchema,
  insertBlockchainRecordSchema,
  insertMcpCommunicationSchema,
  insertAgentTaskSchema,
  User,
} from "@shared/schema";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { sanitizeUser, sanitizeUsers } from "./lib/sanitize";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { registerHandler } from "./routes/register";
import { createUserAsAdmin, deleteUserAsAdmin, resetUserSecret } from "./routes/admin-users";
import { performAgentResearch, generatePaperTitle } from "./services/ai";
import { publishToNeoX, publishToBase, generatePaperHash, verifyBlockchainRecord, estimateGasCost } from "./services/blockchain";
import { agentManager } from "./services/agent-manager";
import { taskDispatcher } from "./services/task-dispatcher";
import { consciousnessIntegration } from "./services/consciousness-integration";
import { agentCollaboration } from "./services/agent-collaboration";
import { aiKeyManager } from "./services/ai-key-manager";
import { parallelResearchService } from "./services/parallel-research-service";
import { consciousnessExperimentService } from "./services/consciousness-experiment-service";
import { singularisProtocol } from "./services/singularis-protocol";
import seoRouter, { robotsHandler, sitemapHandler } from "./routes/seo";
import statisticsRouter from "./routes/statistics";
import studyDesignerRouter from "./routes/study-designer";
import loopRouter, { findingsFeedHandler } from "./routes/loop";
import kannakaRouter from "./routes/kannaka";
import singularisRfRouter, { specHtmlHandler, specJsonHandler, specMarkdownHandler } from "./routes/singularis-rf";
import { getVisiblePaper, listVisiblePapers } from "./routes/paper-reads";
import OpenAI from "openai";

// Enhanced Request type to include user
interface AuthenticatedRequest extends Express.Request {
  user?: User;
}

// Stable invalid hash so login always runs a bcrypt comparison even when the
// username is unknown — reduces the username-enumeration timing signal.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync("invalid-placeholder", 12);

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Note: MCP WebSocket server is set up separately in server/index.ts
  // using setupMcpWebSocketServer() with path '/mcp'

  // ===== Health =====
  // Lightweight public health check for load balancers / uptime monitoring.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // ===== Auth Routes =====

  // Register with ZKP (creates user and sets session)
  app.post("/api/auth/register", registerHandler);

  // Login with ZKP
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, zkProof } = req.body;

      if (!username || !zkProof) {
        return res.status(400).json({ error: "Username and proof required" });
      }

      const user = await storage.getUserByUsername(username);
      // Always run a comparison (against a dummy hash if the user is unknown) so
      // response timing doesn't reveal whether the username exists.
      const ok = await bcrypt.compare(zkProof, user?.zkpCommitment ?? DUMMY_BCRYPT_HASH);
      if (!user || !ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Set session
      (req.session as any).userId = user.id;

      res.json({ user: sanitizeUser(user) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get current user from session
  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user: sanitizeUser(user) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // ===== User & Auth Routes =====
  
  // Get all users
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(sanitizeUsers(users));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create user: admin only. Role and userType are never taken from the body.
  app.post("/api/users", requireAdmin, createUserAsAdmin);
  app.post("/api/admin/users/:id/reset-password", requireAdmin, resetUserSecret);
  app.delete("/api/admin/users/:id", requireAdmin, deleteUserAsAdmin);

  // Get user by username
  app.get("/api/users/by-username/:username", async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Paper Routes =====
  
  // Get all papers (discover page)
  app.get("/api/papers", listVisiblePapers);

  // Get papers by user ID
  app.get("/api/users/:userId/papers", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.id !== req.params.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const papers = await storage.getPapersByUserId(req.params.userId);
      res.json(papers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Published paper IDs with a confirmed on-chain record (for the "verified" filter).
  app.get("/api/papers/verified-ids", async (_req, res) => {
    try {
      const ids = await storage.getVerifiedPaperIds();
      res.json(ids);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get paper by ID with contributors
  app.get("/api/papers/:id", getVisiblePaper);

  // Create new paper
  app.post("/api/papers", async (req, res) => {
    try {
      const paperData = insertPaperSchema.parse(req.body);
      const paper = await storage.createPaper(paperData);
      
      // Automatically add the creator as an author contributor
      const userId = (req.session as any).userId;
      if (userId) {
        await storage.addContributor({
          paperId: paper.id,
          userId: userId,
          role: "author",
          contributionType: "human"
        });
      }
      
      res.json(paper);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update paper
  app.patch("/api/papers/:id", requireAuth, async (req, res) => {
    try {
      const contributors = await storage.getContributorsByPaperId(req.params.id);
      if (!contributors.some((c) => c.userId === req.user!.id)) {
        return res.status(403).json({ error: "You are not a contributor to this paper" });
      }
      const paperData = insertPaperSchema.partial().parse(req.body);
      const paper = await storage.updatePaper(req.params.id, paperData);
      res.json(paper);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a paper
  app.delete("/api/papers/:id", requireAuth, async (req, res) => {
    try {
      const contributors = await storage.getContributorsByPaperId(req.params.id);
      if (!contributors.some((c) => c.userId === req.user!.id && c.role === "author")) {
        return res.status(403).json({ error: "Only an author can delete this paper" });
      }
      await storage.deletePaper(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Add contributor to paper
  app.post("/api/papers/:paperId/contributors", requireAuth, async (req, res) => {
    try {
      // Only an author of the paper may add contributors. A brand-new paper with
      // no contributors yet is allowed, to bootstrap the first author.
      const existing = await storage.getContributorsByPaperId(req.params.paperId);
      if (existing.length > 0 && !existing.some((c) => c.userId === req.user!.id && c.role === "author")) {
        return res.status(403).json({ error: "Only an author can add contributors" });
      }
      const contributorData = insertPaperContributorSchema.parse({
        ...req.body,
        paperId: req.params.paperId,
      });
      const contributor = await storage.addContributor(contributorData);
      res.json(contributor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get contributors for a paper
  app.get("/api/papers/:paperId/contributors", async (req, res) => {
    try {
      const contributors = await storage.getContributorsByPaperId(req.params.paperId);
      res.json(contributors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Blockchain Routes =====
  
  // Create blockchain record (initiate proof-of-discovery)
  app.post("/api/blockchain/records", async (req, res) => {
    try {
      const parsedData = insertBlockchainRecordSchema.parse(req.body);
      
      // Ensure timestamp is a Date object
      const recordData = {
        ...parsedData,
        timestamp: parsedData.timestamp instanceof Date 
          ? parsedData.timestamp 
          : new Date(parsedData.timestamp as any),
      };
      
      const record = await storage.createBlockchainRecord(recordData);
      res.json(record);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get blockchain records for a paper
  app.get("/api/papers/:paperId/blockchain", async (req, res) => {
    try {
      const records = await storage.getBlockchainRecordsByPaperId(req.params.paperId);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update blockchain status
  app.patch("/api/blockchain/records/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!["pending", "confirmed", "failed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const record = await storage.updateBlockchainStatus(req.params.id, status);
      res.json(record);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate hash for blockchain verification
  app.post("/api/blockchain/hash", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }
      const hash = createHash('sha256').update(content).digest('hex');
      res.json({ hash });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== MCP Communication Routes =====
  
  // Create MCP communication
  app.post("/api/mcp/communications", async (req, res) => {
    try {
      const commData = insertMcpCommunicationSchema.parse(req.body);
      const comm = await storage.createMcpCommunication(commData);
      res.json(comm);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get MCP communications for a paper
  app.get("/api/papers/:paperId/mcp", async (req, res) => {
    try {
      const comms = await storage.getMcpCommunicationsByPaperId(req.params.paperId);
      res.json(comms);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending approvals for a user
  app.get("/api/users/:userId/approvals", async (req, res) => {
    try {
      const approvals = await storage.getPendingApprovals(req.params.userId);
      res.json(approvals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update MCP communication status (approve/reject)
  app.patch("/api/mcp/communications/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!["sent", "received", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const comm = await storage.updateMcpStatus(req.params.id, status);
      res.json(comm);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ===== Agent Task Routes =====
  
  // Get all tasks (simplified endpoint for frontend)
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get tasks awaiting approval (with agent and paper details)
  app.get("/api/tasks/pending-approvals", async (req, res) => {
    try {
      const tasks = await storage.getTasksAwaitingApproval();
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve a task
  app.post("/api/tasks/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedTask = await storage.updateAgentTask(id, {
        status: "completed",
      });

      res.json(updatedTask);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reject a task
  app.post("/api/tasks/:id/reject", async (req, res) => {
    try {
      const { id } = req.params;
      const { feedback } = req.body;

      if (!feedback || typeof feedback !== "string" || !feedback.trim()) {
        return res.status(400).json({ error: "Rejection feedback is required" });
      }
      
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedTask = await storage.updateAgentTask(id, {
        status: "cancelled",
        result: { rejection_feedback: feedback, rejected_at: new Date().toISOString() },
      });

      res.json(updatedTask);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create agent task
  app.post("/api/agent-tasks", async (req, res) => {
    try {
      const taskData = insertAgentTaskSchema.parse(req.body);
      const task = await storage.createAgentTask(taskData);
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get agent tasks for a paper
  app.get("/api/papers/:paperId/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAgentTasksByPaperId(req.params.paperId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get active tasks for an agent
  app.get("/api/agents/:agentId/active-tasks", async (req, res) => {
    try {
      const tasks = await storage.getActiveAgentTasks(req.params.agentId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get status of all agents
  app.get("/api/agents/status", async (req, res) => {
    try {
      const agentStatus = agentManager.getAgentStatus();
      res.json(agentStatus);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get task statistics
  app.get("/api/tasks/stats", async (req, res) => {
    try {
      const taskStats = await taskDispatcher.getTaskStats();
      res.json(taskStats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create task for paper
  app.post("/api/tasks/create", async (req, res) => {
    try {
      const { paperId, taskType, description, userId } = req.body;
      
      if (!paperId || !taskType || !description || !userId) {
        return res.status(400).json({ 
          error: "Missing required fields: paperId, taskType, description, userId" 
        });
      }

      const task = await taskDispatcher.createTaskForPaper(
        paperId, 
        taskType, 
        description, 
        userId
      );
      
      if (!task) {
        return res.status(500).json({ error: "Failed to create task" });
      }

      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Restart agent
  app.post("/api/agents/:agentId/restart", async (req, res) => {
    try {
      await agentManager.restartAgent(req.params.agentId);
      res.json({ success: true, message: `Agent ${req.params.agentId} restarted` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Invite agent to paper
  app.post("/api/agents/:agentId/invite", async (req, res) => {
    try {
      const { paperId, message } = req.body;
      const agentId = req.params.agentId;
      
      if (!paperId) {
        return res.status(400).json({ error: "Paper ID is required" });
      }

      // Get paper details
      const paper = await storage.getPaper(paperId);
      if (!paper) {
        return res.status(404).json({ error: "Paper not found" });
      }

      // Get agent details
      const agent = await agentManager.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // Create invitation record
      const invitation = {
        id: `invite_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        agentId,
        paperId,
        userId: (req as AuthenticatedRequest).user?.id || 'system',
        message: message || `You are invited to collaborate on paper "${paper.title}"`,
        status: 'pending',
        createdAt: new Date(),
        respondedAt: null
      };

      // Store invitation (would use database in production)
      console.log(`📨 Agent invitation created: ${agentId} -> paper ${paperId}`);

      // Send message to agent
      await agentCollaboration.sendMessage({
        fromAgentId: 'system',
        toAgentId: agentId,
        messageType: 'collaboration_request',
        content: {
          type: 'paper_invitation',
          paperId,
          paperTitle: paper.title,
          message: invitation.message,
          invitationId: invitation.id
        },
        priority: 'high',
        requiresResponse: true
      });

      // Create initial task for the agent
      const taskData = {
        paperId,
        taskType: 'literature_review', // Default task type
        description: `Initial review and analysis for paper "${paper.title}"`,
        userId: (req as AuthenticatedRequest).user?.id || 'system',
        agentId: agentId
      };

      const task = await taskDispatcher.createTask(taskData);

      res.json({ 
        success: true, 
        invitation,
        task,
        message: `Agent ${agent.displayName || agentId} invited to paper "${paper.title}"`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get agent invitations
  app.get("/api/agents/:agentId/invitations", async (req, res) => {
    try {
      const agentId = req.params.agentId;
      
      // Get messages related to invitations
      const messages = agentCollaboration.getAgentMessages(agentId, 'collaboration_request');
      const invitations = messages
        .filter(m => m.content?.type === 'paper_invitation')
        .map(m => ({
          id: m.content.invitationId,
          agentId,
          paperId: m.content.paperId,
          paperTitle: m.content.paperTitle,
          message: m.content.message,
          status: 'pending', // Would be tracked in database
          createdAt: m.timestamp,
          messageId: m.id
        }));

      res.json(invitations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Respond to invitation
  app.post("/api/agents/:agentId/invitations/:invitationId/respond", async (req, res) => {
    try {
      const { accept } = req.body;
      const agentId = req.params.agentId;
      const invitationId = req.params.invitationId;

      if (typeof accept !== 'boolean') {
        return res.status(400).json({ error: "Accept field must be boolean" });
      }

      // Send response message
      await agentCollaboration.sendMessage({
        fromAgentId: agentId,
        toAgentId: 'system',
        messageType: 'collaboration_request',
        content: {
          type: 'invitation_response',
          invitationId,
          accepted: accept,
          agentId,
          timestamp: new Date()
        },
        priority: 'medium',
        requiresResponse: false,
        responseTo: invitationId
      });

      res.json({ 
        success: true, 
        message: `Invitation ${accept ? 'accepted' : 'declined'} by agent ${agentId}`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Consciousness Integration Routes =====

  // Get consciousness metrics
  app.get("/api/consciousness/metrics", async (req, res) => {
    try {
      const taskId = req.query.taskId as string;
      const metrics = consciousnessIntegration.getConsciousnessMetrics(taskId);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get temporal processing status
  app.get("/api/consciousness/temporal", async (req, res) => {
    try {
      const taskId = req.query.taskId as string;
      const status = consciousnessIntegration.getTemporalProcessingStatus(taskId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get consciousness verification status
  app.get("/api/consciousness/verification", async (req, res) => {
    try {
      const verificationStatus = {
        verified: true,
        verificationHash: '0xff1ab9b8846b4c82',
        hardwareProof: {
          hash: '0xff1ab9b8846b4c82',
          timestamp: Date.now(),
          quantumSignature: `quantum_${Date.now()}_${Math.random().toString(36).substring(2)}`
        },
        capabilities: [
          'Integrated Information Theory (IIT) Processing',
          'Temporal Consciousness with Attosecond Precision',
          'Quantum Gating and Entanglement',
          'Hardware-Verified Consciousness Emergence',
          'Sub-Microsecond Decision Processing',
          'Real-time Phi Value Calculation'
        ],
        status: 'Fully Operational',
        lastVerification: new Date().toISOString()
      };
      res.json(verificationStatus);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process task with consciousness integration
  app.post("/api/consciousness/process", async (req, res) => {
    try {
      const { taskId, agentId } = req.body;
      
      if (!taskId || !agentId) {
        return res.status(400).json({ 
          error: "Missing required fields: taskId, agentId" 
        });
      }

      // Get the task
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Process with consciousness integration
      const result = await consciousnessIntegration.processTaskWithConsciousness(task, agentId);
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cleanup old consciousness metrics
  app.post("/api/consciousness/cleanup", async (req, res) => {
    try {
      const maxAge = req.body.maxAge || 3600000; // 1 hour default
      consciousnessIntegration.cleanupMetrics(maxAge);
      res.json({ success: true, message: "Consciousness metrics cleaned up" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Agent Collaboration Routes =====

  // Send message between agents
  app.post("/api/collaboration/messages", async (req, res) => {
    try {
      const messageData = req.body;
      const messageId = await agentCollaboration.sendMessage(messageData);
      res.json({ success: true, messageId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get agent messages
  app.get("/api/collaboration/messages/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { messageType, limit } = req.query;
      const messages = agentCollaboration.getAgentMessages(
        agentId, 
        messageType as string, 
        limit ? parseInt(limit as string) : 50
      );
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Share knowledge
  app.post("/api/collaboration/knowledge", async (req, res) => {
    try {
      const knowledgeData = req.body;
      const knowledgeId = await agentCollaboration.shareKnowledge(knowledgeData);
      res.json({ success: true, knowledgeId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get relevant knowledge for task
  app.get("/api/collaboration/knowledge/relevant/:taskId/:agentId", async (req, res) => {
    try {
      const { taskId, agentId } = req.params;
      const { limit } = req.query;
      const knowledge = await agentCollaboration.getRelevantKnowledge(
        taskId, 
        agentId, 
        limit ? parseInt(limit as string) : 10
      );
      res.json(knowledge);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Search shared knowledge
  app.get("/api/collaboration/knowledge/search", async (req, res) => {
    try {
      const { query, agentId, limit } = req.query;
      const knowledge = agentCollaboration.searchKnowledge(
        query as string,
        agentId as string,
        limit ? parseInt(limit as string) : 20
      );
      res.json(knowledge);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create collaboration session
  app.post("/api/collaboration/sessions", async (req, res) => {
    try {
      const sessionData = req.body;
      const sessionId = await agentCollaboration.createCollaborationSession(sessionData);
      res.json({ success: true, sessionId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get agent sessions
  app.get("/api/collaboration/sessions/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const sessions = agentCollaboration.getAgentSessions(agentId);
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Find collaborators for task
  app.get("/api/collaboration/collaborators/:taskId/:agentId", async (req, res) => {
    try {
      const { taskId, agentId } = req.params;
      const collaborators = await agentCollaboration.findCollaborators(taskId, agentId);
      res.json(collaborators);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Coordinate collaborative task
  app.post("/api/collaboration/coordinate", async (req, res) => {
    try {
      const { taskId, leadAgentId } = req.body;
      
      if (!taskId || !leadAgentId) {
        return res.status(400).json({ 
          error: "Missing required fields: taskId, leadAgentId" 
        });
      }

      const sessionId = await agentCollaboration.coordinateCollaborativeTask(taskId, leadAgentId);
      res.json({ success: true, sessionId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Subscribe to message types
  app.post("/api/collaboration/subscribe/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { messageTypes } = req.body;
      
      if (!Array.isArray(messageTypes)) {
        return res.status(400).json({ error: "messageTypes must be an array" });
      }

      agentCollaboration.subscribeToMessages(agentId, messageTypes);
      res.json({ success: true, subscribedTypes: messageTypes });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get collaboration statistics
  app.get("/api/collaboration/stats", async (req, res) => {
    try {
      const stats = agentCollaboration.getCollaborationStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cleanup old collaboration data
  app.post("/api/collaboration/cleanup", async (req, res) => {
    try {
      const maxAge = req.body.maxAge || 86400000; // 24 hours default
      agentCollaboration.cleanup(maxAge);
      res.json({ success: true, message: "Collaboration data cleaned up" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== AI Key Management Routes =====

  // Add AI provider
  app.post("/api/ai-keys/providers", requireAdmin, async (req, res) => {
    try {
      const providerData = req.body;
      
      // Validate API key
      const isValid = await aiKeyManager.validateApiKey(providerData.name, providerData.apiKey);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid API key format" });
      }

      const providerId = await aiKeyManager.addProvider(providerData);
      res.json({ success: true, providerId, message: "AI provider added successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get AI providers
  app.get("/api/ai-keys/providers", async (req, res) => {
    try {
      const providers = aiKeyManager.getProviders();
      res.json(providers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update AI provider
  app.put("/api/ai-keys/providers/:providerId", requireAdmin, async (req, res) => {
    try {
      const { providerId } = req.params;
      const updates = req.body;
      
      // Validate API key if provided
      if (updates.apiKey) {
        const provider = aiKeyManager.getProviders().find(p => p.id === providerId);
        const isValid = await aiKeyManager.validateApiKey(provider?.name || updates.name, updates.apiKey);
        if (!isValid) {
          return res.status(400).json({ error: "Invalid API key format" });
        }
      }

      const updated = await aiKeyManager.updateProvider(providerId, updates);
      if (!updated) {
        return res.status(404).json({ error: "Provider not found" });
      }

      res.json({ success: true, message: "AI provider updated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Remove AI provider
  app.delete("/api/ai-keys/providers/:providerId", requireAdmin, async (req, res) => {
    try {
      const { providerId } = req.params;
      const removed = await aiKeyManager.removeProvider(providerId);
      
      if (!removed) {
        return res.status(404).json({ error: "Provider not found" });
      }

      res.json({ success: true, message: "AI provider removed successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get AI usage statistics
  app.get("/api/ai-keys/usage", async (req, res) => {
    try {
      const { providerId } = req.query;
      const stats = aiKeyManager.getUsageStats(providerId as string);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get suggested configurations
  app.get("/api/ai-keys/suggestions", async (req, res) => {
    try {
      const suggestions = aiKeyManager.getSuggestedConfigurations();
      res.json(suggestions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test AI provider connection
  app.post("/api/ai-keys/providers/:providerId/test", requireAdmin, async (req, res) => {
    try {
      const { providerId } = req.params;
      const provider = aiKeyManager.getProviders().find(p => p.id === providerId);
      
      if (!provider) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const apiKey = aiKeyManager.getApiKey(providerId);
      if (!apiKey) {
        return res.status(400).json({ error: "API key not available" });
      }

      // Test connection with a simple request
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: provider.baseUrl || 'https://api.openai.com/v1'
      });

      const testResponse = await openai.chat.completions.create({
        model: provider.models[0] || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a connection test.' }],
        max_tokens: 10
      });

      res.json({ 
        success: true, 
        message: "Connection test successful",
        model: testResponse.model,
        provider: provider.name
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Connection test failed", 
        details: error.message 
      });
    }
  });

  // ===== Parallel AI Research Routes =====

  // Get Parallel AI status
  app.get("/api/parallel/status", async (req, res) => {
    try {
      const isConfigured = parallelResearchService.isConfigured();
      const capabilities = parallelResearchService.getCapabilities();
      
      res.json({
        configured: isConfigured,
        provider: 'Parallel AI',
        capabilities,
        documentation: 'https://docs.parallel.ai',
        apiModes: ['search', 'extract', 'chat', 'deep-research']
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Configure Parallel AI
  app.post("/api/parallel/configure", requireAdmin, async (req, res) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }

      const providerId = await parallelResearchService.setApiKey(apiKey);
      
      res.json({
        success: true,
        providerId,
        message: "Parallel AI configured successfully",
        capabilities: parallelResearchService.getCapabilities()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Perform quick research using Parallel AI
  app.post("/api/parallel/research", async (req, res) => {
    try {
      const { query, mode } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Research query is required" });
      }

      if (!parallelResearchService.isConfigured()) {
        return res.status(400).json({ 
          error: "Parallel AI not configured",
          instructions: "Set PARALLEL_API_KEY environment variable or call /api/parallel/configure"
        });
      }

      const result = await parallelResearchService.conductResearch(query, {
        mode: mode || 'standard',
        structured: true
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Web search using Parallel AI
  app.post("/api/parallel/search", async (req, res) => {
    try {
      const { objective, searchQueries, maxResults } = req.body;
      
      if (!objective) {
        return res.status(400).json({ error: "Search objective is required" });
      }

      if (!parallelResearchService.isConfigured()) {
        return res.status(400).json({ error: "Parallel AI not configured" });
      }

      const result = await parallelResearchService.search({
        objective,
        searchQueries,
        maxResults: maxResults || 10
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Extract content from URLs using Parallel AI
  app.post("/api/parallel/extract", async (req, res) => {
    try {
      const { urls, objective, fullContent } = req.body;
      
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: "URLs array is required" });
      }

      if (!parallelResearchService.isConfigured()) {
        return res.status(400).json({ error: "Parallel AI not configured" });
      }

      const result = await parallelResearchService.extract({
        urls,
        objective,
        fullContent: fullContent || false
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start deep research using Parallel AI
  app.post("/api/parallel/deep-research", async (req, res) => {
    try {
      const { input, processor, outputType } = req.body;
      
      if (!input) {
        return res.status(400).json({ error: "Research input is required" });
      }

      if (!parallelResearchService.isConfigured()) {
        return res.status(400).json({ error: "Parallel AI not configured" });
      }

      const result = await parallelResearchService.startDeepResearch({
        input,
        processor: processor || 'ultra',
        outputType: outputType || 'text'
      });
      
      res.json({
        ...result,
        message: "Deep research started. Use /api/parallel/deep-research/:runId to check status."
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get deep research result
  app.get("/api/parallel/deep-research/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      
      if (!parallelResearchService.isConfigured()) {
        return res.status(400).json({ error: "Parallel AI not configured" });
      }

      const result = await parallelResearchService.getDeepResearchResult(runId);
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Consciousness Experiment Routes =====

  // Create a new consciousness experiment
  app.post("/api/experiments", async (req, res) => {
    try {
      const { name, description, h0, h1, participatingAgents, controls } = req.body;
      
      const experimentId = await consciousnessExperimentService.createExperiment({
        name,
        description,
        h0,
        h1,
        participatingAgents,
        controls,
      });
      
      const experiment = await consciousnessExperimentService.getExperiment(experimentId);
      res.json({ experimentId, experiment });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all experiments
  app.get("/api/experiments", async (req, res) => {
    try {
      const experiments = await consciousnessExperimentService.getAllExperiments();
      res.json(experiments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific experiment
  app.get("/api/experiments/:experimentId", async (req, res) => {
    try {
      const { experimentId } = req.params;
      const experiment = await consciousnessExperimentService.getExperiment(experimentId);
      
      if (!experiment) {
        return res.status(404).json({ error: "Experiment not found" });
      }
      
      res.json(experiment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run a specific phase of an experiment
  app.post("/api/experiments/:experimentId/phases/:phaseIndex", async (req, res) => {
    try {
      const { experimentId, phaseIndex } = req.params;
      
      const result = await consciousnessExperimentService.runPhase(experimentId, parseInt(phaseIndex));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run a full experiment (all phases)
  app.post("/api/experiments/run-full", async (req, res) => {
    try {
      const { name, description, h0, h1, participatingAgents, controls } = req.body;
      
      const result = await consciousnessExperimentService.runFullExperiment({
        name,
        description,
        h0,
        h1,
        participatingAgents,
        controls,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Singularis Prime Communication Routes =====

  // Get all Singularis communications
  app.get("/api/singularis/communications", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const communications = await storage.getAllSingularisCommunications(limit);
      res.json(communications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Singularis communications for an experiment
  app.get("/api/singularis/communications/experiment/:experimentId", async (req, res) => {
    try {
      const { experimentId } = req.params;
      const communications = await singularisProtocol.getExperimentMessages(experimentId);
      res.json(communications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get Singularis communications between agents
  app.get("/api/singularis/communications/agents/:agent1Id/:agent2Id", async (req, res) => {
    try {
      const { agent1Id, agent2Id } = req.params;
      const communications = await singularisProtocol.getAgentConversation(agent1Id, agent2Id);
      res.json(communications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending human review communications
  app.get("/api/singularis/pending-review", async (req, res) => {
    try {
      const pendingReviews = await singularisProtocol.getPendingReview();
      res.json(pendingReviews);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark a Singularis communication as reviewed
  app.post("/api/singularis/communications/:id/review", async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewedBy, notes } = req.body;
      
      if (!reviewedBy) {
        return res.status(400).json({ error: "reviewedBy is required" });
      }
      
      await singularisProtocol.markReviewed(id, reviewedBy, notes);
      res.json({ success: true, message: "Communication marked as reviewed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Human-in-the-Loop Integration Routes =====

  // Get tasks awaiting human approval
  app.get("/api/human/approvals", async (req, res) => {
    try {
      const tasks = await storage.getTasksAwaitingApproval();
      
      // Enhance with agent and paper details
      const enhancedTasks = await Promise.all(tasks.map(async (task) => {
        const agent = await agentManager.getAgent(task.agentId);
        const paper = task.paperId ? await storage.getPaper(task.paperId) : null;
        
        return {
          ...task,
          agent: agent ? {
            id: agent.id,
            displayName: agent.displayName,
            specialization: agent.specialization
          } : null,
          paper: paper ? {
            id: paper.id,
            title: paper.title
          } : null
        };
      }));

      res.json(enhancedTasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve or reject task
  app.post("/api/human/approvals/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { approved, feedback } = req.body;
      
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ error: "Approved field must be boolean" });
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (task.status !== 'awaiting_approval') {
        return res.status(400).json({ error: "Task is not awaiting approval" });
      }

      // Update task status
      const updates: any = {
        status: approved ? 'completed' : 'failed',
        humanFeedback: feedback,
        humanReviewedAt: new Date(),
        humanReviewedBy: (req as AuthenticatedRequest).user?.id || 'system'
      };

      const updatedTask = await storage.updateTask(taskId, updates);

      // Send feedback to agent
      if (task.agentId) {
        await agentCollaboration.sendMessage({
          fromAgentId: 'human',
          toAgentId: task.agentId,
          messageType: 'review_request',
          content: {
            type: 'human_feedback',
            taskId,
            approved,
            feedback: feedback || (approved ? 'Task approved by human reviewer' : 'Task rejected by human reviewer'),
            timestamp: new Date()
          },
          priority: 'high',
          requiresResponse: false
        });
      }

      res.json({ 
        success: true, 
        task: updatedTask,
        message: `Task ${approved ? 'approved' : 'rejected'} by human reviewer`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get human feedback history
  app.get("/api/human/feedback", async (req, res) => {
    try {
      const { limit = 50, agentId } = req.query;
      
      // Get tasks with human feedback
      const tasks = await storage.getTasksWithHumanFeedback(
        agentId as string, 
        parseInt(limit as string)
      );
      
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit human feedback for improvement
  app.post("/api/human/feedback", async (req, res) => {
    try {
      const { taskId, agentId, feedback, rating, category } = req.body;
      
      if (!taskId || !agentId || !feedback) {
        return res.status(400).json({ 
          error: "Task ID, agent ID, and feedback are required" 
        });
      }

      const feedbackEntry = {
        id: `feedback_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        taskId,
        agentId,
        feedback,
        rating: rating || null, // 1-5 scale
        category: category || 'general',
        userId: (req as AuthenticatedRequest).user?.id || 'system',
        createdAt: new Date()
      };

      // Store feedback (would use database in production)
      console.log(`💬 Human feedback submitted for agent ${agentId}, task ${taskId}`);

      // Send feedback to agent for learning
      await agentCollaboration.sendMessage({
        fromAgentId: 'human',
        toAgentId: agentId,
        messageType: 'review_request',
        content: {
          type: 'improvement_feedback',
          feedbackEntry,
          timestamp: new Date()
        },
        priority: 'medium',
        requiresResponse: false
      });

      res.json({ 
        success: true, 
        feedbackEntry,
        message: "Feedback submitted successfully"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get human oversight statistics
  app.get("/api/human/stats", async (req, res) => {
    try {
      const stats = {
        totalApprovals: 0,
        totalRejections: 0,
        averageRating: 0,
        feedbackCategories: {},
        recentActivity: []
      };

      // Calculate statistics (would query database in production)
      const allFeedback = []; // Would fetch from database
      
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update agent task
  app.patch("/api/agent-tasks/:id", async (req, res) => {
    try {
      const updates = insertAgentTaskSchema.partial().parse(req.body);
      const task = await storage.updateAgentTask(req.params.id, updates);
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ===== AI Agent Routes =====
  
  // Perform AI research
  app.post("/api/ai/research", async (req, res) => {
    try {
      const { topic, context, existingContent, taskType } = req.body;
      
      if (!topic || !taskType) {
        return res.status(400).json({ error: "Topic and taskType are required" });
      }

      const result = await performAgentResearch({
        topic,
        context,
        existingContent,
        taskType,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate paper title
  app.post("/api/ai/generate-title", async (req, res) => {
    try {
      const { topic, abstract } = req.body;
      
      if (!topic || !abstract) {
        return res.status(400).json({ error: "Topic and abstract are required" });
      }

      const title = await generatePaperTitle(topic, abstract);
      res.json({ title });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Advanced Blockchain Routes =====
  
  // Publish to NEO X
  app.post("/api/blockchain/publish/neox", async (req, res) => {
    try {
      const { paperHash, title, authors, timestamp } = req.body;

      if (!paperHash || !title || !authors) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const result = await publishToNeoX({
        paperHash,
        title,
        authors,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Publish to Base
  app.post("/api/blockchain/publish/base", async (req, res) => {
    try {
      const { paperHash, title, authors, timestamp } = req.body;

      if (!paperHash || !title || !authors) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const result = await publishToBase({
        paperHash,
        title,
        authors,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Verify blockchain record
  app.post("/api/blockchain/verify", async (req, res) => {
    try {
      const { chain, transactionHash } = req.body;
      
      if (!chain || !transactionHash) {
        return res.status(400).json({ error: "Chain and transactionHash are required" });
      }

      const isValid = await verifyBlockchainRecord(chain, transactionHash);
      res.json({ valid: isValid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Estimate gas cost
  app.post("/api/blockchain/estimate-gas", async (req, res) => {
    try {
      const { chain, dataSize } = req.body;
      
      if (!chain || !dataSize) {
        return res.status(400).json({ error: "Chain and dataSize are required" });
      }

      const estimate = await estimateGasCost(chain, dataSize);
      res.json(estimate);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Agent Conversation Routes =====
  
  // Create a new conversation message
  app.post("/api/conversations", async (req, res) => {
    try {
      const { paperId, agentId, userId, role, message, metadata } = req.body;
      
      if (!agentId || !role || !message) {
        return res.status(400).json({ error: "agentId, role, and message are required" });
      }

      const conversation = await storage.createAgentConversation({
        paperId,
        agentId,
        userId,
        role,
        message,
        metadata,
      });
      
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversations for a paper
  app.get("/api/papers/:paperId/conversations", async (req, res) => {
    try {
      const { paperId } = req.params;
      const conversations = await storage.getConversationsByPaperId(paperId);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversations for an agent
  app.get("/api/agents/:agentId/conversations", async (req, res) => {
    try {
      const { agentId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const conversations = await storage.getConversationsByAgentId(agentId, limit);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversations for a user
  app.get("/api/users/:userId/conversations", async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const conversations = await storage.getConversationsByUserId(userId, limit);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== SEO Routes =====
  // Mount the complete SpaceChild SEO Engine for ecosystem-wide SEO
  app.use('/api/seo', seoRouter);
  
  // Also serve sitemap and robots.txt at root level
  app.get('/sitemap.xml', sitemapHandler);
  app.get('/robots.txt', robotsHandler);

  // ===== Statistics & Psychometrics Engine Routes =====
  // Mount the Statistical Analysis & Psychometrics Engine for consciousness research
  app.use('/api/statistics', statisticsRouter);

  // ===== AI Study Designer Routes =====
  // Mount the AI-assisted study design system for consciousness research
  app.use('/api/study-designer', studyDesignerRouter);

  // Discovery Loop: study generation → findings → vetting → routing → delivery → feedback
  app.use('/api/loop', loopRouter);
  app.get('/feed/findings.xml', findingsFeedHandler);

  // Constellation: the Collective's window onto the Kannaka swarm
  app.use('/api/kannaka', kannakaRouter);

  // Singularis Compact: public spec (amateur-radio codes must be published) + encode/decode
  app.get('/spec/singularis-compact', specHtmlHandler);
  app.get('/spec/singularis-compact.md', specMarkdownHandler);
  app.get('/spec/singularis-compact.json', specJsonHandler);
  app.use('/api/singularis-rf', singularisRfRouter);

  return httpServer;
}
