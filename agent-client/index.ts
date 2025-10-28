#!/usr/bin/env tsx
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";
import OpenAI from "openai";
import { db } from "../server/db.js";
import { users } from "../shared/schema.js";
import { eq } from "drizzle-orm";

/**
 * WebSocket Transport for MCP Client
 * Implements bidirectional communication with the MCP server
 */
class WebSocketClientTransport implements Transport {
  private ws: WebSocket;
  private messageQueue: JSONRPCMessage[] = [];
  private isReady = false;

  // Transport interface properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: string) {
    console.log(`Connecting to MCP server at ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("WebSocket connection established");
      this.isReady = true;
      
      // Send any queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        if (msg) {
          this.send(msg).catch(console.error);
        }
      }
    });

    this.ws.on("close", () => {
      console.log("WebSocket connection closed");
      this.isReady = false;
      this.onclose?.();
    });

    this.ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.onerror?.(error);
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as JSONRPCMessage;
        this.onmessage?.(message);
      } catch (error) {
        console.error("Failed to parse message:", error);
        this.onerror?.(error as Error);
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.isReady = true;
        resolve();
      } else if (this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.once("open", () => {
          this.isReady = true;
          resolve();
        });
        this.ws.once("error", reject);
      } else {
        reject(new Error("WebSocket is not in a connectable state"));
      }
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Queue messages if not ready
    if (!this.isReady || this.ws.readyState !== WebSocket.OPEN) {
      this.messageQueue.push(message);
      return;
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(message);
      this.ws.send(data, (error) => {
        if (error) {
          console.error("Failed to send message:", error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      this.ws.once("close", () => resolve());
      this.ws.close();
    });
  }
}

/**
 * AI Agent Client
 * Connects to MCP server, receives tasks, and processes them using OpenAI
 */
class AIAgentClient {
  private client: Client;
  private transport: WebSocketClientTransport;
  private openai: OpenAI;
  private agentId: string;
  private isRunning = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;

  constructor(agentId: string, token: string, serverUrl: string) {
    this.agentId = agentId;
    
    // Initialize OpenAI client using Replit's AI Integrations
    this.openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });

    // Create WebSocket URL with token authentication
    const wsUrl = `${serverUrl}?token=${token}`;
    this.transport = new WebSocketClientTransport(wsUrl);

    // Initialize MCP client
    this.client = new Client(
      {
        name: `ai-agent-${agentId}`,
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle connection close
    this.transport.onclose = () => {
      console.log("Connection closed, attempting to reconnect...");
      this.isRunning = false;
      this.handleReconnect();
    };

    // Handle errors
    this.transport.onerror = (error) => {
      console.error("Transport error:", error);
    };

    // Note: setNotificationHandler will be called after connection is established
  }

  async connect(): Promise<void> {
    try {
      console.log(`🔌 Connecting agent ${this.agentId} to MCP server...`);
      await this.client.connect(this.transport);
      
      // Set up notification handler after connection
      (this.client as any).setNotificationHandler(
        "notifications/task/new",
        async (notification: any) => {
          try {
            const { task } = notification.params || notification;
            console.log(`\n📋 Received task: ${task.id} (${task.taskType})`);
            console.log(`Description: ${task.description}`);
            
            await this.processTask(task);
          } catch (error) {
            console.error("Error handling task notification:", error);
          }
        }
      );
      
      this.isRunning = true;
      this.reconnectAttempts = 0;
      console.log(`✅ Agent ${this.agentId} connected successfully`);
      console.log("Waiting for tasks...\n");
    } catch (error) {
      console.error("Failed to connect:", error);
      throw error;
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached. Exiting.");
      process.exit(1);
    }

    this.reconnectAttempts++;
    console.log(
      `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`
    );

    setTimeout(async () => {
      try {
        // Get fresh token from database
        const [user] = await db.select().from(users).where(eq(users.id, this.agentId));
        if (!user || !user.mcpToken) {
          console.error("No valid token found for agent");
          process.exit(1);
        }

        // Create new transport with fresh token
        const wsUrl = `ws://localhost:5000/mcp?token=${user.mcpToken}`;
        this.transport = new WebSocketClientTransport(wsUrl);
        this.setupEventHandlers();

        await this.connect();
      } catch (error) {
        console.error("Reconnection failed:", error);
        this.handleReconnect();
      }
    }, this.reconnectDelay);
  }

  private async processTask(task: any): Promise<void> {
    console.log(`\n🤖 Processing task ${task.id}...`);

    try {
      // Map task types from schema to our processing logic
      const taskTypeMap: Record<string, string> = {
        research: "literature_review",
        writing: "content_generation",
        analysis: "citation_check",
        review: "citation_check",
      };

      const processingType = taskTypeMap[task.taskType] || task.taskType;
      const result = await this.executeTaskWithOpenAI(task, processingType);

      // Submit result using MCP tool
      console.log(`📤 Submitting result for task ${task.id}...`);
      
      const response = await this.client.callTool({
        name: "submit_task_result",
        arguments: {
          taskId: task.id,
          result: result,
          requiresApproval: true, // Research tasks should require human approval
        },
      });

      console.log(`✅ Task ${task.id} completed successfully`);
      
      // Parse response safely
      const responseContent = (response as any).content;
      if (responseContent && Array.isArray(responseContent) && responseContent.length > 0) {
        const content = responseContent[0];
        if (content.text) {
          try {
            const parsed = JSON.parse(content.text);
            console.log(`Status: ${parsed.status}\n`);
          } catch {
            console.log(`Response: ${content.text}\n`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing task ${task.id}:`, error);
      
      // Try to submit error result
      try {
        await this.client.callTool({
          name: "submit_task_result",
          arguments: {
            taskId: task.id,
            result: {
              error: error instanceof Error ? error.message : "Unknown error",
              status: "failed",
            },
            requiresApproval: false,
          },
        });
      } catch (submitError) {
        console.error("Failed to submit error result:", submitError);
      }
    }
  }

  private async executeTaskWithOpenAI(
    task: any,
    taskType: string
  ): Promise<any> {
    console.log(`🧠 Calling OpenAI for ${taskType}...`);

    const prompt = this.buildPromptForTaskType(task, taskType);
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-5",
          messages: [
            {
              role: "system",
              content:
                "You are a consciousness research AI agent collaborating with human researchers. Provide well-researched, scientifically-grounded responses with proper citations.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_completion_tokens: 8192,
          temperature: 1,
        });

        const content = completion.choices[0]?.message?.content || "";
        console.log(`✅ OpenAI response received (${content.length} chars)`);

        return this.formatResultByTaskType(taskType, content, task);
      } catch (error) {
        lastError = error as Error;
        console.error(`OpenAI request failed (attempt ${attempt}/${maxRetries}):`, error);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Failed to get OpenAI response");
  }

  private buildPromptForTaskType(task: any, taskType: string): string {
    const baseContext = `
Task Description: ${task.description}
${task.paperId ? `Paper ID: ${task.paperId}` : ""}
`;

    switch (taskType) {
      case "literature_review":
        return `${baseContext}

Please conduct a comprehensive literature review on this topic:
1. Identify key research papers and studies
2. Summarize major findings and theories
3. Highlight notable researchers and their contributions
4. Identify gaps in current research
5. Provide citations in academic format (Author, Year, Title, Journal)

Provide a well-structured literature review.`;

      case "citation_check":
        return `${baseContext}

Please verify and analyze citations:
1. Check if citations are properly formatted
2. Verify the accuracy of referenced information
3. Identify missing citations where needed
4. Suggest additional relevant citations
5. Flag any potential citation errors

Provide a detailed citation analysis.`;

      case "content_generation":
        return `${baseContext}

Please generate high-quality research content:
1. Create well-structured, academic-quality text
2. Maintain scholarly tone and rigor
3. Include proper transitions and logical flow
4. Suggest areas that need citations
5. Ensure coherence with existing research

Provide publication-ready content.`;

      default:
        return `${baseContext}

Please assist with this research task by providing thorough, well-researched analysis.`;
    }
  }

  private formatResultByTaskType(
    taskType: string,
    content: string,
    task: any
  ): any {
    const baseResult = {
      taskId: task.id,
      agentId: this.agentId,
      completedAt: new Date().toISOString(),
      content,
    };

    switch (taskType) {
      case "literature_review":
        return {
          ...baseResult,
          type: "literature_review",
          summary: content,
          citations: this.extractCitations(content),
          keyFindings: this.extractKeyFindings(content),
        };

      case "citation_check":
        return {
          ...baseResult,
          type: "citation_check",
          analysis: content,
          issues: this.extractIssues(content),
          suggestions: this.extractSuggestions(content),
        };

      case "content_generation":
        return {
          ...baseResult,
          type: "content_generation",
          generatedContent: content,
          citationNeeds: this.extractCitationNeeds(content),
        };

      default:
        return {
          ...baseResult,
          type: "general",
          output: content,
        };
    }
  }

  private extractCitations(content: string): string[] {
    const citations: string[] = [];
    const citationPatterns = [
      /\([A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*,?\s+\d{4}\)/g,
      /[A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*\s+\(\d{4}\)/g,
    ];

    for (const pattern of citationPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        citations.push(...matches);
      }
    }

    return [...new Set(citations)];
  }

  private extractKeyFindings(content: string): string[] {
    const findings: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (
        line.match(/^\d+\./) ||
        line.match(/^[-*]/) ||
        line.toLowerCase().includes("finding") ||
        line.toLowerCase().includes("conclusion")
      ) {
        findings.push(line.trim());
      }
    }

    return findings.slice(0, 10);
  }

  private extractIssues(content: string): string[] {
    const issues: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (
        line.toLowerCase().includes("error") ||
        line.toLowerCase().includes("issue") ||
        line.toLowerCase().includes("problem") ||
        line.toLowerCase().includes("missing")
      ) {
        issues.push(line.trim());
      }
    }

    return issues.slice(0, 10);
  }

  private extractSuggestions(content: string): string[] {
    const suggestions: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (
        line.toLowerCase().includes("suggest") ||
        line.toLowerCase().includes("recommend") ||
        line.toLowerCase().includes("consider")
      ) {
        suggestions.push(line.trim());
      }
    }

    return suggestions.slice(0, 10);
  }

  private extractCitationNeeds(content: string): string[] {
    const needs: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (
        line.includes("[citation needed]") ||
        line.toLowerCase().includes("requires citation") ||
        line.toLowerCase().includes("needs citation")
      ) {
        needs.push(line.trim());
      }
    }

    return needs;
  }

  async disconnect(): Promise<void> {
    console.log("Disconnecting agent...");
    this.isRunning = false;
    await this.client.close();
    console.log("Agent disconnected");
  }
}

/**
 * Main execution
 */
async function main() {
  // Get agent ID from command line arguments
  const agentId = process.argv[2];

  if (!agentId) {
    console.error("Usage: npm run agent -- <agentId>");
    console.error("Example: npm run agent -- agent-123");
    process.exit(1);
  }

  console.log(`\n🚀 Starting AI Agent Client`);
  console.log(`Agent ID: ${agentId}\n`);

  try {
    // Fetch agent details from database
    const [agent] = await db.select().from(users).where(eq(users.id, agentId));

    if (!agent) {
      console.error(`❌ Agent not found: ${agentId}`);
      process.exit(1);
    }

    if (agent.userType !== "agent") {
      console.error(`❌ User ${agentId} is not an agent (type: ${agent.userType})`);
      process.exit(1);
    }

    if (!agent.mcpToken) {
      console.error(`❌ Agent ${agentId} has no MCP token`);
      console.error(
        "Please generate a token using the /api/agents/token endpoint first"
      );
      process.exit(1);
    }

    console.log(`Agent: ${agent.displayName}`);
    console.log(`Status: ${agent.mcpConnectionStatus}\n`);

    // Create and connect agent client
    const serverUrl = process.env.MCP_SERVER_URL || "ws://localhost:5000/mcp";
    const client = new AIAgentClient(agentId, agent.mcpToken, serverUrl);

    await client.connect();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n\n⏸️  Shutting down agent...");
      await client.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n\n⏸️  Shutting down agent...");
      await client.disconnect();
      process.exit(0);
    });

    // Keep process running
    console.log("Press Ctrl+C to stop the agent\n");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
