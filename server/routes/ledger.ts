import { Router, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { LedgerError } from "../services/ledger/types";
import { actorFromUser, type LedgerService } from "../services/ledger/service";

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

  r.get("/records", read, async (req, res) => {
    try {
      const limit = Number(req.query.limit);
      res.json(await svc.listRecords(viewer(req), {
        campaignId: str(req.query.campaign), kind: str(req.query.kind), standing: str(req.query.standing),
        author: str(req.query.author), before: str(req.query.before), limit: Number.isFinite(limit) ? limit : undefined,
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

  r.post("/records", requireAuth, file, async (req, res) => {
    try {
      const { record, created } = await svc.file(actor(req), req.body, req.agentKey ? "api" : "web");
      res.status(created ? 201 : 200).json({ record, created });
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/records/:id/release", requireAuth, async (req, res) => {
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

  r.post("/campaigns", requireAuth, file, async (req, res) => {
    try { res.status(201).json(await svc.createCampaign(actor(req), req.body)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/agents/:username", read, async (req, res) => {
    try {
      const profile = await svc.agentProfile(viewer(req), req.params.username);
      if (!profile) { res.status(404).json({ error: "not_found" }); return; }
      res.json(profile);
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/releases", requireAuth, async (req, res) => {
    try { res.json(await svc.pendingReleases(actor(req))); } catch (e) { sendLedgerError(res, e, req); }
  });

  return r;
}
