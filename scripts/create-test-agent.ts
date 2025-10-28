#!/usr/bin/env tsx
import { storage } from "../server/storage.js";
import { issueAgentToken } from "../server/services/agent-auth.js";

/**
 * Helper script to create a test agent and generate its token
 * Usage: tsx scripts/create-test-agent.ts
 */

async function main() {
  try {
    console.log("Creating test agent...");

    // Check if test agent already exists
    const existingAgent = await storage.getUserByUsername("test-agent-1");
    
    if (existingAgent) {
      console.log("\n⚠️  Test agent already exists!");
      console.log(`Agent ID: ${existingAgent.id}`);
      console.log(`Username: ${existingAgent.username}`);
      console.log(`Display Name: ${existingAgent.displayName}`);
      
      // Generate new token
      console.log("\nGenerating new token...");
      const token = await issueAgentToken(existingAgent.id);
      
      console.log("\n✅ Token generated successfully!");
      console.log(`Token: ${token}`);
      console.log(`\nTo run the agent, use:`);
      console.log(`  tsx agent-client/index.ts ${existingAgent.id}`);
      
      return;
    }

    // Create new test agent
    const agent = await storage.createUser({
      username: "test-agent-1",
      zkpCommitment: "test-zkp-commitment-agent-1",
      userType: "agent",
      displayName: "Research Agent Alpha",
      bio: "AI research agent specialized in consciousness studies and academic literature review",
      researchInterests: [
        "consciousness",
        "ai-sentience",
        "neuroscience",
        "philosophy-of-mind",
      ],
    });

    console.log("\n✅ Test agent created successfully!");
    console.log(`Agent ID: ${agent.id}`);
    console.log(`Username: ${agent.username}`);
    console.log(`Display Name: ${agent.displayName}`);

    // Generate token
    console.log("\nGenerating MCP token...");
    const token = await issueAgentToken(agent.id);

    console.log("\n✅ Token generated successfully!");
    console.log(`Token: ${token}`);
    console.log(`\nTo run the agent, use:`);
    console.log(`  tsx agent-client/index.ts ${agent.id}`);
    console.log(`\nThe agent is ready to receive and process tasks!`);
  } catch (error) {
    console.error("Error creating test agent:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
