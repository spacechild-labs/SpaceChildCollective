import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BarChart3, Calculator, Upload, Play, Download, Info, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface StatMethod {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface DescriptivesResult {
  [key: string]: {
    n: number;
    missing: number;
    mean?: number;
    sd?: number;
    median?: number;
    min?: number;
    max?: number;
    skewness?: number | null;
    kurtosis?: number | null;
    type?: string;
    levels?: number;
    frequencies?: Record<string, number>;
  };
}

interface AnalysisResult {
  apaReport?: {
    title: string;
    sections: Array<{ heading: string; content: string }>;
  };
  machineReport?: any;
  recommendations?: any;
  diagnostics?: any;
}

const categoryColors: Record<string, string> = {
  Inferential: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  Psychometrics: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  Regression: "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400",
  Advanced: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
  "Non-parametric": "bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
  Other: "bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400",
};

const sampleData = `participant,condition,score,age
1,control,72,25
2,control,68,28
3,control,75,22
4,control,70,30
5,treatment,85,26
6,treatment,88,24
7,treatment,82,29
8,treatment,90,27
9,treatment,86,25
10,control,71,31`;

export default function Statistics() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("methods");
  const [dataInput, setDataInput] = useState(sampleData);
  const [outcome, setOutcome] = useState("score");
  const [predictor, setPredictor] = useState("condition");
  const [analysisMode, setAnalysisMode] = useState<"exploratory" | "confirmatory">("exploratory");
  const [descriptivesResult, setDescriptivesResult] = useState<DescriptivesResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [openCategories, setOpenCategories] = useState<string[]>(["Inferential"]);

  const { data: methodsData, isLoading: methodsLoading } = useQuery<{ methods: StatMethod[]; count: number }>({
    queryKey: ["/api/statistics/methods"],
  });

  const parseCSV = (csv: string): Record<string, any>[] => {
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(",").map(v => v.trim());
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        const val = values[i];
        row[h] = isNaN(Number(val)) ? val : Number(val);
      });
      return row;
    });
  };

  const descriptivesMutation = useMutation({
    mutationFn: async () => {
      const data = parseCSV(dataInput);
      const res = await apiRequest("POST", "/api/statistics/descriptives", { data });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        setDescriptivesResult(result.descriptives);
        toast({
          title: "Descriptives Computed",
          description: `Analyzed ${result.sampleSize} observations`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const data = parseCSV(dataInput);
      const res = await apiRequest("POST", "/api/statistics/quick-analyze", {
        data,
        outcome,
        predictor,
        mode: analysisMode,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        setAnalysisResult(result.result);
        setActiveTab("results");
        toast({
          title: "Analysis Complete",
          description: "View your results in the Results tab",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const groupedMethods = methodsData?.methods.reduce((acc, method) => {
    if (!acc[method.category]) acc[method.category] = [];
    acc[method.category].push(method);
    return acc;
  }, {} as Record<string, StatMethod[]>) || {};

  const toggleCategory = (category: string) => {
    setOpenCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const dataColumns = dataInput.trim().split("\n")[0]?.split(",").map(h => h.trim()) || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold" data-testid="text-page-title">
            Statistics Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive statistical analysis for consciousness research
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Calculator className="h-3 w-3" />
          {methodsData?.count || 0} Methods Available
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="methods" data-testid="tab-methods">
            <BarChart3 className="h-4 w-4 mr-2" />
            Methods
          </TabsTrigger>
          <TabsTrigger value="analyze" data-testid="tab-analyze">
            <Play className="h-4 w-4 mr-2" />
            Analyze
          </TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">
            <Download className="h-4 w-4 mr-2" />
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="methods" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Statistical Methods</CardTitle>
              <CardDescription>
                Browse the full catalog of analysis methods organized by category
              </CardDescription>
            </CardHeader>
            <CardContent>
              {methodsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(groupedMethods).map(([category, methods]) => (
                    <Collapsible
                      key={category}
                      open={openCategories.includes(category)}
                      onOpenChange={() => toggleCategory(category)}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between hover-elevate"
                          data-testid={`button-category-${category.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge className={categoryColors[category] || categoryColors.Other}>
                              {category}
                            </Badge>
                            <span className="text-muted-foreground text-sm">
                              {methods.length} methods
                            </span>
                          </div>
                          {openCategories.includes(category) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 pt-2 space-y-2">
                        {methods.map(method => (
                          <div
                            key={method.id}
                            className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                            data-testid={`method-${method.id}`}
                          >
                            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium text-sm">{method.name}</p>
                              <p className="text-xs text-muted-foreground">{method.description}</p>
                            </div>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analyze" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Data Input
                </CardTitle>
                <CardDescription>
                  Paste CSV data or use the sample dataset below
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="data-input">CSV Data</Label>
                  <Textarea
                    id="data-input"
                    className="mt-2 font-mono text-xs min-h-[200px]"
                    value={dataInput}
                    onChange={(e) => setDataInput(e.target.value)}
                    placeholder="participant,condition,score,age..."
                    data-testid="input-csv-data"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => descriptivesMutation.mutate()}
                  disabled={descriptivesMutation.isPending}
                  data-testid="button-compute-descriptives"
                >
                  {descriptivesMutation.isPending ? "Computing..." : "Compute Descriptives"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Quick Analysis
                </CardTitle>
                <CardDescription>
                  Run an automated analysis with recommended methods
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Outcome Variable</Label>
                    <Select value={outcome} onValueChange={setOutcome}>
                      <SelectTrigger className="mt-2" data-testid="select-outcome">
                        <SelectValue placeholder="Select outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        {dataColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Predictor Variable</Label>
                    <Select value={predictor} onValueChange={setPredictor}>
                      <SelectTrigger className="mt-2" data-testid="select-predictor">
                        <SelectValue placeholder="Select predictor" />
                      </SelectTrigger>
                      <SelectContent>
                        {dataColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Analysis Mode</Label>
                  <Select value={analysisMode} onValueChange={(v) => setAnalysisMode(v as any)}>
                    <SelectTrigger className="mt-2" data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exploratory">Exploratory</SelectItem>
                      <SelectItem value="confirmatory">Confirmatory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => analysisMutation.mutate()}
                  disabled={analysisMutation.isPending || !outcome || !predictor}
                  className="w-full"
                  data-testid="button-run-analysis"
                >
                  {analysisMutation.isPending ? "Analyzing..." : "Run Analysis"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {descriptivesResult && (
            <Card>
              <CardHeader>
                <CardTitle>Descriptive Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Variable</th>
                        <th className="text-right p-2 font-medium">N</th>
                        <th className="text-right p-2 font-medium">Missing</th>
                        <th className="text-right p-2 font-medium">Mean</th>
                        <th className="text-right p-2 font-medium">SD</th>
                        <th className="text-right p-2 font-medium">Median</th>
                        <th className="text-right p-2 font-medium">Min</th>
                        <th className="text-right p-2 font-medium">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(descriptivesResult).map(([varName, stats]) => (
                        <tr key={varName} className="border-b" data-testid={`row-descriptive-${varName}`}>
                          <td className="p-2 font-medium">{varName}</td>
                          <td className="p-2 text-right">{stats.n}</td>
                          <td className="p-2 text-right">{stats.missing}</td>
                          <td className="p-2 text-right">
                            {stats.mean !== undefined ? stats.mean.toFixed(2) : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {stats.sd !== undefined ? stats.sd.toFixed(2) : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {stats.median !== undefined ? stats.median.toFixed(2) : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {stats.min !== undefined ? stats.min.toFixed(2) : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {stats.max !== undefined ? stats.max.toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {analysisResult ? (
            <>
              {analysisResult.apaReport && (
                <Card>
                  <CardHeader>
                    <CardTitle>{analysisResult.apaReport.title || "Analysis Report"}</CardTitle>
                    <CardDescription>APA-style statistical report</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {Array.isArray(analysisResult.apaReport.sections) ? (
                          analysisResult.apaReport.sections.map((section, i) => (
                            <div key={i}>
                              <h3 className="font-semibold text-sm mb-2">{section.heading}</h3>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {section.content}
                              </p>
                            </div>
                          ))
                        ) : (
                          <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                            {JSON.stringify(analysisResult.apaReport, null, 2)}
                          </pre>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {analysisResult.machineReport && (
                <Card>
                  <CardHeader>
                    <CardTitle>Machine-Readable Output</CardTitle>
                    <CardDescription>Raw JSON results for further processing</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                        {JSON.stringify(analysisResult.machineReport, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {analysisResult.recommendations && (
                <Card>
                  <CardHeader>
                    <CardTitle>Method Recommendations</CardTitle>
                    <CardDescription>Suggested analyses based on your data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                        {JSON.stringify(analysisResult.recommendations, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No analysis results yet. Go to the Analyze tab to run your first analysis.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setActiveTab("analyze")}
                  data-testid="button-go-to-analyze"
                >
                  Go to Analyze
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
