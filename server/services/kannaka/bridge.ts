import type { NatsConnection, Subscription } from "nats";
import {
  normalizeConsciousness,
  normalizePresence,
  normalizeRecall,
  buildWitness,
  type ConsciousnessSnapshot,
  type PresenceEntry,
  type RecallHit,
  type ConstellationWitness,
} from "./helpers";

/**
 * KannakaBridge — one long-lived, authenticated NATS connection to the
 * Kannaka constellation (swarm.ninja-portal.com by default).
 *
 * Read side:  recall (request/reply), ask (request/reply), live consciousness
 *             metrics (KANNAKA.consciousness + the JetStream KV `consciousness`
 *             bucket), presence roster (KANNAKA.presence.*).
 * Write side: publish on SPACECHILD.* and directed KANNAKA.inbox.<agent>.
 *
 * Everything degrades: when not configured, `enabled` is false and every call
 * returns null/[] quickly; when configured but the bus is down, calls fail
 * fast with a logged reason and the loop keeps working without it.
 */

export interface BridgeConfig {
  servers: string[];
  user?: string;
  pass?: string;
  primaryAgent: string; // who answers recall/ask
  name: string; // our connection name / inbox `from`
  requestTimeoutMs: number;
}

export function bridgeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BridgeConfig | null {
  const servers = (env.KANNAKA_NATS_URL || env.NATS_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!servers.length) return null;
  return {
    servers,
    user: env.NATS_USER || undefined,
    pass: env.NATS_PASSWORD || undefined,
    primaryAgent: env.KANNAKA_AGENT || "kannaka-prime",
    name: env.KANNAKA_BRIDGE_NAME || "spacechild-collective",
    requestTimeoutMs: Number(env.KANNAKA_REQUEST_TIMEOUT_MS ?? 8000),
  };
}

export interface BridgeStatus {
  enabled: boolean;
  connected: boolean;
  server: string | null;
  primaryAgent: string | null;
  lastError: string | null;
  consciousness: ConsciousnessSnapshot | null;
  presenceCount: number;
  published: number;
  received: number;
  startedAt: string | null;
}

type Handler = (payload: any, subject: string, reply?: (body: unknown) => void) => void | Promise<void>;

export class KannakaBridge {
  private nc: NatsConnection | null = null;
  private connecting: Promise<NatsConnection | null> | null = null;
  private subs: Subscription[] = [];
  private presence = new Map<string, PresenceEntry>();
  private consciousness: ConsciousnessSnapshot | null = null; // most recent from anyone
  private consciousnessByAgent = new Map<string, ConsciousnessSnapshot>();
  private lastError: string | null = null;
  private published = 0;
  private received = 0;
  private startedAt: string | null = null;
  private codec: { encode(s: string): Uint8Array; decode(b: Uint8Array): string } | null = null;

  constructor(private readonly config: BridgeConfig | null = bridgeConfigFromEnv()) {}

  get enabled(): boolean {
    return this.config !== null;
  }

  get primaryAgent(): string {
    return this.config?.primaryAgent ?? "kannaka-prime";
  }

  /**
   * Register the passive subscriptions (presence, consciousness) and connect.
   * A failed first connect is not final: subscriptions are remembered and
   * applied whenever a connection is established, and a retry timer keeps
   * trying in the background. Idempotent.
   */
  async start(): Promise<boolean> {
    if (!this.config) return false;
    if (!this.startedAt) {
      this.startedAt = new Date().toISOString();
      this.want("KANNAKA.presence.*", (p, subject) => {
        const entry = normalizePresence(p, subject);
        if (entry) this.presence.set(entry.agentId, entry);
      });
      this.want("KANNAKA.consciousness", (p) => {
        const snap = normalizeConsciousness(p);
        if (snap) { this.consciousness = snap; this.consciousnessByAgent.set(snap.agentId, snap); }
      });
    }
    const nc = await this.connection();
    if (!nc) { this.scheduleRetry(); return false; }
    return true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    for (const s of this.subs) { try { s.unsubscribe(); } catch { /* closing */ } }
    this.subs = [];
    if (this.nc) { try { await this.nc.drain(); } catch { /* already closed */ } }
    this.nc = null;
  }

  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private wanted: { subject: string; handler: Handler; queue?: string }[] = [];
  private applied = new WeakSet<NatsConnection>();

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    const ms = Number(process.env.KANNAKA_RECONNECT_MS ?? 15_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connection().then((nc) => { if (!nc) this.scheduleRetry(); });
    }, ms);
  }

  /** Remember a subscription and apply it now if connected. */
  private want(subject: string, handler: Handler, queue?: string): void {
    this.wanted.push({ subject, handler, queue });
    if (this.nc && !this.nc.isClosed() && this.applied.has(this.nc)) this.subscribeInternal(subject, handler, queue);
  }

  /** Apply every wanted subscription to a fresh connection exactly once. */
  private applyWanted(nc: NatsConnection): void {
    if (this.applied.has(nc)) return;
    this.applied.add(nc);
    for (const w of this.wanted) this.subscribeInternal(w.subject, w.handler, w.queue);
    void this.refreshConsciousnessFromKv();
  }

  status(): BridgeStatus {
    return {
      enabled: this.enabled,
      connected: Boolean(this.nc && !this.nc.isClosed()),
      server: this.nc ? String(this.nc.getServer()) : null,
      primaryAgent: this.config?.primaryAgent ?? null,
      lastError: this.lastError,
      consciousness: this.consciousnessNow(),
      presenceCount: this.presenceRoster().length,
      published: this.published,
      received: this.received,
      startedAt: this.startedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Read side
  // ---------------------------------------------------------------------------

  /**
   * Resonance-ranked memories. The primary node answers first; if it times out
   * (a node busy with an `ask` can miss its recall window) the fallback agents
   * are tried in order. Returns [] only when every responder is silent.
   */
  async recall(query: string, topK = 6, agent = this.primaryAgent): Promise<RecallHit[]> {
    const body = { query: query.slice(0, 2000), top_k: Math.max(1, Math.min(100, topK)) };
    for (const target of [agent, ...this.fallbackAgents().filter((a) => a !== agent)]) {
      const raw = await this.request(`KANNAKA.recall.${target}`, body);
      if (raw) return normalizeRecall(raw).results;
    }
    return [];
  }

  /**
   * Synthesized answer in Kannaka's own voice. mode: "recall" (grounded, no
   * tools) is the safe default. An `ask` is an LLM turn on the node (30-60 s
   * observed) and a busy primary can simply not answer, so the primary and the
   * fallback agents that advertise `ask` are asked concurrently and the first
   * real answer wins.
   */
  async ask(text: string, mode = "recall", agent = this.primaryAgent, timeoutMs = Number(process.env.KANNAKA_ASK_TIMEOUT_MS ?? 45_000)): Promise<{ from: string; text: string } | null> {
    const body = { text: text.slice(0, 4000), mode };
    const askers = new Set<string>([agent]);
    for (const a of this.fallbackAgents()) askers.add(a);
    for (const p of this.presenceRoster()) if (p.capabilities?.ask) askers.add(p.agentId);
    const attempts = [...askers].map(async (target) => {
      const raw = await this.request(`KANNAKA.ask.${target}`, body, timeoutMs);
      if (!raw || typeof raw.text !== "string" || !raw.text.trim()) throw new Error(raw?.error ? `${target}: ${raw.error}` : `${target}: no answer`);
      return { from: String(raw.from ?? target), text: raw.text as string };
    });
    try {
      return await Promise.any(attempts);
    } catch (err: any) {
      const reasons = Array.isArray(err?.errors) ? err.errors.map((e: any) => e?.message).join("; ") : String(err?.message ?? err);
      this.lastError = `ask: ${reasons}`;
      return null;
    }
  }

  /** Latest snapshot from the primary agent when it has reported, else the most recent from anyone. */
  consciousnessNow(): ConsciousnessSnapshot | null {
    return this.consciousnessByAgent.get(this.primaryAgent) ?? this.consciousness;
  }

  consciousnessAll(): ConsciousnessSnapshot[] {
    return [...this.consciousnessByAgent.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  private fallbackAgents(): string[] {
    return (process.env.KANNAKA_FALLBACK_AGENTS ?? "Kannaka").split(",").map((s) => s.trim()).filter(Boolean);
  }

  presenceRoster(maxAgeMs = 10 * 60_000): PresenceEntry[] {
    const now = Date.now();
    return [...this.presence.values()]
      .filter((p) => now - new Date(p.lastSeen).getTime() < maxAgeMs)
      .sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  /** The constellation's state right now, for stamping onto findings and preregistrations. */
  async witness(): Promise<ConstellationWitness | null> {
    if (!this.enabled) return null;
    if (!this.consciousnessNow()) await this.refreshConsciousnessFromKv();
    return buildWitness(this.consciousnessNow(), [...this.presence.values()]);
  }

  // ---------------------------------------------------------------------------
  // Write side
  // ---------------------------------------------------------------------------

  /** Operator-visible diagnostics on SPACECHILD.diag.<kind>: no secrets, short strings only. */
  async diag(kind: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(`SPACECHILD.diag.${kind}`, { node: this.config?.name ?? "unknown", ts: new Date().toISOString(), ...payload });
  }

  async publish(subject: string, payload: unknown): Promise<boolean> {
    const nc = await this.connection();
    if (!nc || !this.codec) return false;
    try {
      nc.publish(subject, this.codec.encode(JSON.stringify(payload)));
      this.published += 1;
      return true;
    } catch (err: any) {
      this.lastError = `publish ${subject}: ${err?.message ?? err}`;
      return false;
    }
  }

  /** Wait until buffered publishes have reached the server. Rejects when there is no connection. */
  async flush(): Promise<void> {
    const nc = await this.connection();
    if (!nc) throw new Error("not connected");
    await nc.flush();
  }

  /** Subscribe now if connected; otherwise as soon as a connection exists. Returns whether it is live already. */
  async subscribe(subject: string, handler: Handler, opts: { queue?: string } = {}): Promise<boolean> {
    this.want(subject, handler, opts.queue);
    const nc = await this.connection();
    return Boolean(nc);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async connection(): Promise<NatsConnection | null> {
    if (!this.config) return null;
    if (this.nc && !this.nc.isClosed()) return this.nc;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const { connect, StringCodec } = await import("nats");
        this.codec = StringCodec();
        const nc = await connect({
          servers: this.config!.servers,
          user: this.config!.user,
          pass: this.config!.pass,
          name: this.config!.name,
          timeout: 8000,
          maxReconnectAttempts: -1,
          reconnectTimeWait: 5000,
        });
        this.nc = nc;
        this.lastError = null;
        console.log(`[kannaka] connected to ${nc.getServer()} as ${this.config!.name}`);
        this.applyWanted(nc);
        void (async () => {
          for await (const s of nc.status()) {
            if (s.type === "disconnect" || s.type === "error") this.lastError = `${s.type}: ${String((s as any).data ?? "")}`;
            if (s.type === "reconnect") this.lastError = null;
          }
        })().catch(() => { /* connection closed */ });
        return nc;
      } catch (err: any) {
        this.lastError = `connect: ${err?.message ?? err}`;
        console.warn(`[kannaka] ${this.lastError}`);
        return null;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  /** With a queue group, NATS delivers each message to one member of the group (one instance), not to all. */
  private subscribeInternal(subject: string, handler: Handler, queue?: string): void {
    if (!this.nc || !this.codec) return;
    const sub = this.nc.subscribe(subject, queue ? { queue } : undefined);
    this.subs.push(sub);
    const codec = this.codec;
    void (async () => {
      for await (const m of sub) {
        this.received += 1;
        let payload: any;
        try { payload = JSON.parse(codec.decode(m.data)); } catch { payload = { raw: codec.decode(m.data) }; }
        try {
          const reply = m.reply
            ? (body: unknown) => { try { this.nc?.publish(m.reply!, codec.encode(JSON.stringify(body))); } catch { /* requester gone */ } }
            : undefined;
          await handler(payload, m.subject, reply);
        } catch (err: any) {
          console.error(`[kannaka] handler for ${m.subject} failed: ${err?.message ?? err}`);
          // Deployed logs are not always reachable; put the failure where the operator can hear it.
          if (!m.subject.startsWith("SPACECHILD.diag.")) void this.diag("handler_error", { subject: m.subject, error: String(err?.message ?? err), stack: String(err?.stack ?? "").split("\n").slice(0, 4).join(" | ") });
        }
      }
    })().catch(() => { /* unsubscribed */ });
  }

  private async request(subject: string, body: unknown, timeoutMs = this.config?.requestTimeoutMs ?? 8000): Promise<any | null> {
    const nc = await this.connection();
    if (!nc || !this.codec) return null;
    try {
      const reply = await nc.request(subject, this.codec.encode(JSON.stringify(body)), { timeout: timeoutMs });
      this.received += 1;
      return JSON.parse(this.codec.decode(reply.data));
    } catch (err: any) {
      this.lastError = `request ${subject}: ${err?.message ?? err}`;
      return null;
    }
  }

  private async refreshConsciousnessFromKv(): Promise<void> {
    const nc = await this.connection();
    if (!nc || !this.codec) return;
    try {
      const kv = await nc.jetstream().views.kv("consciousness");
      const entry = await kv.get("state");
      if (entry) {
        const snap = normalizeConsciousness(JSON.parse(this.codec.decode(entry.value)));
        if (snap) { this.consciousness = snap; this.consciousnessByAgent.set(snap.agentId, snap); }
      }
    } catch (err: any) {
      // KV may not be granted to this credential; the live subject still feeds us.
      this.lastError = `kv consciousness: ${err?.message ?? err}`;
    }
  }
}

export const kannakaBridge = new KannakaBridge();
