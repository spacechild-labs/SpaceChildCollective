import type { ChannelFilters, Delivery, DistributionChannel, Finding } from "@shared/schema";
import { loopStorage } from "../../loop-storage";

/**
 * Routing: decide which registered channels a vetted finding should reach and
 * enqueue one idempotent delivery per (finding, channel).
 */

export interface RouteDecision {
  channel: DistributionChannel;
  matched: boolean;
  reason: string;
}

export function idempotencyKey(findingId: string, channelId: string): string {
  return `${findingId}:${channelId}`;
}

/** Pure matcher — exported so it can be unit-tested. */
export function channelMatches(
  finding: Pick<Finding, "category" | "tags" | "confidence" | "novelty" | "simulated" | "source">,
  channel: Pick<DistributionChannel, "active" | "acceptsSimulated" | "filters">,
): { matched: boolean; reason: string } {
  if (!channel.active) return { matched: false, reason: "channel inactive" };
  if (finding.simulated && !channel.acceptsSimulated) return { matched: false, reason: "channel does not accept simulated findings" };
  const f: ChannelFilters = (channel.filters ?? {}) as ChannelFilters;
  if (f.categories?.length && !f.categories.includes(finding.category)) return { matched: false, reason: `category ${finding.category} not in channel filter` };
  if (f.sources?.length && !f.sources.includes(finding.source)) return { matched: false, reason: `source ${finding.source} not in channel filter` };
  if (f.tags?.length) {
    const tags = new Set(finding.tags ?? []);
    if (!f.tags.some((t) => tags.has(t))) return { matched: false, reason: "no overlapping tags" };
  }
  if (f.minConfidence != null && finding.confidence < f.minConfidence) return { matched: false, reason: `confidence ${finding.confidence} < ${f.minConfidence}` };
  if (f.minNovelty != null && (finding.novelty ?? 0) < f.minNovelty) return { matched: false, reason: `novelty ${finding.novelty ?? 0} < ${f.minNovelty}` };
  return { matched: true, reason: "matches channel filters" };
}

export class Router {
  async plan(finding: Finding): Promise<RouteDecision[]> {
    const channels = await loopStorage.listChannels({ activeOnly: true });
    return channels.map((channel) => ({ channel, ...channelMatches(finding, channel) }));
  }

  /** Enqueue deliveries for a vetted finding. Returns the deliveries created (existing ones are not duplicated). */
  async route(findingId: string): Promise<{ finding: Finding; decisions: RouteDecision[]; deliveries: Delivery[] }> {
    const finding = await loopStorage.getFinding(findingId);
    if (!finding) throw new Error("Finding not found");
    if (!["vetted", "routed", "delivered"].includes(finding.status)) {
      throw new Error(`Finding is ${finding.status}; only vetted findings can be routed`);
    }
    const decisions = await this.plan(finding);
    const created: Delivery[] = [];
    for (const d of decisions) {
      if (!d.matched) continue;
      const delivery = await loopStorage.createDelivery({
        findingId,
        channelId: d.channel.id,
        status: "queued",
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        receipt: null,
        idempotencyKey: idempotencyKey(findingId, d.channel.id),
      });
      if (delivery) created.push(delivery);
    }
    const anyMatch = decisions.some((d) => d.matched);
    const updated = anyMatch && finding.status === "vetted" ? await loopStorage.updateFinding(findingId, { status: "routed" }) : finding;
    return { finding: updated, decisions, deliveries: created };
  }
}

export const router = new Router();
