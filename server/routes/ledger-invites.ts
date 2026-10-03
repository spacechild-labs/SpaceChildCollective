import { Router, type RequestHandler } from "express";
import type { InviteService } from "../services/ledger/invites";
import { requireLedgerAuth, sendLedgerError } from "./ledger";

export function createLedgerInviteRouter(svc: InviteService, limits: { onboard?: RequestHandler } = {}): Router {
  const r = Router();
  const pass: RequestHandler = (_req, _res, next) => next();

  // Public: the invite code is the credential. The response carries a fresh key secret and is never logged.
  r.post("/onboard", limits.onboard ?? pass, async (req, res) => {
    try { res.status(201).json(await svc.redeem(req.body ?? {})); } catch (e) { sendLedgerError(res, e, req); }
  });
  r.post("/invites", requireLedgerAuth, async (req, res) => {
    try {
      const b = req.body ?? {};
      res.status(201).json(await svc.mint(req.user as any, {
        note: b.note, maxUses: b.maxUses, expiresInDays: b.expiresInDays, grantsInvite: b.grantsInvite,
      }));
    } catch (e) { sendLedgerError(res, e, req); }
  });
  r.get("/invites", requireLedgerAuth, async (req, res) => {
    try { res.json(await svc.list(req.user as any)); } catch (e) { sendLedgerError(res, e, req); }
  });
  r.delete("/invites/:id", requireLedgerAuth, async (req, res) => {
    try { res.json(await svc.revoke(req.user as any, req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });
  return r;
}
