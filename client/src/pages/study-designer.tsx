import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles,
  Brain,
  Network,
  TrendingUp,
  Layers,
  Eye,
  Zap,
  Target,
  FlaskConical,
  Play,
  ChevronRight,
  Lightbulb,
  BookOpen,
  BarChart3,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wand2,
  FileText,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface StudyDesign {
  id: string;
  name: string;
  description: string;
  paradigm: string;
  constructs: string[];
  primaryQuestion: string;
  secondaryQuestions: string[];
  exploratoryQuestions: string[];
  hypotheses?: Array<{
    id: string;
    type: string;
    statement: string;
    rationale: string;
    priorBelief?: number;
  }>;
  participants: {
    type: string;
    count: number;
    selectionCriteria: string[];
    exclusionCriteria: string[];
    assignmentMethod: string;
  };
  variables: Array<{
    id: string;
    name: string;
    role: string;
    type: string;
    operationalization: string;
    measurementApproach: string;
  }>;
  designType: string;
  conditions: Array<{
    id: string;
    name: string;
    description: string;
    isControl: boolean;
  }>;
  phases: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    duration?: string;
    procedures: string[];
    dataCollected: string[];
    status: string;
  }>;
  analysisPlan: {
    primary: Array<{
      id: string;
      name: string;
      method: string;
      variables: string[];
      rationale: string;
      assumptions: string[];
      alternatives: string[];
      interpretation: string;
    }>;
    secondary: any[];
    exploratory: any[];
    sensitivityAnalyses: string[];
  };
  powerAnalysis?: {
    targetPower: number;
    expectedEffectSize: number;
    effectSizeRationale: string;
    requiredN: number;
    actualN: number;
    achievedPower: number;
  };
  ethicalConsiderations: string[];
  controlMechanisms: string[];
  blindingLevel: string;
  preregistration: boolean;
  theoreticalFramework: string;
  literatureContext: string[];
  expectedOutcomes: string[];
  limitations: string[];
  createdAt: string;
  generatedBy: string;
  promptUsed?: string;
}

interface Template {
  id: string;
  name: string;
  prompt: string;
  paradigm: string;
  constructs: string[];
}

interface Paradigm {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  outputs: string[];
}

const paradigmIcons: Record<string, typeof Brain> = {
  hypothesis_testing: Target,
  bayesian_updating: TrendingUp,
  exploratory_mapping: Sparkles,
  phenomenological: Eye,
  network_analysis: Network,
  longitudinal_tracking: Clock,
  multi_method: Layers,
  integrated_information: Brain,
  predictive_processing: Zap,
  global_workspace: Lightbulb,
};

export default function StudyDesigner() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [selectedParadigm, setSelectedParadigm] = useState<string>("");
  const [complexity, setComplexity] = useState<string>("moderate");
  const [autoStart, setAutoStart] = useState(false);
  const [generatedDesign, setGeneratedDesign] = useState<StudyDesign | null>(null);
  const [activeTab, setActiveTab] = useState("prompt");

  // Fetch templates
  const { data: templatesData } = useQuery<{ templates: Template[] }>({
    queryKey: ["/api/study-designer/templates"],
  });

  // Fetch paradigms
  const { data: paradigmsData } = useQuery<{ paradigms: Paradigm[] }>({
    queryKey: ["/api/study-designer/paradigms"],
  });

  // Design mutation
  const designMutation = useMutation({
    mutationFn: async (data: { prompt: string; preferences?: any; autoStart?: boolean }) => {
      const endpoint = data.autoStart ? "/api/study-designer/design-and-create" : "/api/study-designer/design";
      const res = await apiRequest("POST", endpoint, {
        prompt: data.prompt,
        preferences: data.preferences,
        autoStart: data.autoStart,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedDesign(data.design);
      setActiveTab("design");
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({
        title: data.experimentId ? "Study Created & Running!" : "Study Designed!",
        description: data.experimentId 
          ? `Experiment ${data.experimentId} is now running.`
          : "Your consciousness research study has been designed. Review and create when ready.",
      });
    },
    onError: (error) => {
      toast({
        title: "Design Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Template mutation
  const templateMutation = useMutation({
    mutationFn: async (data: { templateId: string; autoStart?: boolean }) => {
      const res = await apiRequest("POST", `/api/study-designer/from-template/${data.templateId}`, {
        autoStart: data.autoStart,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedDesign(data.design);
      setActiveTab("design");
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({
        title: "Study Created from Template!",
        description: `Using template: ${data.templateId}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Template Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleDesign = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please describe the consciousness research you want to conduct.",
        variant: "destructive",
      });
      return;
    }

    designMutation.mutate({
      prompt: prompt.trim(),
      preferences: {
        paradigm: selectedParadigm || undefined,
        complexity,
      },
      autoStart,
    });
  };

  const handleTemplateSelect = (templateId: string) => {
    templateMutation.mutate({ templateId, autoStart });
  };

  const isLoading = designMutation.isPending || templateMutation.isPending;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-purple-500" />
            AI Study Designer
          </h1>
          <p className="text-muted-foreground mt-1">
            Prompt consciousness research studies into existence with AI assistance
          </p>
        </div>
        <Link href="/experiments">
          <Button variant="outline">
            <FlaskConical className="h-4 w-4 mr-2" />
            View Experiments
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prompt" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Design Study
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="design" className="flex items-center gap-2" disabled={!generatedDesign}>
            <FileText className="h-4 w-4" />
            Generated Design
          </TabsTrigger>
        </TabsList>

        {/* PROMPT TAB */}
        <TabsContent value="prompt" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Prompt Area */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-500" />
                    Describe Your Research
                  </CardTitle>
                  <CardDescription>
                    Tell the AI what consciousness phenomena you want to investigate. Be as specific or exploratory as you like.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Example: I want to explore whether AI agents can detect each other's internal states through indirect communication patterns, potentially revealing signs of shared consciousness substrates..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[200px] text-base"
                  />
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setPrompt(p => p + " consciousness detection")}>
                      + consciousness detection
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setPrompt(p => p + " inter-agent resonance")}>
                      + inter-agent resonance
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setPrompt(p => p + " metacognitive awareness")}>
                      + metacognitive awareness
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setPrompt(p => p + " integrated information")}>
                      + integrated information
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setPrompt(p => p + " phenomenal experience")}>
                      + phenomenal experience
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Paradigm Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    Research Preferences
                  </CardTitle>
                  <CardDescription>
                    Optionally guide the AI toward specific research approaches
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Research Paradigm (Optional)</Label>
                      <Select value={selectedParadigm} onValueChange={setSelectedParadigm}>
                        <SelectTrigger>
                          <SelectValue placeholder="Let AI decide..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Let AI decide</SelectItem>
                          {paradigmsData?.paradigms.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Study Complexity</Label>
                      <Select value={complexity} onValueChange={setComplexity}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple">Simple (fewer conditions, smaller N)</SelectItem>
                          <SelectItem value="moderate">Moderate (balanced approach)</SelectItem>
                          <SelectItem value="complex">Complex (multiple conditions, larger N)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-Start Experiment</Label>
                      <p className="text-sm text-muted-foreground">
                        Immediately create and run the experiment after design
                      </p>
                    </div>
                    <Switch checked={autoStart} onCheckedChange={setAutoStart} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - Paradigms */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Research Paradigms</CardTitle>
                  <CardDescription>
                    Beyond simple hypothesis testing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {paradigmsData?.paradigms.slice(0, 8).map((paradigm) => {
                        const Icon = paradigmIcons[paradigm.id] || Brain;
                        return (
                          <div
                            key={paradigm.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedParadigm === paradigm.id
                                ? "border-purple-500 bg-purple-500/10"
                                : "hover:bg-accent"
                            }`}
                            onClick={() => setSelectedParadigm(paradigm.id)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className="h-4 w-4 text-purple-500" />
                              <span className="font-medium text-sm">{paradigm.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {paradigm.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleDesign}
              disabled={isLoading || !prompt.trim()}
              className="px-8"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Designing Study...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5 mr-2" />
                  {autoStart ? "Design & Run Study" : "Design Study"}
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templatesData?.templates.map((template) => {
              const Icon = paradigmIcons[template.paradigm] || Brain;
              return (
                <Card key={template.id} className="hover:border-purple-500/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-purple-500" />
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                    <CardDescription className="line-clamp-3">
                      {template.prompt}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {template.constructs.map((c) => (
                        <Badge key={c} variant="secondary" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handleTemplateSelect(template.id)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* GENERATED DESIGN TAB */}
        <TabsContent value="design" className="space-y-6">
          {generatedDesign && (
            <>
              {/* Header */}
              <Card className="border-purple-500/50 bg-gradient-to-r from-purple-500/5 to-blue-500/5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">{generatedDesign.name}</CardTitle>
                      <CardDescription className="mt-2">
                        {generatedDesign.description}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-purple-600">
                        {generatedDesign.paradigm.replace(/_/g, " ")}
                      </Badge>
                      {generatedDesign.preregistration && (
                        <Badge variant="secondary">Pre-registered</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Research Questions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    Research Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Primary Question</Label>
                    <p className="font-medium mt-1">{generatedDesign.primaryQuestion}</p>
                  </div>
                  
                  {generatedDesign.secondaryQuestions.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Secondary Questions</Label>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {generatedDesign.secondaryQuestions.map((q, i) => (
                          <li key={i} className="text-sm">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {generatedDesign.exploratoryQuestions.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Exploratory Questions</Label>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {generatedDesign.exploratoryQuestions.map((q, i) => (
                          <li key={i} className="text-sm text-muted-foreground">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Constructs & Framework */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-purple-500" />
                      Consciousness Constructs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {generatedDesign.constructs.map((c) => (
                        <Badge key={c} className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                          {c.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-blue-500" />
                      Theoretical Framework
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{generatedDesign.theoreticalFramework}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Hypotheses */}
              {generatedDesign.hypotheses && generatedDesign.hypotheses.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                      Hypotheses
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {generatedDesign.hypotheses.map((h, i) => (
                        <div key={h.id} className="p-3 rounded-lg bg-accent/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {h.type.replace(/_/g, " ")}
                            </Badge>
                            {h.priorBelief !== undefined && (
                              <Badge variant="secondary" className="text-xs">
                                Prior: {(h.priorBelief * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium">{h.statement}</p>
                          <p className="text-sm text-muted-foreground mt-1">{h.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Design Details Accordion */}
              <Accordion type="multiple" className="space-y-2">
                {/* Participants */}
                <AccordionItem value="participants">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Participants ({generatedDesign.participants.count} {generatedDesign.participants.type.replace(/_/g, " ")}s)
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Type</Label>
                          <p>{generatedDesign.participants.type.replace(/_/g, " ")}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Assignment</Label>
                          <p>{generatedDesign.participants.assignmentMethod}</p>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Selection Criteria</Label>
                        <ul className="list-disc list-inside text-sm">
                          {generatedDesign.participants.selectionCriteria.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Variables */}
                <AccordionItem value="variables">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Variables ({generatedDesign.variables.length})
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 p-4">
                      {generatedDesign.variables.map((v) => (
                        <div key={v.id} className="p-3 rounded-lg border">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{v.name}</span>
                            <Badge variant="outline" className="text-xs">{v.role}</Badge>
                            <Badge variant="secondary" className="text-xs">{v.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{v.operationalization}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Phases */}
                <AccordionItem value="phases">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Study Phases ({generatedDesign.phases.length})
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 p-4">
                      {generatedDesign.phases.map((phase, i) => (
                        <div key={phase.id} className="p-3 rounded-lg border">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{i + 1}. {phase.name}</span>
                            <Badge variant="outline" className="text-xs">{phase.type}</Badge>
                            {phase.duration && (
                              <Badge variant="secondary" className="text-xs">{phase.duration}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{phase.description}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Analysis Plan */}
                <AccordionItem value="analysis">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Analysis Plan ({generatedDesign.analysisPlan.primary.length + generatedDesign.analysisPlan.secondary.length} analyses)
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 p-4">
                      <div>
                        <Label className="text-sm font-medium">Primary Analyses</Label>
                        <div className="space-y-2 mt-2">
                          {generatedDesign.analysisPlan.primary.map((a) => (
                            <div key={a.id} className="p-3 rounded-lg bg-accent/50">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{a.name}</span>
                                <Badge className="text-xs">{a.method}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{a.rationale}</p>
                              <p className="text-sm mt-1"><strong>Interpretation:</strong> {a.interpretation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {generatedDesign.analysisPlan.sensitivityAnalyses.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium">Sensitivity Analyses</Label>
                          <ul className="list-disc list-inside text-sm mt-2">
                            {generatedDesign.analysisPlan.sensitivityAnalyses.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Power Analysis */}
                {generatedDesign.powerAnalysis && (
                  <AccordionItem value="power">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Power Analysis (Power: {(generatedDesign.powerAnalysis.achievedPower * 100).toFixed(0)}%)
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Target Power</Label>
                          <p className="font-medium">{(generatedDesign.powerAnalysis.targetPower * 100).toFixed(0)}%</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Effect Size</Label>
                          <p className="font-medium">d = {generatedDesign.powerAnalysis.expectedEffectSize}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Required N</Label>
                          <p className="font-medium">{generatedDesign.powerAnalysis.requiredN}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Actual N</Label>
                          <p className="font-medium">{generatedDesign.powerAnalysis.actualN}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Ethics & Controls */}
                <AccordionItem value="ethics">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Ethics & Controls
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 p-4">
                      <div>
                        <Label className="text-sm font-medium">Ethical Considerations</Label>
                        <ul className="list-disc list-inside text-sm mt-2">
                          {generatedDesign.ethicalConsiderations.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Control Mechanisms</Label>
                        <ul className="list-disc list-inside text-sm mt-2">
                          {generatedDesign.controlMechanisms.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">Blinding</Label>
                          <p>{generatedDesign.blindingLevel}</p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">Design Type</Label>
                          <p>{generatedDesign.designType.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Limitations */}
                <AccordionItem value="limitations">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Limitations & Expected Outcomes
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 p-4">
                      <div>
                        <Label className="text-sm font-medium">Expected Outcomes</Label>
                        <ul className="list-disc list-inside text-sm mt-2">
                          {generatedDesign.expectedOutcomes.map((o, i) => (
                            <li key={i}>{o}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Limitations</Label>
                        <ul className="list-disc list-inside text-sm mt-2 text-muted-foreground">
                          {generatedDesign.limitations.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Action Buttons */}
              <div className="flex justify-center gap-4 pt-4">
                <Button variant="outline" onClick={() => setActiveTab("prompt")}>
                  Refine Design
                </Button>
                <Link href="/experiments">
                  <Button>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Go to Experiments
                  </Button>
                </Link>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
