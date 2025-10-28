import { connectionRegistry } from "../websocket.js";
import { storage } from "../storage.js";
import type { AgentTask } from "@shared/schema";

/**
 * Task Dispatcher Service
 * Polls database for queued tasks and dispatches them to connected agents
 */
export class TaskDispatcher {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private pollIntervalMs: number;

  constructor(pollIntervalMs = 5000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Start the task dispatcher
   */
  start(): void {
    if (this.isRunning) {
      console.log("Task dispatcher is already running");
      return;
    }

    this.isRunning = true;
    console.log(`Starting task dispatcher with ${this.pollIntervalMs}ms polling interval`);

    // Run initial check immediately
    this.checkAndDispatchTasks();

    // Set up polling interval
    this.pollingInterval = setInterval(() => {
      this.checkAndDispatchTasks();
    }, this.pollIntervalMs);
  }

  /**
   * Stop the task dispatcher
   */
  stop(): void {
    if (!this.isRunning) {
      console.log("Task dispatcher is not running");
      return;
    }

    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    console.log("Task dispatcher stopped");
  }

  /**
   * Check for queued tasks and dispatch them to connected agents
   */
  private async checkAndDispatchTasks(): Promise<void> {
    try {
      // Get all tasks from the database
      const allTasks = await storage.getAllTasks();

      // Filter for queued tasks
      const queuedTasks = allTasks.filter((task) => task.status === "queued");

      if (queuedTasks.length === 0) {
        return;
      }

      console.log(`Found ${queuedTasks.length} queued task(s) to dispatch`);

      // Get connected agent IDs
      const connectedAgentIds = connectionRegistry.getConnectedAgentIds();

      if (connectedAgentIds.length === 0) {
        console.log("No agents connected, tasks will remain queued");
        return;
      }

      console.log(`Connected agents: ${connectedAgentIds.join(", ")}`);

      // Dispatch tasks to connected agents
      for (const task of queuedTasks) {
        // Check if the agent for this task is connected
        if (connectionRegistry.has(task.agentId)) {
          await this.dispatchTask(task);
        } else {
          console.log(
            `Task ${task.id} is for agent ${task.agentId} which is not connected, skipping`
          );
        }
      }
    } catch (error) {
      console.error("Error checking and dispatching tasks:", error);
    }
  }

  /**
   * Dispatch a single task to an agent
   */
  private async dispatchTask(task: AgentTask): Promise<void> {
    try {
      console.log(
        `Dispatching task ${task.id} (${task.taskType}) to agent ${task.agentId}`
      );

      // Send task to agent via WebSocket
      const sent = await connectionRegistry.sendTaskToAgent(task.agentId, task);

      if (sent) {
        // Update task status to in_progress
        await storage.updateAgentTask(task.id, {
          status: "in_progress",
        });
        console.log(`Task ${task.id} dispatched successfully and marked as in_progress`);
      } else {
        console.log(`Failed to send task ${task.id} to agent ${task.agentId}`);
      }
    } catch (error) {
      console.error(`Error dispatching task ${task.id}:`, error);
    }
  }

  /**
   * Handle task result submission from agent
   */
  async handleTaskResult(
    taskId: string,
    result: any,
    requiresApproval = false
  ): Promise<void> {
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
      }

      // Determine new status based on whether approval is required
      const newStatus = requiresApproval ? "awaiting_approval" : "completed";

      // Update task with result and new status
      await storage.updateAgentTask(taskId, {
        status: newStatus,
        result,
      });

      console.log(
        `Task ${taskId} completed by agent ${task.agentId}, status: ${newStatus}`
      );
    } catch (error) {
      console.error(`Error handling task result for ${taskId}:`, error);
    }
  }
}

// Export singleton instance
export const taskDispatcher = new TaskDispatcher();
