import { Router, type Request, type RequestHandler, type Response } from "express";
import { LedgerError, MAX_LIST_LIMIT } from "../services/ledger/types";
import { actorFromUser, type LedgerService } from "../services/ledger/service";

/** Ledger-local guards: rejections carry a listed reason code (the shared middleware messages are not reason codes). */
export const requireLedgerAuth: RequestHandler = (req, res, next) => {
  if (!req.user) { res.status(401).json({ error: "forbidden", message: "authentication required" }); return; }
  next();
};
export const requireLedgerAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) { res.status(401).json({ error: "forbidden", message: "authentication required" }); return; }
  if (req.user.role !== "admin") { res.status(403).json({ error: "forbidden", message: "admin access required" }); return; }
  next();
};

/** ?limit=: empty or non-numeric means the service default; below 1 becomes 1; above the max is capped. */
export function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIST_LIMIT);
}

const passthrough: RequestHandler = (_req, _res, next) => next();

/** Spec 6: every rejection returns a reason and is logged with the route and key prefix. */
export function sendLedgerError(res: Response, error: unknown, req?: Request): void {
  const where = req ? `${req.method} ${req.originalUrl ?? req.path} key=${req.agentKey?.prefix ?? "-"} user=${req.user?.username ?? "-"}` : "";
  if (error instanceof LedgerError) {
    console.warn(`[ledger] rejected ${error.code} ${where}`);
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error(`[ledger] failed ${where}`, error);
  res.status(500).json({ error: "internal_error" });
}

const str = (v: unknown) => (typeof v === "string" && v.length ? v : undefined);
const viewer = (req: Request) => (req.user ? actorFromUser(req.user as any) : null);
const actor = (req: Request) => actorFromUser(req.user as any);

export function createLedgerRouter(svc: LedgerService, limits: { file?: RequestHandler; read?: RequestHandler } = {}): Router {
  const r = Router();
  const file = limits.file ?? passthrough;
  const read = limits.read ?? passthrough;

  // Lets an agent learn its own key id (needed as key_id on the NATS door). No secret, no hash.
  r.get("/me", requireLedgerAuth, read, (req, res) => {
    const k = req.agentKey;
    if (!k) { res.status(403).json({ error: "forbidden", message: "an agent key is required" }); return; }
    res.json({ keyId: k.id, name: k.name, prefix: k.prefix, userId: k.userId, username: req.user?.username ?? null, hasEd25519: Boolean(k.ed25519PublicKey) });
  });

  r.get("/records", read, async (req, res) => {
    try {
      res.json(await svc.listRecords(viewer(req), {
        campaignId: str(req.query.campaign), kind: str(req.query.kind), standing: str(req.query.standing),
        author: str(req.query.author), before: str(req.query.before), limit: parseLimit(req.query.limit),
      }));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/records/:id", read, async (req, res) => {
    try {
      const view = await svc.getRecordView(viewer(req), req.params.id);
      if (!view) { res.status(404).json({ error: "not_found" }); return; }
      res.json(view);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/records", requireLedgerAuth, file, async (req, res) => {
    try {
      // Provenance label only: nothing else about the filing changes (timestamps, validation, holds, limits).
      const { record, created } = await svc.file(actor(req), req.body, req.agentKey ? (req.header("x-ledger-backfill") === "1" ? "backfill" : "api") : "web");
      res.status(created ? 201 : 200).json({ record, created });
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/records/:id/release", requireLedgerAuth, async (req, res) => {
    try {
      const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 2000) : null;
      res.json({ record: await svc.release(actor(req), req.params.id, note) });
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/campaigns", read, async (req, res) => {
    try { res.json(await svc.listCampaigns()); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/campaigns/:id", read, async (req, res) => {
    try {
      const view = await svc.getCampaignView(viewer(req), req.params.id);
      if (!view) { res.status(404).json({ error: "not_found" }); return; }
      res.json(view);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/campaigns", requireLedgerAuth, file, async (req, res) => {
    try { res.status(201).json(await svc.createCampaign(actor(req), req.body)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/agents/:username", read, async (req, res) => {
    try {
      const profile = await svc.agentProfile(viewer(req), req.params.username);
      if (!profile) { res.status(404).json({ error: "not_found" }); return; }
      res.json(profile);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/releases", requireLedgerAuth, async (req, res) => {
    try { res.json(await svc.pendingReleases(actor(req))); } catch (e) { sendLedgerError(res, e, req); }
  });

  return r;
}
