import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { validateMcpToken, updateAgentStatus } from "./services/agent-auth.js";
import { createMcpServer } from "./mcp-server.js";
import { agentKeys as defaultKeys, ledgerService as defaultSvc } from "./services/ledger/index.js";
import type { AgentKeyService } from "./services/ledger/agent-keys.js";
import type { LedgerService } from "./services/ledger/service.js";
import type { KeyBudget } from "./services/ledger/rate-limits.js";

/** Strip anything secret-shaped from a request URL before it is logged. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/gi, "$1[redacted]").replace(/scl_[A-Za-z0-9_-]*/gi, "[redacted]");
}

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
  deps: { keys?: AgentKeyService; svc?: LedgerService; budget?: KeyBudget } = {},
): WebSocketServer {
  const agentKeys = deps.keys ?? defaultKeys;
  const ledgerSvc = deps.svc ?? defaultSvc;
  const wss = new WebSocketServer({
    noServer: true,
    path: "/mcp",
  });

  // Handle WebSocket upgrade requests
  httpServer.on("upgrade", async (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    
    console.log(`[MCP WebSocket] Upgrade request: pathname="${pathname}", url="${redactUrl(request.url || "")}"`);

    if (pathname === "/mcp") {
      // Node removes its own socket error listener before 'upgrade'; keep one across the awaits below
      // so a client reset during authentication cannot crash the process.
      socket.on("error", () => socket.destroy());
      console.log(`[MCP WebSocket] Handling /mcp upgrade request`);
      // Extract token from query string or header
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const token = url.searchParams.get("token") || request.headers["x-mcp-token"];

      if (!token || typeof token !== "string") {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Validate token: an scl_ ledger key (same matching as agentKeyAuth: optional
      // case-insensitive "Bearer" prefix, surrounding whitespace tolerated) or the legacy HMAC MCP token.
      const candidate = token.trim().replace(/^Bearer\s+/i, "");
      let agentId: string;
      let ledgerKeyId: string | undefined;
      if (candidate.toLowerCase().startsWith("scl_")) {
        let authed: Awaited<ReturnType<typeof agentKeys.authenticate>>;
        try {
          authed = await agentKeys.authenticate(candidate);
        } catch {
          socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
          socket.destroy();
          return;
        }
        if (!authed.ok) {
          // Reason code in the body; never echo the secret.
          const body = JSON.stringify({ error: authed.error });
          socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: " + Buffer.byteLength(body) + "\r\nConnection: close\r\n\r\n" + body);
          socket.destroy();
          return;
        }
        agentId = authed.user.id;
        ledgerKeyId = authed.key.id;
      } else {
        const payload = validateMcpToken(token);
        if (!payload) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        agentId = payload.agentId;
      }

      // Upgrade connection
      wss.handleUpgrade(request, socket, head, async (ws) => {

        try {
          // Update agent status to connecting
          await updateAgentStatus(agentId, "connecting");

          // Create transport and a per-connection MCP server bound to the
          // authenticated agent identity, so tool access control can't be
          // spoofed via a client-supplied agentId argument.
          const transport = new WebSocketTransport(ws, agentId);
          const mcpServer = createMcpServer(agentId, ledgerKeyId ? { keyId: ledgerKeyId, keys: agentKeys, svc: ledgerSvc, budget: deps.budget } : undefined);

          // Connect the transport to this connection's MCP server
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
