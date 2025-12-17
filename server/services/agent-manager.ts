import { spawn, ChildProcess } from 'child_process';
import { storage } from '../storage.js';
import { connectionRegistry } from '../websocket.js';
import { parallelResearchService } from './parallel-research-service.js';
import { aiKeyManager } from './ai-key-manager.js';
import type { AgentTask, User } from '@shared/schema';

/**
 * Agent Manager Service
 * Manages autonomous agent processes with health monitoring and resource allocation.
 * Agents use Parallel AI as the default research provider when configured.
 */
export class AgentManager {
  private agents = new Map<string, AgentProcess>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.setupGracefulShutdown();
  }

  /**
   * Start the agent manager and initialize all agents
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Agent Manager is already running');
      return;
    }

    console.log('🚀 Starting Agent Manager...');
    this.isRunning = true;

    // Initialize Parallel AI if API key is available
    await this.initializeParallelAI();

    // Get all agent users from database
    const allUsers = await storage.getAllUsers();
    const agentUsers = allUsers.filter(user => user.userType === 'agent');

    if (agentUsers.length === 0) {
      console.log('⚠️  No agents found in database. Creating default agents...');
      await this.createDefaultAgents();
      // Retry getting agents
      const users = await storage.getAllUsers();
      agentUsers.push(...users.filter(user => user.userType === 'agent'));
    }

    // Start all agents
    for (const agent of agentUsers) {
      await this.startAgent(agent.id);
    }

    // Start health monitoring
    this.startHealthMonitoring();

    console.log(`✅ Agent Manager started with ${this.agents.size} agents`);
  }

  /**
   * Stop the agent manager and all agent processes
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping Agent Manager...');
    this.isRunning = false;

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all agents
    const stopPromises = Array.from(this.agents.values()).map(agent => 
      this.stopAgent(agent.id)
    );
    
    await Promise.all(stopPromises);
    console.log('✅ Agent Manager stopped');
  }

  /**
   * Start a specific agent process
   */
  private async startAgent(agentId: string): Promise<void> {
    try {
      const agent = await storage.getUser(agentId);
      if (!agent || agent.userType !== 'agent') {
        console.error(`❌ Invalid agent: ${agentId}`);
        return;
      }

      // Check if agent is already running
      if (this.agents.has(agentId)) {
        console.log(`⚠️  Agent ${agentId} is already running`);
        return;
      }

      // Generate fresh MCP token if needed
      if (!agent.mcpToken) {
        const token = this.generateMcpToken(agentId);
        await storage.updateUser(agentId, { mcpToken: token });
        agent.mcpToken = token;
      }

      // Spawn agent process
      const agentProcess = new AgentProcess(agentId, agent.mcpToken!);
      await agentProcess.start();

      this.agents.set(agentId, agentProcess);
      console.log(`✅ Started agent: ${agent.displayName} (${agentId})`);

      // Update agent status in database
      await storage.updateUser(agentId, { 
        mcpConnectionStatus: 'online',
        lastActiveAt: new Date()
      });

    } catch (error) {
      console.error(`❌ Failed to start agent ${agentId}:`, error);
    }
  }

  /**
   * Stop a specific agent process
   */
  private async stopAgent(agentId: string): Promise<void> {
    const agentProcess = this.agents.get(agentId);
    if (!agentProcess) {
      return;
    }

    try {
      await agentProcess.stop();
      this.agents.delete(agentId);

      // Update agent status in database
      await storage.updateUser(agentId, { 
        mcpConnectionStatus: 'offline'
      });

      console.log(`✅ Stopped agent: ${agentId}`);
    } catch (error) {
      console.error(`❌ Failed to stop agent ${agentId}:`, error);
    }
  }

  /**
   * Restart a specific agent
   */
  async restartAgent(agentId: string): Promise<void> {
    if (this.agents.has(agentId)) {
      await this.stopAgent(agentId);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }
    await this.startAgent(agentId);
  }

  /**
   * Create default agents if none exist
   */
  private async createDefaultAgents(): Promise<void> {
    const defaultAgents = [
      {
        id: 'research-agent-1',
        username: 'research-agent-1',
        displayName: 'Research Agent Alpha',
        userType: 'agent' as const,
        specialization: 'research',
        capabilities: ['literature_review', 'citation_analysis', 'topic_research']
      },
      {
        id: 'writing-agent-1',
        username: 'writing-agent-1',
        displayName: 'Writing Agent Beta',
        userType: 'agent' as const,
        specialization: 'writing',
        capabilities: ['content_generation', 'academic_writing', 'editing']
      },
      {
        id: 'review-agent-1',
        username: 'review-agent-1',
        displayName: 'Review Agent Gamma',
        userType: 'agent' as const,
        specialization: 'review',
        capabilities: ['citation_check', 'peer_review', 'quality_assessment']
      }
    ];

    for (const agentData of defaultAgents) {
      try {
        const existingAgent = await storage.getUserByUsername(agentData.username);
        if (!existingAgent) {
          const token = this.generateMcpToken(agentData.id);
          await storage.createUser({
            ...agentData,
            zkpCommitment: `agent_${agentData.id}`,
            mcpToken: token,
            mcpConnectionStatus: 'offline'
          });
          console.log(`✅ Created default agent: ${agentData.displayName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to create agent ${agentData.displayName}:`, error);
      }
    }
  }

  /**
   * Generate MCP token for agent
   */
  private generateMcpToken(agentId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return Buffer.from(`${agentId}:${timestamp}:${random}`).toString('base64');
  }

  /**
   * Initialize Parallel AI as the default research provider
   */
  private async initializeParallelAI(): Promise<void> {
    const parallelApiKey = process.env.PARALLEL_API_KEY;
    
    if (parallelApiKey) {
      try {
        await parallelResearchService.setApiKey(parallelApiKey);
        console.log('🔬 Parallel AI initialized as default research provider');
        console.log(`   • Capabilities: ${parallelResearchService.getCapabilities().join(', ')}`);
      } catch (error) {
        console.error('❌ Failed to initialize Parallel AI:', error);
      }
    } else {
      console.log('⚠️  PARALLEL_API_KEY not set. Set it to enable Parallel AI research capabilities.');
      console.log('   Get your API key from https://platform.parallel.ai/');
    }
  }

  /**
   * Start health monitoring for all agents
   * Disabled by default for stub agents to prevent unnecessary restarts
   */
  private startHealthMonitoring(): void {
    // Only enable health checks if explicitly requested
    if (process.env.ENABLE_AGENT_HEALTH_CHECKS === 'true') {
      this.healthCheckInterval = setInterval(async () => {
        await this.performHealthCheck();
      }, 30000); // Check every 30 seconds
      console.log('🔍 Agent health monitoring enabled');
    } else {
      console.log('⏭️  Agent health monitoring disabled (stub mode)');
    }
  }

  /**
   * Perform health check on all agents
   */
  private async performHealthCheck(): Promise<void> {
    for (const [agentId, agentProcess] of Array.from(this.agents.entries())) {
      try {
        const isHealthy = await agentProcess.healthCheck();
        
        if (!isHealthy) {
          console.warn(`⚠️  Agent ${agentId} failed health check, restarting...`);
          await this.restartAgent(agentId);
        } else {
          // Update last active timestamp
          await storage.updateUser(agentId, { 
            lastActiveAt: new Date()
          });
        }
      } catch (error) {
        console.error(`❌ Health check failed for agent ${agentId}:`, error);
        await this.restartAgent(agentId);
      }
    }
  }

  /**
   * Get status of all agents
   */
  getAgentStatus(): Array<{ id: string; status: string; health: string; lastActive: Date | null }> {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      status: agent.getStatus(),
      health: agent.getHealth(),
      lastActive: agent.getLastActive()
    }));
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<User | null> {
    try {
      const agent = await storage.getUser(agentId);
      return agent || null;
    } catch (error) {
      console.error(`Error getting agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Assign task to best available agent
   */
  async assignTask(task: AgentTask): Promise<string | null> {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.isAvailable() && agent.canHandleTask(task.taskType));

    if (availableAgents.length === 0) {
      console.warn('⚠️  No available agents for task type:', task.taskType);
      return null;
    }

    // Select agent with lowest workload
    const bestAgent = availableAgents.reduce((best, current) => 
      current.getWorkload() < best.getWorkload() ? current : best
    );

    // Assign task to agent
    await storage.updateAgentTask(task.id, {
      agentId: bestAgent.id,
      status: 'assigned'
    });

    console.log(`📋 Assigned task ${task.id} to agent ${bestAgent.id}`);
    return bestAgent.id;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      console.log('\n🛑 Shutting down Agent Manager...');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGUSR2', shutdown); // For nodemon restarts
  }
}

/**
 * Agent Process wrapper
 * Manages individual agent process lifecycle
 */
class AgentProcess {
  public readonly id: string;
  private process: ChildProcess | null = null;
  private token: string;
  private startTime: Date;
  private lastActive: Date;
  private workload: number = 0;
  private health: string = 'healthy';

  constructor(agentId: string, token: string) {
    this.id = agentId;
    this.token = token;
    this.startTime = new Date();
    this.lastActive = new Date();
  }

  async start(): Promise<void> {
    const scriptPath = new URL('../agent-client/index.ts', import.meta.url).pathname;
    
    this.process = spawn('tsx', [scriptPath, this.id], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MCP_SERVER_URL: process.env.MCP_SERVER_URL || 'ws://localhost:5000/mcp',
        AI_INTEGRATIONS_OPENAI_BASE_URL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        AI_INTEGRATIONS_OPENAI_API_KEY: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        PARALLEL_API_KEY: process.env.PARALLEL_API_KEY,
      }
    });

    // Handle process output
    this.process.stdout?.on('data', (data) => {
      console.log(`[${this.id}] ${data.toString().trim()}`);
      this.lastActive = new Date();
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[${this.id}] ERROR: ${data.toString().trim()}`);
      this.health = 'unhealthy';
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      console.log(`[${this.id}] Process exited with code ${code}`);
      this.health = 'stopped';
    });

    // Wait for process to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Agent process failed to start within timeout'));
      }, 10000);

      this.process!.once('spawn', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    const process = this.process;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        process.kill('SIGKILL');
        resolve(undefined);
      }, 5000);

      process.once('exit', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });

      process.kill('SIGTERM');
    });
  }

  async healthCheck(): Promise<boolean> {
    if (!this.process || this.process.killed) {
      return false;
    }

    // Check if process is responsive
    const timeSinceLastActive = Date.now() - this.lastActive.getTime();
    const isResponsive = timeSinceLastActive < 60000; // Active within last minute

    if (!isResponsive) {
      this.health = 'unresponsive';
    } else if (this.health === 'unhealthy') {
      this.health = 'healthy';
    }

    return isResponsive;
  }

  isAvailable(): boolean {
    return this.process !== null && !this.process.killed && this.workload < 3;
  }

  canHandleTask(taskType: string): boolean {
    // Map task types to agent specializations
    const agentSpecialization = this.id.split('-')[0]; // research, writing, review
    const taskMap: Record<string, string[]> = {
      research: ['research', 'literature_review', 'citation_analysis'],
      writing: ['writing', 'content_generation', 'academic_writing'],
      review: ['review', 'citation_check', 'peer_review', 'quality_assessment']
    };

    return taskMap[agentSpecialization]?.includes(taskType) || false;
  }

  getWorkload(): number {
    return this.workload;
  }

  incrementWorkload(): void {
    this.workload++;
  }

  decrementWorkload(): void {
    this.workload = Math.max(0, this.workload - 1);
  }

  getStatus(): string {
    if (!this.process) return 'stopped';
    if (this.process.killed) return 'stopped';
    return connectionRegistry.has(this.id) ? 'online' : 'connecting';
  }

  getHealth(): string {
    return this.health;
  }

  getLastActive(): Date {
    return this.lastActive;
  }
}

// Export singleton instance
export const agentManager = new AgentManager();
