import type { RequestHandler } from "express";

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
    let captured: unknown;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      captured = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      let line = `${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`;
      if (captured) {
        line += bodyHasSecret(captured) ? " :: [redacted: response contains a secret]" : ` :: ${JSON.stringify(captured)}`;
      }
      if (line.length > 80) line = line.slice(0, 79) + "…";
      write(line);
    });

    next();
  };
}
