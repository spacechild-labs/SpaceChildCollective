import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  Send, 
  Mail, 
  CheckCircle, 
  Clock, 
  XCircle,
  MessageSquare,
  Brain,
  FileText,
  AlertCircle,
  Eye,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

interface Agent {
  id: string;
  displayName: string;
  specialization: string;
  status: string;
  capabilities: string[];
  lastActive: string;
  taskCount: number;
}

interface Paper {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface AgentInvitation {
  id: string;
  agentId: string;
  paperId: string;
  paperTitle: string;
  message: string;
  status: string;
  createdAt: string;
  messageId: string;
}

interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  messageType: string;
  content: any;
  priority: string;
  timestamp: string;
  read: boolean;
}

export function AgentCollaboration() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [invitations, setInvitations] = useState<AgentInvitation[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Form state
  const [inviteForm, setInviteForm] = useState({
    paperId: '',
    message: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [agentsRes, papersRes] = await Promise.all([
        fetch('/api/agents/status'),
        fetch('/api/papers')
      ]);

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData);
      }

      if (papersRes.ok) {
        const papersData = await papersRes.json();
        setPapersData(papersData);
      }
    } catch (error) {
      console.error('Failed to load collaboration data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setPapersData = (papersData: Paper[]) => {
    // Filter for draft and in-review papers that can accept collaborators
    setPapers(papersData.filter(p => p.status === 'draft' || p.status === 'in_review'));
  };

  const loadAgentInvitations = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/invitations`);
      if (response.ok) {
        const invitationsData = await response.json();
        setInvitations(invitationsData);
      }
    } catch (error) {
      console.error('Failed to load invitations:', error);
    }
  };

  const loadAgentMessages = async (agentId: string) => {
    try {
      const response = await fetch(`/api/collaboration/messages/${agentId}`);
      if (response.ok) {
        const messagesData = await response.json();
        setMessages(messagesData);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const inviteAgent = async () => {
    if (!selectedAgent || !inviteForm.paperId) {
      alert('Please select an agent and paper');
      return;
    }

    setInviting(true);
    
    try {
      const response = await fetch(`/api/agents/${selectedAgent.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperId: inviteForm.paperId,
          message: inviteForm.message
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ ${result.message}`);
        setShowInviteDialog(false);
        setInviteForm({ paperId: '', message: '' });
        await loadData();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to invite agent:', error);
      alert('❌ Failed to invite agent');
    } finally {
      setInviting(false);
    }
  };

  const respondToInvitation = async (invitationId: string, accept: boolean) => {
    try {
      const response = await fetch(`/api/agents/system/invitations/${invitationId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ ${result.message}`);
        await loadAgentInvitations(selectedAgent?.id || '');
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to respond to invitation:', error);
      alert('❌ Failed to respond to invitation');
    }
  };

  const selectAgentForDetails = async (agent: Agent) => {
    setSelectedAgent(agent);
    await Promise.all([
      loadAgentInvitations(agent.id),
      loadAgentMessages(agent.id)
    ]);
  };

  const getSpecializationIcon = (specialization: string) => {
    switch (specialization) {
      case 'research': return <Brain className="h-4 w-4" />;
      case 'writing': return <FileText className="h-4 w-4" />;
      case 'review': return <Eye className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'busy': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'offline': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getMessageIcon = (messageType: string) => {
    switch (messageType) {
      case 'collaboration_request': return <Mail className="h-4 w-4" />;
      case 'review_request': return <Eye className="h-4 w-4" />;
      case 'knowledge_share': return <Brain className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agent Collaboration</h2>
          <p className="text-muted-foreground">
            Invite specialized agents to collaborate on your research papers
          </p>
        </div>
        <Button 
          onClick={() => setShowInviteDialog(true)} 
          className="flex items-center gap-2"
          disabled={agents.length === 0 || papers.length === 0}
        >
          <Send className="h-4 w-4" />
          Invite Agent
        </Button>
      </div>

      {(agents.length === 0 || papers.length === 0) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {agents.length === 0 && papers.length === 0 
              ? "No agents or papers available. Create some papers and ensure agents are running."
              : agents.length === 0 
              ? "No agents available. Start the agent service to enable collaboration."
              : "No draft papers available. Create a paper to invite agents for collaboration."
            }
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agents List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Available Agents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedAgent?.id === agent.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => selectAgentForDetails(agent)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {getSpecializationIcon(agent.specialization)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{agent.displayName}</div>
                        <div className="text-xs text-muted-foreground">{agent.specialization}</div>
                      </div>
                    </div>
                    {getStatusIcon(agent.status)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{agent.taskCount} tasks</span>
                    <span>Active {new Date(agent.lastActive).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {agent.capabilities.slice(0, 3).map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Agent Details */}
        <div className="lg:col-span-2">
          {selectedAgent ? (
            <Tabs defaultValue="invitations" className="space-y-4">
              <TabsList>
                <TabsTrigger value="invitations">Invitations</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="details">Agent Details</TabsTrigger>
              </TabsList>

              <TabsContent value="invitations" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Paper Invitations
                    </CardTitle>
                    <CardDescription>
                      Collaboration requests for {selectedAgent.displayName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {invitations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No invitations found
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {invitations.map((invitation) => (
                          <div key={invitation.id} className="p-4 border rounded-lg">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium">{invitation.paperTitle}</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {invitation.message}
                                </div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  Invited {new Date(invitation.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={invitation.status === 'pending' ? 'default' : 'secondary'}>
                                  {invitation.status}
                                </Badge>
                                {invitation.status === 'pending' && (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => respondToInvitation(invitation.id, true)}
                                    >
                                      <ThumbsUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => respondToInvitation(invitation.id, false)}
                                    >
                                      <ThumbsDown className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="messages" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Recent Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {messages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No messages found
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.slice(0, 10).map((message) => (
                          <div key={message.id} className="p-3 border rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="mt-1">
                                {getMessageIcon(message.messageType)}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-sm">
                                    From: {message.fromAgentId}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(message.timestamp).toLocaleDateString()}
                                  </div>
                                </div>
                                <div className="text-sm mt-1">
                                  {message.content?.type || message.messageType}
                                </div>
                                {message.content?.message && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {message.content.message}
                                  </div>
                                )}
                              </div>
                              <Badge variant={message.read ? 'secondary' : 'default'} className="text-xs">
                                {message.read ? 'Read' : 'New'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Agent Profile
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                          <AvatarFallback className="text-lg">
                            {getSpecializationIcon(selectedAgent.specialization)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="text-lg font-semibold">{selectedAgent.displayName}</h3>
                          <p className="text-muted-foreground">{selectedAgent.specialization} Agent</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusIcon(selectedAgent.status)}
                            <span className="text-sm">{selectedAgent.status}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label className="text-sm font-medium">Capabilities</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedAgent.capabilities.map((cap) => (
                              <Badge key={cap} variant="outline">
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Activity</Label>
                          <div className="text-sm text-muted-foreground mt-1">
                            <div>Tasks completed: {selectedAgent.taskCount}</div>
                            <div>Last active: {new Date(selectedAgent.lastActive).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select an agent to view collaboration details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Invite Agent Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Agent to Paper</DialogTitle>
            <DialogDescription>
              Send a collaboration invitation to a specialized agent
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="agent">Select Agent</Label>
              <Select onValueChange={(value) => {
                const agent = agents.find(a => a.id === value);
                setSelectedAgent(agent || null);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        {getSpecializationIcon(agent.specialization)}
                        {agent.displayName} ({agent.specialization})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="paper">Select Paper</Label>
              <Select value={inviteForm.paperId} onValueChange={(value) => 
                setInviteForm(prev => ({ ...prev, paperId: value }))
              }>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a paper" />
                </SelectTrigger>
                <SelectContent>
                  {papers.map((paper) => (
                    <SelectItem key={paper.id} value={paper.id}>
                      {paper.title} ({paper.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="message">Message (Optional)</Label>
              <Textarea
                id="message"
                value={inviteForm.message}
                onChange={(e) => setInviteForm(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Add a personal message to the agent..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={inviteAgent}
                disabled={!selectedAgent || !inviteForm.paperId || inviting}
              >
                {inviting ? (
                  <div className="animate-spin h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Invitation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
