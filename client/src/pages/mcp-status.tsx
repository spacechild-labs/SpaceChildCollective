import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, Activity, MessageSquare, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function McpStatus() {
  const { data: communications, isLoading } = useQuery<any[]>({
    queryKey: ["/api/mcp/communications"],
    refetchInterval: 5000,
  });

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
              {isLoading ? (
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
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Connected agents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Protocol</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">JSON-RPC</div>
            <p className="text-xs text-muted-foreground">Version 2.0</p>
          </CardContent>
        </Card>
      </div>

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
          {isLoading ? (
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
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-1">Resources</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• paper:// - Research paper resources</li>
                <li>• Real-time WebSocket connection</li>
                <li>• Human-in-the-loop approval</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
