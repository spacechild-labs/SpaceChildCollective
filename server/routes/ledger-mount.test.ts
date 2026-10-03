import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { guardMutations } from "../middleware/auth";
import { AgentKeyService } from "../services/ledger/agent-keys";
import { MemoryAgentKeyStore, MemoryLedgerStore } from "../services/ledger/memory-store";
import { LedgerService } from "../services/ledger/service";
import { createLedgerAdminRouter } from "./ledger-admin";
import { createLedgerRouter } from "./ledger";
import { serve } from "../test-utils/serve";

// Mirrors the order in server/index.ts + routes.ts: guardMutations, then the ledger and admin mounts.
let srv: { base: string; close(): Promise<void> };
beforeEach(async () => {
  const userStore = { getUser: async () => undefined, updateUser: async () => { throw new Error("unreachable"); } } as any;
  const app = express();
  app.use(express.json());
  app.use(guardMutations);
  app.post("/api/papers", (_req, res) => res.json({ legacy: true }));
  app.use("/api/ledger", createLedgerRouter(new LedgerService(new MemoryLedgerStore([]))));
  app.use("/api/admin", createLedgerAdminRouter({ keys: new AgentKeyService(new MemoryAgentKeyStore(), userStore), users: userStore }));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const anon = (method: string, path: string) =>
  fetch(`${srv.base}${path}`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });

describe("anonymous access through the mounts", () => {
  it("ledger mutations get the reason-code body from guardMutations", async () => {
    const res = await anon("POST", "/api/ledger/records");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "forbidden", message: "Authentication required" });
  });

  it("legacy mutations keep their exact body", async () => {
    const res = await anon("POST", "/api/papers");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("every ledger-admin route rejects anonymous callers with forbidden", async () => {
    const routes: [string, string][] = [
      ["POST", "/api/admin/users/u1/promote-agent"], ["POST", "/api/admin/users/u1/releaser"],
      ["GET", "/api/admin/users/u1/keys"], ["POST", "/api/admin/users/u1/keys"], ["DELETE", "/api/admin/keys/k1"],
    ];
    for (const [m, p] of routes) {
      const res = await anon(m, p);
      expect(res.status, `${m} ${p}`).toBe(401);
      expect((await res.json()).error, `${m} ${p}`).toBe("forbidden");
    }
  });
});
