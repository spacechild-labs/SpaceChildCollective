import { connectionRegistry } from "../websocket.js";
import { storage } from "../storage.js";
import { agentManager } from "./agent-manager.js";
import { AgentFactory } from "./agent-implementations.js";
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

      // Filter for tasks that need processing (only queued tasks)
      const pendingTasks = allTasks.filter((task) => 
        task.status === "queued"
      );

      if (pendingTasks.length === 0) {
        return;
      }

      console.log(`Found ${pendingTasks.length} pending task(s) to process`);

      // Process each task
      for (const task of pendingTasks) {
        await this.processTask(task);
      }
    } catch (error) {
      console.error("Error checking and dispatching tasks:", error);
    }
  }

  /**
   * Process a single task
   */
  private async processTask(task: AgentTask): Promise<void> {
    try {
      console.log(`Processing task ${task.id} (${task.taskType})`);

      // If task is queued, try to execute it
      if (task.status === "queued") {
        // Check if we have an agent for this task
        if (!task.agentId) {
          const assignedAgentId = await agentManager.assignTask(task);
          if (!assignedAgentId) {
            console.log(`No available agent for task ${task.id}, will retry later`);
            return;
          }
        }
        
        // Execute the task
        await this.executeTask(task);
      }
    } catch (error) {
      console.error(`Error processing task ${task.id}:`, error);
      // Mark task as cancelled on error
      await storage.updateAgentTask(task.id, {
        status: "cancelled",
        result: { error: error instanceof Error ? error.message : "Unknown error" }
      });
    }
  }

  /**
   * Execute a task using the appropriate agent
   */
  private async executeTask(task: AgentTask): Promise<void> {
    if (!task.agentId) {
      console.error(`Task ${task.id} has no assigned agent`);
      return;
    }

    try {
      // Update task status to in_progress
      await storage.updateAgentTask(task.id, {
        status: "in_progress"
      });

      // Get agent details
      const agent = await storage.getUser(task.agentId);
      if (!agent || agent.userType !== "agent") {
        throw new Error(`Invalid agent: ${task.agentId}`);
      }

      // Create agent instance and process task
      const agentInstance = AgentFactory.createAgent(task.agentId, agent.specialization || 'research');
      const result = await agentInstance.processTask(task);

      // Update task with result
      const newStatus = result.requiresApproval ? "awaiting_approval" : "completed";
      await storage.updateAgentTask(task.id, {
        status: newStatus,
        result: result
      });

      console.log(`Task ${task.id} completed by agent ${task.agentId}, status: ${newStatus}`);

    } catch (error) {
      console.error(`Error executing task ${task.id}:`, error);
      await storage.updateAgentTask(task.id, {
        status: "cancelled",
        result: { error: error instanceof Error ? error.message : "Unknown error" }
      });
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

  /**
   * Create a new task
   */
  async createTask(taskData: {
    paperId?: string;
    taskType: string;
    description: string;
    userId?: string;
    agentId?: string;
  }): Promise<AgentTask> {
    try {
      const task = await storage.createAgentTask({
        paperId: taskData.paperId ?? null,
        agentId: taskData.agentId ?? "system",
        taskType: taskData.taskType as any,
        description: taskData.description,
        status: "queued"
      });

      console.log(`✅ Created task ${task.id}: ${taskData.taskType}`);
      return task;
    } catch (error) {
      console.error(`Failed to create task:`, error);
      throw error;
    }
  }

  /**
   * Create tasks automatically based on user actions
   */
  async createTaskForPaper(
    paperId: string,
    taskType: string,
    description: string,
    userId: string
  ): Promise<AgentTask | null> {
    try {
      const task = await storage.createAgentTask({
        paperId,
        agentId: "system",
        taskType: taskType as any,
        description,
        status: "queued"
      });

      console.log(`✅ Created task ${task.id} for paper ${paperId}: ${taskType}`);
      return task;
    } catch (error) {
      console.error(`Failed to create task for paper ${paperId}:`, error);
      return null;
    }
  }

  /**
   * Get task statistics
   */
  async getTaskStats(): Promise<{
    total: number;
    queued: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    awaitingApproval: number;
  }> {
    try {
      const allTasks = await storage.getAllTasks();
      
      return {
        total: allTasks.length,
        queued: allTasks.filter(t => t.status === "queued").length,
        inProgress: allTasks.filter(t => t.status === "in_progress").length,
        completed: allTasks.filter(t => t.status === "completed").length,
        cancelled: allTasks.filter(t => t.status === "cancelled").length,
        awaitingApproval: allTasks.filter(t => t.status === "awaiting_approval").length
      };
    } catch (error) {
      console.error("Error getting task stats:", error);
      return {
        total: 0,
        queued: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        awaitingApproval: 0
      };
    }
  }
}

// Export singleton instance
export const taskDispatcher = new TaskDispatcher();
