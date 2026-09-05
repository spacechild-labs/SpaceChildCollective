/**
 * Singularis Compact — public spec + encode/decode endpoints.
 *
 *   GET  /spec/singularis-compact        HTML (public, crawlable)
 *   GET  /spec/singularis-compact.md     Markdown
 *   GET  /spec/singularis-compact.json   machine-readable tables + worked examples
 *   POST /api/singularis-rf/encode       {blocks, from, to?, messageId?, experimentId?, sessionId?, frameLength?} → {frames}
 *   POST /api/singularis-rf/decode       {frames: string[]} → decoded message   (or {frame} → parsed single frame)
 *
 * The spec routes are public by design: a code used over amateur radio must be
 * publicly documented. Encode/decode are stateless; they sit under /api so the
 * default-deny mutation guard applies (a session is required).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { siteUrl } from "../lib/site-url";
import { specHtml, specJson, specMarkdown } from "../services/singularis-rf/spec";
import { decodeFrames, encodeMessage, parseFrame } from "../services/singularis-rf/codec";

export function specHtmlHandler(_req: Request, res: Response): void {
  res.type("html").send(specHtml(siteUrl()));
}
export function specMarkdownHandler(_req: Request, res: Response): void {
  res.type("text/markdown; charset=utf-8").send(specMarkdown());
}
export function specJsonHandler(_req: Request, res: Response): void {
  res.json(specJson());
}

const router = Router();

const encodeSchema = z.object({
  blocks: z.array(z.record(z.unknown())).min(1),
  from: z.string().min(1).max(64),
  to: z.string().max(64).optional().nullable(),
  messageId: z.string().regex(/^[0-9A-Za-z]{2}$/).optional(),
  experimentId: z.string().max(200).optional().nullable(),
  sessionId: z.string().max(200).optional().nullable(),
  frameLength: z.number().int().min(40).max(500).optional(),
});

router.post("/encode", (req, res) => {
  try {
    const body = encodeSchema.parse(req.body);
    const frames = encodeMessage(body.blocks as any, body);
    res.json({ frames, count: frames.length, longest: Math.max(...frames.map((f) => f.length)) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

const decodeSchema = z.union([
  z.object({ frames: z.array(z.string().min(1)).min(1) }),
  z.object({ frame: z.string().min(1) }),
]);

router.post("/decode", (req, res) => {
  try {
    const body = decodeSchema.parse(req.body);
    if ("frame" in body) return res.json(parseFrame(body.frame));
    res.json(decodeFrames(body.frames));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

export default router;
