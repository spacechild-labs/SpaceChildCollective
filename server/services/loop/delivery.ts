import crypto from "crypto";
import { spawn } from "child_process";
import type { Delivery, DistributionChannel, Finding } from "@shared/schema";
import { loopStorage } from "../../loop-storage";
import { storage } from "../../storage";
import { openFields } from "../../lib/secretbox";
import { siteUrl } from "../../lib/site-url";
import { connectionRegistry } from "../../websocket";
import { publishToBase, publishToNeoX } from "../blockchain";
import { loopEvents } from "./events";
import { kannakaBridge } from "../kannaka/bridge";
import { buildInboxMessage } from "../kannaka/helpers";
import { planRfMessage, rfTxRequest, type RfChannelConfig } from "../kannaka/rf";

/**
 * Delivery: push a routed finding to a channel through the adapter for its
 * kind, record a receipt, and retry with exponential backoff on failure.
 *
 * Adapters are deliberately small and side-effect-only; the worker owns the
 * ledger. Every outbound webhook body is HMAC-signed so consumers can verify
 * it came from this collective and can send signed feedback back.
 */

export const SECRET_CONFIG_FIELDS = ["secret", "password", "token"] as const;

export interface DeliveryEnvelope {
  event: "finding.vetted";
  deliveryId: string;
  channelId: string;
  sentAt: string;
  finding: {
    id: string;
    title: string;
    claim: string;
    summary: string | null;
    category: string;
    tags: string[];
    confidence: number;
    novelty: number | null;
    simulated: boolean;
    contentHash: string;
    evidence: Record<string, unknown>;
    source: string;
    paperId: string | null;
    experimentId: string | null;
    studyDesignId: string | null;
    vettingSummary: unknown;
    createdAt: string;
  };
  links: { finding: string; feedback: string };
}

export interface AdapterResult {
  ok: boolean;
  receipt?: Record<string, unknown>;
  error?: string;
  /** false ⇒ do not retry (configuration problem). */
  retryable?: boolean;
}

export type Adapter = (channel: DistributionChannel, finding: Finding, envelope: DeliveryEnvelope, config: Record<string, any>) => Promise<AdapterResult>;

export function signBody(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

export function verifySignature(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = signBody(secret, body);
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildEnvelope(finding: Finding, delivery: Pick<Delivery, "id" | "channelId">, baseUrl: string): DeliveryEnvelope {
  // Strip bulky raw trial arrays from the outbound evidence; consumers can fetch them by id.
  const { rawTrials, ...evidence } = (finding.evidence ?? {}) as Record<string, unknown>;
  return {
    event: "finding.vetted",
    deliveryId: delivery.id,
    channelId: delivery.channelId,
    sentAt: new Date().toISOString(),
    finding: {
      id: finding.id,
      title: finding.title,
      claim: finding.claim,
      summary: finding.summary,
      category: finding.category,
      tags: finding.tags ?? [],
      confidence: finding.confidence,
      novelty: finding.novelty,
      simulated: finding.simulated,
      contentHash: finding.contentHash,
      evidence: { ...evidence, rawTrialCount: Array.isArray(rawTrials) ? rawTrials.length : undefined },
      source: finding.source,
      paperId: finding.paperId,
      experimentId: finding.experimentId,
      studyDesignId: finding.studyDesignId,
      vettingSummary: finding.vettingSummary,
      createdAt: finding.createdAt.toISOString(),
    },
    links: {
      finding: `${baseUrl}/api/loop/findings/${finding.id}`,
      feedback: `${baseUrl}/api/loop/feedback/inbound/${delivery.channelId}`,
    },
  };
}

function baseUrl(): string {
  return siteUrl();
}

export function findingAsText(f: Finding): string {
  const ev: any = f.evidence ?? {};
  const stats = [ev.n != null ? `n=${ev.n}` : null, ev.pValue != null ? `p=${ev.pValue}` : null, ev.effectSize != null ? `h=${ev.effectSize}` : null].filter(Boolean).join(", ");
  return `[SpaceChild finding ${f.id}] ${f.claim}${stats ? ` (${stats})` : ""}${f.simulated ? " [SIMULATED]" : ""} confidence=${f.confidence}`;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

const webhookAdapter: Adapter = async (_channel, _finding, envelope, config) => {
  const url = String(config.url ?? "");
  if (!/^https?:\/\//.test(url)) return { ok: false, error: "webhook url missing or not http(s)", retryable: false };
  const body = JSON.stringify(envelope);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "SpaceChildCollective-DiscoveryLoop/1.0",
    "X-SpaceChild-Event": envelope.event,
    "X-SpaceChild-Delivery": envelope.deliveryId,
  };
  if (config.secret) headers["X-SpaceChild-Signature"] = signBody(String(config.secret), body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(config.timeoutMs ?? 10_000));
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    const text = (await res.text()).slice(0, 500);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text}`, retryable: res.status >= 500 || res.status === 429 };
    return { ok: true, receipt: { status: res.status, body: text } };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), retryable: true };
  } finally {
    clearTimeout(timer);
  }
};

function runCommand(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`command timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000) }); });
  });
}

/** Deliver into a Kannaka HRM memory via the CLI (`kannaka remember`). */
const kannakaAdapter: Adapter = async (_channel, finding, _envelope, config) => {
  const bin = String(config.bin || process.env.KANNAKA_BIN || "");
  if (!bin) return { ok: false, error: "kannaka binary not configured (channel config.bin or KANNAKA_BIN)", retryable: false };
  const importance = Math.max(0.1, Math.min(1, Number(config.importance ?? finding.confidence / 100)));
  const args = ["remember", findingAsText(finding), "--importance", importance.toFixed(2)];
  try {
    const r = await runCommand(bin, args, Number(config.timeoutMs ?? 20_000));
    if (r.code !== 0) return { ok: false, error: `kannaka exited ${r.code}: ${r.stderr || r.stdout}`, retryable: true };
    return { ok: true, receipt: { stdout: r.stdout.trim() } };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), retryable: true };
  }
};

/**
 * Publish on NATS (plain publish — not JetStream-retained).
 *   mode "subject" (default): the envelope on config.subject or SPACECHILD.findings.<category>
 *   mode "inbox": a directed KANNAKA.inbox.<agentId> message to one constellation node
 * Uses the shared Kannaka bridge connection when it is up; otherwise a short-lived connection.
 */
const natsAdapter: Adapter = async (_channel, finding, envelope, config) => {
  const mode = config.mode === "inbox" ? "inbox" : "subject";
  let subject: string;
  let body: unknown;
  if (mode === "inbox") {
    const agentId = String(config.agentId ?? "");
    if (!agentId) return { ok: false, error: "inbox mode needs config.agentId (a constellation agent id)", retryable: false };
    subject = `KANNAKA.inbox.${agentId}`;
    body = buildInboxMessage(finding, agentId);
  } else {
    subject = String(config.subject || `SPACECHILD.findings.${finding.category}`);
    body = envelope;
  }
  if (kannakaBridge.enabled && !config.servers) {
    const ok = await kannakaBridge.publish(subject, body);
    if (ok) return { ok: true, receipt: { subject, mode, via: "kannaka-bridge" } };
    return { ok: false, error: `bridge publish failed: ${kannakaBridge.status().lastError ?? "unknown"}`, retryable: true };
  }
  const servers = String(config.servers || process.env.KANNAKA_NATS_URL || process.env.NATS_URL || "");
  if (!servers) return { ok: false, error: "NATS servers not configured (channel config.servers, KANNAKA_NATS_URL or NATS_URL)", retryable: false };
  try {
    const { connect, StringCodec } = await import("nats");
    const nc = await connect({
      servers: servers.split(",").map((s) => s.trim()),
      user: config.user || process.env.NATS_USER,
      pass: config.password || process.env.NATS_PASSWORD,
      timeout: Number(config.timeoutMs ?? 5_000),
    });
    try {
      nc.publish(subject, StringCodec().encode(JSON.stringify(body)));
      await nc.flush();
    } finally {
      await nc.close();
    }
    return { ok: true, receipt: { subject, mode, servers } };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), retryable: true };
  }
};

/** Push a JSON-RPC notification to a connected MCP agent over its WebSocket. */
const mcpSubscriberAdapter: Adapter = async (_channel, _finding, envelope, config) => {
  const agentId = String(config.agentId ?? "");
  if (!agentId) return { ok: false, error: "mcp_subscriber channel has no agentId", retryable: false };
  const transport = connectionRegistry.get(agentId);
  if (!transport) return { ok: false, error: `agent ${agentId} is not connected`, retryable: true };
  try {
    await transport.send({ jsonrpc: "2.0", method: "notifications/spacechild/finding", params: envelope } as any);
    return { ok: true, receipt: { agentId, pushedAt: new Date().toISOString() } };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), retryable: true };
  }
};

/** Pull channel: the public Atom feed reads routed findings directly; delivery is a no-op marker. */
const feedAdapter: Adapter = async () => ({ ok: true, receipt: { feed: "/feed/findings.xml" } });

/** Anchor the finding's content hash on-chain as proof of discovery. */
const blockchainAdapter: Adapter = async (_channel, finding, _envelope, config) => {
  const chain = config.chain === "neox" ? "neox" : "base";
  try {
    const req = { paperHash: finding.contentHash, title: finding.title, authors: ["Space Child Research Collective"], timestamp: new Date() };
    const result = chain === "base" ? await publishToBase(req) : await publishToNeoX(req);
    if (finding.paperId) {
      await storage.createBlockchainRecord({
        paperId: finding.paperId,
        chain,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        timestamp: result.timestamp,
        dataHash: finding.contentHash,
        status: "confirmed",
      });
    }
    return { ok: true, receipt: { chain, transactionHash: result.transactionHash, blockNumber: result.blockNumber, gasUsed: result.gasUsed } };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    return { ok: false, error: msg, retryable: !/signing key not configured/i.test(msg) };
  }
};

/**
 * Amateur radio via a singularis-rf station. Hands a Singularis Compact request to
 * RF.tx.<station> over the Kannaka bridge and returns "sent" immediately: air time
 * is minutes per frame, so completion arrives later as RF.tx.<station>.status events
 * (ref = delivery id) which move the delivery to acknowledged or failed.
 */
const rfAdapter: Adapter = async (_channel, finding, envelope, config) => {
  const cfg = config as RfChannelConfig;
  if (!cfg.station) return { ok: false, error: "rf channel needs config.station (the singularis-rf station id / callsign)", retryable: false };
  if (!kannakaBridge.enabled) return { ok: false, error: "rf delivery needs the Kannaka bridge (KANNAKA_NATS_URL)", retryable: false };
  const plan = planRfMessage(finding, cfg);
  if (!plan.fits) return { ok: false, error: `finding cannot fit in ${cfg.maxFrames ?? 6} frame(s) even as a bare SIGNAL (${plan.frames.length} needed); raise config.maxFrames`, retryable: false };
  const request = rfTxRequest(finding, cfg, envelope.deliveryId, plan);
  const subject = `RF.tx.${String(cfg.station).toUpperCase().replace(/[^A-Z0-9-]/g, "-")}`;
  const ok = await kannakaBridge.publish(subject, request);
  if (!ok) return { ok: false, error: `bridge publish failed: ${kannakaBridge.status().lastError ?? "unknown"}`, retryable: true };
  return { ok: true, receipt: { subject, to: request.to, frames: plan.frames.length, claimChars: plan.claimChars, trimmed: plan.trimmed, preview: plan.frames, awaitingStation: true } };
};

export const ADAPTERS: Record<DistributionChannel["kind"], Adapter> = {
  webhook: webhookAdapter,
  kannaka: kannakaAdapter,
  nats: natsAdapter,
  mcp_subscriber: mcpSubscriberAdapter,
  feed: feedAdapter,
  blockchain: blockchainAdapter,
  rf: rfAdapter,
};

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 5;

export function backoffMs(attempt: number): number {
  // 30s, 2m, 8m, 32m, ...
  return 30_000 * Math.pow(4, Math.max(0, attempt - 1));
}

export class DeliveryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly adapters: Record<string, Adapter> = ADAPTERS) {}

  start(intervalMs = Number(process.env.LOOP_DELIVERY_INTERVAL_MS ?? 15_000)): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    console.log(`[delivery] worker started (every ${intervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Process every due delivery once. Safe to call inline after routing. */
  async tick(limit = 50): Promise<{ processed: number; sent: number; failed: number }> {
    if (this.running) return { processed: 0, sent: 0, failed: 0 };
    this.running = true;
    let processed = 0, sent = 0, failed = 0;
    try {
      const due = await loopStorage.listDueDeliveries(new Date(), limit);
      for (const d of due) {
        processed += 1;
        try {
          const r = await this.attempt(d.id);
          if (r.status === "sent") sent += 1; else if (r.status === "failed") failed += 1;
        } catch (err: any) {
          // One broken delivery must never take the worker (or the process) down.
          failed += 1;
          console.error(`[delivery] attempt ${d.id} threw: ${err?.message ?? err}`);
          try {
            await loopStorage.updateDelivery(d.id, { status: "failed", lastError: String(err?.message ?? err), nextAttemptAt: null });
          } catch { /* ledger unavailable; leave it queued for the next tick */ }
        }
      }
    } catch (err: any) {
      console.error(`[delivery] tick failed: ${err?.message ?? err}`);
    } finally {
      this.running = false;
    }
    return { processed, sent, failed };
  }

  /** Attempt a single delivery now regardless of its schedule. */
  async attempt(deliveryId: string): Promise<Delivery> {
    const delivery = await loopStorage.getDelivery(deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    if (delivery.status === "sent" || delivery.status === "acknowledged") return delivery;
    const [finding, channel] = await Promise.all([loopStorage.getFinding(delivery.findingId), loopStorage.getChannel(delivery.channelId)]);
    if (!finding || !channel) {
      return loopStorage.updateDelivery(deliveryId, { status: "skipped", lastError: "finding or channel no longer exists" });
    }
    if (!channel.active) return loopStorage.updateDelivery(deliveryId, { status: "skipped", lastError: "channel inactive" });

    const adapter = this.adapters[channel.kind];
    if (!adapter) return loopStorage.updateDelivery(deliveryId, { status: "failed", lastError: `no adapter for kind ${channel.kind}` });

    const attempts = delivery.attempts + 1;
    let config: Record<string, any>;
    try {
      config = openFields((channel.config ?? {}) as Record<string, any>, SECRET_CONFIG_FIELDS);
    } catch {
      // Sealed with a different ENCRYPTION_KEY (or an ephemeral one from a previous process).
      return loopStorage.updateDelivery(deliveryId, {
        status: "failed",
        attempts,
        lastError: "channel secret cannot be decrypted (ENCRYPTION_KEY changed or unset since the channel was created); re-enter the secret",
        nextAttemptAt: null,
      });
    }
    const envelope = buildEnvelope(finding, delivery, baseUrl());
    let result: AdapterResult;
    try {
      result = await adapter(channel, finding, envelope, config);
    } catch (err: any) {
      result = { ok: false, error: String(err?.message ?? err), retryable: true };
    }

    if (result.ok) {
      const updated = await loopStorage.updateDelivery(deliveryId, { status: "sent", attempts, lastError: null, receipt: result.receipt ?? {}, sentAt: new Date(), nextAttemptAt: null });
      await loopStorage.updateChannel(channel.id, { lastDeliveryAt: new Date() });
      await this.markFindingDelivered(finding.id);
      loopEvents.emit("finding.delivered", { finding, delivery: updated, channelKind: channel.kind, channelName: channel.name });
      return updated;
    }

    const giveUp = result.retryable === false || attempts >= MAX_ATTEMPTS;
    return loopStorage.updateDelivery(deliveryId, {
      status: giveUp ? "failed" : "queued",
      attempts,
      lastError: result.error ?? "unknown error",
      nextAttemptAt: giveUp ? null : new Date(Date.now() + backoffMs(attempts)),
    });
  }

  private async markFindingDelivered(findingId: string): Promise<void> {
    const finding = await loopStorage.getFinding(findingId);
    if (!finding || finding.status === "delivered") return;
    if (finding.status === "routed" || finding.status === "vetted") await loopStorage.updateFinding(findingId, { status: "delivered" });
  }
}

export const deliveryWorker = new DeliveryWorker();
