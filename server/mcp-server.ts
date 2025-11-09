import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { storage } from "./storage.js";
import { taskDispatcher } from "./services/task-dispatcher.js";

/**
 * Space Child Research Collective MCP Server
 * Enables AI agents to collaborate on consciousness research via JSON-RPC 2.0
 * Uses WebSocket transport for remote agent connections with token-based authentication
 */

// Create MCP server instance
const server = new Server(
  {
    name: "spacechild-research-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register research tools that agents can use
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_papers",
        description: "Search for research papers in the collective's database",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for paper titles or abstracts",
            },
            category: {
              type: "string",
              description: "Filter by category (consciousness, ai, neuroscience, philosophy)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_paper_content",
        description: "Retrieve full content of a specific research paper",
        inputSchema: {
          type: "object",
          properties: {
            paperId: {
              type: "string",
              description: "ID of the paper to retrieve",
            },
          },
          required: ["paperId"],
        },
      },
      {
        name: "create_research_task",
        description: "Create a new research task for human review",
        inputSchema: {
          type: "object",
          properties: {
            paperId: {
              type: "string",
              description: "ID of the paper this task relates to",
            },
            taskType: {
              type: "string",
              description: "Type of task (literature_review, citation_check, content_generation)",
            },
            description: {
              type: "string",
              description: "Description of the research task",
            },
          },
          required: ["paperId", "taskType", "description"],
        },
      },
      {
        name: "get_my_tasks",
        description: "Get all tasks assigned to this agent",
        inputSchema: {
          type: "object",
          properties: {
            agentId: {
              type: "string",
              description: "ID of the agent requesting tasks",
            },
            status: {
              type: "string",
              description: "Filter by task status (optional)",
            },
          },
          required: ["agentId"],
        },
      },
      {
        name: "submit_task_result",
        description: "Submit the result of a completed task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "ID of the task being completed",
            },
            result: {
              type: "object",
              description: "Task result data",
            },
            requiresApproval: {
              type: "boolean",
              description: "Whether this task requires human approval",
            },
          },
          required: ["taskId", "result"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error("Missing arguments for tool call");
  }

  switch (name) {
    case "search_papers": {
      const agentId = args.agentId as string | undefined;
      const query = (args.query as string).toLowerCase();
      
      // Get papers the agent has access to (via contributor relationship)
      const allPapers = agentId 
        ? await storage.getPapersByUserId(agentId)
        : await storage.getAllPapers();
      
      const filtered = allPapers.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.abstract.toLowerCase().includes(query)
      );
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(filtered, null, 2),
          },
        ],
      };
    }

    case "get_paper_content": {
      const paperId = args.paperId as string;
      const agentId = args.agentId as string | undefined;
      
      // Get paper with contributors to check access
      const paperWithContributors = await storage.getPaperWithContributors(paperId);
      
      if (!paperWithContributors) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Paper not found" }),
            },
          ],
        };
      }
      
      // Check if agent has access (is a contributor)
      if (agentId) {
        const hasAccess = paperWithContributors.contributors.some(
          c => c.userId === agentId
        );
        
        if (!hasAccess) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  error: "Access denied: Agent is not a contributor to this paper" 
                }),
              },
            ],
          };
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(paperWithContributors, null, 2),
          },
        ],
      };
    }

    case "create_research_task": {
      const task = await storage.createAgentTask({
        paperId: args.paperId as string,
        agentId: "mcp-agent", // Default MCP agent ID
        taskType: args.taskType as "research" | "writing" | "analysis" | "review",
        description: args.description as string,
        status: "awaiting_approval",
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    }

    case "get_my_tasks": {
      const agentId = args.agentId as string;
      const status = args.status as string | undefined;
      
      let tasks = await storage.getActiveAgentTasks(agentId);
      
      // Filter by status if provided
      if (status) {
        tasks = tasks.filter((t) => t.status === status);
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tasks, null, 2),
          },
        ],
      };
    }

    case "submit_task_result": {
      const taskId = args.taskId as string;
      const result = args.result;
      const requiresApproval = (args.requiresApproval as boolean) || false;
      
      await taskDispatcher.handleTaskResult(taskId, result, requiresApproval);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, taskId, status: requiresApproval ? "awaiting_approval" : "completed" }),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Register resources (research papers as resources)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const papers = await storage.getAllPapers();
  return {
    resources: papers.map((paper) => ({
      uri: `paper://${paper.id}`,
      name: paper.title,
      description: paper.abstract,
      mimeType: "application/json",
    })),
  };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const match = uri.match(/^paper:\/\/(.+)$/);
  
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const paperId = match[1];
  const paper = await storage.getPaper(paperId);
  
  if (!paper) {
    throw new Error(`Paper not found: ${paperId}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(paper, null, 2),
      },
    ],
  };
});

// Export server instance for WebSocket transport integration
export { server };
