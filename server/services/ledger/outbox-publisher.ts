import type { LedgerStore } from "./types";

/** Drains the outbox to NATS in order. A failed publish stops the drain; the event is retried next tick. */
export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private inflight: Promise<number> | null = null;

  constructor(
    private readonly store: LedgerStore,
    private readonly publish: (subject: string, payload: unknown) => Promise<boolean>,
    private readonly intervalMs = 5000,
    private readonly flush?: () => Promise<void>,
  ) {}

  async drainOnce(limit = 100): Promise<number> {
    if (this.running || this.stopped) return 0;
    this.running = true;
    const run = this.drain(limit);
    this.inflight = run;
    try {
      return await run;
    } finally {
      this.running = false;
      this.inflight = null;
    }
  }

  private async drain(limit: number): Promise<number> {
    const sent: string[] = [];
    for (const event of await this.store.listUnpublishedEvents(limit)) {
      if (this.stopped) break;
      if (!(await this.publish(event.subject, event.payload))) break;
      sent.push(event.id);
    }
    if (sent.length === 0) return 0;
    // Core NATS buffers publishes; flush so "published" means the server has them. A failed flush leaves
    // the events unmarked, so they are re-sent next tick (at-least-once).
    if (this.flush) {
      try { await this.flush(); } catch { return 0; }
    }
    for (const id of sent) await this.store.markEventPublished(id, new Date());
    return sent.length;
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.drainOnce().catch((error) => console.error("[ledger] outbox drain failed:", error));
    }, this.intervalMs);
  }

  /** Stops the timer and waits for a drain already in flight; nothing is published after this resolves. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => 0);
  }
}
