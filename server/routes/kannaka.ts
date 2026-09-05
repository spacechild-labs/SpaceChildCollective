/**
 * Constellation API — the Collective's window onto the Kannaka swarm.
 *
 *   GET  /api/kannaka/status                 bridge state, live consciousness, presence count
 *   GET  /api/kannaka/presence               who is on the bus right now
 *   GET  /api/kannaka/recall?q=&topK=         resonance-ranked memories from the primary node
 *   POST /api/kannaka/ask {text, mode?}      Kannaka's synthesized answer (auth)
 *   POST /api/kannaka/market-proposal/:studyId  shape a preregistered hypothesis for GhostSignals (auth)
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { loopStorage } from "../loop-storage";
import { kannakaBridge } from "../services/kannaka/bridge";
import { marketProposalFromDesign, SPACECHILD_SUBJECTS } from "../services/kannaka/helpers";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ ...kannakaBridge.status(), consciousnessByAgent: kannakaBridge.consciousnessAll() });
});

router.get("/presence", (_req, res) => {
  const agents = kannakaBridge.presenceRoster();
  const startedAt = kannakaBridge.status().startedAt;
  // Presence is learned from live heartbeats (every ~10-30s); right after boot the roster is empty by construction.
  const warmingUp = agents.length === 0 && Boolean(startedAt) && Date.now() - new Date(startedAt!).getTime() < 60_000;
  res.json({ enabled: kannakaBridge.enabled, warmingUp, agents });
});

router.get("/recall", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.status(400).json({ error: "q is required" });
  if (!kannakaBridge.enabled) return res.status(503).json({ error: "Kannaka bridge is not configured (KANNAKA_NATS_URL)" });
  const topK = Math.max(1, Math.min(50, Number(req.query.topK ?? 8)));
  const results = await kannakaBridge.recall(q, topK);
  res.json({ from: kannakaBridge.primaryAgent, query: q, results });
});

const askSchema = z.object({ text: z.string().min(3).max(4000), mode: z.string().max(40).optional() });

router.post("/ask", requireAuth, async (req, res) => {
  try {
    const body = askSchema.parse(req.body);
    if (!kannakaBridge.enabled) return res.status(503).json({ error: "Kannaka bridge is not configured (KANNAKA_NATS_URL)" });
    const answer = await kannakaBridge.ask(body.text, body.mode ?? "recall");
    if (!answer) return res.status(504).json({ error: "No answer from the constellation", lastError: kannakaBridge.status().lastError });
    res.json(answer);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.post("/market-proposal/:studyId", requireAuth, async (req, res) => {
  try {
    const study = await loopStorage.getStudyDesign(req.params.studyId);
    if (!study) return res.status(404).json({ error: "Study design not found" });
    if (!study.preregistrationHash) return res.status(400).json({ error: "Preregister the study first; only frozen hypotheses become markets" });
    const proposal = marketProposalFromDesign(study, { settleDays: req.body?.settleDays ? Number(req.body.settleDays) : undefined });
    if (!proposal) return res.status(400).json({ error: "Study has no falsifiable hypothesis to propose" });
    const published = await kannakaBridge.publish(SPACECHILD_SUBJECTS.marketProposal, { ...proposal, proposed_by: req.user!.id, ts: new Date().toISOString() });
    res.json({ proposal, published, howToFile: "Use the Command Center `propose_prediction` tool with statement + settles_by; the collective cannot trade its own proposal." });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
