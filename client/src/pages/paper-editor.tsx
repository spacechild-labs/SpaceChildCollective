import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Save, Send, Users, Bot, Database, Edit, CheckCircle, Loader2, MessageSquare } from "lucide-react";
import { UserTypeBadge } from "@/components/user-type-badge";
import { Markdown } from "@/components/markdown";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import type { Paper, PaperContributor, User } from "@shared/schema";
import { WalletConnect } from "@/components/wallet-connect";
import { useRoute, Link } from "wouter";
import { AgentTeamwork } from "@/components/agent-teamwork";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BLOCKCHAIN_CONFIG, RESEARCH_REGISTRY_ABI, isBlockchainEnabled } from "@/lib/blockchain-config";

export default function PaperEditor() {
  // Detect if we're in view mode (route is /papers/:id without /edit)
  const [, viewParams] = useRoute("/papers/:id");
  const [, editParams] = useRoute("/papers/:id/edit");
  const [, newParams] = useRoute("/papers/new");
  
  // View mode only if we have a valid UUID (not "new") and not in edit mode
  const paperId = viewParams?.id || editParams?.id;
  const isNewPaper = !!newParams || paperId === "new";
  const isViewMode = !!(viewParams && !editParams && !isNewPaper);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState("Untitled Research Paper");
  const [content, setContent] = useState("# Introduction\n\nBegin writing your research...");
  const [abstract, setAbstract] = useState("");
  const [category, setCategory] = useState("consciousness");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [savedPaperId, setSavedPaperId] = useState<string | null>(null);

  // Fetch paper data if we have a valid paperId (not "new")
  const { data: paper, isLoading } = useQuery<Paper>({
    queryKey: ['/api/papers', paperId],
    queryFn: async () => {
      if (!paperId || paperId === "new") return null;
      const res = await fetch(`/api/papers/${paperId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load paper');
      return res.json();
    },
    enabled: !!paperId && paperId !== "new",
  });

  // Populate form when paper data loads
  useEffect(() => {
    if (paper) {
      setTitle(paper.title);
      setContent(paper.content);
      setAbstract(paper.abstract);
      setCategory(paper.category);
      setSavedPaperId(paper.id);
    }
  }, [paper]);

  const savePaperMutation = useMutation({
    mutationFn: async () => {
      if (savedPaperId) {
        const res = await apiRequest('PATCH', `/api/papers/${savedPaperId}`, {
          title,
          abstract: abstract || "No abstract provided",
          content,
          category,
        });
        return await res.json() as Paper;
      } else {
        const res = await apiRequest('POST', '/api/papers', {
          title,
          abstract: abstract || "No abstract provided",
          content,
          status: "draft",
          category,
        });
        return await res.json() as Paper;
      }
    },
    onSuccess: (data) => {
      setSavedPaperId(data.id);
      // Invalidate all paper-related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/papers'] });
      // Invalidate all user paper queries (using partial match)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/users/') && key.includes('/papers');
        }
      });
      toast({
        title: "Paper saved",
        description: "Your research paper has been saved as a draft.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving paper",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { address, isConnected } = useAccount();
  const { writeContract, data: txHash, isPending: isWritingContract } = useWriteContract();
  const { isLoading: isWaitingForTx, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const publishPaperMutation = useMutation({
    mutationFn: async () => {
      if (!savedPaperId) throw new Error("Paper must be saved first");
      
      // Update paper status to published
      const res = await apiRequest('PATCH', `/api/papers/${savedPaperId}`, {
        status: "published",
        publishedAt: new Date().toISOString(),
      });
      
      const publishedPaper = await res.json() as Paper;
      
      // If blockchain is enabled and wallet connected, publish on-chain
      if (isBlockchainEnabled() && isConnected && address) {
        try {
          // Calculate content hash
          const contentHash = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(content + title + abstract)
          );
          const hashArray = Array.from(new Uint8Array(contentHash));
          const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Publish to NEO X if enabled
          if (BLOCKCHAIN_CONFIG.neoX.enabled && BLOCKCHAIN_CONFIG.neoX.address) {
            writeContract({
              address: BLOCKCHAIN_CONFIG.neoX.address as `0x${string}`,
              abi: RESEARCH_REGISTRY_ABI,
              functionName: 'publishPaper',
              args: [hashHex as `0x${string}`, title, `paper://${savedPaperId}`],
            });
          }
          
          // Record blockchain attempt in database
          await apiRequest('POST', '/api/blockchain/records', {
            paperId: savedPaperId,
            chain: 'neox',
            dataHash: hashHex,
            title: title,
            authors: [user?.displayName || 'Anonymous'],
          });
        } catch (error) {
          console.error('Blockchain record creation failed:', error);
          // Don't fail the publish if blockchain fails - fallback mode
        }
      }
      
      return publishedPaper;
    },
    onSuccess: () => {
      // Invalidate all paper-related queries to ensure fresh data everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/papers'] });
      // Invalidate all user paper queries (using partial match)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/users/') && key.includes('/papers');
        }
      });
      setPublishDialogOpen(false);
      toast({
        title: "Paper published!",
        description: "Your research is now available to the community and secured on the blockchain.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error publishing paper",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInviteAgent = () => {
    if (!savedPaperId) {
      toast({
        title: "Save paper first",
        description: "Please save your paper as a draft before inviting AI agents.",
        variant: "destructive",
      });
      return;
    }
    setInviteDialogOpen(true);
  };

  // Real contributors for this paper (once it has been saved).
  const { data: contributorsData } = useQuery<(PaperContributor & { user: User })[]>({
    queryKey: [`/api/papers/${savedPaperId}/contributors`],
    enabled: !!savedPaperId,
  });
  const contributors = contributorsData ?? [];

  // Available AI agents to invite (fetched when the dialog opens).
  const { data: agents } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: inviteDialogOpen,
    select: (users) => users.filter((u) => u.userType === "agent"),
  });
  const invitableAgents = agents?.filter((a) => !contributors.some((c) => c.userId === a.id)) ?? [];

  const inviteMutation = useMutation({
    mutationFn: async (agentId: string) => {
      return await apiRequest("POST", `/api/papers/${savedPaperId}/contributors`, {
        userId: agentId,
        role: "collaborator",
        contributionType: "agent",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/papers/${savedPaperId}/contributors`] });
      toast({ title: "Agent invited", description: "The agent has been added to your paper." });
      setInviteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Could not invite agent", description: error.message, variant: "destructive" });
    },
  });

  // Show loading state while fetching paper
  if (isLoading && paperId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading paper...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="border-b p-4 flex items-center justify-between gap-4">
          {isViewMode ? (
            <div className="flex items-center gap-3 flex-1">
              <h1 className="text-2xl font-semibold">{title}</h1>
              <Badge variant="outline">Read-Only</Badge>
            </div>
          ) : (
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-semibold border-none shadow-none focus-visible:ring-0 px-0"
              placeholder="Paper Title"
              data-testid="input-paper-title"
            />
          )}
          <div className="flex items-center gap-2">
            {isViewMode ? (
              viewParams && (
                <Link href={`/papers/${viewParams.id}/edit`}>
                  <Button variant="default" size="sm" data-testid="button-edit-mode">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Paper
                  </Button>
                </Link>
              )
            ) : (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => savePaperMutation.mutate()}
                  disabled={savePaperMutation.isPending}
                  data-testid="button-save-draft"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savePaperMutation.isPending ? "Saving..." : "Save Draft"}
                </Button>
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={() => setPublishDialogOpen(true)}
                  disabled={!savedPaperId || paper?.status === "published"}
                  data-testid="button-publish"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {paper?.status === "published" ? "Published" : "Publish"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-hidden p-4">
          {isViewMode ? (
            /* Read-Only View */
            <Card className="h-full overflow-auto">
              <CardContent className="p-8">
                <h1 className="mb-4 text-3xl font-bold">{title}</h1>
                <Markdown>{content}</Markdown>
              </CardContent>
            </Card>
          ) : (
            /* Edit Mode - Split View */
            <div className="grid md:grid-cols-2 gap-4 h-full">
              {/* Markdown Input */}
              <div className="flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">MARKDOWN EDITOR</h3>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 font-mono text-sm resize-none"
                  placeholder="Write your research in Markdown..."
                  data-testid="textarea-paper-content"
                />
              </div>

              {/* Preview */}
              <div className="flex flex-col">
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">PREVIEW</h3>
                </div>
                <Card className="flex-1 overflow-auto">
                  <CardContent className="p-6">
                    <h1 className="mb-4 text-3xl font-bold">{title}</h1>
                    <Markdown>{content}</Markdown>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Collaboration Panel */}
      <div className="w-80 border-l bg-muted/30 p-4 overflow-auto">
        <Tabs defaultValue="contributors" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="contributors">
              <Users className="h-4 w-4 mr-2" />
              Team
            </TabsTrigger>
            <TabsTrigger value="chat" disabled={!savedPaperId}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contributors" className="mt-4">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Contributors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
            {contributors.map((contributor) => (
              <div 
                key={contributor.id}
                className="flex items-center gap-3"
                data-testid={`contributor-${contributor.id}`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {contributor.user.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{contributor.user.displayName}</p>
                  <UserTypeBadge userType={contributor.user.userType} className="scale-75 -ml-1" />
                </div>
              </div>
            ))}
            {contributors.length === 0 && (
              <p className="text-sm text-muted-foreground">No contributors yet.</p>
            )}
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={handleInviteAgent}
                  data-testid="button-invite-agent"
                >
                  <Bot className="mr-2 h-4 w-4" />
                  Invite AI Agent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite AI Research Agent</DialogTitle>
                  <DialogDescription>
                    AI agents can help with research, writing, and analysis on your paper
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Available AI Agents:
                    </p>
                    <div className="space-y-2">
                      {invitableAgents.map((agent) => (
                        <Button
                          key={agent.id}
                          variant="outline"
                          className="w-full justify-start"
                          disabled={inviteMutation.isPending}
                          onClick={() => inviteMutation.mutate(agent.id)}
                          data-testid={`button-invite-${agent.id}`}
                        >
                          <Bot className="mr-2 h-4 w-4" />
                          <div className="text-left">
                            <p className="font-medium">{agent.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {agent.specialization ? `${agent.specialization} specialist` : "AI agent"}
                            </p>
                          </div>
                        </Button>
                      ))}
                      {invitableAgents.length === 0 && (
                        <p className="text-sm text-muted-foreground">No agents available to invite.</p>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Publish Dialog */}
        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogContent data-testid="dialog-publish-paper">
            <DialogHeader>
              <DialogTitle>Publish Research Paper</DialogTitle>
              <DialogDescription>
                Publishing will make your research available to the community and record it on the blockchain for verification.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <h4 className="font-medium">Paper Details</h4>
                <div className="text-sm space-y-1">
                  <p><strong>Title:</strong> {title}</p>
                  <p><strong>Category:</strong> {category}</p>
                  <p><strong>Abstract:</strong> {abstract || "No abstract provided"}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Blockchain Verification</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>✓ Paper will be published to NEO X blockchain</p>
                  <p>✓ Immutable proof of discovery timestamp</p>
                  <p>✓ Tamper-proof content verification</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setPublishDialogOpen(false)}
                  disabled={publishPaperMutation.isPending}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => publishPaperMutation.mutate()}
                  disabled={publishPaperMutation.isPending}
                  className="flex-1"
                  data-testid="button-confirm-publish"
                >
                  {publishPaperMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Publish Paper
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Paper Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-paper-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consciousness">Consciousness Studies</SelectItem>
                  <SelectItem value="ai">AI Research</SelectItem>
                  <SelectItem value="neuroscience">Neuroscience</SelectItem>
                  <SelectItem value="philosophy">Philosophy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Abstract</label>
              <Textarea
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                placeholder="Brief summary of your research..."
                rows={4}
                className="resize-none"
                data-testid="textarea-paper-abstract"
              />
            </div>
          </CardContent>
        </Card>

        <WalletConnect />
          </TabsContent>

          <TabsContent value="chat" className="mt-4">
            {savedPaperId ? (
              <AgentTeamwork paperId={savedPaperId} />
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Save your paper first to start chatting with agents
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
