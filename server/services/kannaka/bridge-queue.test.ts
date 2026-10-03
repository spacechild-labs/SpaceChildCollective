import { describe, expect, it, vi } from "vitest";

const subscribeCalls: Array<{ subject: string; opts: unknown }> = [];
vi.mock("nats", () => ({
  StringCodec: () => ({ encode: (s: string) => new TextEncoder().encode(s), decode: (b: Uint8Array) => new TextDecoder().decode(b) }),
  connect: async () => ({
    getServer: () => "nats://fake:4222",
    isClosed: () => false,
    status: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) }),
    subscribe: (subject: string, opts?: unknown) => {
      subscribeCalls.push({ subject, opts });
      return { unsubscribe() {}, [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) };
    },
    drain: async () => {},
    publish() {},
  }),
}));

import { KannakaBridge } from "./bridge";

const config = { servers: ["nats://fake:4222"], primaryAgent: "kannaka-prime", name: "test", requestTimeoutMs: 100 };

describe("KannakaBridge.subscribe queue groups (ruling FI3)", () => {
  it("passes a queue group to NATS when given one, and none for existing callers", async () => {
    const bridge = new KannakaBridge(config);
    await bridge.subscribe("SPACECHILD.ledger.file", async () => {}, { queue: "spacechild-ledger" });
    await bridge.subscribe("SPACECHILD.other", async () => {});
    expect(subscribeCalls.find((c) => c.subject === "SPACECHILD.ledger.file")?.opts).toEqual({ queue: "spacechild-ledger" });
    expect(subscribeCalls.find((c) => c.subject === "SPACECHILD.other")?.opts).toBeUndefined();
    await bridge.stop();
  });
});

describe("ledger door wiring", () => {
  it("server/index.ts subscribes the NATS door with the ledger queue group", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/kannakaBridge\.subscribe\(NATS_FILE_SUBJECT,[^\n]*\{ queue: NATS_FILE_QUEUE \}\)/);
    const { NATS_FILE_QUEUE } = await import("../ledger/nats-door");
    expect(NATS_FILE_QUEUE).toBe("spacechild-ledger");
  });
});
