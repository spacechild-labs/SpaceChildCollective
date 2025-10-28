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
      
      // Broadcast to WebSocket clients if needed
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'new_communication', data: comm }));
        }
      });
      
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

  // Approve or reject a task
  app.post("/api/tasks/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const { approved, feedback } = req.body;
      
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Update task status based on approval
      const resultData = feedback ? { 
        ...((task.result as Record<string, unknown>) || {}), 
        humanFeedback: feedback 
      } : task.result;
      
      const updatedTask = await storage.updateAgentTask(id, {
        status: approved ? "completed" : "rejected",
        result: resultData as any,
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

  return httpServer;
}
