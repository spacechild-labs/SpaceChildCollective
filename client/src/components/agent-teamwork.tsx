import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Bot, User as UserIcon, Send, MessageSquare, Users, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AgentConversation, Paper, User } from "@shared/schema";

interface AgentTeamworkProps {
  paperId: string;
}

export function AgentTeamwork({ paperId }: AgentTeamworkProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Fetch paper details
  const { data: paper } = useQuery<Paper>({
    queryKey: [`/api/papers/${paperId}`],
  });

  // Fetch conversations for this paper
  const { data: conversations, isLoading } = useQuery<AgentConversation[]>({
    queryKey: [`/api/papers/${paperId}/conversations`],
  });

  // Fetch agents (users with userType: 'agent')
  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const agents = allUsers?.filter(u => u.userType === 'agent') || [];

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: { agentId: string; message: string; role: 'user' | 'agent' }) => {
      return await apiRequest('POST', '/api/conversations', {
        paperId,
        agentId: data.agentId,
        role: data.role,
        message: data.message,
        metadata: { paperTitle: paper?.title },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/papers/${paperId}/conversations`] });
      setMessage("");
      toast({
        title: "Message sent",
        description: "Your message has been sent to the agent.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!message.trim() || !selectedAgentId) {
      toast({
        title: "Error",
        description: "Please select an agent and enter a message",
        variant: "destructive",
      });
      return;
    }

    sendMessageMutation.mutate({
      agentId: selectedAgentId,
      message: message.trim(),
      role: 'user',
    });
  };

  // Group conversations by agent
  const conversationsByAgent = conversations?.reduce((acc, conv) => {
    if (!acc[conv.agentId]) {
      acc[conv.agentId] = [];
    }
    acc[conv.agentId].push(conv);
    return acc;
  }, {} as Record<string, AgentConversation[]>) || {};

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Agent Selection Sidebar */}
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Agents
          </CardTitle>
          <CardDescription>
            Select an agent to view conversation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No agents available
              </p>
            ) : (
              agents.map((agent) => {
                const agentConvCount = conversationsByAgent[agent.id]?.length || 0;
                return (
                  <Card
                    key={agent.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedAgentId === agent.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          <Bot className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{agent.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {agent.specialization || 'AI Agent'}
                        </p>
                      </div>
                      {agentConvCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {agentConvCount}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conversation Area */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Conversation
          </CardTitle>
          <CardDescription>
            {selectedAgentId
              ? `Chat with ${agents.find(a => a.id === selectedAgentId)?.displayName}`
              : 'Select an agent to start chatting'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedAgentId ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select an agent from the sidebar to view conversations</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Messages */}
              <ScrollArea className="h-96 pr-4">
                {isLoading ? (
                  <p className="text-center text-muted-foreground py-8">Loading messages...</p>
                ) : conversationsByAgent[selectedAgentId]?.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {conversationsByAgent[selectedAgentId]?.map((conv) => (
                      <div
                        key={conv.id}
                        className={`flex gap-3 ${
                          conv.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback>
                            {conv.role === 'agent' ? (
                              <Bot className="h-4 w-4" />
                            ) : (
                              <UserIcon className="h-4 w-4" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={`flex-1 max-w-[80%] ${
                            conv.role === 'user' ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div
                            className={`inline-block rounded-lg px-4 py-2 ${
                              conv.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{conv.message}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(conv.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <Separator />

              {/* Message Input */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type your message to the agent..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="min-h-[80px] resize-none"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
