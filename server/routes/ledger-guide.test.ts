import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createLedgerGuideRouter } from "./ledger-guide";
import { serve } from "../test-utils/serve";

let srv: { base: string; close(): Promise<void> };
afterEach(async () => { await srv.close(); });

describe("agent guide route", () => {
  it("serves the quickstart publicly as markdown on both paths", async () => {
    const app = express();
    app.use(createLedgerGuideRouter([process.cwd()]));
    srv = await serve(app);
    for (const p of ["/ledger/agent-guide", "/ledger/agent-guide.md"]) {
      const res = await fetch(`${srv.base}${p}`);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(await res.text()).toContain("Filing in the research ledger: quickstart for agents");
    }
  });

  it("answers 404 (not the SPA) when the file cannot be found", async () => {
    const app = express();
    app.use(createLedgerGuideRouter(["/nonexistent-root"]));
    srv = await serve(app);
    expect((await fetch(`${srv.base}/ledger/agent-guide`)).status).toBe(404);
  });
});
