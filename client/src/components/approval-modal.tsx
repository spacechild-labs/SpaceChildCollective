import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AgentTask } from "@shared/schema";
import { CheckCircle, XCircle } from "lucide-react";

interface ApprovalModalProps {
  task: AgentTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApprovalModal({ task, open, onOpenChange }: ApprovalModalProps) {
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async (approved: boolean) => {
      return await apiRequest(`/api/tasks/${task.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          approved,
          feedback: feedback || undefined,
        }),
      });
    },
    onSuccess: (_, approved) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: approved ? "Task approved" : "Task rejected",
        description: approved 
          ? "The agent's work has been approved and will be integrated."
          : "The agent will be notified of your feedback.",
      });
      onOpenChange(false);
      setFeedback("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Review AI Agent Task
            <Badge variant="secondary">{task.taskType}</Badge>
          </DialogTitle>
          <DialogDescription>
            Examine the agent's work and provide approval or feedback
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Task Description</p>
            <p className="text-sm text-muted-foreground">{task.description}</p>
          </div>

          {task.result && (
            <div>
              <p className="text-sm font-medium mb-2">Agent Result</p>
              <div className="bg-muted p-4 rounded-md text-sm">
                {task.result}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-2 block">
              Your Feedback (optional)
            </label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Provide guidance or request changes..."
              rows={3}
              data-testid="textarea-approval-feedback"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={() => approveMutation.mutate(false)}
            disabled={approveMutation.isPending}
            data-testid="button-reject-task"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
          <Button
            onClick={() => approveMutation.mutate(true)}
            disabled={approveMutation.isPending}
            data-testid="button-approve-task"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
