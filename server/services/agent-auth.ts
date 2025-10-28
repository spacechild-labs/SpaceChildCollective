import crypto from "crypto";
import { storage } from "../storage.js";

/**
 * Agent Authentication Service
 * Manages MCP authentication tokens for AI agents
 */

// Validate MCP_TOKEN_SECRET on startup
const MCP_TOKEN_SECRET = process.env.MCP_TOKEN_SECRET;
if (!MCP_TOKEN_SECRET || MCP_TOKEN_SECRET.length < 32) {
  console.error("ERROR: MCP_TOKEN_SECRET environment variable must be set with at least 32 characters for production security");
  if (process.env.NODE_ENV === "production") {
    throw new Error("MCP_TOKEN_SECRET is required in production");
  }
  console.warn("WARNING: Using fallback MCP secret for development. DO NOT use in production!");
}

const SECRET = MCP_TOKEN_SECRET || "dev-fallback-secret-not-for-production-use-only";
const TOKEN_VALIDITY_HOURS = 24;

/**
 * Generate HMAC-signed MCP token for an agent
 */
export function generateMcpToken(agentId: string, paperId?: string): string {
  const timestamp = Date.now();
  const expiry = timestamp + (TOKEN_VALIDITY_HOURS * 60 * 60 * 1000);
  
  const payload = {
    agentId,
    paperId: paperId || "global",
    timestamp,
    expiry,
  };
  
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
  
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(payloadB64);
  const signature = hmac.digest("base64url");
  
  return `${payloadB64}.${signature}`;
}

/**
 * Validate MCP token and extract payload
 */
export function validateMcpToken(token: string): { agentId: string; paperId: string; expiry: number } | null {
  try {
    const [payloadB64, signature] = token.split(".");
    
    if (!payloadB64 || !signature) {
      return null;
    }
    
    // Verify signature
    const hmac = crypto.createHmac("sha256", SECRET);
    hmac.update(payloadB64);
    const expectedSignature = hmac.digest("base64url");
    
    if (signature !== expectedSignature) {
      console.error("MCP token signature mismatch");
      return null;
    }
    
    // Decode payload
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr);
    
    // Check expiry
    if (Date.now() > payload.expiry) {
      console.error("MCP token expired");
      return null;
    }
    
    return {
      agentId: payload.agentId,
      paperId: payload.paperId,
      expiry: payload.expiry,
    };
  } catch (error) {
    console.error("MCP token validation error:", error);
    return null;
  }
}

/**
 * Issue a new MCP token for an agent and store it in database
 */
export async function issueAgentToken(agentId: string, paperId?: string): Promise<string> {
  // Validate agent exists and is actually an agent
  const user = await storage.getUser(agentId);
  if (!user) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  if (user.userType !== "agent") {
    throw new Error(`User ${agentId} is not an agent`);
  }
  
  const token = generateMcpToken(agentId, paperId);
  const payload = validateMcpToken(token);
  
  if (!payload) {
    throw new Error("Failed to generate valid token");
  }
  
  // Store token in database
  await storage.updateUser(agentId, {
    mcpToken: token,
    mcpTokenExpiry: new Date(payload.expiry),
  });
  
  return token;
}

/**
 * Revoke an agent's MCP token
 */
export async function revokeAgentToken(agentId: string): Promise<void> {
  await storage.updateUser(agentId, {
    mcpToken: null,
    mcpTokenExpiry: null,
    mcpConnectionStatus: "offline",
  });
}

/**
 * Update agent connection status
 */
export async function updateAgentStatus(
  agentId: string, 
  status: "online" | "offline" | "connecting"
): Promise<void> {
  await storage.updateUser(agentId, {
    mcpConnectionStatus: status,
    ...(status === "online" ? { lastConnectedAt: new Date() } : {}),
  });
}
