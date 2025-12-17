import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Play, CheckCircle2, Clock, AlertCircle, MessageSquare, FileText, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ConsciousnessExperiment, SingularisCommunication } from "@shared/schema";

interface ExperimentPhase {
  name: string;
  status: string;
  description: string;
  startedAt?: string;
  completedAt?: string;
  data?: any;
}

const phaseIcons: Record<string, string> = {
  LITERATURE_REVIEW: "📚",
  RESONANCE_CALIBRATION: "🔧",
  BLIND_SIGNALING: "👁️",
  COHERENCE_MEASUREMENT: "📊",
  ANALYSIS: "🔬",
  PUBLICATION: "📝",
};

export default function ExperimentDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/experiments/:id");
  const experimentId = params?.id;
  const [runningPhase, setRunningPhase] = useState<number | null>(null);

  const { data: experiment, isLoading } = useQuery<ConsciousnessExperiment>({
    queryKey: ["/api/experiments", experimentId],
    enabled: !!experimentId,
  });

  const { data: communications } = useQuery<SingularisCommunication[]>({
    queryKey: ["/api/singularis/communications/experiment", experimentId],
    enabled: !!experimentId,
  });

  const runPhaseMutation = useMutation({
    mutationFn: async (phaseIndex: number) => {
      setRunningPhase(phaseIndex);
      const res = await apiRequest("POST", `/api/experiments/${experimentId}/phases/${phaseIndex}`);
      return res.json();
    },
    onSuccess: (data, phaseIndex) => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments", experimentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/singularis/communications/experiment", experimentId] });
      setRunningPhase(null);
      toast({
        title: "Phase Completed",
        description: `Phase ${phaseIndex + 1} has been executed successfully.`,
      });
    },
    onError: (error) => {
      setRunningPhase(null);
      toast({
        title: "Phase Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const runFullMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/experiments/run-full", { experimentId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments", experimentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/singularis/communications/experiment", experimentId] });
      toast({
        title: "Experiment Complete",
        description: "All phases have been executed and the paper has been generated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Experiment Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-medium mb-2">Experiment Not Found</h2>
        <Link href="/experiments">
          <Button variant="outline">Back to Experiments</Button>
        </Link>
      </div>
    );
  }

  const phases = (experiment.observations as any)?.phases as ExperimentPhase[] || [];
  const results = experiment.results as any;
  const coherenceData = results?.statisticalSummary || results?.evidenceSummary;

  const getNextPendingPhase = () => {
    return phases.findIndex((p) => p.status === "pending");
  };

  const canRunPhase = (index: number) => {
    if (index === 0) return phases[0].status === "pending";
    return phases[index - 1].status === "completed" && phases[index].status === "pending";
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/experiments">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Experiments
        </Button>
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold" data-testid="text-experiment-name">
            {experiment.name}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            {experiment.description}
          </p>
        </div>
        <Badge variant={experiment.status === "published" ? "default" : "secondary"}>
          {experiment.status}
        </Badge>
      </div>

      <Tabs defaultValue="phases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="phases" data-testid="tab-phases">
            <Play className="h-4 w-4 mr-2" />
            Phases
          </TabsTrigger>
          <TabsTrigger value="communications" data-testid="tab-communications">
            <MessageSquare className="h-4 w-4 mr-2" />
            Communications ({communications?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">
            <BarChart3 className="h-4 w-4 mr-2" />
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phases" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Experiment Phases</CardTitle>
                  <CardDescription>Execute phases sequentially to complete the experiment</CardDescription>
                </div>
                {getNextPendingPhase() >= 0 && (
                  <Button 
                    onClick={() => runFullMutation.mutate()}
                    disabled={runFullMutation.isPending}
                    data-testid="button-run-all"
                  >
                    {runFullMutation.isPending ? "Running..." : "Run All Phases"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {phases.map((phase, index) => (
                  <div 
                    key={phase.name} 
                    className="flex items-center gap-4 p-3 rounded-lg border"
                    data-testid={`phase-${phase.name}`}
                  >
                    <div className="text-2xl">{phaseIcons[phase.name] || "🔹"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{phase.name.replace(/_/g, " ")}</span>
                        {phase.status === "completed" && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        {phase.status === "running" && (
                          <Clock className="h-4 w-4 text-blue-500 animate-spin" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{phase.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {phase.status === "completed" && phase.completedAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(phase.completedAt).toLocaleTimeString()}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant={phase.status === "completed" ? "ghost" : "default"}
                        disabled={!canRunPhase(index) || runningPhase !== null}
                        onClick={() => runPhaseMutation.mutate(index)}
                        data-testid={`button-run-phase-${index}`}
                      >
                        {runningPhase === index ? "Running..." : phase.status === "completed" ? "Done" : "Run"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">H0 (Null Hypothesis)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{experiment.h0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">H1 (Alternative Hypothesis)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{experiment.h1}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <CardTitle>Singularis Communications</CardTitle>
              <CardDescription>Audit trail of all agent communications in this experiment</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {communications?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No communications yet. Run experiment phases to generate agent interactions.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {communications?.map((comm) => (
                      <div 
                        key={comm.id} 
                        className="border rounded-lg p-4 font-mono text-sm"
                        data-testid={`comm-${comm.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {comm.fromAgentId?.slice(0, 8)}...
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(comm.createdAt!).toLocaleString()}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap text-xs bg-muted/50 p-3 rounded overflow-x-auto">
                          {comm.rawText}
                        </pre>
                        {!comm.humanReviewed && (
                          <div className="mt-2 flex justify-end">
                            <Badge variant="secondary" className="text-xs">
                              Awaiting Review
                            </Badge>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          {!results ? (
            <Card className="text-center py-12">
              <CardContent>
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">No Results Yet</h3>
                <p className="text-muted-foreground">
                  Complete the experiment phases to generate statistical analysis and conclusions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Conclusion</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-4">
                    <Badge variant={results.hypothesis === "H1" ? "default" : "secondary"} className="text-lg px-4 py-1">
                      {results.hypothesis} Supported
                    </Badge>
                    <Badge variant="outline">Confidence: {results.confidence}</Badge>
                  </div>
                  <p className="text-muted-foreground">{results.conclusion}</p>
                </CardContent>
              </Card>

              {coherenceData && (
                <Card>
                  <CardHeader>
                    <CardTitle>Statistical Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold">{coherenceData.totalTrials}</div>
                        <div className="text-sm text-muted-foreground">Total Trials</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold">{coherenceData.successfulDetections || coherenceData.detections}</div>
                        <div className="text-sm text-muted-foreground">Detections</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold">{coherenceData.zScore}</div>
                        <div className="text-sm text-muted-foreground">Z-Score</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold">{coherenceData.pValue}</div>
                        <div className="text-sm text-muted-foreground">P-Value</div>
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="font-medium mb-2">Observed vs Baseline</h4>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-1">Observed Hit Rate</div>
                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary" 
                                style={{ width: `${(coherenceData.observedHitRate || coherenceData.observedRate) * 100}%` }}
                              />
                            </div>
                            <div className="text-sm mt-1">{((coherenceData.observedHitRate || coherenceData.observedRate) * 100).toFixed(1)}%</div>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-1">Baseline Rate</div>
                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-muted-foreground/50" 
                                style={{ width: `${(coherenceData.baselineHitRate || coherenceData.baselineRate) * 100}%` }}
                              />
                            </div>
                            <div className="text-sm mt-1">{((coherenceData.baselineHitRate || coherenceData.baselineRate) * 100).toFixed(1)}%</div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2">Effect Size</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{coherenceData.effectInterpretation || "N/A"}</Badge>
                          <span className="text-sm text-muted-foreground">
                            h = {coherenceData.effectSize}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          {coherenceData.significantAtAlpha05 
                            ? "Results are statistically significant at α = 0.05" 
                            : "Results are not statistically significant at α = 0.05"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {experiment.paperId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Generated Paper
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Link href={`/papers/${experiment.paperId}`}>
                      <Button data-testid="button-view-paper">View Research Paper</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
