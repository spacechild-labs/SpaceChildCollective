import { Router } from "express";
import type { User } from "@shared/schema";
import { sanitizeUser } from "../lib/sanitize";
import type { AgentKeyService } from "../services/ledger/agent-keys";
import { sendLedgerError } from "./ledger";

export function createLedgerAdminRouter(deps: {
  keys: AgentKeyService;
  users: { getUser(id: string): Promise<User | undefined>; updateUser(id: string, u: Partial<User>): Promise<User> };
}): Router {
  const r = Router();

  r.post("/users/:id/promote-agent", async (req, res) => {
    try {
      if (req.params.id === req.user?.id) { res.status(400).json({ error: "invalid_input", message: "cannot promote yourself" }); return; }
      const user = await deps.users.getUser(req.params.id);
      if (!user) { res.status(404).json({ error: "not_found" }); return; }
      if (user.role === "admin") {
        res.status(409).json({ error: "forbidden", message: "admin accounts cannot be promoted to agents (an agent key would carry admin powers)" });
        return;
      }
      // An agent may never release, so promotion clears the flag in the same write.
      res.json(sanitizeUser(await deps.users.updateUser(user.id, { userType: "agent", canRelease: false })));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/releaser", async (req, res) => {
    try {
      const user = await deps.users.getUser(req.params.id);
      if (!user) { res.status(404).json({ error: "not_found" }); return; }
      const canRelease = req.body?.canRelease === true;
      if (canRelease && user.userType === "agent") { res.status(400).json({ error: "agents_cannot_release" }); return; }
      res.json(sanitizeUser(await deps.users.updateUser(user.id, { canRelease })));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.get("/users/:id/keys", async (req, res) => {
    try { res.json(await deps.keys.list(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  r.post("/users/:id/keys", async (req, res) => {
    try {
      const owner = await deps.users.getUser(req.params.id);
      if (owner?.role === "admin") {
        res.status(409).json({ error: "forbidden", message: "admin accounts cannot hold agent keys" });
        return;
      }
      res.status(201).json(await deps.keys.issue(req.params.id, String(req.body?.name ?? ""), req.body?.ed25519PublicKey ?? null));
    } catch (e) { sendLedgerError(res, e, req); }
  });

  r.delete("/keys/:id", async (req, res) => {
    try { res.json(await deps.keys.revoke(req.params.id)); } catch (e) { sendLedgerError(res, e, req); }
  });

  return r;
}
