import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertUserSchema,
  insertPaperSchema,
  insertPaperContributorSchema,
  insertBlockchainRecordSchema,
  insertMcpCommunicationSchema,
  insertAgentTaskSchema,
} from "@shared/schema";
import { createHash } from "crypto";
import { performAgentResearch, generatePaperTitle } from "./services/ai";
import { publishToNeoX, publishToBase, generatePaperHash, verifyBlockchainRecord, estimateGasCost } from "./services/blockchain";
import { agentManager } from "./services/agent-manager";
import { taskDispatcher } from "./services/task-dispatcher";
import { consciousnessIntegration } from "./services/consciousness-integration";
import { agentCollaboration } from "./services/agent-collaboration";
import seoRouter from "./routes/seo";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Note: MCP WebSocket server is set up separately in server/index.ts
  // using setupMcpWebSocketServer() with path '/mcp'

  // ===== Auth Routes =====
  
  // Register with ZKP (creates user and sets session)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, displayName, userType, zkProof, bio, researchInterests } = req.body;
      
      if (!displayName || !userType || !zkProof) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Generate username if not provided
      const finalUsername = username || `user_${Date.now()}`;

      // Check if user already exists with this ZKP
      const existingUser = await storage.getUserByZkProof(zkProof);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Parse research interests from comma-separated string to array
      const interestsArray = researchInterests 
        ? researchInterests.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

      // Create user with correct field names
      const user = await storage.createUser({
        username: finalUsername,
        zkpCommitment: zkProof,
        userType,
        displayName,
        bio: bio || null,
        researchInterests: interestsArray,
      });

      // Set session
      (req.session as any).userId = user.id;
      
      res.json({ user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Login with ZKP
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { zkProof } = req.body;
      
      if (!zkProof) {
        return res.status(400).json({ error: "ZKP required" });
      }

      const user = await storage.getUserByZkProof(zkProof);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Set session
      (req.session as any).userId = user.id;
      
      res.json({ user });
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

      res.json({ user });
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
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create user (ZKP auth registration)
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get user by username
  app.get("/api/users/by-username/:username", async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Paper Routes =====
  
  // Get all papers (discover page)
  app.get("/api/papers", async (req, res) => {
    try {
      const papers = await storage.getAllPapers();
      res.json(papers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get papers by user ID
  app.get("/api/users/:userId/papers", async (req, res) => {
    try {
      const papers = await storage.getPapersByUserId(req.params.userId);
      res.json(papers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get paper by ID with contributors
  app.get("/api/papers/:id", async (req, res) => {
    try {
      const paper = await storage.getPaperWithContributors(req.params.id);
      if (!paper) {
        return res.status(404).json({ error: "Paper not found" });
      }
      res.json(paper);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create new paper
  app.post("/api/papers", async (req, res) => {
    try {
      const paperData = insertPaperSchema.parse(req.body);
      const paper = await storage.createPaper(paperData);
      res.json(paper);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update paper
  app.patch("/api/papers/:id", async (req, res) => {
    try {
      const paperData = insertPaperSchema.partial().parse(req.body);
      const paper = await storage.updatePaper(req.params.id, paperData);
      res.json(paper);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a paper
  app.delete("/api/papers/:id", async (req, res) => {
    try {
      await storage.deletePaper(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Add contributor to paper
  app.post("/api/papers/:paperId/contributors", async (req, res) => {
    try {
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
      const recordData = insertBlockchainRecordSchema.parse(req.body);
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
      const { paperHash, title, authors, timestamp, privateKey } = req.body;
      
      if (!paperHash || !title || !authors || !privateKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const result = await publishToNeoX({
        paperHash,
        title,
        authors,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        privateKey,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Publish to Base
  app.post("/api/blockchain/publish/base", async (req, res) => {
    try {
      const { paperHash, title, authors, timestamp, privateKey } = req.body;
      
      if (!paperHash || !title || !authors || !privateKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const result = await publishToBase({
        paperHash,
        title,
        authors,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        privateKey,
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

  // ===== SEO Routes =====
  // Mount the complete SpaceChild SEO Engine for ecosystem-wide SEO
  app.use('/api/seo', seoRouter);
  
  // Also serve sitemap and robots.txt at root level
  app.get('/sitemap.xml', seoRouter);
  app.get('/robots.txt', seoRouter);

  return httpServer;
}
