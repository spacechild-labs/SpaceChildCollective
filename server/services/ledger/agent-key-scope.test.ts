import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { AgentKeyService, agentKeyAuth, isAgentKeyPath } from "./agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import { guardMutations, requireAdmin, requireAuth } from "../../middleware/auth";
import { createLedgerRouter } from "../../routes/ledger";
import { createLedgerAdminRouter } from "../../routes/ledger-admin";
import { serve } from "../../test-utils/serve";

// Ruling FI2: an scl_ key authorizes only /api/ledger/* and the MCP HTTP route. Mirrors the order in server/index.ts.
const agent = { id: "agent-1", username: "kannaka", userType: "agent", role: "user", canRelease: false };
const users = { getUser: async (id: string) => (id === agent.id ? (agent as any) : undefined), updateUser: async () => { throw new Error("unreachable"); } } as any;

let srv: { base: string; close(): Promise<void> };
let secret: string;
beforeEach(async () => {
  const keys = new AgentKeyService(new MemoryAgentKeyStore(), users);
  secret = (await keys.issue(agent.id, "k")).secret;
  const app = express();
  app.use(express.json());
  app.use(agentKeyAuth(keys));
  app.use(guardMutations);
  // Legacy routes guarded only by requireAuth/requireAdmin (routes.ts): a key must never reach them as the user.
  app.get("/api/users", requireAuth, (req, res) => res.json({ reachedAs: req.user?.username ?? null }));
  app.delete("/api/papers/:id", requireAuth, (req, res) => res.json({ deletedBy: req.user?.username ?? null }));
  app.get("/api/papers", (req, res) => res.json({ reachedAs: req.user?.username ?? null }));
  app.post("/api/admin/users/:id/reset-password", requireAdmin, (_req, res) => res.json({ reset: true }));
  app.use("/api/ledger", createLedgerRouter(new LedgerService(new MemoryLedgerStore([agent as any]))));
  app.use("/api/admin", createLedgerAdminRouter({ keys, users, invites: {} as any }));
  app.post("/mcp", (req, res) => res.json({ reachedAs: req.user?.username ?? null, key: Boolean(req.agentKey) }));
  app.post("/mcp/http", (req, res) => res.json({ reachedAs: req.user?.username ?? null, key: Boolean(req.agentKey) }));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const call = (method: string, path: string, auth: string) =>
  fetch(`${srv.base}${path}`, { method, headers: { "content-type": "application/json", authorization: auth }, body: method === "GET" ? undefined : "{}" });

describe("agent key scope", () => {
  it("refuses an scl_ key on legacy routes with 403 forbidden, never as the user or anonymous", async () => {
    const routes: [string, string][] = [
      ["GET", "/api/users"], ["DELETE", "/api/papers/p1"], ["GET", "/api/papers"], ["GET", "/API/USERS"],
      ["GET", "/api/ledgerx"], ["GET", "/mcp/other"],
      ["POST", "/api/admin/users/u1/reset-password"], ["GET", "/api/admin/users/agent-1/keys"], ["DELETE", "/api/admin/keys/k1"],
      ["POST", "/api/admin/users/agent-1/can-invite"], ["POST", "/api/admin/users/agent-1/revoke-chain"],
      ["GET", "/api/admin/users/agent-1/revoke-chain/preview"],
    ];
    for (const [m, p] of routes) {
      for (const auth of [`Bearer ${secret}`, "bearer scl_not-a-real-key"]) {
        const res = await call(m, p, auth);
        expect(res.status, `${m} ${p}`).toBe(403);
        expect(await res.json(), `${m} ${p}`).toEqual({ error: "forbidden", message: "agent keys authorize only the ledger" });
      }
    }
  });

  it("still authorizes the ledger API and the MCP HTTP routes", async () => {
    const me = await call("GET", "/api/ledger/me", `Bearer ${secret}`);
    expect(me.status).toBe(200);
    expect((await me.json()).username).toBe("kannaka");
    const filed = await fetch(`${srv.base}/api/ledger/records`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ kind: "note", title: "scoped" }),
    });
    expect(filed.status).toBe(201);
    for (const p of ["/mcp", "/mcp/http"]) {
      expect(await (await call("POST", p, `Bearer ${secret}`)).json(), p).toEqual({ reachedAs: "kannaka", key: true });
    }
    // an unknown key on a ledger path keeps its reason code
    expect(await (await call("GET", "/api/ledger/me", "Bearer scl_nope")).json()).toEqual({ error: "unknown_key" });
  });

  it("leaves non-scl bearers and anonymous requests alone on legacy routes", async () => {
    const res = await call("GET", "/api/papers", "Bearer legacy.hmac-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reachedAs: null });
  });

  it("matches only the ledger and MCP HTTP paths", () => {
    for (const p of ["/api/ledger", "/api/ledger/", "/api/ledger/records/x", "/API/Ledger/me", "/mcp", "/mcp/", "/mcp/http"]) expect(isAgentKeyPath(p), p).toBe(true);
    for (const p of ["/api/ledgers", "/api/users", "/mcp/http/x", "/mcpx", "/", "/api/admin/keys/k"]) expect(isAgentKeyPath(p), p).toBe(false);
  });
});
