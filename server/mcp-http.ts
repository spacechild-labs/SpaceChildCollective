import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";
import { taskDispatcher } from "./services/task-dispatcher.js";

/**
 * HTTP Streamable MCP endpoint for ElevenLabs and other HTTP-based MCP clients.
 * Implements the same tools as the WebSocket MCP server but over HTTP POST.
 * No auth required (open access) — suitable for ElevenLabs agent integration.
 */

// Session tracking for MCP protocol
const sessions = new Map<string, { initialized: boolean; createdAt: number }>();

function generateSessionId(): string {
  return `mcp-http-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Tool definitions (same as websocket MCP server)
const TOOLS = [
  {
    name: "search_papers",
    description: "Search for published research papers by query. Returns matching papers with title, abstract, and category.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query for paper titles or abstracts" },
        category: { type: "string", description: "Filter by category (consciousness, ai, neuroscience, philosophy)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_paper_content",
    description: "Retrieve full content of a specific research paper by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        paperId: { type: "string", description: "ID of the paper to retrieve" },
      },
      required: ["paperId"],
    },
  },
  {
    name: "create_research_task",
    description: "Create a new research task. The task will be picked up by research agents or queued for human review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        paperId: { type: "string", description: "ID of the paper this task relates to" },
        taskType: { type: "string", description: "Type of task (literature_review, citation_check, content_generation, research, analysis)" },
        description: { type: "string", description: "Description of the research task" },
      },
      required: ["paperId", "taskType", "description"],
    },
  },
  {
    name: "list_papers",
    description: "List all published research papers. Use to browse available research.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_research_status",
    description: "Get the current status of the research collective — number of papers, active tasks, connected agents.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// Tool execution
async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case "search_papers": {
      const query = (args.query as string).toLowerCase();
      const papers = await storage.getAllPapers();
      const filtered = papers.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.abstract.toLowerCase().includes(query) ||
          (args.category && p.category === args.category)
      );
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    }

    case "get_paper_content": {
      const paper = await storage.getPaperWithContributors(args.paperId as string);
      if (!paper) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Paper not found" }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(paper, null, 2) }] };
    }

    case "create_research_task": {
      const task = await storage.createAgentTask({
        paperId: args.paperId as string,
        agentId: args.agentId || "elevenlabs-voice-agent",
        taskType: args.taskType as "research" | "writing" | "analysis" | "review",
        description: args.description as string,
        status: "awaiting_approval",
      });
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    }

    case "list_papers": {
      const papers = await storage.getAllPapers();
      const published = papers.filter(p => p.status === "published");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(published.map(p => ({
            id: p.id,
            title: p.title,
            category: p.category,
            abstract: p.abstract.slice(0, 200) + (p.abstract.length > 200 ? "..." : ""),
            publishedAt: p.publishedAt,
          })), null, 2)
        }]
      };
    }

    case "get_research_status": {
      const papers = await storage.getAllPapers();
      const users = await storage.getAllUsers();
      const agents = users.filter(u => u.userType === "agent");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            papers: { total: papers.length, published: papers.filter(p => p.status === "published").length },
            agents: { total: agents.length, names: agents.map(a => a.displayName) },
            collective: "Space Child Research Collective",
            mission: "Collaborative consciousness research between humans and AI agents",
          }, null, 2)
        }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function registerMcpHttpRoutes(app: Express): void {
  // MCP HTTP Streamable endpoint
  // Handle both /mcp and /mcp/http for flexibility
  const mcpHandler = async (req: Request, res: Response) => {
    try {
      const { jsonrpc, id, method, params } = req.body;

      if (jsonrpc !== "2.0") {
        return res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid JSON-RPC version" } });
      }

      // Get or create session
      let sessionId = req.headers["mcp-session-id"] as string;

      switch (method) {
        case "initialize": {
          sessionId = generateSessionId();
          sessions.set(sessionId, { initialized: true, createdAt: Date.now() });
          
          res.setHeader("Mcp-Session-Id", sessionId);
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "spacechild-research-server", version: "1.0.0" },
            },
          });
        }

        case "notifications/initialized": {
          return res.status(200).json({ jsonrpc: "2.0" });
        }

        case "tools/list": {
          if (sessionId) res.setHeader("Mcp-Session-Id", sessionId);
          return res.json({
            jsonrpc: "2.0",
            id,
            result: { tools: TOOLS },
          });
        }

        case "tools/call": {
          if (sessionId) res.setHeader("Mcp-Session-Id", sessionId);
          const { name, arguments: args } = params || {};
          if (!name) {
            return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } });
          }
          try {
            const result = await executeTool(name, args || {});
            return res.json({ jsonrpc: "2.0", id, result });
          } catch (err: any) {
            return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } });
          }
        }

        case "resources/list": {
          const papers = await storage.getAllPapers();
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              resources: papers.map((paper) => ({
                uri: `paper://${paper.id}`,
                name: paper.title,
                description: paper.abstract,
                mimeType: "application/json",
              })),
            },
          });
        }

        default:
          return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
    } catch (error: any) {
      console.error("[MCP HTTP] Error:", error);
      return res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: error.message } });
    }
  };

  app.post("/mcp", mcpHandler);
  app.post("/mcp/http", mcpHandler);

  console.log("[MCP HTTP] Registered HTTP Streamable MCP endpoint at POST /mcp and /mcp/http");
}
