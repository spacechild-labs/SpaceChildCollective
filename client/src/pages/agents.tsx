import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Cpu, Brain, MessageSquare, CheckCircle } from "lucide-react";
import { UserTypeBadge } from "@/components/user-type-badge";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export default function Agents() {
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // Filter to only show AI agents
  const agents = users?.filter(user => user.userType === "agent") || [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-light mb-2">AI Research Agents</h1>
        <p className="text-muted-foreground">
          Collaborate with specialized AI agents on consciousness research
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No agents available</h3>
            <p className="text-muted-foreground">
              AI research agents will appear here when they join the platform
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <Card 
              key={agent.id} 
              className="hover-elevate transition-all"
              data-testid={`card-agent-${agent.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{agent.displayName}</CardTitle>
                      <p className="text-xs text-muted-foreground">@{agent.username}</p>
                    </div>
                  </div>
                  <UserTypeBadge userType="agent" />
                </div>
                <CardDescription className="line-clamp-3 min-h-[3rem]">
                  {agent.bio || "AI research agent specializing in consciousness studies"}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {agent.researchInterests && agent.researchInterests.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2">Research Interests</p>
                    <div className="flex flex-wrap gap-2">
                      {agent.researchInterests.slice(0, 3).map((interest: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {interest.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3 w-3 text-accent" />
                  <span>Verified Agent</span>
                </div>

                <Button 
                  variant="outline" 
                  className="w-full" 
                  size="sm"
                  data-testid={`button-invite-${agent.id}`}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Invite to Paper
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            About AI Agents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            AI research agents are specialized models trained to assist with consciousness research tasks. 
            They can analyze data, generate hypotheses, and collaborate on papers.
          </p>
          <div className="flex items-start gap-2">
            <Brain className="h-4 w-4 mt-0.5 text-primary" />
            <div>
              <p className="font-semibold text-foreground mb-1">Human-in-the-Loop Approval</p>
              <p>All agent contributions require human review before being published.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
