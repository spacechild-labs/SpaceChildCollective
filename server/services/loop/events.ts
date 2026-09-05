import { EventEmitter } from "events";
import type { Delivery, FeedbackEvent, Finding, StudyDesignRecord } from "@shared/schema";

/**
 * In-process event bus for the Discovery Loop. Stages emit; integrations
 * (the Kannaka bridge, future radio/OBC hooks) subscribe. Keeps the loop
 * services free of knowledge about where events go.
 */
export type LoopEventMap = {
  "study.generated": { study: StudyDesignRecord };
  "study.preregistered": { study: StudyDesignRecord };
  "study.launched": { study: StudyDesignRecord; experimentId: string };
  "study.concluded": { study: StudyDesignRecord; experimentId: string; findingIds: string[] };
  "study.spawned": { study: StudyDesignRecord; fromFinding: Finding; feedback: FeedbackEvent };
  "finding.candidate": { finding: Finding };
  "finding.vetted": { finding: Finding };
  "finding.rejected": { finding: Finding; fails: string[] };
  "finding.delivered": { finding: Finding; delivery: Delivery; channelKind: string; channelName: string };
  "feedback.received": { finding: Finding; feedback: FeedbackEvent };
};

export type LoopEventName = keyof LoopEventMap;

class LoopEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends LoopEventName>(name: K, payload: LoopEventMap[K]): void {
    // Never let a listener failure surface into the loop stage that emitted.
    try {
      this.emitter.emit(name, payload);
    } catch (err: any) {
      console.error(`[loop-events] listener for ${name} threw: ${err?.message ?? err}`);
    }
  }

  on<K extends LoopEventName>(name: K, listener: (payload: LoopEventMap[K]) => unknown): () => void {
    const wrapped = (payload: LoopEventMap[K]) => {
      Promise.resolve()
        .then(() => listener(payload))
        .catch((err) => console.error(`[loop-events] async listener for ${name} failed: ${err?.message ?? err}`));
    };
    this.emitter.on(name, wrapped);
    return () => this.emitter.off(name, wrapped);
  }

  listenerCount(name: LoopEventName): number {
    return this.emitter.listenerCount(name);
  }
}

export const loopEvents = new LoopEvents();
