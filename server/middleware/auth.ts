import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";

// Make the session userId and the request user strongly typed everywhere.
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Populate req.user from the session (non-blocking). Runs globally so handlers
 * and downstream middleware can read req.user; clears a stale session whose
 * user no longer exists.
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (userId) {
    try {
      const user = await storage.getUser(userId);
      if (user) req.user = user;
      else req.session.userId = undefined;
    } catch {
      // Non-fatal: treat as unauthenticated for this request.
    }
  }
  next();
}

/** Require an authenticated session; 401 otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/** Require an authenticated admin user; 401/403 otherwise. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// API mutations that are intentionally public (the auth bootstrap itself).
const PUBLIC_MUTATION_PATHS: RegExp[] = [
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/logout$/,
  // Signed inbound feedback from delivery channels (HMAC-verified in the handler).
  /^\/api\/loop\/feedback\/inbound\/[^/]+$/,
];

/**
 * Default-deny guard: block anonymous state-changing requests to the API.
 * This single gate closes the mass-IDOR/anonymous-mutation hole across every
 * route without having to annotate each one. Read (GET/HEAD) requests pass
 * through; secret-bearing reads are locked individually with requireAuth.
 */
export function guardMutations(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api/")) return next();
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (PUBLIC_MUTATION_PATHS.some((re) => re.test(req.path))) return next();
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
