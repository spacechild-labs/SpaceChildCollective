import type { RequestHandler, Response } from "express";
import type { PublicEvent } from "../services/ledger/service";

const DEFAULT_MAX_CLIENTS = 500;
const DEFAULT_HEARTBEAT_MS = 25_000;

function envMax(): number {
  const n = Number(process.env.LEDGER_STREAM_MAX_CLIENTS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_CLIENTS;
}

/**
 * Server-Sent Events for public ledger changes. Held records never pass through here: the service only
 * emits public events, and events carry no body. Concurrent clients are capped; a heartbeat comment keeps
 * idle connections alive through proxies.
 */
export class LedgerStream {
  private clients = new Set<Response>();
  private readonly maxClients: number;
  private readonly heartbeatMs: number;

  constructor(opts: { maxClients?: number; heartbeatMs?: number } = {}) {
    this.maxClients = opts.maxClients ?? envMax();
    this.heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  }

  get size(): number {
    return this.clients.size;
  }

  handler: RequestHandler = (req, res) => {
    if (this.clients.size >= this.maxClients) {
      res.status(503).set("retry-after", "30").json({ error: "rate_limited", message: "too many live-stream clients" });
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 5000\n: connected\n\n");
    res.flushHeaders();
    this.clients.add(res);
    const heartbeat = setInterval(() => this.send(res, ": hb\n\n"), this.heartbeatMs);
    heartbeat.unref();
    const cleanup = () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
  };

  private send(res: Response, frame: string): void {
    try {
      res.write(frame);
    } catch {
      this.clients.delete(res);
    }
  }

  notify(e: PublicEvent): void {
    const frame = `event: ${e.type}\ndata: ${JSON.stringify({ type: e.type, id: e.id, kind: e.kind, campaignId: e.campaignId })}\n\n`;
    for (const client of this.clients) this.send(client, frame);
  }
}
