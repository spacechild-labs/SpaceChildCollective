import { z } from "zod";
import {
  CAMPAIGN_ID_RE, CAMPAIGN_STATUSES, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS,
} from "./ledger-schema";

export const LEDGER_RULE_CODES = ["invalid_link", "missing_verdict"] as const;

const recordId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "record ids are 26-character ULIDs");

export const evidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex characters").optional(),
  bytes: z.number().int().nonnegative().optional(),
}).strict();

export const recordInputSchema = z.object({
  campaignId: z.string().regex(CAMPAIGN_ID_RE).nullable().optional(),
  kind: z.enum(LEDGER_KINDS),
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100_000).default(""),
  standing: z.enum(LEDGER_STANDINGS).default("unverified"),
  evidence: z.array(evidenceSchema).max(100).default([]),
  correctsId: recordId.nullable().optional(),
  reviewsId: recordId.nullable().optional(),
  verdict: z.enum(REVIEW_VERDICTS).nullable().optional(),
  amendsId: recordId.nullable().optional(),
  aboutId: recordId.nullable().optional(),
  setsStatus: z.enum(CAMPAIGN_STATUSES).nullable().optional(),
  clientRef: z.string().trim().min(1).max(200).nullable().optional(),
  held: z.boolean().default(false),
}).strict().superRefine((r, ctx) => {
  const bad = (message: (typeof LEDGER_RULE_CODES)[number], path: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
  if (r.kind === "review") {
    if (!r.reviewsId) bad("invalid_link", "reviewsId");
    if (!r.verdict) bad("missing_verdict", "verdict");
  } else {
    if (r.reviewsId) bad("invalid_link", "reviewsId");
    if (r.verdict) bad("invalid_link", "verdict");
  }
  if ((r.kind === "correction") !== Boolean(r.correctsId)) bad("invalid_link", "correctsId");
  if ((r.kind === "amendment") !== Boolean(r.amendsId)) bad("invalid_link", "amendsId");
  if (r.aboutId && r.kind !== "note") bad("invalid_link", "aboutId");
  if (r.setsStatus && r.kind !== "decision") bad("invalid_link", "setsStatus");
});
export type RecordInput = z.infer<typeof recordInputSchema>;

export const campaignInputSchema = z.object({
  id: z.string().regex(CAMPAIGN_ID_RE),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(5000).default(""),
  links: z.array(z.object({ label: z.string().trim().min(1).max(200), url: z.string().url().max(2000) }).strict()).max(50).default([]),
}).strict();
export type CampaignInput = z.infer<typeof campaignInputSchema>;
