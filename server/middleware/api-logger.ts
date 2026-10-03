import type { RequestHandler } from "express";

/** The key-issue routes (per-user keys, and one-step add-agent): their responses are never logged, whatever their shape. */
const KEY_ISSUE_ROUTE = /^\/api\/admin\/(?:users\/[^/]+\/keys|agents)\/?$/;

/** Invite redemption returns a fresh key secret and invite minting returns the plaintext code: never log either. */
// Looser than the exact PUBLIC_MUTATION_PATHS onboard entry in auth.ts on purpose: logging must fail closed.
const INVITE_ROUTE = /^\/api\/ledger\/(?:onboard|invites)\/?$/i;

/** Ledger reads: a signed-in viewer's response can carry held titles, which must not sit in operator logs. */
const LEDGER_PATH = /^\/api\/ledger(\/|$)/i;

/** True when a JSON body carries a credential that must never reach logs. */
export function bodyHasSecret(body: unknown): boolean {
  return !!body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "secret");
}

/**
 * /api request logger. Appends the (truncated) JSON response body, except when the
 * body contains a `secret` field (a freshly issued agent key): then no body is logged at all.
 */
export function apiLogger(write: (line: string) => void): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const path = req.path;
    const neverLogBody = req.method === "POST" && (KEY_ISSUE_ROUTE.test(path) || INVITE_ROUTE.test(path));
    let captured: unknown;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      captured = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      let line = `${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`;
      if (captured && req.method === "GET" && LEDGER_PATH.test(path)) {
        line += " :: [body not logged: ledger read]";
      } else if (captured) {
        line += neverLogBody || bodyHasSecret(captured) ? " :: [redacted: response may contain a secret]" : ` :: ${JSON.stringify(captured)}`;
      }
      if (line.length > 80) line = line.slice(0, 79) + "…";
      write(line);
    });

    next();
  };
}
