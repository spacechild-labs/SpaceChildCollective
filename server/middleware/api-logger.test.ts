import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { apiLogger } from "./api-logger";
import { serve } from "../test-utils/serve";

let srv: { base: string; close(): Promise<void> };
afterEach(async () => { await srv.close(); });

describe("apiLogger", () => {
  it("never logs a response body that carries a secret, even a short one", async () => {
    const lines: string[] = [];
    const app = express();
    app.use(apiLogger((l) => lines.push(l)));
    app.post("/api/x", (_req, res) => res.status(201).json({ secret: "scl_SHORT" }));
    app.get("/api/y", (_req, res) => res.json({ ok: 1 }));
    srv = await serve(app);
    await fetch(`${srv.base}/api/x`, { method: "POST" });
    await fetch(`${srv.base}/api/y`);
    await new Promise((r) => setTimeout(r, 50));
    expect(lines.join("\n")).not.toContain("scl_");
    expect(lines.join("\n")).not.toContain("SHORT");
    expect(lines.some((l) => l.includes('"ok":1'))).toBe(true);
  });
});
