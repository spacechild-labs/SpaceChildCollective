#!/usr/bin/env tsx
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";
import { AgentFactory } from "../server/services/agent-implementations.js";
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
 * Connects to MCP server, receives tasks, and processes them using specialized agents
 */
class AIAgentClient {
  private client: Client;
  private transport: WebSocketClientTransport;
  private agent: any; // BaseAgent instance
  private agentId: string;
  private isRunning = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;

  constructor(agentId: string, token: string, serverUrl: string) {
    this.agentId = agentId;

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
      
      // Get agent details from database to determine specialization
      const [agent] = await db.select().from(users).where(eq(users.id, this.agentId));
      if (!agent || agent.userType !== "agent") {
        throw new Error(`Invalid agent: ${this.agentId}`);
      }

      // Create specialized agent instance
      const specialization = agent.specialization || 'research';
      this.agent = AgentFactory.createAgent(this.agentId, specialization);
      console.log(`🤖 Created ${specialization} agent instance`);

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
      // Use the specialized agent to process the task
      console.log(`🧠 Using ${this.agent.constructor.name} for task processing...`);
      const result = await this.agent.processTask(task);

      // Submit result using MCP tool
      console.log(`📤 Submitting result for task ${task.id}...`);
      
      const response = await this.client.callTool({
        name: "submit_task_result",
        arguments: {
          taskId: task.id,
          result: result,
          requiresApproval: result.success && result.metadata.confidence > 0.7, // Require approval for high-confidence results
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
