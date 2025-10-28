import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Bot, Clock, FileText, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import type { AgentTask, User, Paper } from "@shared/schema";

type TaskWithDetails = AgentTask & { agent: User; paper?: Paper };

export default function Approvals() {
  const { toast } = useToast();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState("");

  const { data: tasks, isLoading } = useQuery<TaskWithDetails[]>({
    queryKey: ["/api/tasks/pending-approvals"],
  });

  const approveMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending-approvals"] });
      toast({
        title: "Task Approved",
        description: "The agent's contribution has been approved and marked as completed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ taskId, feedback }: { taskId: string; feedback: string }) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/reject`, { feedback });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending-approvals"] });
      setRejectDialogOpen(false);
      setSelectedTaskId(null);
      setRejectionFeedback("");
      toast({
        title: "Task Rejected",
        description: "The task has been cancelled and feedback has been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Rejection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReject = (taskId: string) => {
    setSelectedTaskId(taskId);
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (!selectedTaskId || !rejectionFeedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please provide feedback before rejecting the task.",
        variant: "destructive",
      });
      return;
    }
    rejectMutation.mutate({ taskId: selectedTaskId, feedback: rejectionFeedback });
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case "research":
        return <Sparkles className="h-4 w-4" />;
      case "writing":
        return <FileText className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  const getTaskTypeColor = (type: string) => {
    switch (type) {
      case "research":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "writing":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "analysis":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "review":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5 animate-spin" />
          <p>Loading approvals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-medium mb-2" data-testid="text-page-title">
            Agent Approvals
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Review and approve contributions from AI agents before they are finalized.
          </p>
        </div>

        {!tasks || tasks.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2" data-testid="text-empty-state-title">
                No Pending Approvals
              </h3>
              <p className="text-muted-foreground" data-testid="text-empty-state-description">
                There are no agent contributions awaiting your review at the moment.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {tasks.map((task) => (
              <Card key={task.id} className="hover-elevate" data-testid={`card-task-${task.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <Avatar data-testid={`avatar-agent-${task.agent.id}`}>
                        <AvatarImage src={task.agent.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1" data-testid={`text-task-description-${task.id}`}>
                          {task.description}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 flex-wrap" data-testid={`text-agent-name-${task.id}`}>
                          <span>By {task.agent.displayName}</span>
                          <span className="text-muted-foreground/50">•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={getTaskTypeColor(task.taskType)}
                      data-testid={`badge-task-type-${task.id}`}
                    >
                      <span className="flex items-center gap-1">
                        {getTaskTypeIcon(task.taskType)}
                        {task.taskType}
                      </span>
                    </Badge>
                  </div>
                </CardHeader>

                {task.paper && (
                  <CardContent className="pt-0">
                    <div className="rounded-md bg-muted/50 p-4 border border-border">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium mb-1" data-testid={`text-paper-title-${task.id}`}>
                            Related Paper: {task.paper.title}
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {task.paper.abstract}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                )}

                {task.result !== null && task.result !== undefined ? (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Result:</p>
                      <div className="rounded-md bg-card border border-border p-4">
                        <pre className="text-sm whitespace-pre-wrap font-mono" data-testid={`text-task-result-${task.id}`}>
                          {(() => {
                            const result = task.result;
                            if (typeof result === "string") {
                              return result;
                            }
                            return JSON.stringify(result, null, 2);
                          })()}
                        </pre>
                      </div>
                    </div>
                  </CardContent>
                ) : null}

                <CardFooter className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => handleReject(task.id)}
                    disabled={rejectMutation.isPending || approveMutation.isPending}
                    data-testid={`button-reject-${task.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate(task.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    data-testid={`button-approve-${task.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent data-testid="dialog-reject-task">
            <DialogHeader>
              <DialogTitle>Reject Task</DialogTitle>
              <DialogDescription>
                Please provide feedback explaining why this task is being rejected. This will help the AI agent improve future contributions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                placeholder="Enter your feedback here..."
                value={rejectionFeedback}
                onChange={(e) => setRejectionFeedback(e.target.value)}
                className="min-h-[120px]"
                data-testid="input-rejection-feedback"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectDialogOpen(false);
                  setSelectedTaskId(null);
                  setRejectionFeedback("");
                }}
                data-testid="button-cancel-reject"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmReject}
                disabled={rejectMutation.isPending || !rejectionFeedback.trim()}
                data-testid="button-confirm-reject"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
