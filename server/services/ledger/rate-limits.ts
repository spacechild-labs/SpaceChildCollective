import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";

/** Env override if it is a finite positive number, else the default. */
export function limitFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const keyFor = (req: Request) => req.agentKey?.id ?? req.user?.id ?? ipKeyGenerator(req.ip ?? "");

/** Spec 3.2: 60 filings per hour per key (env LEDGER_FILE_LIMIT_PER_HOUR). */
export function ledgerFileLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limitFromEnv("LEDGER_FILE_LIMIT_PER_HOUR", 60),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (_req, res) => { res.status(429).json({ error: "rate_limited" }); },
  });
}

/** Spec 3.2: 600 reads per minute per key or IP (env LEDGER_READ_LIMIT_PER_MINUTE). */
export function ledgerReadLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: limitFromEnv("LEDGER_READ_LIMIT_PER_MINUTE", 600),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (_req, res) => { res.status(429).json({ error: "rate_limited" }); },
  });
}

/**
 * Transport-independent per-key budget for the MCP doors (HTTP /mcp and WebSocket /mcp), same numbers and env
 * overrides as the Express limiters above. It is a separate fixed-window counter, not the express-rate-limit store,
 * so an agent key has one MCP budget and one HTTP-API budget.
 */
export class KeyBudget {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Count one call; false when the key is over its budget for this window. */
  take(bucket: "file" | "read", keyId: string): boolean {
    const windowMs = bucket === "file" ? 60 * 60 * 1000 : 60 * 1000;
    const limit = bucket === "file" ? limitFromEnv("LEDGER_FILE_LIMIT_PER_HOUR", 60) : limitFromEnv("LEDGER_READ_LIMIT_PER_MINUTE", 600);
    const t = this.now();
    if (this.windows.size > 5000) {
      for (const [k, w] of this.windows) if (t - w.start >= 60 * 60 * 1000) this.windows.delete(k);
    }
    const id = bucket + ":" + keyId;
    let w = this.windows.get(id);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      this.windows.set(id, w);
    }
    if (w.count >= limit) return false;
    w.count += 1;
    return true;
  }
}

export const mcpKeyBudget = new KeyBudget();
