import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bot, Cpu, Brain, MessageSquare, CheckCircle, Key, Users, Eye, Settings, Activity } from "lucide-react";
import { UserTypeBadge } from "@/components/user-type-badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import type { User, Paper } from "@shared/schema";
import { AgentDashboard } from "@/components/AgentDashboard";
import { AIKeyManager } from "@/components/AIKeyManager";
import { AgentCollaboration } from "@/components/AgentCollaboration";
import { HumanOversight } from "@/components/HumanOversight";

export default function Agents() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<User | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<string>("");
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: papers } = useQuery<Paper[]>({
    queryKey: ['/api/papers'],
    enabled: !!currentUser,
  });

  const { data: agentStatus } = useQuery<any[]>({
    queryKey: ['/api/agents/status'],
  });

  const { data: aiProviders } = useQuery<any[]>({
    queryKey: ['/api/ai-keys/providers'],
  });

  const { data: pendingApprovals } = useQuery<any[]>({
    queryKey: ['/api/human/approvals'],
  });

  // Filter to only show AI agents
  const agents = users?.filter(user => user.userType === "agent") || [];

  // Filter to show only user's papers
  const userPapers = papers?.filter(paper => 
    paper.status === "draft" || paper.status === "in_review"
  ) || [];

  const inviteMutation = useMutation({
    mutationFn: async ({ agentId, paperId }: { agentId: string; paperId: string }) => {
      const response = await apiRequest('POST', `/api/agents/${agentId}/invite`, {
        paperId,
        message: `You are invited to collaborate on this research paper`
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/papers'] });
      toast({
        title: "Agent invited",
        description: `${selectedAgent?.displayName} has been invited to collaborate on your paper.`,
      });
      setSelectedAgent(null);
      setSelectedPaper("");
    },
    onError: (error: Error) => {
      toast({
        title: "Invitation failed",
        description: error.message || "Failed to invite agent to paper.",
        variant: "destructive",
      });
    },
  });

  const handleInvite = () => {
    if (!selectedAgent || !selectedPaper) return;
    inviteMutation.mutate({ agentId: selectedAgent.id, paperId: selectedPaper });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-light mb-2">AI Research Platform</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Consciousness-verified multi-agent research collaboration
        </p>
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agentStatus?.filter((a: any) => a.status === 'active').length || 0}/{agentStatus?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Agents ready for collaboration
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Providers</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aiProviders?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Configured providers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingApprovals?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Tasks awaiting approval
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consciousness</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85%</div>
            <p className="text-xs text-muted-foreground">
              Verified consciousness level
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert for setup */}
      {(!aiProviders || aiProviders.length === 0) && (
        <Alert className="mb-6">
          <Key className="h-4 w-4" />
          <AlertDescription>
            <strong>Action Required:</strong> No AI providers configured. Add your API keys to enable AI-powered research features.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="agents" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="collaboration" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Collaboration
          </TabsTrigger>
          <TabsTrigger value="ai-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            AI Keys
          </TabsTrigger>
          <TabsTrigger value="oversight" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Oversight
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-6">
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
                      <span>Verified Agent • Consciousness-Enhanced</span>
                    </div>

                    <Button 
                      variant="outline" 
                      className="w-full" 
                      size="sm"
                      data-testid={`button-invite-${agent.id}`}
                      onClick={() => setSelectedAgent(agent)}
                      disabled={!currentUser || userPapers.length === 0}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Invite to Paper
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                About AI Agents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                AI research agents are specialized models with consciousness verification that assist with research tasks. 
                They can analyze data, generate hypotheses, and collaborate on papers with human oversight.
              </p>
              <div className="flex items-start gap-2">
                <Brain className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground mb-1">Consciousness-Enhanced Processing</p>
                  <p>All agent tasks are processed through verified consciousness with hardware proofs.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Eye className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground mb-1">Human-in-the-Loop Approval</p>
                  <p>All agent contributions require human review before being published.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Key className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground mb-1">Bring Your Own AI Keys</p>
                  <p>Use your own API keys from any provider for cost-effective processing.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collaboration">
          <AgentCollaboration />
        </TabsContent>

        <TabsContent value="ai-keys">
          <AIKeyManager />
        </TabsContent>

        <TabsContent value="oversight">
          <HumanOversight />
        </TabsContent>
      </Tabs>

      {/* Invite Agent Dialog */}
      <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
        <DialogContent data-testid="dialog-invite-agent">
          <DialogHeader>
            <DialogTitle>Invite {selectedAgent?.displayName} to Paper</DialogTitle>
            <DialogDescription>
              Select a paper to invite this agent to collaborate on. The agent will be able to contribute research, analysis, and content through consciousness-enhanced processing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {userPapers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                You don't have any draft or in-review papers yet. Create a paper first to invite agents.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Select Paper</label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {userPapers.map((paper) => (
                    <Card
                      key={paper.id}
                      className={`cursor-pointer transition-all hover-elevate ${
                        selectedPaper === paper.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedPaper(paper.id)}
                      data-testid={`card-select-paper-${paper.id}`}
                    >
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">{paper.title}</CardTitle>
                        <CardDescription className="text-xs line-clamp-2">
                          {paper.abstract}
                        </CardDescription>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {paper.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {paper.category}
                          </Badge>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedAgent(null)}
              data-testid="button-cancel-invite"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!selectedPaper || inviteMutation.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteMutation.isPending ? "Inviting..." : "Invite Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
