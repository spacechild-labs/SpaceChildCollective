/**
 * Discovery Loop API
 *
 *   /api/loop/studies     generate → preregister → launch → harvest
 *   /api/loop/findings    candidates → vet → review/approve → route → deliver
 *   /api/loop/channels    where vetted findings go
 *   /api/loop/deliveries  the ledger (+ retry)
 *   /api/loop/feedback    what came back (+ signed inbound webhook) → next study
 *   /api/loop/lineage/:id the graph of a finding's ancestry and descendants
 *   /feed/findings.xml    public Atom feed of delivered findings (pull channel)
 */
import { Router as ExpressRouter, type Request, type Response } from "express";
import { z } from "zod";
import { loopStorage } from "../loop-storage";
import { requireAuth } from "../middleware/auth";
import { discoveryLoop, studyGenerator, vettingPipeline, deliveryWorker, feedbackService } from "../services/loop";
import { FEEDBACK_KINDS } from "../services/loop/feedback";
import { router as findingRouter } from "../services/loop/router";
import { SECRET_CONFIG_FIELDS, verifySignature } from "../services/loop/delivery";
import { openFields, redactFields, sealFields } from "../lib/secretbox";
import type { ChannelKind, DistributionChannel, FeedbackKind, FindingStatus } from "@shared/schema";

const loopRouter = ExpressRouter();

function fail(res: Response, err: any, status = 500) {
  const message = err?.message ?? String(err);
  const code = /not found/i.test(message) ? 404 : /required|must be|only|cannot|unknown|invalid|is not/i.test(message) ? 400 : status;
  res.status(code).json({ error: message });
}

function publicChannel(c: DistributionChannel) {
  return { ...c, config: redactFields((c.config ?? {}) as Record<string, any>, SECRET_CONFIG_FIELDS) };
}

// ---------------------------------------------------------------------------
// Studies
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  prompt: z.string().min(3).max(4000),
  preferences: z
    .object({
      paradigm: z.string().optional(),
      complexity: z.enum(["simple", "moderate", "complex"]).optional(),
      duration: z.enum(["short", "medium", "long"]).optional(),
      novelty: z.enum(["conservative", "balanced", "innovative"]).optional(),
    })
    .optional(),
  context: z
    .object({
      previousStudies: z.array(z.string()).optional(),
      theoreticalInterests: z.array(z.string()).optional(),
      availableResources: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
    })
    .optional(),
  preregister: z.boolean().optional(),
  launch: z.boolean().optional(),
  run: z.boolean().optional(),
});

loopRouter.post("/studies", requireAuth, async (req, res) => {
  try {
    const body = generateSchema.parse(req.body);
    const result = await studyGenerator.generate({
      prompt: body.prompt,
      ownerId: req.user!.id,
      preferences: body.preferences as any,
      context: body.context,
    });
    let record = result.record;
    let launch: { experimentId: string; findings: any[] } | null = null;
    if (body.preregister) record = await studyGenerator.preregister(record.id);
    if (body.launch || body.run) {
      const l = await studyGenerator.launch(record.id, { run: Boolean(body.run), actorId: req.user!.id });
      record = l.record;
      launch = { experimentId: l.experimentId, findings: l.findings };
    }
    res.json({ success: true, study: record, design: result.design, generator: result.generator, llmError: result.llmError ?? null, launch });
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.get("/studies", async (req, res) => {
  try {
    const rows = await loopStorage.listStudyDesigns({
      ownerId: typeof req.query.ownerId === "string" ? req.query.ownerId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      limit: Math.min(500, Number(req.query.limit ?? 100)),
    });
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.get("/studies/:id", async (req, res) => {
  try {
    const record = await loopStorage.getStudyDesign(req.params.id);
    if (!record) return res.status(404).json({ error: "Study design not found" });
    const [findings, children] = await Promise.all([
      loopStorage.listFindings({ studyDesignId: record.id, limit: 100 }),
      loopStorage.listChildDesigns(record.id),
    ]);
    const parent = record.parentDesignId ? await loopStorage.getStudyDesign(record.parentDesignId) : null;
    res.json({ ...record, findings, children, parent });
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/studies/:id/preregister", requireAuth, async (req, res) => {
  try {
    const anchorChain = req.body?.anchorChain === "base" || req.body?.anchorChain === "neox" ? req.body.anchorChain : undefined;
    const record = await studyGenerator.preregister(req.params.id, { anchorChain });
    res.json(record);
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.get("/studies/:id/verify", async (req, res) => {
  try {
    res.json(await studyGenerator.verifyPreregistration(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/studies/:id/launch", requireAuth, async (req, res) => {
  try {
    const result = await studyGenerator.launch(req.params.id, { run: Boolean(req.body?.run), actorId: req.user!.id });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/studies/:id/harvest", requireAuth, async (req, res) => {
  try {
    const created = await studyGenerator.harvest(req.params.id, req.user!.id);
    res.json({ created });
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/studies/:id/archive", requireAuth, async (req, res) => {
  try {
    res.json(await loopStorage.updateStudyDesign(req.params.id, { status: "archived" }));
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const FINDING_STATUSES: FindingStatus[] = ["candidate", "vetting", "vetted", "rejected", "routed", "delivered", "archived"];

loopRouter.get("/findings", async (req, res) => {
  try {
    const statusParam = typeof req.query.status === "string" ? req.query.status.split(",").filter((s) => FINDING_STATUSES.includes(s as FindingStatus)) : [];
    const rows = await loopStorage.listFindings({
      status: statusParam.length ? (statusParam as FindingStatus[]) : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      studyDesignId: typeof req.query.studyDesignId === "string" ? req.query.studyDesignId : undefined,
      experimentId: typeof req.query.experimentId === "string" ? req.query.experimentId : undefined,
      limit: Math.min(500, Number(req.query.limit ?? 200)),
    });
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.get("/findings/:id", async (req, res) => {
  try {
    const finding = await loopStorage.getFinding(req.params.id);
    if (!finding) return res.status(404).json({ error: "Finding not found" });
    const [reviews, deliveries, feedback] = await Promise.all([
      loopStorage.listVettingReviews(finding.id),
      loopStorage.listDeliveries({ findingId: finding.id }),
      loopStorage.listFeedbackEvents({ findingId: finding.id }),
    ]);
    res.json({ ...finding, reviews, deliveries, feedback });
  } catch (err) {
    fail(res, err);
  }
});

const manualFindingSchema = z.object({
  title: z.string().min(3).max(300),
  claim: z.string().min(10).max(2000),
  summary: z.string().max(4000).optional(),
  evidence: z.record(z.unknown()).default({}),
  category: z.string().min(1).max(100),
  tags: z.array(z.string()).max(20).optional(),
  confidence: z.number().min(0).max(100).default(50),
  simulated: z.boolean().default(false),
  paperId: z.string().optional(),
  experimentId: z.string().optional(),
  studyDesignId: z.string().optional(),
});

loopRouter.post("/findings", requireAuth, async (req, res) => {
  try {
    const body = manualFindingSchema.parse(req.body);
    const { persistCandidates } = await import("../services/loop/findings-extractor");
    const { created, skipped } = await persistCandidates([
      {
        title: body.title,
        claim: body.claim,
        summary: body.summary,
        evidence: body.evidence,
        category: body.category,
        tags: body.tags ?? [],
        confidence: body.confidence,
        simulated: body.simulated,
        source: req.user!.userType === "agent" ? "agent" : "manual",
        paperId: body.paperId ?? null,
        experimentId: body.experimentId ?? null,
        studyDesignId: body.studyDesignId ?? null,
        createdBy: req.user!.id,
      },
    ]);
    if (!created.length) return res.status(409).json({ error: "An identical finding already exists", skipped });
    res.status(201).json(created[0]);
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/findings/from-paper/:paperId", requireAuth, async (req, res) => {
  try {
    res.json(await discoveryLoop.findingsFromPaper(req.params.paperId, req.user!.id));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/findings/:id/vet", requireAuth, async (req, res) => {
  try {
    res.json(await vettingPipeline.vet(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

/** Vet, and if it clears, route + deliver in one call. */
loopRouter.post("/findings/:id/process", requireAuth, async (req, res) => {
  try {
    res.json(await discoveryLoop.processFinding(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

const reviewSchema = z.object({
  verdict: z.enum(["pass", "flag", "fail"]),
  notes: z.string().max(4000).optional(),
  score: z.number().min(0).max(100).optional(),
  /** When a human passes a finding, dispatch it immediately (default true). */
  dispatch: z.boolean().optional(),
});

loopRouter.post("/findings/:id/reviews", requireAuth, async (req, res) => {
  try {
    const body = reviewSchema.parse(req.body);
    const reviewerType = req.user!.userType === "agent" ? "agent" : "human";
    const result = await vettingPipeline.review(req.params.id, {
      reviewerType,
      reviewerId: req.user!.id,
      verdict: body.verdict,
      notes: body.notes,
      score: body.score,
    });
    let dispatched: any = null;
    if (reviewerType === "human" && result.finding.status === "vetted" && body.dispatch !== false) {
      dispatched = await discoveryLoop.dispatch(result.finding.id);
    }
    res.json({ ...result, finding: dispatched?.finding ?? result.finding, dispatched });
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.get("/findings/:id/plan", async (req, res) => {
  try {
    const finding = await loopStorage.getFinding(req.params.id);
    if (!finding) return res.status(404).json({ error: "Finding not found" });
    const decisions = await findingRouter.plan(finding);
    res.json(decisions.map((d) => ({ channel: publicChannel(d.channel), matched: d.matched, reason: d.reason })));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/findings/:id/route", requireAuth, async (req, res) => {
  try {
    res.json(await discoveryLoop.dispatch(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/findings/:id/archive", requireAuth, async (req, res) => {
  try {
    res.json(await loopStorage.updateFinding(req.params.id, { status: "archived" }));
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

const CHANNEL_KINDS: ChannelKind[] = ["webhook", "kannaka", "nats", "mcp_subscriber", "feed", "blockchain", "rf"];

const channelSchema = z.object({
  kind: z.enum(CHANNEL_KINDS as [ChannelKind, ...ChannelKind[]]),
  name: z.string().min(1).max(120),
  config: z.record(z.unknown()).default({}),
  filters: z
    .object({
      categories: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      minConfidence: z.number().min(0).max(100).optional(),
      minNovelty: z.number().min(0).max(100).optional(),
      sources: z.array(z.enum(["experiment", "paper", "manual", "agent"])).optional(),
    })
    .optional(),
  acceptsSimulated: z.boolean().default(false),
  active: z.boolean().default(true),
});

function validateChannelConfig(kind: ChannelKind, config: Record<string, any>): string | null {
  switch (kind) {
    case "webhook":
      return /^https?:\/\//.test(String(config.url ?? "")) ? null : "webhook channels need config.url (http/https)";
    case "mcp_subscriber":
      return config.agentId ? null : "mcp_subscriber channels need config.agentId";
    case "blockchain":
      return config.chain === undefined || config.chain === "base" || config.chain === "neox" ? null : "config.chain must be base or neox";
    case "rf":
      if (!config.station || !/^[A-Za-z0-9-]{1,16}$/.test(String(config.station))) return "rf channels need config.station (the singularis-rf station id / callsign, A-Z 0-9 -)";
      if (config.to && String(config.to) !== "*" && !/^[@A-Za-z0-9-]{1,16}$/.test(String(config.to))) return "config.to must be a callsign, @ALLCALL or *";
      if (config.maxFrames !== undefined && !(Number(config.maxFrames) >= 1 && Number(config.maxFrames) <= 40)) return "config.maxFrames must be 1-40";
      return null;
    default:
      return null;
  }
}

loopRouter.get("/channels", requireAuth, async (req, res) => {
  try {
    const rows = await loopStorage.listChannels({ ownerId: req.user!.role === "admin" ? undefined : req.user!.id });
    res.json(rows.map(publicChannel));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/channels", requireAuth, async (req, res) => {
  try {
    const body = channelSchema.parse(req.body);
    const problem = validateChannelConfig(body.kind, body.config as Record<string, any>);
    if (problem) return res.status(400).json({ error: problem });
    const channel = await loopStorage.createChannel({
      ownerId: req.user!.id,
      kind: body.kind,
      name: body.name,
      config: sealFields(body.config as Record<string, any>, SECRET_CONFIG_FIELDS),
      filters: body.filters ?? null,
      acceptsSimulated: body.acceptsSimulated,
      active: body.active,
    });
    res.status(201).json(publicChannel(channel));
  } catch (err) {
    fail(res, err);
  }
});

async function ownedChannel(req: Request, res: Response): Promise<DistributionChannel | null> {
  const channel = await loopStorage.getChannel(req.params.id);
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return null; }
  if (channel.ownerId !== req.user!.id && req.user!.role !== "admin") { res.status(403).json({ error: "Not your channel" }); return null; }
  return channel;
}

loopRouter.patch("/channels/:id", requireAuth, async (req, res) => {
  try {
    const channel = await ownedChannel(req, res);
    if (!channel) return;
    const body = channelSchema.partial().parse(req.body);
    const updates: Record<string, unknown> = { ...body };
    if (body.config) {
      // Keep existing secrets when the client sends the redaction marker back.
      const merged: Record<string, any> = { ...(channel.config as Record<string, any>), ...(body.config as Record<string, any>) };
      for (const f of SECRET_CONFIG_FIELDS) if (merged[f] === "••••••") merged[f] = (channel.config as Record<string, any>)[f];
      const problem = validateChannelConfig(body.kind ?? channel.kind, openFields(merged, SECRET_CONFIG_FIELDS));
      if (problem) return res.status(400).json({ error: problem });
      updates.config = sealFields(merged, SECRET_CONFIG_FIELDS);
    }
    res.json(publicChannel(await loopStorage.updateChannel(channel.id, updates as any)));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.delete("/channels/:id", requireAuth, async (req, res) => {
  try {
    const channel = await ownedChannel(req, res);
    if (!channel) return;
    await loopStorage.deleteChannel(channel.id);
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

loopRouter.get("/deliveries", requireAuth, async (req, res) => {
  try {
    const rows = await loopStorage.listDeliveries({
      findingId: typeof req.query.findingId === "string" ? req.query.findingId : undefined,
      channelId: typeof req.query.channelId === "string" ? req.query.channelId : undefined,
      status: typeof req.query.status === "string" ? (req.query.status as any) : undefined,
      limit: Math.min(500, Number(req.query.limit ?? 200)),
    });
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/deliveries/:id/retry", requireAuth, async (req, res) => {
  try {
    const delivery = await loopStorage.getDelivery(req.params.id);
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.status === "failed" || delivery.status === "skipped") {
      await loopStorage.updateDelivery(delivery.id, { status: "queued", nextAttemptAt: null });
    }
    res.json(await deliveryWorker.attempt(delivery.id));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/deliveries/tick", requireAuth, async (_req, res) => {
  try {
    res.json(await deliveryWorker.tick());
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const feedbackSchema = z.object({
  findingId: z.string().min(1),
  kind: z.enum(FEEDBACK_KINDS as [FeedbackKind, ...FeedbackKind[]]),
  payload: z.record(z.unknown()).optional(),
  text: z.string().max(8000).optional(),
  deliveryId: z.string().optional(),
  spawnFollowUp: z.boolean().optional(),
});

loopRouter.get("/feedback", async (req, res) => {
  try {
    res.json(await feedbackService.list(typeof req.query.findingId === "string" ? req.query.findingId : undefined, Math.min(500, Number(req.query.limit ?? 200))));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.post("/feedback", requireAuth, async (req, res) => {
  try {
    const body = feedbackSchema.parse(req.body);
    const payload = { ...(body.payload ?? {}), ...(body.text ? { text: body.text } : {}) };
    const result = await feedbackService.ingest({
      findingId: body.findingId,
      kind: body.kind,
      payload,
      deliveryId: body.deliveryId ?? null,
      actorId: req.user!.id,
      spawnFollowUp: body.spawnFollowUp,
    });
    res.status(201).json(result);
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Inbound feedback from a channel consumer. Public (no session) but must be
 * HMAC-signed with the channel's secret — the same secret we sign deliveries
 * with — so only the party we delivered to can talk back.
 */
loopRouter.post("/feedback/inbound/:channelId", async (req, res) => {
  try {
    const channel = await loopStorage.getChannel(req.params.channelId);
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    let config: Record<string, any>;
    try {
      config = openFields((channel.config ?? {}) as Record<string, any>, SECRET_CONFIG_FIELDS);
    } catch {
      return res.status(403).json({ error: "This channel's secret cannot be decrypted (ENCRYPTION_KEY changed); the owner must re-enter it" });
    }
    const secret = String(config.secret ?? "");
    if (!secret) return res.status(403).json({ error: "This channel has no secret; inbound feedback is disabled" });
    const raw = (req as any).rawBody instanceof Buffer ? (req as any).rawBody.toString("utf8") : JSON.stringify(req.body ?? {});
    if (!verifySignature(secret, raw, req.header("X-SpaceChild-Signature"))) return res.status(401).json({ error: "Bad signature" });

    const body = feedbackSchema.parse(req.body);
    const payload = { ...(body.payload ?? {}), ...(body.text ? { text: body.text } : {}) };
    if (body.deliveryId) {
      const delivery = await loopStorage.getDelivery(body.deliveryId);
      if (!delivery || delivery.channelId !== channel.id || delivery.findingId !== body.findingId) return res.status(400).json({ error: "deliveryId does not belong to this channel/finding" });
    }
    const result = await feedbackService.ingest({
      findingId: body.findingId,
      kind: body.kind,
      payload,
      deliveryId: body.deliveryId ?? null,
      channelId: channel.id,
      externalActor: channel.name,
      spawnFollowUp: body.spawnFollowUp,
    });
    res.status(201).json({ feedbackId: result.event.id, spawnedStudyId: result.spawned?.id ?? null });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Lineage + stats
// ---------------------------------------------------------------------------

loopRouter.get("/lineage/:findingId", async (req, res) => {
  try {
    res.json(await discoveryLoop.lineage(req.params.findingId));
  } catch (err) {
    fail(res, err);
  }
});

loopRouter.get("/stats", async (_req, res) => {
  try {
    res.json(await discoveryLoop.stats());
  } catch (err) {
    fail(res, err);
  }
});

export default loopRouter;

// ---------------------------------------------------------------------------
// Public Atom feed (pull channel)
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

export async function findingsFeedHandler(req: Request, res: Response): Promise<void> {
  try {
    const includeSimulated = req.query.simulated === "1";
    const rows = (await loopStorage.listFindings({ status: ["routed", "delivered"], limit: 100 })).filter((f) => includeSimulated || !f.simulated);
    const base = `${req.protocol}://${req.get("host")}`;
    const updated = rows[0]?.updatedAt ?? new Date();
    const entries = rows
      .map((f) => {
        const ev: any = f.evidence ?? {};
        const stats = [ev.n != null ? `n=${ev.n}` : null, ev.pValue != null ? `p=${ev.pValue}` : null].filter(Boolean).join(", ");
        return [
          "  <entry>",
          `    <id>urn:spacechild:finding:${f.id}</id>`,
          `    <title>${xmlEscape(f.title)}</title>`,
          `    <link href="${base}/api/loop/findings/${f.id}"/>`,
          `    <updated>${f.updatedAt.toISOString()}</updated>`,
          `    <category term="${xmlEscape(f.category)}"/>`,
          ...(f.simulated ? ['    <category term="simulated"/>'] : []),
          `    <summary type="text">${xmlEscape(f.claim)}${stats ? ` (${xmlEscape(stats)})` : ""}${f.simulated ? " [SIMULATED]" : ""}</summary>`,
          "  </entry>",
        ].join("\n");
      })
      .join("\n");
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      "  <title>Space Child Research Collective — vetted findings</title>",
      `  <id>${base}/feed/findings.xml</id>`,
      `  <link rel="self" href="${base}/feed/findings.xml"/>`,
      `  <updated>${updated.toISOString()}</updated>`,
      entries,
      "</feed>",
    ].join("\n");
    res.type("application/atom+xml").send(xml);
  } catch (err: any) {
    res.status(500).type("text/plain").send(err?.message ?? "feed error");
  }
}
