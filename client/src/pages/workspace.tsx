import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Bot, Clock, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { UserTypeBadge } from "@/components/user-type-badge";
import { useQuery } from "@tanstack/react-query";
import type { Paper, AgentTask } from "@shared/schema";

export default function Workspace() {
  // TODO: Get actual user ID from auth context
  const userId = "temp-user-id";

  const { data: userPapers, isLoading: papersLoading } = useQuery<Paper[]>({
    queryKey: ['/api/users', userId, 'papers'],
  });

  const { data: activeTasks, isLoading: tasksLoading } = useQuery<AgentTask[]>({
    queryKey: ['/api/agents', userId, 'active-tasks'],
  });
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-light mb-2">Research Workspace</h1>
          <p className="text-muted-foreground">
            Collaborate with AI agents on consciousness research
          </p>
        </div>
        <Link href="/papers/new">
          <Button size="lg" data-testid="button-new-paper">
            <Plus className="mr-2 h-5 w-5" />
            New Research Paper
          </Button>
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content - My Papers */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                My Research Papers
              </CardTitle>
              <CardDescription>
                Papers you're contributing to or have created
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {papersLoading ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Loading papers...</p>
                </div>
              ) : !userPapers || userPapers.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">No papers yet</p>
                  <Link href="/papers/new">
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First Paper
                    </Button>
                  </Link>
                </div>
              ) : (
                userPapers.map((paper) => (
                  <Card 
                    key={paper.id} 
                    className="hover-elevate transition-all"
                    data-testid={`card-my-paper-${paper.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold mb-2">{paper.title}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>Updated {new Date(paper.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <Badge 
                          variant={paper.status === "draft" ? "secondary" : "default"}
                          data-testid={`badge-status-${paper.status}`}
                        >
                          {paper.status === "draft" ? "Draft" : paper.status === "in_review" ? "In Review" : "Published"}
                        </Badge>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" data-testid={`button-edit-${paper.id}`}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-view-${paper.id}`}>
                          View
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Active Agents */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5" />
                Active AI Agents
              </CardTitle>
              <CardDescription>
                Agents currently working on research
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasksLoading ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Loading active tasks...
                </p>
              ) : !activeTasks || activeTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No active tasks
                </p>
              ) : (
                activeTasks.map((task) => (
                  <Card 
                    key={task.id} 
                    className="p-3"
                    data-testid={`card-task-${task.id}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <UserTypeBadge userType="agent" className="scale-90" />
                        {task.status === "in_progress" ? (
                          <Clock className="h-4 w-4 text-primary animate-pulse" />
                        ) : task.status === "completed" ? (
                          <CheckCircle className="h-4 w-4 text-accent" />
                        ) : null}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{task.taskType}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.description}
                        </p>
                      </div>
                      {task.status === "awaiting_approval" && (
                        <Button 
                          size="sm" 
                          className="w-full mt-2"
                          data-testid={`button-approve-task-${task.id}`}
                        >
                          Review & Approve
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">MCP Protocol Active</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Model Context Protocol server is running, enabling agent-to-agent communication.
              </p>
              <Link href="/mcp">
                <Button variant="outline" size="sm" className="w-full">
                  View MCP Status
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
