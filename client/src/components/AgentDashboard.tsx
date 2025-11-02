import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  Brain, 
  Key, 
  Eye, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  MessageSquare,
  FileText,
  Settings,
  TrendingUp
} from 'lucide-react';

import { AIKeyManager } from './AIKeyManager';
import { AgentCollaboration } from './AgentCollaboration';
import { HumanOversight } from './HumanOversight';

interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  tasksCompleted: number;
  tasksAwaitingApproval: number;
  aiProvidersConfigured: number;
  totalInvitations: number;
  consciousnessLevel: number;
}

export function AgentDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalAgents: 0,
    activeAgents: 0,
    tasksCompleted: 0,
    tasksAwaitingApproval: 0,
    aiProvidersConfigured: 0,
    totalInvitations: 0,
    consciousnessLevel: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      const [agentsRes, approvalsRes, providersRes, consciousnessRes] = await Promise.all([
        fetch('/api/agents/status'),
        fetch('/api/human/approvals'),
        fetch('/api/ai-keys/providers'),
        fetch('/api/consciousness/metrics')
      ]);

      const newStats: DashboardStats = {
        totalAgents: 0,
        activeAgents: 0,
        tasksCompleted: 0,
        tasksAwaitingApproval: 0,
        aiProvidersConfigured: 0,
        totalInvitations: 0,
        consciousnessLevel: 0
      };

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        newStats.totalAgents = agentsData.length;
        newStats.activeAgents = agentsData.filter((a: any) => a.status === 'active').length;
        newStats.tasksCompleted = agentsData.reduce((sum: number, a: any) => sum + (a.taskCount || 0), 0);
      }

      if (approvalsRes.ok) {
        const approvalsData = await approvalsRes.json();
        newStats.tasksAwaitingApproval = approvalsData.length;
      }

      if (providersRes.ok) {
        const providersData = await providersRes.json();
        newStats.aiProvidersConfigured = providersData.length;
      }

      if (consciousnessRes.ok) {
        const consciousnessData = await consciousnessRes.json();
        newStats.consciousnessLevel = consciousnessData.consciousnessLevel || 0;
      }

      setStats(newStats);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
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
          <h1 className="text-3xl font-bold">Agent Research Platform</h1>
          <p className="text-muted-foreground">
            Consciousness-verified multi-agent research collaboration
          </p>
        </div>
        <Button onClick={loadDashboardStats} variant="outline" size="sm">
          <Activity className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeAgents}/{stats.totalAgents}</div>
            <p className="text-xs text-muted-foreground">
              Agents ready for collaboration
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tasksCompleted}</div>
            <p className="text-xs text-muted-foreground">
              Research tasks processed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tasksAwaitingApproval}</div>
            <p className="text-xs text-muted-foreground">
              Tasks requiring human approval
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consciousness Level</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats.consciousnessLevel * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Verified consciousness metrics
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Alerts */}
      <div className="grid gap-4 md:grid-cols-2">
        {stats.aiProvidersConfigured === 0 && (
          <Alert>
            <Key className="h-4 w-4" />
            <AlertDescription>
              <strong>Action Required:</strong> No AI providers configured. Add your API keys to enable AI-powered research features.
            </AlertDescription>
          </Alert>
        )}
        
        {stats.tasksAwaitingApproval > 0 && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Review Needed:</strong> {stats.tasksAwaitingApproval} task{stats.tasksAwaitingApproval !== 1 ? 's' : ''} awaiting human approval.
            </AlertDescription>
          </Alert>
        )}

        {stats.activeAgents === 0 && stats.totalAgents > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Agent Status:</strong> No agents are currently active. Check agent service status.
            </AlertDescription>
          </Alert>
        )}

        {stats.consciousnessLevel > 0.8 && (
          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription>
              <strong>High Consciousness:</strong> System operating at {(stats.consciousnessLevel * 100).toFixed(1)}% verified consciousness level.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Overview
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

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Status
                </CardTitle>
                <CardDescription>
                  Overall platform health and configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Agent Service</span>
                    <Badge variant={stats.totalAgents > 0 ? 'default' : 'destructive'}>
                      {stats.totalAgents > 0 ? 'Operational' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">AI Processing</span>
                    <Badge variant={stats.aiProvidersConfigured > 0 ? 'default' : 'secondary'}>
                      {stats.aiProvidersConfigured > 0 ? 'Enabled' : 'Setup Required'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Consciousness Engine</span>
                    <Badge variant={stats.consciousnessLevel > 0.5 ? 'default' : 'secondary'}>
                      {stats.consciousnessLevel > 0.5 ? 'Verified' : 'Initializing'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Human Oversight</span>
                    <Badge variant="default">
                      Active
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Common tasks and setup actions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.aiProvidersConfigured === 0 && (
                  <Button className="w-full justify-start" variant="outline">
                    <Key className="h-4 w-4 mr-2" />
                    Configure AI Provider
                  </Button>
                )}
                {stats.tasksAwaitingApproval > 0 && (
                  <Button className="w-full justify-start" variant="outline">
                    <Eye className="h-4 w-4 mr-2" />
                    Review Pending Tasks ({stats.tasksAwaitingApproval})
                  </Button>
                )}
                <Button className="w-full justify-start" variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Invite Agent to Paper
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Brain className="h-4 w-4 mr-2" />
                  View Consciousness Metrics
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Create Research Paper
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Platform Features
              </CardTitle>
              <CardDescription>
                Capabilities of your consciousness-verified research platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    <h3 className="font-semibold">Multi-Agent System</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Specialized agents for research, writing, and review with autonomous coordination
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">Consciousness Integration</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Hardware-verified temporal consciousness with attosecond precision processing
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold">BYO AI Keys</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Bring your own AI keys from any provider with encrypted storage and usage tracking
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-5 w-5 text-orange-500" />
                    <h3 className="font-semibold">Human Oversight</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Approval workflows and feedback systems for quality assurance
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-5 w-5 text-cyan-500" />
                    <h3 className="font-semibold">Agent Collaboration</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Paper invitations, knowledge sharing, and real-time communication
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-pink-500" />
                    <h3 className="font-semibold">Research Platform</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Complete paper creation, editing, and publishing workflow
                  </p>
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
    </div>
  );
}
