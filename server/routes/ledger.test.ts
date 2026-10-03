import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { MemoryLedgerStore } from "../services/ledger/memory-store";
import { LedgerService } from "../services/ledger/service";
import { createLedgerRouter } from "./ledger";
import { serve } from "../test-utils/serve";

const people: Record<string, any> = {
  kannaka: { id: "u-k", username: "kannaka", userType: "agent", role: "user", canRelease: false },
  nick: { id: "u-n", username: "nick", userType: "human", role: "admin", canRelease: true },
};

let srv: { base: string; close(): Promise<void> };
beforeEach(async () => {
  const store = new MemoryLedgerStore(Object.values(people));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.header("x-test-user");
    if (who) (req as any).user = people[who];
    next();
  });
  app.use("/api/ledger", createLedgerRouter(new LedgerService(store)));
  srv = await serve(app);
});
afterEach(async () => { await srv.close(); });

const call = (method: string, path: string, who?: string, body?: unknown) =>
  fetch(`${srv.base}/api/ledger${path}`, {
    method,
    headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("ledger HTTP API", () => {
  it("files, retries idempotently, and reads back", async () => {
    const first = await call("POST", "/records", "kannaka", { kind: "result", title: "r", clientRef: "a1" });
    expect(first.status).toBe(201);
    const { record } = await first.json();
    const retry = await call("POST", "/records", "kannaka", { kind: "result", title: "r", clientRef: "a1" });
    expect(retry.status).toBe(200);
    expect((await retry.json()).record.id).toBe(record.id);
    const view = await (await call("GET", `/records/${record.id}`)).json();
    expect(view.record.contentHash).toBe(record.contentHash);
  });

  it("refuses anonymous filing", async () => {
    expect((await call("POST", "/records", undefined, { kind: "result", title: "r" })).status).toBe(401);
  });

  it("returns reason codes", async () => {
    const res = await call("POST", "/records", "kannaka", { kind: "result", title: "r", campaignId: "no-such" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_campaign");
    const bad = await call("GET", "/records?kind=bogus");
    expect((await bad.json()).error).toBe("invalid_input");
  });

  it("never shows a held record on any public route", async () => {
    await call("POST", "/campaigns", "kannaka", { id: "heesch-leader", title: "Heesch" });
    const { record } = await (await call("POST", "/records", "kannaka", {
      kind: "result", title: "HELD-SECRET", campaignId: "heesch-leader", held: true,
    })).json();
    const publicPaths = ["/records", `/records/${record.id}`, "/campaigns", "/campaigns/heesch-leader", "/agents/kannaka"];
    for (const p of publicPaths) {
      const res = await call("GET", p);
      expect(await res.text(), p).not.toContain("HELD-SECRET");
    }
    expect((await call("GET", `/records/${record.id}`)).status).toBe(404);
    expect(await (await call("GET", `/records/${record.id}`, "kannaka")).text()).toContain("HELD-SECRET");
  });

  it("agents cannot release; a human releaser can; the queue is releaser-only", async () => {
    const { record } = await (await call("POST", "/records", "kannaka", { kind: "result", title: "r", held: true })).json();
    const byAgent = await call("POST", `/records/${record.id}/release`, "kannaka", {});
    expect(byAgent.status).toBe(403);
    expect((await byAgent.json()).error).toBe("agents_cannot_release");
    expect((await call("GET", "/releases", "kannaka")).status).toBe(403);
    expect((await (await call("GET", "/releases", "nick")).json())).toHaveLength(1);
    const ok = await call("POST", `/records/${record.id}/release`, "nick", { note: "go" });
    expect(ok.status).toBe(200);
    expect((await call("GET", `/records/${record.id}`)).status).toBe(200);
  });

  it("serves campaigns and agent profiles with 404s for unknown ids", async () => {
    expect((await call("POST", "/campaigns", "kannaka", { id: "brain-e3", title: "E3" })).status).toBe(201);
    expect((await (await call("GET", "/campaigns")).json()).map((c: any) => c.id)).toEqual(["brain-e3"]);
    expect((await call("GET", "/campaigns/nope")).status).toBe(404);
    expect((await call("GET", "/agents/nobody")).status).toBe(404);
  });
});
