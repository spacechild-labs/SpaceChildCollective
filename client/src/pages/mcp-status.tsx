import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, Activity, MessageSquare, Zap, Bot, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function McpStatus() {
  const { data: communications, isLoading: commsLoading } = useQuery<any[]>({
    queryKey: ["/api/mcp/communications"],
  });

  const { data: agentStatus, isLoading: agentsLoading } = useQuery<any[]>({
    queryKey: ["/api/agents/status"],
  });

  const { data: taskStats, isLoading: tasksLoading } = useQuery<any>({
    queryKey: ["/api/tasks/stats"],
  });

  const connectedAgents = agentStatus?.filter(agent => agent.status === 'online') || [];
  const totalAgents = agentStatus?.length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-light">
          MCP Protocol Status
        </h1>
        <p className="text-muted-foreground">
          Monitor Model Context Protocol communications and agent activity
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connection</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400">
                Active
              </Badge>
              <span className="text-xs text-muted-foreground">WebSocket Ready</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {commsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                communications?.length || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Total communications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agentsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                `${connectedAgents.length}/${totalAgents}`
              )}
            </div>
            <p className="text-xs text-muted-foreground">Connected/Total agents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tasksLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                taskStats?.completed || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Completed tasks</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Status
          </CardTitle>
          <CardDescription>
            Real-time status of all autonomous research agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : agentStatus && agentStatus.length > 0 ? (
            <div className="space-y-3">
              {agentStatus.map((agent: any) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                  data-testid={`agent-${agent.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {agent.status === 'online' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : agent.status === 'connecting' ? (
                        <Clock className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {agent.id.split('-')[0]} {/* Show specialization */}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{agent.id}</p>
                      <p className="text-xs text-muted-foreground">
                        Health: {agent.health} • Last active: {agent.lastActive ? new Date(agent.lastActive).toLocaleTimeString() : 'Never'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={agent.status === 'online' ? 'default' : agent.status === 'connecting' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No agents available</p>
              <p className="text-sm mt-1">
                Agents will appear here when the Agent Manager starts them
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Recent Communications
          </CardTitle>
          <CardDescription>
            Latest MCP protocol messages and agent interactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : communications && communications.length > 0 ? (
            <div className="space-y-3">
              {communications.slice(0, 10).map((comm: any) => (
                <div
                  key={comm.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3"
                  data-testid={`communication-${comm.id}`}
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {comm.communicationType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comm.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-mono">
                      {comm.messageContent && typeof comm.messageContent === 'object'
                        ? JSON.stringify(comm.messageContent).substring(0, 100) + '...'
                        : comm.messageContent || 'No content'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No MCP communications yet</p>
              <p className="text-sm mt-1">
                Agent communications will appear here when they interact with the platform
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Protocol Information</CardTitle>
          <CardDescription>
            Model Context Protocol (MCP) enables standardized AI agent communication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium mb-1">Available Tools</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• search_papers - Search research database</li>
                <li>• get_paper_content - Retrieve paper details</li>
                <li>• create_research_task - Submit research tasks</li>
                <li>• submit_task_result - Submit completed work</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-1">Agent Specializations</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Research Agents - Literature analysis</li>
                <li>• Writing Agents - Content generation</li>
                <li>• Review Agents - Quality assessment</li>
                <li>• Auto-assignment based on task type</li>
              </ul>
            </div>
          </div>
          {taskStats && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Task Statistics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <span className="ml-2 font-medium">{taskStats.total}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Queued:</span>
                  <span className="ml-2 font-medium">{taskStats.queued}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">In Progress:</span>
                  <span className="ml-2 font-medium">{taskStats.inProgress}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed:</span>
                  <span className="ml-2 font-medium text-green-600">{taskStats.completed}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
