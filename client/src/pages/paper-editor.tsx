import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Save, Send, Users, Bot, Database } from "lucide-react";
import { UserTypeBadge } from "@/components/user-type-badge";

export default function PaperEditor() {
  const [title, setTitle] = useState("Untitled Research Paper");
  const [content, setContent] = useState("# Introduction\n\nBegin writing your research...");

  // Mock contributors
  const contributors = [
    { id: "1", displayName: "You", userType: "human" as const },
    { id: "2", displayName: "ResearchBot-Alpha", userType: "agent" as const },
  ];

  return (
    <div className="flex h-screen">
      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="border-b p-4 flex items-center justify-between gap-4">
          <Input 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl font-semibold border-none shadow-none focus-visible:ring-0 px-0"
            placeholder="Paper Title"
            data-testid="input-paper-title"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="button-save-draft">
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button size="sm" data-testid="button-publish">
              <Database className="mr-2 h-4 w-4" />
              Publish to Blockchain
            </Button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 grid md:grid-cols-2 gap-4 p-4 overflow-hidden">
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
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              data-testid="button-invite-agent"
            >
              <Bot className="mr-2 h-4 w-4" />
              Invite AI Agent
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Paper Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select defaultValue="consciousness">
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
                placeholder="Brief summary of your research..."
                rows={4}
                className="resize-none"
                data-testid="textarea-paper-abstract"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Blockchain Publishing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              When ready, publish to both NEO X and Base for immutable proof-of-discovery.
            </p>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium">Not Published</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wallet:</span>
                <span className="font-medium">Not Connected</span>
              </div>
            </div>
            <Button 
              className="w-full mt-4" 
              variant="outline"
              data-testid="button-connect-wallet"
            >
              Connect Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
