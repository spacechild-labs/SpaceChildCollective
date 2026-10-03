import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { LedgerStream } from "./ledger-stream";
import { serve } from "../test-utils/serve";

let srv: { base: string; close(): Promise<void> } | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

async function start(stream: LedgerStream) {
  const app = express();
  app.get("/api/ledger/stream", stream.handler);
  srv = await serve(app);
}
const waitFor = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe("ledger stream", () => {
  it("pushes public events to connected clients as SSE, with the right headers", async () => {
    const stream = new LedgerStream();
    await start(stream);
    const controller = new AbortController();
    const res = await fetch(`${srv!.base}/api/ledger/stream`, { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    expect(text).toContain(": connected");
    await waitFor(() => stream.size === 1);
    stream.notify({ type: "filed", id: "01J9Z3K8Q2A7B5C4D6E8F0G1H2", kind: "result", campaignId: null });
    text = decoder.decode((await reader.read()).value);
    expect(text).toContain("event: filed");
    expect(text).toContain('"id":"01J9Z3K8Q2A7B5C4D6E8F0G1H2"');
    controller.abort();
    await waitFor(() => stream.size === 0);
    expect(stream.size).toBe(0);
  });

  it("rejects clients over the cap with 503 rate_limited and frees the slot on disconnect", async () => {
    const stream = new LedgerStream({ maxClients: 1 });
    await start(stream);
    const c1 = new AbortController();
    await fetch(`${srv!.base}/api/ledger/stream`, { signal: c1.signal });
    await waitFor(() => stream.size === 1);
    const over = await fetch(`${srv!.base}/api/ledger/stream`);
    expect(over.status).toBe(503);
    expect((await over.json()).error).toBe("rate_limited");
    c1.abort();
    await waitFor(() => stream.size === 0);
    const again = new AbortController();
    const ok = await fetch(`${srv!.base}/api/ledger/stream`, { signal: again.signal });
    expect(ok.status).toBe(200);
    again.abort();
  });

  it("sends heartbeat comments", async () => {
    const stream = new LedgerStream({ heartbeatMs: 20 });
    await start(stream);
    const controller = new AbortController();
    const res = await fetch(`${srv!.base}/api/ledger/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let all = decoder.decode((await reader.read()).value);
    for (let i = 0; i < 20 && !all.includes(": hb"); i++) all += decoder.decode((await reader.read()).value);
    expect(all).toContain(": hb");
    controller.abort();
  });
});
