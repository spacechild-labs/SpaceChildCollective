import { describe, expect, it } from "vitest";
import { MemoryLedgerStore } from "./memory-store";
import { LedgerService } from "./service";
import { OutboxPublisher } from "./outbox-publisher";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };

describe("outbox publisher", () => {
  it("publishes in order and marks events published", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    await svc.file(agent, { kind: "result", title: "a" }, "api");
    await svc.file(agent, { kind: "result", title: "b" }, "api");
    const sent: Array<{ subject: string; title?: unknown }> = [];
    const pub = new OutboxPublisher(store, async (subject, payload: any) => { sent.push({ subject, title: payload.id }); return true; });
    expect(await pub.drainOnce()).toBe(2);
    expect(sent.map((s) => s.subject)).toEqual(["SPACECHILD.ledger.record.filed", "SPACECHILD.ledger.record.filed"]);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });

  it("stops at the first failed publish and keeps the rest for next time", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    await svc.file(agent, { kind: "result", title: "a" }, "api");
    await svc.file(agent, { kind: "result", title: "b" }, "api");
    const pub = new OutboxPublisher(store, async () => false);
    expect(await pub.drainOnce()).toBe(0);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(2);
  });

  it("emits nothing for a held record until release, then only the released event", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    const nick = { id: "u-n", username: "nick", userType: "human" as const, role: "admin" as const, canRelease: true };
    const rec = await svc.file(agent, { kind: "result", title: "secret", held: true }, "nats");
    const sent: string[] = [];
    const pub = new OutboxPublisher(store, async (subject) => { sent.push(subject); return true; });
    expect(await pub.drainOnce()).toBe(0);
    expect(sent).toEqual([]);
    await svc.release(nick, rec.record.id);
    expect(await pub.drainOnce()).toBe(1);
    expect(sent).toEqual(["SPACECHILD.ledger.record.released"]);
  });

  it("stop() waits for an in-flight drain and nothing is published after it", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    await svc.file(agent, { kind: "result", title: "a" }, "api");
    await svc.file(agent, { kind: "result", title: "b" }, "api");
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sent: string[] = [];
    const pub = new OutboxPublisher(store, async (subject) => { sent.push(subject); await gate; return true; });
    const drain = pub.drainOnce();
    await new Promise((r) => setTimeout(r, 10));
    let stopped = false;
    const stopping = pub.stop().then(() => { stopped = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(stopped).toBe(false);
    release();
    await stopping;
    await drain;
    expect(sent).toHaveLength(1);
    expect(await pub.drainOnce()).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("flushes before marking published; a failed flush leaves events for retry", async () => {
    const store = new MemoryLedgerStore([agent]);
    const svc = new LedgerService(store);
    await svc.file(agent, { kind: "result", title: "a" }, "api");
    let fail = true;
    let flushes = 0;
    const pub = new OutboxPublisher(store, async () => true, 5000, async () => { flushes++; if (fail) throw new Error("down"); });
    expect(await pub.drainOnce()).toBe(0);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(1);
    fail = false;
    expect(await pub.drainOnce()).toBe(1);
    expect(flushes).toBe(2);
    expect(await store.listUnpublishedEvents(10)).toHaveLength(0);
  });
});
