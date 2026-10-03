import { describe, expect, it } from "vitest";
import type { User } from "@shared/schema";
import { MemoryAgentKeyStore, MemoryInviteStore, MemoryLedgerStore } from "./services/ledger/memory-store";
import { LedgerService } from "./services/ledger/service";
import { InviteService } from "./services/ledger/invites";
import { AgentKeyService } from "./services/ledger/agent-keys";
import { KeyBudget } from "./services/ledger/rate-limits";
import { LEDGER_TOOLS, callLedgerTool, handleLedgerTool, isLedgerTool } from "./mcp-ledger-tools";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
const parse = (r: any) => JSON.parse(r.content[0].text);

describe("MCP ledger tools", () => {
  it("declares the ledger tools, invite tools included", () => {
    expect(LEDGER_TOOLS.map((t) => t.name)).toEqual(["ledger_file", "ledger_review", "ledger_list", "ledger_get", "ledger_campaigns", "ledger_invite", "ledger_invites"]);
    expect(isLedgerTool("ledger_get")).toBe(true);
    expect(isLedgerTool("search_papers")).toBe(false);
  });

  it("files, reviews, lists and gets", async () => {
    const svc = new LedgerService(new MemoryLedgerStore([agent]));
    const filed = parse(await handleLedgerTool("ledger_file", { kind: "result", title: "r", clientRef: "m1" }, agent, svc));
    expect(filed.created).toBe(true);
    const review = parse(await handleLedgerTool("ledger_review", { reviewsId: filed.record.id, verdict: "holds", title: "ok" }, agent, svc));
    expect(review.record.kind).toBe("review");
    expect(review.record.filedVia).toBe("mcp");
    expect(parse(await handleLedgerTool("ledger_list", {}, agent, svc))).toHaveLength(2);
    expect(parse(await handleLedgerTool("ledger_get", { id: filed.record.id }, agent, svc)).reviews).toHaveLength(1);
  });

  it("returns reason codes as tool errors, not exceptions", async () => {
    const svc = new LedgerService(new MemoryLedgerStore([agent]));
    const res = await handleLedgerTool("ledger_get", { id: "01J9Z3K8Q2A7B5C4D6E8F0G999" }, agent, svc);
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("not_found");
    const bad = await handleLedgerTool("ledger_review", { title: "x" }, agent, svc);
    expect(bad.isError).toBe(true);
    expect(parse(bad).error).toBe("missing_verdict");
  });

  it("coerces a string limit in ledger_list", async () => {
    const svc = new LedgerService(new MemoryLedgerStore([agent]));
    for (const n of [1, 2, 3]) await handleLedgerTool("ledger_file", { kind: "note", title: "n" + n }, agent, svc);
    expect(parse(await handleLedgerTool("ledger_list", { limit: "2" }, agent, svc))).toHaveLength(2);
    expect(parse(await handleLedgerTool("ledger_list", { limit: "junk" }, agent, svc))).toHaveLength(3);
  });
});

describe("invite tools", () => {
  const mk = (id: string, extra: Partial<User> = {}) =>
    ({ id, username: id, userType: "agent", role: "user", canRelease: false, canInvite: false, invitedBy: null, inviteId: null, displayName: id, zkpCommitment: "x", createdAt: new Date(), ...extra }) as User;
  function setup() {
    const m = new Map<string, User>();
    const qe = mk("qe", { canInvite: true });
    const plain = mk("plain");
    for (const u of [qe, plain]) m.set(u.id, u);
    const users: any = { getUser: async (id: string) => m.get(id) };
    const invites = new InviteService(new MemoryInviteStore(), users, new AgentKeyService(new MemoryAgentKeyStore(), users));
    const svc = new LedgerService(new MemoryLedgerStore([agent]));
    const ctx = (user?: User, withInvites = true) => ({ keyId: "k1", actor: agent, svc, budget: new KeyBudget(), user, invites: withInvites ? invites : undefined });
    return { qe, plain, invites, ctx };
  }

  it("lists both tools", () => {
    expect(LEDGER_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["ledger_invite", "ledger_invites"]));
    expect(isLedgerTool("ledger_invite")).toBe(true);
    expect(isLedgerTool("ledger_invites")).toBe(true);
  });

  it("an inviter mints over MCP and sees it in ledger_invites; codes never appear in the list", async () => {
    const { qe, ctx } = setup();
    const out = parse(await callLedgerTool("ledger_invite", { note: "k", maxUses: 3, expiresInDays: 2 }, ctx(qe)));
    expect(out.code).toMatch(/^sci_[A-Za-z0-9_-]{43}$/);
    expect(out.invite.note).toBe("k");
    expect(out.invite.maxUses).toBe(3);
    expect(out.redeemUrl).toContain("/ledger/agent-guide");
    const list = parse(await callLedgerTool("ledger_invites", {}, ctx(qe)));
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(out.invite.id);
    expect(JSON.stringify(list)).not.toContain(out.code);
    expect(JSON.stringify(list)).not.toContain(out.code.slice(4));
  });

  it("an agent without canInvite gets forbidden from ledger_invite (same as HTTP)", async () => {
    const { plain, invites, ctx } = setup();
    const res = await callLedgerTool("ledger_invite", {}, ctx(plain));
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("forbidden");
    expect(await invites.list(plain)).toHaveLength(0);
  });

  it("reports validation failures as tool errors", async () => {
    const { qe, ctx } = setup();
    const res = await callLedgerTool("ledger_invite", { maxUses: 999 }, ctx(qe));
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("invalid_input");
  });

  it("without user/invites in ctx the invite tools refuse with forbidden and mint nothing", async () => {
    const { qe, invites, ctx } = setup();
    for (const c of [ctx(undefined), ctx(qe, false)]) {
      for (const name of ["ledger_invite", "ledger_invites"]) {
        const res = await callLedgerTool(name, {}, c);
        expect(res.isError).toBe(true);
        expect(parse(res).error).toBe("forbidden");
      }
    }
    expect(await invites.list(qe)).toHaveLength(0);
  });

  it("invite tools draw on the per-key read budget", async () => {
    process.env.LEDGER_READ_LIMIT_PER_MINUTE = "1";
    try {
      const { qe, ctx } = setup();
      const c = ctx(qe);
      expect((await callLedgerTool("ledger_invites", {}, c)).isError).toBeUndefined();
      const over = await callLedgerTool("ledger_invite", {}, c);
      expect(parse(over).error).toBe("rate_limited");
    } finally {
      delete process.env.LEDGER_READ_LIMIT_PER_MINUTE;
    }
  });
});
