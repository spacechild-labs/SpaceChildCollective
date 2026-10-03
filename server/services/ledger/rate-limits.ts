import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";

const keyFor = (req: Request) => req.agentKey?.id ?? req.user?.id ?? ipKeyGenerator(req.ip ?? "");

/** Spec 3.2: 60 filings per hour per key (env LEDGER_FILE_LIMIT_PER_HOUR). */
export function ledgerFileLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.LEDGER_FILE_LIMIT_PER_HOUR ?? 60),
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
    limit: Number(process.env.LEDGER_READ_LIMIT_PER_MINUTE ?? 600),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (_req, res) => { res.status(429).json({ error: "rate_limited" }); },
  });
}
