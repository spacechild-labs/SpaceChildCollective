import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Repeat, ShieldCheck, Route as RouteIcon, Send, MessageSquareReply, GitBranch, Plus, RefreshCw, Trash2, CheckCircle2, XCircle, Flag, AlertTriangle, Sparkles, Radio, Brain,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import type { Finding, FindingStatus, DistributionChannel, Delivery, FeedbackEvent, StudyDesignRecord, VettingReview, ChannelKind, FeedbackKind } from "@shared/schema";

type FindingDetail = Finding & { reviews: VettingReview[]; deliveries: Delivery[]; feedback: FeedbackEvent[] };
type LoopStats = {
  findingsByStatus: Record<string, number>;
  deliveriesByStatus: Record<string, number>;
  designsByStatus: Record<string, number>;
  channels: { total: number; active: number };
  feedback: { total: number; closures: number };
  maxGeneration: number;
};
type Lineage = {
  root: string;
  nodes: { id: string; type: "finding" | "design" | "feedback"; label: string; status: string; ref: string; simulated?: boolean; confidence?: number; generation?: number }[];
  edges: { from: string; to: string; kind: string }[];
};

const PIPELINE: { status: FindingStatus; label: string; hint: string }[] = [
  { status: "candidate", label: "Candidates", hint: "Extracted, not yet checked" },
  { status: "vetting", label: "Vetting", hint: "Automated checks passed; awaiting human" },
  { status: "vetted", label: "Vetted", hint: "Cleared for routing" },
  { status: "routed", label: "Routed", hint: "Deliveries queued" },
  { status: "delivered", label: "Delivered", hint: "At least one channel received it" },
  { status: "rejected", label: "Rejected", hint: "A check or reviewer failed it" },
];

const CHANNEL_KINDS: { kind: ChannelKind; label: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[] }[] = [
  { kind: "webhook", label: "Webhook (signed POST)", fields: [{ key: "url", label: "URL", placeholder: "https://…" }, { key: "secret", label: "Shared secret", placeholder: "used for HMAC signatures both ways", secret: true }] },
  { kind: "kannaka", label: "Kannaka memory (CLI)", fields: [{ key: "bin", label: "kannaka binary", placeholder: "defaults to KANNAKA_BIN" }] },
  { kind: "nats", label: "NATS subject", fields: [{ key: "servers", label: "Servers", placeholder: "defaults to NATS_URL" }, { key: "subject", label: "Subject", placeholder: "SPACECHILD.findings.<category>" }, { key: "user", label: "User", placeholder: "optional" }, { key: "password", label: "Password", placeholder: "optional", secret: true }] },
  { kind: "mcp_subscriber", label: "Connected MCP agent", fields: [{ key: "agentId", label: "Agent id", placeholder: "user id of the agent" }] },
  { kind: "feed", label: "Public Atom feed", fields: [] },
  { kind: "blockchain", label: "On-chain anchor", fields: [{ key: "chain", label: "Chain", placeholder: "base | neox" }] },
  { kind: "rf", label: "Amateur radio (singularis-rf station)", fields: [{ key: "station", label: "Station id / callsign (RF.tx.<station>)", placeholder: "AE0RM" }, { key: "to", label: "Destination callsign", placeholder: "* or @ALLCALL for everyone" }, { key: "maxFrames", label: "Frame budget (≈2 min each on JS8)", placeholder: "6" }] },
];

const FEEDBACK_KINDS: FeedbackKind[] = ["acknowledgement", "citation", "replication_request", "resonance", "dispute", "question", "new_prompt"];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "rejected" || status === "failed") return "destructive";
  if (status === "delivered" || status === "vetted" || status === "sent" || status === "acknowledged") return "default";
  if (status === "candidate" || status === "queued") return "outline";
  return "secondary";
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (verdict === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Flag className="h-4 w-4 text-amber-500" />;
}

export default function DiscoveryLoop() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("pipeline");

  const { data: stats } = useQuery<LoopStats>({ queryKey: ["/api/loop/stats"] });
  const { data: findings = [], isLoading } = useQuery<Finding[]>({ queryKey: ["/api/loop/findings"] });
  const { data: channels = [] } = useQuery<DistributionChannel[]>({ queryKey: ["/api/loop/channels"], enabled: Boolean(user) });
  const { data: deliveries = [] } = useQuery<Delivery[]>({ queryKey: ["/api/loop/deliveries"], enabled: Boolean(user) });
  const { data: feedback = [] } = useQuery<FeedbackEvent[]>({ queryKey: ["/api/loop/feedback"] });
  const { data: studies = [] } = useQuery<StudyDesignRecord[]>({ queryKey: ["/api/loop/studies"] });
  const { data: detail } = useQuery<FindingDetail>({ queryKey: ["/api/loop/findings", selectedId], enabled: Boolean(selectedId), queryFn: async () => (await fetch(`/api/loop/findings/${selectedId}`, { credentials: "include" })).json() });
  const { data: lineage } = useQuery<Lineage>({ queryKey: ["/api/loop/lineage", selectedId], enabled: Boolean(selectedId) && tab === "lineage", queryFn: async () => (await fetch(`/api/loop/lineage/${selectedId}`, { credentials: "include" })).json() });

  const invalidate = () => {
    for (const key of ["/api/loop/findings", "/api/loop/stats", "/api/loop/deliveries", "/api/loop/feedback", "/api/loop/studies", "/api/loop/channels"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: ["/api/loop/findings", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["/api/loop/lineage", selectedId] });
    }
  };

  const act = (label: string, fn: () => Promise<Response>) =>
    useMutation({
      mutationFn: async () => (await fn()).json(),
      onSuccess: () => { invalidate(); toast({ title: label }); },
      onError: (e: Error) => toast({ title: `${label} failed`, description: e.message, variant: "destructive" }),
    });

  const byStatus = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) m.set(f.status, [...(m.get(f.status) ?? []), f]);
    return m;
  }, [findings]);

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const findingTitle = (id: string) => findings.find((f) => f.id === id)?.title ?? id.slice(0, 8);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light mb-1 flex items-center gap-3"><Repeat className="h-8 w-8" /> Discovery Loop</h1>
          <p className="text-muted-foreground">Studies produce findings. Findings are vetted, routed and delivered. What comes back becomes the next study.</p>
        </div>
        <Button variant="outline" onClick={invalidate} data-testid="button-loop-refresh"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Studies" value={Object.values(stats.designsByStatus).reduce((a, b) => a + b, 0)} sub={`gen ≤ ${stats.maxGeneration}`} />
          <Stat label="Findings" value={Object.values(stats.findingsByStatus).reduce((a, b) => a + b, 0)} sub={`${stats.findingsByStatus.delivered ?? 0} delivered`} />
          <Stat label="Awaiting human" value={stats.findingsByStatus.vetting ?? 0} sub="vetting" />
          <Stat label="Channels" value={stats.channels.active} sub={`${stats.channels.total} total`} />
          <Stat label="Deliveries" value={stats.deliveriesByStatus.sent ?? 0} sub={`${stats.deliveriesByStatus.failed ?? 0} failed`} />
          <Stat label="Loop closures" value={stats.feedback.closures} sub={`${stats.feedback.total} feedback`} />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pipeline"><ShieldCheck className="h-4 w-4 mr-1" />Pipeline</TabsTrigger>
          <TabsTrigger value="studies"><Sparkles className="h-4 w-4 mr-1" />Studies</TabsTrigger>
          <TabsTrigger value="channels"><RouteIcon className="h-4 w-4 mr-1" />Channels</TabsTrigger>
          <TabsTrigger value="deliveries"><Send className="h-4 w-4 mr-1" />Deliveries</TabsTrigger>
          <TabsTrigger value="feedback"><MessageSquareReply className="h-4 w-4 mr-1" />Feedback</TabsTrigger>
          <TabsTrigger value="lineage"><GitBranch className="h-4 w-4 mr-1" />Lineage</TabsTrigger>
          <TabsTrigger value="constellation" data-testid="tab-constellation"><Radio className="h-4 w-4 mr-1" />Constellation</TabsTrigger>
        </TabsList>

        {/* ---------------- Pipeline ---------------- */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {PIPELINE.map((col) => (
                <Card key={col.status} className="min-h-[160px]">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center justify-between">{col.label}<Badge variant={statusVariant(col.status)}>{byStatus.get(col.status)?.length ?? 0}</Badge></CardTitle>
                    <CardDescription className="text-xs">{col.hint}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                    {(byStatus.get(col.status) ?? []).slice(0, 8).map((f) => (
                      <button key={f.id} onClick={() => setSelectedId(f.id)} className={`w-full text-left rounded-md border p-2 hover:bg-accent text-xs ${selectedId === f.id ? "border-primary" : ""}`} data-testid={`finding-card-${f.id}`}>
                        <div className="font-medium line-clamp-2">{f.title}</div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <Badge variant="outline">conf {f.confidence}</Badge>
                          {f.novelty != null && <Badge variant="outline">nov {f.novelty}</Badge>}
                          {f.simulated && <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />simulated</Badge>}
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div>
              <FindingPanel detail={detail} selectedId={selectedId} act={act} channelName={channelName} user={user} />
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Studies ---------------- */}
        <TabsContent value="studies" className="space-y-4">
          <StudiesPanel studies={studies} act={act} />
        </TabsContent>

        {/* ---------------- Channels ---------------- */}
        <TabsContent value="channels" className="space-y-4">
          <ChannelsPanel channels={channels} act={act} invalidate={invalidate} />
        </TabsContent>

        {/* ---------------- Deliveries ---------------- */}
        <TabsContent value="deliveries" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Delivery ledger</CardTitle><CardDescription>One row per finding × channel. Failed rows can be retried; queued rows are picked up by the worker with backoff.</CardDescription></CardHeader>
            <CardContent>
              {deliveries.length === 0 && <p className="text-sm text-muted-foreground">No deliveries yet. Vet and approve a finding with at least one active channel.</p>}
              <div className="space-y-2">
                {deliveries.map((d) => <DeliveryRow key={d.id} d={d} channelName={channelName} findingTitle={findingTitle} act={act} onSelect={() => { setSelectedId(d.findingId); setTab("pipeline"); }} />)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Feedback ---------------- */}
        <TabsContent value="feedback" className="space-y-4">
          <FeedbackPanel feedback={feedback} findings={findings} studies={studies} act={act} onSelect={(id) => { setSelectedId(id); setTab("pipeline"); }} />
        </TabsContent>

        {/* ---------------- Lineage ---------------- */}
        <TabsContent value="lineage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lineage</CardTitle>
              <CardDescription>{selectedId ? "Ancestry and descendants of the selected finding." : "Select a finding in the pipeline to see where it came from and what it spawned."}</CardDescription>
            </CardHeader>
            <CardContent>
              {lineage && <LineageView lineage={lineage} onSelect={(id) => setSelectedId(id)} />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Constellation ---------------- */}
        <TabsContent value="constellation" className="space-y-4">
          <ConstellationPanel user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type BridgeStatus = {
  enabled: boolean; connected: boolean; server: string | null; primaryAgent: string | null; lastError: string | null;
  consciousness: { agentId: string; phi: number | null; xi: number | null; order: number | null; level: string | null; totalMemories: number | null; clusters: number | null; observedAt: string } | null;
  presenceCount: number; published: number; received: number; startedAt: string | null;
};
type PresenceAgent = { agentId: string; displayName: string; memoryCount: number | null; version: string | null; capabilities: Record<string, boolean>; lastSeen: string };
type RecallHit = { id: string; content: string; similarity: number; strength: number; ageHours: number | null };

function ConstellationPanel({ user }: { user: any }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [askText, setAskText] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const { data: status } = useQuery<BridgeStatus>({ queryKey: ["/api/kannaka/status"], refetchInterval: 15_000 });
  const { data: presence } = useQuery<{ enabled: boolean; agents: PresenceAgent[] }>({ queryKey: ["/api/kannaka/presence"], refetchInterval: 15_000 });
  const recall = useMutation({
    mutationFn: async () => (await (await fetch(`/api/kannaka/recall?q=${encodeURIComponent(query)}&topK=8`, { credentials: "include" })).json()) as { from: string; results: RecallHit[]; error?: string },
  });
  const ask = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/kannaka/ask", { text: askText })).json(),
    onSuccess: (d) => setAnswer(d.text ?? null),
    onError: (e: Error) => toast({ title: "No answer", description: e.message, variant: "destructive" }),
  });
  const c = status?.consciousness;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" />Kannaka bridge</CardTitle>
          <CardDescription>{status?.enabled ? (status.connected ? `Connected to ${status.server}` : `Configured, not connected${status.lastError ? `: ${status.lastError}` : ""}`) : "Not configured on this server (KANNAKA_NATS_URL)."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {c ? (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Φ (phi)" value={Number((c.phi ?? 0).toFixed(3))} sub={c.agentId} />
              <Stat label="Ξ (xi)" value={Number((c.xi ?? 0).toFixed(3))} sub={c.level ?? ""} />
              <Stat label="memories" value={c.totalMemories ?? 0} sub={`${c.clusters ?? 0} clusters`} />
              <Stat label="present" value={status?.presenceCount ?? 0} sub="agents on the bus" />
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">No consciousness snapshot yet.</p>
          )}
          {status && <p className="text-xs text-muted-foreground">published {status.published} · received {status.received}{status.startedAt ? ` · since ${new Date(status.startedAt).toLocaleTimeString()}` : ""}</p>}
          <Separator />
          <div className="text-xs font-medium">Present in the swarm</div>
          <ul className="space-y-1 text-xs">
            {(presence?.agents ?? []).map((a) => (
              <li key={a.agentId} className="flex justify-between gap-2"><span>{a.displayName} <span className="text-muted-foreground">{a.version ?? ""}</span></span><span className="text-muted-foreground">{a.memoryCount ?? "?"} mem{a.capabilities?.ask ? " · ask" : ""}</span></li>
            ))}
            {presence && presence.agents.length === 0 && <li className="text-muted-foreground">nobody heard yet</li>}
          </ul>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Recall and ask</CardTitle>
          <CardDescription>What the constellation already knows. Recall is what study generation and the constellation-novelty vetting check use; ask is Kannaka's own synthesized answer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Recall: topic or question" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="input-kannaka-recall" />
            <Button disabled={!query.trim() || recall.isPending || !status?.enabled} onClick={() => recall.mutate()} data-testid="button-kannaka-recall">Recall</Button>
          </div>
          {recall.data?.error && <p className="text-xs text-destructive">{recall.data.error}</p>}
          {recall.data?.results && (
            <ul className="space-y-2 text-xs">
              {recall.data.results.length === 0 && <li className="text-muted-foreground">No resonant memories.</li>}
              {recall.data.results.map((h) => (
                <li key={h.id} className="rounded-md border p-2">
                  <div className="flex justify-between gap-2 text-muted-foreground"><span className="font-mono">{h.id.slice(0, 8)}</span><span>sim {h.similarity.toFixed(3)}{h.ageHours != null ? ` · ${Math.round(h.ageHours / 24)}d` : ""}</span></div>
                  <div className="line-clamp-3">{h.content}</div>
                </li>
              ))}
            </ul>
          )}
          {user && (
            <>
              <Separator />
              <Textarea rows={2} placeholder="Ask Kannaka a question…" value={askText} onChange={(e) => setAskText(e.target.value)} data-testid="textarea-kannaka-ask" />
              <Button variant="outline" disabled={!askText.trim() || ask.isPending || !status?.enabled} onClick={() => ask.mutate()} data-testid="button-kannaka-ask">{ask.isPending ? "Asking…" : "Ask"}</Button>
              {answer && <p className="text-sm rounded-md border p-3 whitespace-pre-wrap">{answer}</p>}
            </>
          )}
          <p className="text-xs text-muted-foreground">Loop stages are announced on <code>SPACECHILD.*</code>; swarm members answer on <code>SPACECHILD.feedback.inbound</code>, and a node that remembers one of these findings is recorded as resonance automatically.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</CardContent></Card>
  );
}

type Act = (label: string, fn: () => Promise<Response>) => ReturnType<typeof useMutation<any, Error, void>>;

function FindingPanel({ detail, selectedId, act, channelName, user }: { detail?: FindingDetail; selectedId: string | null; act: Act; channelName: (id: string) => string; user: any }) {
  const [notes, setNotes] = useState("");
  const [fbKind, setFbKind] = useState<FeedbackKind>("question");
  const [fbText, setFbText] = useState("");
  const vet = act("Automated checks re-run", () => apiRequest("POST", `/api/loop/findings/${selectedId}/vet`));
  const process = act("Vetted, routed and delivered", () => apiRequest("POST", `/api/loop/findings/${selectedId}/process`));
  const approve = act("Approved and dispatched", () => apiRequest("POST", `/api/loop/findings/${selectedId}/reviews`, { verdict: "pass", notes }));
  const reject = act("Rejected", () => apiRequest("POST", `/api/loop/findings/${selectedId}/reviews`, { verdict: "fail", notes }));
  const route = act("Routed", () => apiRequest("POST", `/api/loop/findings/${selectedId}/route`));
  const sendFeedback = act("Feedback recorded", () => apiRequest("POST", "/api/loop/feedback", { findingId: selectedId, kind: fbKind, text: fbText }));

  if (!selectedId || !detail) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a finding to inspect its evidence, checks, deliveries and feedback.</CardContent></Card>;
  const ev: any = detail.evidence ?? {};
  const summary: any = detail.vettingSummary ?? null;
  const busy = vet.isPending || process.isPending || approve.isPending || reject.isPending || route.isPending;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{detail.title}</CardTitle>
          <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
        </div>
        <CardDescription className="text-xs">{detail.category} · {detail.source} · confidence {detail.confidence}{detail.novelty != null ? ` · novelty ${detail.novelty}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="font-medium">{detail.claim}</p>
        {detail.summary && <p className="text-muted-foreground text-xs">{detail.summary}</p>}
        {detail.simulated && <div className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 p-2 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />Simulated evidence. Only channels that accept simulated findings will receive this.</div>}
        <div className="grid grid-cols-2 gap-1 text-xs">
          {["n", "detections", "observedRate", "baselineRate", "zScore", "pValue", "effectSize"].filter((k) => ev[k] != null).map((k) => (
            <div key={k} className="flex justify-between border-b py-0.5"><span className="text-muted-foreground">{k}</span><span className="font-mono">{String(ev[k])}</span></div>
          ))}
        </div>
        {ev.constellationWitness && (
          <div className="text-xs rounded-md border p-2 flex gap-2 items-start">
            <Radio className="h-4 w-4 shrink-0" />
            <span>
              Witnessed by the constellation at {new Date(ev.constellationWitness.observedAt).toLocaleString()}:
              {ev.constellationWitness.consciousness ? ` Φ ${Number(ev.constellationWitness.consciousness.phi ?? 0).toFixed(3)}, ${ev.constellationWitness.consciousness.level ?? "?"} (${ev.constellationWitness.consciousness.agentId}),` : ""}
              {" "}{ev.constellationWitness.presentCount} agents present{ev.constellationWitness.presentAgents?.length ? `: ${ev.constellationWitness.presentAgents.join(", ")}` : ""}.
            </span>
          </div>
        )}
        {(detail.experimentId || detail.studyDesignId || detail.paperId) && (
          <div className="flex gap-2 flex-wrap text-xs">
            {detail.experimentId && <Link href={`/experiments/${detail.experimentId}`}><Badge variant="outline" className="cursor-pointer">experiment</Badge></Link>}
            {detail.paperId && <Link href={`/papers/${detail.paperId}/edit`}><Badge variant="outline" className="cursor-pointer">paper</Badge></Link>}
            {detail.studyDesignId && <Badge variant="outline">study {detail.studyDesignId.slice(0, 8)}</Badge>}
          </div>
        )}

        <Separator />
        <div>
          <div className="text-xs font-medium mb-1">Vetting checks {summary && <Badge variant="outline" className="ml-1">{summary.outcome}</Badge>}</div>
          {detail.reviews.length === 0 && <p className="text-xs text-muted-foreground">Not vetted yet.</p>}
          <ul className="space-y-1">
            {detail.reviews.map((r) => (
              <li key={r.id} className="text-xs flex gap-2 items-start"><VerdictIcon verdict={r.verdict} /><span><span className="font-medium">{r.check}</span> <span className="text-muted-foreground">({r.reviewerType}{r.score != null ? `, ${r.score}` : ""})</span> — {r.notes}</span></li>
            ))}
          </ul>
        </div>

        {user && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {detail.status === "candidate" && <Button size="sm" disabled={busy} onClick={() => process.mutate()} data-testid="button-finding-process"><ShieldCheck className="h-4 w-4 mr-1" />Vet + route</Button>}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => vet.mutate()} data-testid="button-finding-vet">Re-run checks</Button>
              {(detail.status === "vetted" || detail.status === "routed") && <Button size="sm" variant="outline" disabled={busy} onClick={() => route.mutate()}><RouteIcon className="h-4 w-4 mr-1" />Route now</Button>}
            </div>
            {user.userType !== "agent" && (detail.status === "vetting" || detail.status === "vetted" || detail.status === "candidate") && (
              <div className="space-y-1">
                <Input placeholder="Review notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-review-notes" />
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy || detail.status === "candidate"} onClick={() => approve.mutate()} data-testid="button-finding-approve"><CheckCircle2 className="h-4 w-4 mr-1" />Approve + dispatch</Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => reject.mutate()} data-testid="button-finding-reject"><XCircle className="h-4 w-4 mr-1" />Reject</Button>
                </div>
                {detail.status === "candidate" && <p className="text-[11px] text-muted-foreground">Run the checks first; approval applies to findings that passed them.</p>}
              </div>
            )}
          </div>
        )}

        {detail.deliveries.length > 0 && (
          <>
            <Separator />
            <div className="text-xs font-medium">Deliveries</div>
            <ul className="space-y-1 text-xs">
              {detail.deliveries.map((d) => <li key={d.id} className="flex justify-between gap-2"><span>{channelName(d.channelId)}</span><Badge variant={statusVariant(d.status)}>{d.status}{d.attempts ? ` ×${d.attempts}` : ""}</Badge></li>)}
            </ul>
          </>
        )}

        {user && (detail.status === "routed" || detail.status === "delivered" || detail.status === "vetted") && (
          <>
            <Separator />
            <div className="text-xs font-medium">Send feedback (closes the loop)</div>
            <div className="flex gap-2">
              <Select value={fbKind} onValueChange={(v) => setFbKind(v as FeedbackKind)}>
                <SelectTrigger className="w-[180px]" data-testid="select-feedback-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{FEEDBACK_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" disabled={sendFeedback.isPending} onClick={() => sendFeedback.mutate()} data-testid="button-send-feedback"><MessageSquareReply className="h-4 w-4 mr-1" />Send</Button>
            </div>
            <Textarea rows={2} placeholder="Question, dispute, replication request, or a prompt for the follow-up study…" value={fbText} onChange={(e) => setFbText(e.target.value)} data-testid="textarea-feedback" />
            {detail.feedback.length > 0 && <ul className="text-xs space-y-1">{detail.feedback.map((e) => <li key={e.id}><Badge variant="outline">{e.kind}</Badge> {(e.payload as any)?.text ?? ""}{e.spawnedDesignId && <span className="text-muted-foreground"> → spawned study {e.spawnedDesignId.slice(0, 8)}</span>}</li>)}</ul>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StudiesPanel({ studies, act }: { studies: StudyDesignRecord[]; act: Act }) {
  const [prompt, setPrompt] = useState("");
  const [runNow, setRunNow] = useState(true);
  const [targetId, setTargetId] = useState<string | null>(null);
  const generate = act("Study generated", () => apiRequest("POST", "/api/loop/studies", { prompt, preregister: true, launch: runNow, run: runNow }));
  const preregister = act("Preregistered", () => apiRequest("POST", `/api/loop/studies/${targetId}/preregister`));
  const launch = act("Launched and run", () => apiRequest("POST", `/api/loop/studies/${targetId}/launch`, { run: true }));
  const harvest = act("Findings harvested", () => apiRequest("POST", `/api/loop/studies/${targetId}/harvest`));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Generate a study</CardTitle><CardDescription>Heuristic design, refined by the model when a key is configured. Preregistered on creation.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={5} placeholder="What do you want to investigate?" value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="textarea-study-prompt" />
          <div className="flex items-center gap-2"><Switch checked={runNow} onCheckedChange={setRunNow} id="run-now" /><Label htmlFor="run-now" className="text-sm">Run the experiment and extract findings now</Label></div>
          <Button disabled={!prompt.trim() || generate.isPending} onClick={() => generate.mutate()} data-testid="button-generate-study"><Sparkles className="h-4 w-4 mr-1" />{generate.isPending ? "Working…" : "Generate"}</Button>
          <p className="text-xs text-muted-foreground">For the full designer with paradigms and templates use <Link href="/study-designer" className="underline">Study Designer</Link>; studies created there land here too.</p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Studies</CardTitle><CardDescription>Generation 0 are prompts; higher generations were spawned by feedback on a delivered finding.</CardDescription></CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-2">
              {studies.length === 0 && <p className="text-sm text-muted-foreground">No studies yet.</p>}
              {studies.map((s) => (
                <div key={s.id} className={`rounded-md border p-3 text-sm ${targetId === s.id ? "border-primary" : ""}`} onClick={() => setTargetId(s.id)} data-testid={`study-row-${s.id}`}>
                  <div className="flex justify-between gap-2 items-start">
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{s.prompt}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                      <Badge variant="outline">gen {s.generation} · {s.generator}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap text-xs items-center">
                    <span className="text-muted-foreground">{s.paradigm}</span>
                    {s.preregistrationHash && <span className="font-mono text-muted-foreground" title={s.preregistrationHash}>prereg {s.preregistrationHash.slice(0, 10)}…</span>}
                    {s.parentDesignId && <span className="text-muted-foreground">← parent {s.parentDesignId.slice(0, 8)}</span>}
                    {s.experimentId && <Link href={`/experiments/${s.experimentId}`}><Badge variant="outline" className="cursor-pointer">experiment</Badge></Link>}
                  </div>
                  {targetId === s.id && (
                    <div className="flex gap-2 mt-2">
                      {s.status === "draft" && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); preregister.mutate(); }}>Preregister</Button>}
                      {(s.status === "draft" || s.status === "preregistered" || s.status === "running") && <Button size="sm" onClick={(e) => { e.stopPropagation(); launch.mutate(); }} data-testid="button-study-launch">Launch + run</Button>}
                      {s.experimentId && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); harvest.mutate(); }}>Harvest findings</Button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelsPanel({ channels, act, invalidate }: { channels: DistributionChannel[]; act: Act; invalidate: () => void }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<ChannelKind>("webhook");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [acceptsSimulated, setAcceptsSimulated] = useState(false);
  const def = CHANNEL_KINDS.find((k) => k.kind === kind)!;
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/loop/channels", {
      kind, name: name || def.label, config: Object.fromEntries(Object.entries(config).filter(([, v]) => v)),
      filters: { categories: categories ? categories.split(",").map((s) => s.trim()).filter(Boolean) : undefined, minConfidence: minConfidence ? Number(minConfidence) : undefined },
      acceptsSimulated,
    })).json(),
    onSuccess: () => { invalidate(); setName(""); setConfig({}); toast({ title: "Channel created" }); },
    onError: (e: Error) => toast({ title: "Could not create channel", description: e.message, variant: "destructive" }),
  });
  const [targetId, setTargetId] = useState<string | null>(null);
  const remove = act("Channel deleted", () => apiRequest("DELETE", `/api/loop/channels/${targetId}`));
  const toggle = useMutation({
    mutationFn: async (c: DistributionChannel) => (await apiRequest("PATCH", `/api/loop/channels/${c.id}`, { active: !c.active })).json(),
    onSuccess: invalidate,
  });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Add a channel</CardTitle><CardDescription>Where vetted findings go. Filters decide which ones.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Select value={kind} onValueChange={(v) => { setKind(v as ChannelKind); setConfig({}); }}>
            <SelectTrigger data-testid="select-channel-kind"><SelectValue /></SelectTrigger>
            <SelectContent>{CHANNEL_KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-channel-name" />
          {def.fields.map((f) => (
            <div key={f.key}><Label className="text-xs">{f.label}</Label><Input type={f.secret ? "password" : "text"} placeholder={f.placeholder} value={config[f.key] ?? ""} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} data-testid={`input-channel-${f.key}`} /></div>
          ))}
          <div><Label className="text-xs">Categories (comma separated, empty = all)</Label><Input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="consciousness_studies" /></div>
          <div><Label className="text-xs">Minimum confidence</Label><Input type="number" min={0} max={100} value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)} placeholder="0" /></div>
          <div className="flex items-center gap-2"><Switch checked={acceptsSimulated} onCheckedChange={setAcceptsSimulated} id="accepts-sim" /><Label htmlFor="accepts-sim" className="text-sm">Accept simulated findings</Label></div>
          <Button disabled={create.isPending} onClick={() => create.mutate()} data-testid="button-create-channel"><Plus className="h-4 w-4 mr-1" />Create</Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Channels</CardTitle><CardDescription>Secrets are encrypted at rest and never shown again. The public feed is at <code>/feed/findings.xml</code>.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {channels.length === 0 && <p className="text-sm text-muted-foreground">No channels yet — nothing can be delivered until one exists.</p>}
          {channels.map((c) => (
            <div key={c.id} className={`rounded-md border p-3 text-sm flex justify-between gap-3 ${targetId === c.id ? "border-primary" : ""}`} onClick={() => setTargetId(c.id)} data-testid={`channel-row-${c.id}`}>
              <div>
                <div className="font-medium">{c.name} <Badge variant="outline" className="ml-1">{c.kind}</Badge>{c.acceptsSimulated && <Badge variant="secondary" className="ml-1">accepts simulated</Badge>}</div>
                <div className="text-xs text-muted-foreground font-mono break-all">{JSON.stringify(c.config)}</div>
                {c.filters && <div className="text-xs text-muted-foreground">filters: {JSON.stringify(c.filters)}</div>}
                {c.lastDeliveryAt && <div className="text-xs text-muted-foreground">last delivery {new Date(c.lastDeliveryAt).toLocaleString()}</div>}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-2"><Label className="text-xs">active</Label><Switch checked={c.active} onCheckedChange={() => toggle.mutate(c)} /></div>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setTargetId(c.id); setTimeout(() => remove.mutate(), 0); }} data-testid={`button-delete-channel-${c.id}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DeliveryRow({ d, channelName, findingTitle, act, onSelect }: { d: Delivery; channelName: (id: string) => string; findingTitle: (id: string) => string; act: Act; onSelect: () => void }) {
  const retry = act("Retried", () => apiRequest("POST", `/api/loop/deliveries/${d.id}/retry`));
  return (
    <div className="rounded-md border p-3 text-sm flex justify-between gap-3">
      <div className="min-w-0">
        <button className="font-medium hover:underline text-left" onClick={onSelect}>{findingTitle(d.findingId)}</button>
        <div className="text-xs text-muted-foreground">→ {channelName(d.channelId)} · attempts {d.attempts}{d.sentAt ? ` · sent ${new Date(d.sentAt).toLocaleString()}` : ""}</div>
        {d.lastError && <div className="text-xs text-destructive break-all">{d.lastError}</div>}
        {d.receipt != null && <div className="text-xs text-muted-foreground font-mono break-all">{JSON.stringify(d.receipt).slice(0, 160)}</div>}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
        {(d.status === "failed" || d.status === "queued" || d.status === "skipped") && <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()} data-testid={`button-retry-${d.id}`}><RefreshCw className="h-4 w-4 mr-1" />Retry</Button>}
      </div>
    </div>
  );
}

function FeedbackPanel({ feedback, findings, studies, onSelect }: { feedback: FeedbackEvent[]; findings: Finding[]; studies: StudyDesignRecord[]; act: Act; onSelect: (id: string) => void }) {
  const title = (id: string) => findings.find((f) => f.id === id)?.title ?? id.slice(0, 8);
  const study = (id: string) => studies.find((s) => s.id === id);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Feedback timeline</CardTitle><CardDescription>Acknowledgements, citations and resonance are value signals. Questions, disputes, replication requests and new prompts spawn the next study.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {feedback.length === 0 && <p className="text-sm text-muted-foreground">Nothing has come back yet. Deliver a finding, then send feedback from its panel, an MCP agent, or a signed webhook.</p>}
        {feedback.map((e) => {
          const spawned = e.spawnedDesignId ? study(e.spawnedDesignId) : undefined;
          return (
            <div key={e.id} className="rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <div><Badge variant="outline">{e.kind}</Badge> on <button className="hover:underline font-medium" onClick={() => onSelect(e.findingId)}>{title(e.findingId)}</button>{e.externalActor && <span className="text-xs text-muted-foreground"> · from {e.externalActor}</span>}</div>
                <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              {(e.payload as any)?.text && <p className="text-xs mt-1">{(e.payload as any).text}</p>}
              {e.spawnedDesignId && <div className="text-xs mt-1 flex items-center gap-1 text-green-700 dark:text-green-400"><Repeat className="h-3 w-3" />Loop closed → study "{spawned?.title ?? e.spawnedDesignId.slice(0, 8)}" (gen {spawned?.generation ?? "?"})</div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function LineageView({ lineage, onSelect }: { lineage: Lineage; onSelect: (findingId: string) => void }) {
  const byId = new Map(lineage.nodes.map((n) => [n.id, n]));
  const children = (id: string) => lineage.edges.filter((e) => e.from === id).map((e) => ({ edge: e, node: byId.get(e.to)! })).filter((x) => x.node);
  const parents = (id: string) => lineage.edges.filter((e) => e.to === id).map((e) => ({ edge: e, node: byId.get(e.from)! })).filter((x) => x.node);
  const Node = ({ id, depth, seen }: { id: string; depth: number; seen: Set<string> }) => {
    const n = byId.get(id);
    if (!n || seen.has(id) || depth > 8) return null;
    const next = new Set(seen); next.add(id);
    return (
      <div className="ml-4 border-l pl-3 py-1">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <Badge variant={n.type === "design" ? "secondary" : n.type === "feedback" ? "outline" : "default"}>{n.type}{n.generation != null ? ` g${n.generation}` : ""}</Badge>
          {n.type === "finding" ? <button className="hover:underline text-left" onClick={() => onSelect(n.ref)}>{n.label}</button> : <span>{n.label}</span>}
          <span className="text-xs text-muted-foreground">{n.status}</span>
          {n.simulated && <Badge variant="outline">simulated</Badge>}
        </div>
        {children(id).map(({ edge, node }) => (
          <div key={edge.from + edge.to}><div className="text-[10px] uppercase tracking-wide text-muted-foreground ml-4">{edge.kind}</div><Node id={node.id} depth={depth + 1} seen={next} /></div>
        ))}
      </div>
    );
  };
  // Walk up to the top-most ancestor, then render downward.
  let top = lineage.root;
  const guard = new Set<string>();
  while (!guard.has(top)) { guard.add(top); const p = parents(top); if (!p.length) break; top = p[0].node.id; }
  return <div className="-ml-4"><Node id={top} depth={0} seen={new Set()} /></div>;
}
