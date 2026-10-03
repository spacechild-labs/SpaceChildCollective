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
