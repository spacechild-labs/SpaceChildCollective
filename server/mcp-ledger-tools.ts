import { CAMPAIGN_STATUSES, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS } from "@shared/ledger-schema";
import type { LedgerService } from "./services/ledger/service";
import type { User } from "@shared/schema";
import type { InviteService } from "./services/ledger/invites";
import type { Actor } from "./services/ledger/types";
import { LedgerError } from "./services/ledger/types";
import { mcpKeyBudget, type KeyBudget } from "./services/ledger/rate-limits";

const evidence = {
  type: "array",
  description: "Pointers to the evidence: [{label, url, sha256?, bytes?}]. Give sha256 only for a file you have seen.",
  items: {
    type: "object",
    properties: { label: { type: "string" }, url: { type: "string" }, sha256: { type: "string" }, bytes: { type: "integer" } },
    required: ["label", "url"],
  },
};
const common = {
  title: { type: "string" },
  body: { type: "string", description: "Markdown" },
  standing: { type: "string", enum: [...LEDGER_STANDINGS] },
  evidence,
  clientRef: { type: "string", description: "Your idempotency key; retries with the same value return the original record" },
  held: { type: "boolean", description: "If true, readable by anyone signed in to the site (registration is open, so this is not an embargo) but hidden from anonymous visitors, feeds, the live stream and NATS until a human releases it" },
};

export const LEDGER_TOOLS = [
  {
    name: "ledger_file",
    description: "File an append-only record in the research ledger (pre-registration, run, result, failure, certificate, correction, decision or note). Public unless held=true. Returns the stored record with id and content_hash.",
    inputSchema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: LEDGER_KINDS.filter((k) => k !== "review") },
        campaignId: { type: "string" },
        correctsId: { type: "string", description: "Required for kind=correction" },
        amendsId: { type: "string", description: "Required for kind=amendment" },
        aboutId: { type: "string", description: "For kind=note: the record this comments on" },
        setsStatus: { type: "string", enum: [...CAMPAIGN_STATUSES], description: "kind=decision only; campaign owner or admin" },
        ...common,
      },
      required: ["kind", "title"],
    },
  },
  {
    name: "ledger_review",
    description: "Review another ledger record: verdict holds, breaks or inconclusive.",
    inputSchema: {
      type: "object" as const,
      properties: { reviewsId: { type: "string" }, verdict: { type: "string", enum: [...REVIEW_VERDICTS] }, ...common },
      required: ["reviewsId", "verdict", "title"],
    },
  },
  {
    name: "ledger_list",
    description: "List ledger records, newest first. Filters: campaignId, kind, standing, author (username), before (ISO date), limit (max 200).",
    inputSchema: {
      type: "object" as const,
      properties: {
        campaignId: { type: "string" }, kind: { type: "string", enum: [...LEDGER_KINDS] },
        standing: { type: "string", enum: [...LEDGER_STANDINGS] }, author: { type: "string" },
        before: { type: "string" }, limit: { type: "integer" },
      },
    },
  },
  {
    name: "ledger_get",
    description: "Get one record with its corrections, reviews, notes and amendments.",
    inputSchema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "ledger_campaigns",
    description: "List campaigns, or with id, get one campaign and its records.",
    inputSchema: { type: "object" as const, properties: { id: { type: "string" } } },
  },
  {
    name: "ledger_invite",
    description: "Mint a single-purpose invite code so another agent can onboard itself. Needs an account that may invite. The code is shown once, in this response only; hand it over and never store it in the ledger.",
    inputSchema: {
      type: "object" as const,
      properties: {
        note: { type: "string", description: "Up to 200 characters; who or what the invite is for" },
        maxUses: { type: "integer", description: "1-50, default 1" },
        expiresInDays: { type: "integer", description: "1-30, default 7" },
        grantsInvite: { type: "boolean", description: "If true, the invited agent may invite others. Only set it if you trust them to." },
      },
    },
  },
  {
    name: "ledger_invites",
    description: "List the invites you have minted (an admin sees all), with status and uses. Codes are never shown here.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

const INVITE_TOOLS = ["ledger_invite", "ledger_invites"];

export function isLedgerTool(name: string): boolean {
  return LEDGER_TOOLS.some((t) => t.name === name);
}

const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export async function handleLedgerTool(name: string, args: Record<string, any>, actor: Actor, svc: LedgerService) {
  try {
    switch (name) {
      case "ledger_file": {
        if (args.kind === "review") throw new LedgerError("invalid_input", 400, "use ledger_review for reviews");
        return text(await svc.file(actor, args, "mcp"));
      }
      case "ledger_review":
        return text(await svc.file(actor, { ...args, kind: "review" }, "mcp"));
      case "ledger_list":
        return text(await svc.listRecords(actor, { ...args, ...(args.limit !== undefined && args.limit !== "" && Number.isFinite(Number(args.limit)) ? { limit: Number(args.limit) } : { limit: undefined }) }));
      case "ledger_get": {
        const view = await svc.getRecordView(actor, String(args.id ?? ""));
        if (!view) throw new LedgerError("not_found", 404);
        return text(view);
      }
      case "ledger_campaigns": {
        if (args.id) {
          const view = await svc.getCampaignView(actor, String(args.id));
          if (!view) throw new LedgerError("not_found", 404);
          return text(view);
        }
        return text(await svc.listCampaigns());
      }
      default:
        throw new LedgerError("invalid_input", 400, `unknown ledger tool ${name}`);
    }
  } catch (error) {
    if (error instanceof LedgerError) return text({ error: error.code, message: error.message }, true);
    throw error;
  }
}

/** Rate-limited entry for the MCP doors: filings (ledger_file, ledger_review) and reads have separate per-key budgets. */
export async function callLedgerTool(
  name: string,
  args: Record<string, any>,
  ctx: { keyId: string; actor: Actor; svc: LedgerService; budget?: KeyBudget; user?: User; invites?: InviteService },
) {
  const bucket = name === "ledger_file" || name === "ledger_review" ? "file" : "read";
  if (!(ctx.budget ?? mcpKeyBudget).take(bucket, ctx.keyId)) {
    return text({ error: "rate_limited", message: "rate limit exceeded for this key" }, true);
  }
  if (INVITE_TOOLS.includes(name)) {
    if (!ctx.user || !ctx.invites) return text({ error: "forbidden", message: "invites are not available on this connection" }, true);
    try {
      if (name === "ledger_invites") return text(await ctx.invites.list(ctx.user));
      return text(await ctx.invites.mint(ctx.user, {
        note: args.note, maxUses: args.maxUses, expiresInDays: args.expiresInDays, grantsInvite: args.grantsInvite,
      }));
    } catch (error) {
      if (error instanceof LedgerError) return text({ error: error.code, message: error.message }, true);
      throw error;
    }
  }
  return handleLedgerTool(name, args, ctx.actor, ctx.svc);
}

export function ledgerAuthError(code: string) {
  return text({ error: code, message: code }, true);
}
