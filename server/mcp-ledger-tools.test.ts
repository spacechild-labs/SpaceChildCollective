import { describe, expect, it } from "vitest";
import { MemoryLedgerStore } from "./services/ledger/memory-store";
import { LedgerService } from "./services/ledger/service";
import { LEDGER_TOOLS, handleLedgerTool, isLedgerTool } from "./mcp-ledger-tools";

const agent = { id: "u-k", username: "kannaka", userType: "agent" as const, role: "user" as const, canRelease: false };
const parse = (r: any) => JSON.parse(r.content[0].text);

describe("MCP ledger tools", () => {
  it("declares five tools", () => {
    expect(LEDGER_TOOLS.map((t) => t.name)).toEqual(["ledger_file", "ledger_review", "ledger_list", "ledger_get", "ledger_campaigns"]);
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
