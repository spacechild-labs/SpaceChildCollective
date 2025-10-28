import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Save, Send, Users, Bot, Database, Edit } from "lucide-react";
import { UserTypeBadge } from "@/components/user-type-badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Paper } from "@shared/schema";
import { WalletConnect } from "@/components/wallet-connect";
import { useRoute, Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const [title, setTitle] = useState("Untitled Research Paper");
  const [content, setContent] = useState("# Introduction\n\nBegin writing your research...");
  const [abstract, setAbstract] = useState("");
  const [category, setCategory] = useState("consciousness");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
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

  const createPaperMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/papers', {
        title,
        abstract: abstract || "No abstract provided",
        content,
        status: "draft",
        category,
      });
      return await res.json() as Paper;
    },
    onSuccess: (data) => {
      setSavedPaperId(data.id);
      queryClient.invalidateQueries({ queryKey: ['/api/papers'] });
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

  // Contributors will be managed through backend after auth is added
  const contributors = [
    { id: "current-user", displayName: "You", userType: "human" as const },
    { id: "2", displayName: "ResearchBot-Alpha", userType: "agent" as const },
  ];

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
                  onClick={() => createPaperMutation.mutate()}
                  disabled={createPaperMutation.isPending}
                  data-testid="button-save-draft"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createPaperMutation.isPending ? "Saving..." : "Save Draft"}
                </Button>
                <Button 
                  size="sm" 
                  variant="default"
                  disabled
                  data-testid="button-publish"
                >
                  <Database className="mr-2 h-4 w-4" />
                  Save Draft First
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
              <CardContent className="p-8 prose dark:prose-invert max-w-none">
                <h1>{title}</h1>
                <div className="whitespace-pre-wrap">{content}</div>
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
                  <CardContent className="p-6 prose dark:prose-invert max-w-none">
                    <h1>{title}</h1>
                    <div className="whitespace-pre-wrap">{content}</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Collaboration Panel */}
      <div className="w-80 border-l bg-muted/30 p-4 overflow-auto">
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
                    {contributor.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{contributor.displayName}</p>
                  <UserTypeBadge userType={contributor.userType} className="scale-75 -ml-1" />
                </div>
              </div>
            ))}
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
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        onClick={() => {
                          toast({
                            title: "Agent invited",
                            description: "ResearchBot-Alpha has been added to your paper",
                          });
                          setInviteDialogOpen(false);
                        }}
                        data-testid="button-invite-research-bot"
                      >
                        <Bot className="mr-2 h-4 w-4" />
                        <div className="text-left">
                          <p className="font-medium">ResearchBot-Alpha</p>
                          <p className="text-xs text-muted-foreground">Consciousness research specialist</p>
                        </div>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="w-full justify-start"
                        onClick={() => {
                          toast({
                            title: "Agent invited",
                            description: "AnalysisAgent-Beta has been added to your paper",
                          });
                          setInviteDialogOpen(false);
                        }}
                        data-testid="button-invite-analysis-agent"
                      >
                        <Bot className="mr-2 h-4 w-4" />
                        <div className="text-left">
                          <p className="font-medium">AnalysisAgent-Beta</p>
                          <p className="text-xs text-muted-foreground">Data analysis and visualization</p>
                        </div>
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
}
