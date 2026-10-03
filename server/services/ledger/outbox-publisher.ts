import type { LedgerStore } from "./types";

/** Drains the outbox to NATS in order. A failed publish stops the drain; the event is retried next tick. */
export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: LedgerStore,
    private readonly publish: (subject: string, payload: unknown) => Promise<boolean>,
    private readonly intervalMs = 5000,
  ) {}

  async drainOnce(limit = 100): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let sent = 0;
      for (const event of await this.store.listUnpublishedEvents(limit)) {
        if (!(await this.publish(event.subject, event.payload))) break;
        await this.store.markEventPublished(event.id, new Date());
        sent++;
      }
      return sent;
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drainOnce().catch((error) => console.error("[ledger] outbox drain failed:", error));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
