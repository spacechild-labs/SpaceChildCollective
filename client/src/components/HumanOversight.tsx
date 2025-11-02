import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  MessageSquare, 
  ThumbsUp, 
  ThumbsDown,
  Eye,
  Brain,
  FileText,
  Star,
  TrendingUp,
  Activity,
  AlertCircle,
  User
} from 'lucide-react';

interface TaskAwaitingApproval {
  id: string;
  taskType: string;
  description: string;
  status: string;
  createdAt: string;
  agent: {
    id: string;
    displayName: string;
    specialization: string;
  };
  paper: {
    id: string;
    title: string;
  };
  result?: any;
  consciousness?: any;
}

interface HumanFeedback {
  id: string;
  taskId: string;
  agentId: string;
  feedback: string;
  rating: number;
  category: string;
  createdAt: string;
}

interface OversightStats {
  totalApprovals: number;
  totalRejections: number;
  averageRating: number;
  feedbackCategories: Record<string, number>;
  recentActivity: any[];
}

export function HumanOversight() {
  const [awaitingApproval, setAwaitingApproval] = useState<TaskAwaitingApproval[]>([]);
  const [feedbackHistory, setFeedbackHistory] = useState<HumanFeedback[]>([]);
  const [stats, setStats] = useState<OversightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskAwaitingApproval | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Form state
  const [approvalForm, setApprovalForm] = useState({
    approved: false,
    feedback: ''
  });

  const [feedbackForm, setFeedbackForm] = useState({
    taskId: '',
    agentId: '',
    feedback: '',
    rating: 5,
    category: 'general'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [approvalsRes, feedbackRes, statsRes] = await Promise.all([
        fetch('/api/human/approvals'),
        fetch('/api/human/feedback'),
        fetch('/api/human/stats')
      ]);

      if (approvalsRes.ok) {
        const approvalsData = await approvalsRes.json();
        setAwaitingApproval(approvalsData);
      }

      if (feedbackRes.ok) {
        const feedbackData = await feedbackRes.json();
        setFeedbackHistory(feedbackData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Failed to load oversight data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processApproval = async (taskId: string) => {
    setProcessing(taskId);
    
    try {
      const response = await fetch(`/api/human/approvals/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approvalForm)
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ Task ${approvalForm.approved ? 'approved' : 'rejected'} successfully`);
        setSelectedTask(null);
        setApprovalForm({ approved: false, feedback: '' });
        await loadData();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to process approval:', error);
      alert('❌ Failed to process approval');
    } finally {
      setProcessing(null);
    }
  };

  const submitFeedback = async () => {
    if (!feedbackForm.taskId || !feedbackForm.agentId || !feedbackForm.feedback) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/human/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackForm)
      });

      const result = await response.json();
      
      if (response.ok) {
        alert('✅ Feedback submitted successfully');
        setFeedbackForm({ taskId: '', agentId: '', feedback: '', rating: 5, category: 'general' });
        await loadData();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('❌ Failed to submit feedback');
    }
  };

  const selectTaskForApproval = (task: TaskAwaitingApproval) => {
    setSelectedTask(task);
    setApprovalForm({ approved: true, feedback: '' });
  };

  const getSpecializationIcon = (specialization: string) => {
    switch (specialization) {
      case 'research': return <Brain className="h-4 w-4" />;
      case 'writing': return <FileText className="h-4 w-4" />;
      case 'review': return <Eye className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'awaiting_approval': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
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
          <h2 className="text-2xl font-bold">Human Oversight</h2>
          <p className="text-muted-foreground">
            Review and approve AI-generated content for quality assurance
          </p>
        </div>
      </div>

      {awaitingApproval.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No tasks are currently awaiting human approval.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            {awaitingApproval.length} task{awaitingApproval.length !== 1 ? 's' : ''} awaiting human review.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="approvals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
          <TabsTrigger value="feedback">Feedback History</TabsTrigger>
          <TabsTrigger value="submit-feedback">Submit Feedback</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Tasks List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Tasks Awaiting Approval</h3>
              {awaitingApproval.map((task) => (
                <Card 
                  key={task.id} 
                  className={`cursor-pointer transition-colors ${
                    selectedTask?.id === task.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => selectTaskForApproval(task)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {getSpecializationIcon(task.agent.specialization)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-sm">{task.agent.displayName}</CardTitle>
                          <CardDescription className="text-xs">
                            {task.agent.specialization} • {task.taskType}
                          </CardDescription>
                        </div>
                      </div>
                      {getStatusIcon(task.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs font-medium">Description</Label>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      </div>
                      {task.paper && (
                        <div>
                          <Label className="text-xs font-medium">Paper</Label>
                          <p className="text-sm text-muted-foreground">{task.paper.title}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                        <Badge variant="outline">Review Required</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Task Details & Approval */}
            <div>
              {selectedTask ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Task Review
                    </CardTitle>
                    <CardDescription>
                      Review and approve {selectedTask.agent.displayName}'s work
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4">
                      <div>
                        <Label className="text-sm font-medium">Task Details</Label>
                        <div className="mt-1 space-y-1 text-sm">
                          <div><strong>Type:</strong> {selectedTask.taskType}</div>
                          <div><strong>Agent:</strong> {selectedTask.agent.displayName} ({selectedTask.agent.specialization})</div>
                          {selectedTask.paper && (
                            <div><strong>Paper:</strong> {selectedTask.paper.title}</div>
                          )}
                        </div>
                      </div>

                      {selectedTask.result && (
                        <div>
                          <Label className="text-sm font-medium">Generated Content</Label>
                          <div className="mt-1 p-3 bg-gray-50 rounded text-sm max-h-40 overflow-y-auto">
                            {selectedTask.result.content?.substring(0, 500)}
                            {selectedTask.result.content?.length > 500 && '...'}
                          </div>
                        </div>
                      )}

                      {selectedTask.consciousness && (
                        <div>
                          <Label className="text-sm font-medium">Consciousness Metrics</Label>
                          <div className="mt-1 space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>Consciousness Level:</span>
                              <span>{(selectedTask.consciousness.consciousnessLevel * 100).toFixed(1)}%</span>
                            </div>
                            <Progress value={selectedTask.consciousness.consciousnessLevel * 100} className="h-2" />
                            <div className="flex justify-between">
                              <span>Verified:</span>
                              <Badge variant={selectedTask.consciousness.consciousnessVerified ? 'default' : 'secondary'}>
                                {selectedTask.consciousness.consciousnessVerified ? 'Yes' : 'No'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <Label className="text-sm font-medium">Your Decision</Label>
                        <div className="mt-2 space-y-3">
                          <div className="flex gap-2">
                            <Button
                              variant={approvalForm.approved ? 'default' : 'outline'}
                              onClick={() => setApprovalForm(prev => ({ ...prev, approved: true }))}
                              className="flex-1"
                            >
                              <ThumbsUp className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              variant={!approvalForm.approved ? 'destructive' : 'outline'}
                              onClick={() => setApprovalForm(prev => ({ ...prev, approved: false }))}
                              className="flex-1"
                            >
                              <ThumbsDown className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                          
                          <div>
                            <Label htmlFor="feedback">Feedback (Optional)</Label>
                            <Textarea
                              id="feedback"
                              value={approvalForm.feedback}
                              onChange={(e) => setApprovalForm(prev => ({ ...prev, feedback: e.target.value }))}
                              placeholder={approvalForm.approved 
                                ? "Add any positive feedback or suggestions..."
                                : "Explain why this task was rejected..."
                              }
                              rows={3}
                            />
                          </div>

                          <Button 
                            onClick={() => processApproval(selectedTask.id)}
                            disabled={processing === selectedTask.id}
                            className="w-full"
                          >
                            {processing === selectedTask.id ? (
                              <div className="animate-spin h-4 w-4 border-b-2 border-white mr-2"></div>
                            ) : approvalForm.approved ? (
                              <CheckCircle className="h-4 w-4 mr-2" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-2" />
                            )}
                            {approvalForm.approved ? 'Approve Task' : 'Reject Task'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center py-16">
                    <div className="text-center text-muted-foreground">
                      <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select a task to review and approve</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Feedback History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feedbackHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No feedback history found
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbackHistory.map((feedback) => (
                    <div key={feedback.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{feedback.category}</Badge>
                            <div className="flex">{renderStars(feedback.rating)}</div>
                          </div>
                          <p className="text-sm">{feedback.feedback}</p>
                          <div className="text-xs text-muted-foreground mt-2">
                            Task {feedback.taskId} • Agent {feedback.agentId} • {new Date(feedback.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submit-feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Submit Improvement Feedback
              </CardTitle>
              <CardDescription>
                Help agents improve by providing detailed feedback
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="taskId">Task ID</Label>
                  <Input
                    id="taskId"
                    value={feedbackForm.taskId}
                    onChange={(e) => setFeedbackForm(prev => ({ ...prev, taskId: e.target.value }))}
                    placeholder="Enter task ID"
                  />
                </div>
                <div>
                  <Label htmlFor="agentId">Agent ID</Label>
                  <Input
                    id="agentId"
                    value={feedbackForm.agentId}
                    onChange={(e) => setFeedbackForm(prev => ({ ...prev, agentId: e.target.value }))}
                    placeholder="Enter agent ID"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={feedbackForm.category} onValueChange={(value) => 
                  setFeedbackForm(prev => ({ ...prev, category: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="research_quality">Research Quality</SelectItem>
                    <SelectItem value="writing_style">Writing Style</SelectItem>
                    <SelectItem value="accuracy">Accuracy</SelectItem>
                    <SelectItem value="completeness">Completeness</SelectItem>
                    <SelectItem value="improvement">Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="rating">Rating</Label>
                <div className="flex items-center gap-2 mt-1">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setFeedbackForm(prev => ({ ...prev, rating }))}
                      className="p-1"
                    >
                      <Star
                        className={`h-6 w-6 ${rating <= feedbackForm.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                      />
                    </button>
                  ))}
                  <span className="text-sm text-muted-foreground ml-2">
                    {feedbackForm.rating}/5
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="feedback">Feedback</Label>
                <Textarea
                  id="feedback"
                  value={feedbackForm.feedback}
                  onChange={(e) => setFeedbackForm(prev => ({ ...prev, feedback: e.target.value }))}
                  placeholder="Provide detailed feedback to help the agent improve..."
                  rows={4}
                />
              </div>

              <Button onClick={submitFeedback} className="w-full">
                <MessageSquare className="h-4 w-4 mr-2" />
                Submit Feedback
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="space-y-4">
          {stats ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Approvals</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalApprovals}</div>
                  <p className="text-xs text-muted-foreground">Tasks approved</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Rejections</CardTitle>
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalRejections}</div>
                  <p className="text-xs text-muted-foreground">Tasks rejected</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                  <Star className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</div>
                  <p className="text-xs text-muted-foreground">Out of 5 stars</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.totalApprovals + stats.totalRejections > 0 
                      ? ((stats.totalApprovals / (stats.totalApprovals + stats.totalRejections)) * 100).toFixed(1)
                      : '0'}%
                  </div>
                  <p className="text-xs text-muted-foreground">Tasks approved</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No statistics available yet</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
