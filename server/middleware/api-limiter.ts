import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { isAgentKeyBearer } from "../services/ledger/agent-keys";

const rateLimitedBody = { error: "rate_limited", message: "Too many requests. Please try again later." };

/**
 * The general per-IP cap on /api. Requests carrying an scl_ agent key skip it: they are limited per key downstream
 * (spec 3.2: 600 reads per minute, 60 filings per hour), and several agents can share one host IP (ruling FI1).
 * Rejections carry the ledger's reason code.
 */
export function createApiLimiter(opts: { windowMs?: number; max?: number } = {}): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs ?? 15 * 60 * 1000,
    limit: opts.max ?? 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isAgentKeyBearer(req.headers.authorization),
    handler: (_req, res) => { res.status(429).json(rateLimitedBody); },
  });
}

/**
 * The counterpart for requests the general cap skips: a per-IP cap on scl_ bearers that FAIL authentication or scope
 * (401/403). Valid keys are never counted, so it does not touch an agent's per-key budget, but a flood of guessed or
 * revoked keys from one IP is still bounded.
 */
export function createAgentKeyFailureLimiter(opts: { windowMs?: number; max?: number } = {}): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs ?? 15 * 60 * 1000,
    limit: opts.max ?? 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isAgentKeyBearer(req.headers.authorization),
    requestWasSuccessful: (_req, res) => res.statusCode !== 401 && res.statusCode !== 403,
    skipSuccessfulRequests: true,
    handler: (_req, res) => { res.status(429).json(rateLimitedBody); },
  });
}
