import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getAllPapers: vi.fn(),
  getPublishedPapers: vi.fn(),
  getPaperWithContributors: vi.fn(),
  createAgentTask: vi.fn(),
}));
vi.mock("./storage", () => ({ storage: storageMock }));
vi.mock("./storage.js", () => ({ storage: storageMock }));

import { agentCanReadPaper, publishedOnly } from "./mcp-paper-access";
import { executeTool } from "./mcp-http";

const published = { id: "p", status: "published", title: "Open", abstract: "a", category: "ai" };
const draft = { id: "d", status: "draft", title: "Secret draft", abstract: "s", category: "ai" };
const auth = { agentId: "agent-1", paperId: "global" };

describe("MCP paper access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishedOnly keeps only published papers", () => {
    expect(publishedOnly([published, draft]).map((p) => p.id)).toEqual(["p"]);
  });

  it("an agent reads a draft only as a contributor", () => {
    expect(agentCanReadPaper({ ...draft, contributors: [{ userId: "agent-1" }] }, "agent-1")).toBe(true);
    expect(agentCanReadPaper({ ...draft, contributors: [{ userId: "someone" }] }, "agent-1")).toBe(false);
    expect(agentCanReadPaper({ ...published, contributors: [] }, "agent-1")).toBe(true);
  });

  it("search_papers never returns drafts", async () => {
    storageMock.getPublishedPapers.mockResolvedValue([published]);
    storageMock.getAllPapers.mockResolvedValue([published, draft]);
    const out = await executeTool("search_papers", { query: "" }, auth);
    expect(out.content[0].text).not.toContain("Secret draft");
    expect(storageMock.getAllPapers).not.toHaveBeenCalled();
  });

  it("get_paper_content hides a draft from a non-contributor", async () => {
    storageMock.getPaperWithContributors.mockResolvedValue({ ...draft, contributors: [{ userId: "x" }] });
    const out = await executeTool("get_paper_content", { paperId: "d" }, auth);
    expect(out.content[0].text).toContain("Paper not found");
    expect(out.content[0].text).not.toContain("Secret draft");
  });
});
