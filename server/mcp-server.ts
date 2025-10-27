import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { storage } from "./storage.js";

/**
 * Space Child Research Collective MCP Server
 * Enables AI agents to collaborate on consciousness research via JSON-RPC 2.0
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
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_papers": {
      const papers = await storage.getAllPapers();
      const query = (args.query as string).toLowerCase();
      const filtered = papers.filter(
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
      const paper = await storage.getPaper(args.paperId as string);
      if (!paper) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Paper not found" }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(paper, null, 2),
          },
        ],
      };
    }

    case "create_research_task": {
      const task = await storage.createAgentTask({
        paperId: args.paperId as string,
        agentId: "mcp-agent", // Default MCP agent ID
        taskType: args.taskType as string,
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

// Start MCP server on stdio transport
async function runMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Space Child MCP Server running on stdio");
}

// Export for external use
export { server, runMcpServer };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpServer().catch(console.error);
}
