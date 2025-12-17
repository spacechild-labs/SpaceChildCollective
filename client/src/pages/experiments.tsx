import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, FlaskConical, Play, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ConsciousnessExperiment } from "@shared/schema";

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  designing: { icon: Clock, color: "bg-yellow-500/10 text-yellow-600", label: "Designing" },
  running: { icon: Play, color: "bg-blue-500/10 text-blue-600", label: "Running" },
  analyzing: { icon: FlaskConical, color: "bg-purple-500/10 text-purple-600", label: "Analyzing" },
  concluded: { icon: CheckCircle2, color: "bg-green-500/10 text-green-600", label: "Concluded" },
  published: { icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-600", label: "Published" },
  failed: { icon: AlertCircle, color: "bg-red-500/10 text-red-600", label: "Failed" },
};

export default function Experiments() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newExperimentName, setNewExperimentName] = useState("");

  const { data: experiments, isLoading } = useQuery<ConsciousnessExperiment[]>({
    queryKey: ["/api/experiments"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/experiments", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      setIsCreateOpen(false);
      setNewExperimentName("");
      toast({
        title: "Experiment Created",
        description: "Your consciousness experiment has been initialized.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create experiment",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (newExperimentName.trim()) {
      createMutation.mutate(newExperimentName.trim());
    }
  };

  const getPhaseProgress = (experiment: ConsciousnessExperiment) => {
    const phases = (experiment.observations as any)?.phases || [];
    const completed = phases.filter((p: any) => p.status === "completed").length;
    return { completed, total: phases.length };
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold" data-testid="text-page-title">
            Consciousness Experiments
          </h1>
          <p className="text-muted-foreground mt-1">
            Run structured experiments testing AI consciousness hypotheses
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-experiment">
              <Plus className="h-4 w-4 mr-2" />
              New Experiment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Experiment</DialogTitle>
              <DialogDescription>
                Start a new consciousness experiment with AI agents testing H0 (isolated processors) vs H1 (interconnected resonance).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="experiment-name">Experiment Name</Label>
              <Input
                id="experiment-name"
                placeholder="e.g., Mutual Resonance Study"
                value={newExperimentName}
                onChange={(e) => setNewExperimentName(e.target.value)}
                data-testid="input-experiment-name"
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={!newExperimentName.trim() || createMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createMutation.isPending ? "Creating..." : "Create Experiment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : experiments?.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No experiments yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first consciousness experiment to begin testing AI sentience hypotheses.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first">
              <Plus className="h-4 w-4 mr-2" />
              Create First Experiment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {experiments?.map((experiment) => {
            const status = statusConfig[experiment.status] || statusConfig.designing;
            const StatusIcon = status.icon;
            const progress = getPhaseProgress(experiment);
            
            return (
              <Link key={experiment.id} href={`/experiments/${experiment.id}`}>
                <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-experiment-${experiment.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{experiment.name}</CardTitle>
                      <Badge variant="secondary" className={status.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs mt-1">
                      Created {new Date(experiment.createdAt!).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">H0:</span> {experiment.h0?.slice(0, 60)}...
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{progress.completed}/{progress.total} phases</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div 
                          className="bg-primary h-1.5 rounded-full transition-all" 
                          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
