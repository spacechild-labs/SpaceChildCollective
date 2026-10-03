import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createAgentKeyFailureLimiter, createApiLimiter } from "./api-limiter";
import { serve } from "../test-utils/serve";

let srv: { base: string; close(): Promise<void> };
beforeEach(async () => {
  const app = express();
  app.use("/api", createApiLimiter({ max: 2 }));
  app.use("/api", createAgentKeyFailureLimiter({ max: 2 }));
  // Stand-in for agentKeyAuth: "scl_good" authenticates, any other scl_ key is refused.
  app.use((req, res, next) => {
    const h = req.headers.authorization ?? "";
    if (/^Bearer\s+scl_/i.test(h) && !h.endsWith("scl_good")) { res.status(401).json({ error: "unknown_key" }); return; }
    next();
  });
  app.get("/api/ledger/records", (_req, res) => res.json([]));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const get = (auth?: string) => fetch(`${srv.base}/api/ledger/records`, { headers: auth ? { authorization: auth } : {} });

describe("global /api limiter", () => {
  it("answers 429 with a JSON reason code once an IP is over the cap", async () => {
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);
    const third = await get();
    expect(third.status).toBe(429);
    expect(third.headers.get("content-type")).toMatch(/application\/json/);
    expect(await third.json()).toEqual({ error: "rate_limited", message: expect.any(String) });
  });

  it("does not count or block requests carrying an scl_ agent key (any scheme case)", async () => {
    for (let i = 0; i < 5; i++) expect((await get(i % 2 ? "bearer   scl_good" : "Bearer scl_good")).status).toBe(200);
    // the IP budget is untouched by the agent requests
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
    // and agent keys still pass once the IP is capped
    expect((await get("Bearer scl_good")).status).toBe(200);
  });

  it("still caps a flood of failing scl_ keys from one IP, without counting valid ones", async () => {
    expect((await get("Bearer scl_bad1")).status).toBe(401);
    expect((await get("Bearer scl_good")).status).toBe(200);
    expect((await get("Bearer scl_bad2")).status).toBe(401);
    const capped = await get("Bearer scl_bad3");
    expect(capped.status).toBe(429);
    expect((await capped.json()).error).toBe("rate_limited");
  });
});
