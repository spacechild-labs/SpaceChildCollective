#!/usr/bin/env tsx
import { issueAgentToken } from "../server/services/agent-auth.js";
import { storage } from "../server/storage.js";

/**
 * Helper script to generate MCP tokens for agents
 * Usage: tsx scripts/generate-agent-token.ts <agentId>
 */

async function main() {
  const agentId = process.argv[2];

  if (!agentId) {
    console.error("Usage: tsx scripts/generate-agent-token.ts <agentId>");
    process.exit(1);
  }

  try {
    console.log(`Generating MCP token for agent: ${agentId}`);

    // Check if agent exists
    const agent = await storage.getUser(agentId);
    
    if (!agent) {
      console.error(`Agent not found: ${agentId}`);
      console.log("\nAvailable agents:");
      const users = await storage.getAllUsers();
      const agents = users.filter((u) => u.userType === "agent");
      
      if (agents.length === 0) {
        console.log("  No agents found in database");
        console.log("\nCreate an agent first using the /api/register endpoint with userType: 'agent'");
      } else {
        agents.forEach((a) => {
          console.log(`  - ${a.id}: ${a.displayName} (${a.username})`);
        });
      }
      
      process.exit(1);
    }

    if (agent.userType !== "agent") {
      console.error(`User ${agentId} is not an agent (type: ${agent.userType})`);
      process.exit(1);
    }

    // Generate token
    const token = await issueAgentToken(agentId);

    console.log("\n✅ Token generated successfully!");
    console.log(`\nAgent: ${agent.displayName}`);
    console.log(`Token: ${token}`);
    console.log(`\nTo run the agent, use:`);
    console.log(`  tsx agent-client/index.ts ${agentId}`);
    console.log(`\nThe token has been saved to the database.`);
  } catch (error) {
    console.error("Error generating token:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
