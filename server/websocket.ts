import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { validateMcpToken, updateAgentStatus } from "./services/agent-auth.js";

/**
 * Connection Registry for tracking connected agents
 */
class AgentConnectionRegistry {
  private connections = new Map<string, WebSocketTransport>();

  register(agentId: string, transport: WebSocketTransport): void {
    this.connections.set(agentId, transport);
    console.log(`Agent ${agentId} registered. Total connected agents: ${this.connections.size}`);
  }

  unregister(agentId: string): void {
    this.connections.delete(agentId);
    console.log(`Agent ${agentId} unregistered. Total connected agents: ${this.connections.size}`);
  }

  get(agentId: string): WebSocketTransport | undefined {
    return this.connections.get(agentId);
  }

  has(agentId: string): boolean {
    return this.connections.has(agentId);
  }

  getAll(): Map<string, WebSocketTransport> {
    return this.connections;
  }

  getConnectedAgentIds(): string[] {
    return Array.from(this.connections.keys());
  }

  async sendTaskToAgent(agentId: string, task: any): Promise<boolean> {
    const transport = this.get(agentId);
    if (!transport) {
      console.log(`Agent ${agentId} not connected, cannot send task`);
      return false;
    }

    try {
      await transport.send({
        jsonrpc: "2.0",
        method: "notifications/task/new",
        params: {
          task,
        },
      });
      console.log(`Task ${task.id} sent to agent ${agentId}`);
      return true;
    } catch (error) {
      console.error(`Failed to send task to agent ${agentId}:`, error);
      return false;
    }
  }
}

// Global connection registry
export const connectionRegistry = new AgentConnectionRegistry();

/**
 * WebSocket Transport for MCP Server
 * Implements the MCP SDK Transport interface for WebSocket communication
 */
class WebSocketTransport implements Transport {
  private ws: WebSocket;
  private agentId: string;

  // Transport interface properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(ws: WebSocket, agentId: string) {
    this.ws = ws;
    this.agentId = agentId;

    // Set up WebSocket event handlers
    this.ws.on("close", () => {
      connectionRegistry.unregister(this.agentId);
      updateAgentStatus(this.agentId, "offline").catch(console.error);
      this.onclose?.();
    });

    this.ws.on("error", (error) => {
      this.onerror?.(error);
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as JSONRPCMessage;
        this.onmessage?.(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
        this.onerror?.(error as Error);
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        resolve();
      } else if (this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.once("open", () => resolve());
        this.ws.once("error", reject);
      } else {
        reject(new Error("WebSocket is not in a connectable state"));
      }
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not open"));
        return;
      }

      const data = JSON.stringify(message);
      this.ws.send(data, (error) => {
        if (error) {
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

      this.ws.once("close", () => {
        updateAgentStatus(this.agentId, "offline").catch(console.error);
        resolve();
      });

      this.ws.close();
    });
  }
}

/**
 * Set up WebSocket server for MCP connections
 */
export function setupMcpWebSocketServer(
  httpServer: HTTPServer,
  mcpServer: Server
): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    path: "/mcp",
  });

  // Handle WebSocket upgrade requests
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    
    console.log(`[MCP WebSocket] Upgrade request: pathname="${pathname}", url="${request.url}"`);

    if (pathname === "/mcp") {
      console.log(`[MCP WebSocket] Handling /mcp upgrade request`);
      // Extract token from query string or header
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const token = url.searchParams.get("token") || request.headers["x-mcp-token"];

      if (!token || typeof token !== "string") {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Validate token
      const payload = validateMcpToken(token);
      if (!payload) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Upgrade connection
      wss.handleUpgrade(request, socket, head, async (ws) => {
        const agentId = payload.agentId;

        try {
          // Update agent status to connecting
          await updateAgentStatus(agentId, "connecting");

          // Create transport and connect MCP server
          const transport = new WebSocketTransport(ws, agentId);

          // Connect the transport to the MCP server
          await mcpServer.connect(transport);

          // Register agent in connection registry
          connectionRegistry.register(agentId, transport);

          // Update agent status to online
          await updateAgentStatus(agentId, "online");

          console.log(`MCP agent ${agentId} connected successfully`);

          // Emit connection event
          wss.emit("connection", ws, request);
        } catch (error) {
          console.error(`Failed to connect agent ${agentId}:`, error);
          await updateAgentStatus(agentId, "offline");
          ws.close(1011, "Internal server error");
        }
      });
    }
  });

  wss.on("connection", (ws, request) => {
    console.log("New MCP WebSocket connection established");

    ws.on("close", () => {
      console.log("MCP WebSocket connection closed");
    });
  });

  return wss;
}
