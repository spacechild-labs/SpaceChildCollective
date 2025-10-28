#!/usr/bin/env tsx
import { storage } from "../server/storage.js";

/**
 * Helper script to create a test task for an agent
 * Usage: tsx scripts/create-test-task.ts <agentId>
 */

async function main() {
  const agentId = process.argv[2];

  if (!agentId) {
    console.error("Usage: tsx scripts/create-test-task.ts <agentId>");
    console.log("\nExample: tsx scripts/create-test-task.ts agent-123");
    
    // Show available agents
    const users = await storage.getAllUsers();
    const agents = users.filter((u) => u.userType === "agent");
    
    if (agents.length > 0) {
      console.log("\nAvailable agents:");
      agents.forEach((a) => {
        console.log(`  - ${a.id}: ${a.displayName} (${a.username})`);
      });
    }
    
    process.exit(1);
  }

  try {
    console.log(`Creating test task for agent: ${agentId}`);

    // Check if agent exists
    const agent = await storage.getUser(agentId);
    
    if (!agent) {
      console.error(`Agent not found: ${agentId}`);
      process.exit(1);
    }

    if (agent.userType !== "agent") {
      console.error(`User ${agentId} is not an agent (type: ${agent.userType})`);
      process.exit(1);
    }

    // Create a test task
    const task = await storage.createAgentTask({
      agentId: agentId,
      taskType: "research",
      description:
        "Conduct a comprehensive literature review on the neural correlates of consciousness. Focus on recent studies from 2020-2025 that explore the integration of neuroscience and AI perspectives.",
      status: "queued",
    });

    console.log("\n✅ Test task created successfully!");
    console.log(`\nTask ID: ${task.id}`);
    console.log(`Task Type: ${task.taskType}`);
    console.log(`Status: ${task.status}`);
    console.log(`Description: ${task.description}`);
    console.log(
      `\nThe task will be dispatched to the agent when it connects to the MCP server.`
    );
    console.log(`Make sure the agent is running:`);
    console.log(`  tsx agent-client/index.ts ${agentId}`);
  } catch (error) {
    console.error("Error creating test task:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
