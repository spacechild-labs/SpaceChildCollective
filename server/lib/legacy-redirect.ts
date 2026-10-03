import type { Request } from "express";
import { archiveRedirectTarget } from "@shared/archive-routes";

/** Same-origin /archive target for a legacy request (query string kept), or null. Never returns a host or scheme. */
export function legacyRedirectFor(req: Pick<Request, "path" | "originalUrl">): string | null {
  const q = req.originalUrl.indexOf("?");
  return archiveRedirectTarget(req.path, q >= 0 ? req.originalUrl.slice(q) : "");
}
