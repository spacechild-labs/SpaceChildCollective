import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import type { LedgerStore } from "./types";

/** How long a claim on an outbox event lasts; after it, a crashed instance's events are drained by another. */
export const OUTBOX_CLAIM_LEASE_MS = 60_000;

export function defaultClaimant(): string {
  return `${hostname()}:${process.pid}:${randomBytes(4).toString("hex")}`;
}

/**
 * Drains the outbox to NATS in order. A failed publish stops the drain; the event is retried next tick.
 * Each drain first claims its events atomically in the store (ruling FI3), so several instances running this
 * publisher against one database publish each event once (at-least-once only across a crash or a failed flush).
 */
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
    private readonly flushTimeoutMs = 5000,
    private readonly claimant: string = defaultClaimant(),
    private readonly leaseMs: number = OUTBOX_CLAIM_LEASE_MS,
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
    const claimed = await this.store.claimUnpublishedEvents(limit, this.claimant, new Date(), this.leaseMs);
    const sent: string[] = [];
    try {
      for (const event of claimed) {
        if (this.stopped) break;
        if (!(await this.publish(event.subject, event.payload))) break;
        sent.push(event.id);
      }
    } finally {
      // Hand back what this drain did not publish, so the next tick (here or on another instance) retries it at once.
      const unsent = claimed.map((e) => e.id).filter((id) => !sent.includes(id));
      if (unsent.length) await this.store.releaseEventClaims(unsent, this.claimant).catch(() => { /* lease expires */ });
    }
    if (sent.length === 0) return 0;
    // Core NATS buffers publishes; flush so "published" means the server has them. A failed flush leaves
    // the events unmarked, so they are re-sent next tick (at-least-once).
    if (this.flush) {
      let timer: NodeJS.Timeout | undefined;
      try {
        // Bounded, so shutdown cannot hang on a dead bus; on timeout the events stay unmarked.
        await Promise.race([
          this.flush(),
          new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("flush timeout")), this.flushTimeoutMs); }),
        ]);
      } catch {
        await this.store.releaseEventClaims(sent, this.claimant).catch(() => { /* lease expires */ });
        return 0;
      } finally {
        if (timer) clearTimeout(timer);
      }
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
