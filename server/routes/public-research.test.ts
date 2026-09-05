import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getPaperWithContributors: vi.fn(),
  getPublishedPapers: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: storageMock }));

import { renderPublishedPaper } from "./public-research";

function response() {
  const res = {
    status: vi.fn(),
    type: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  return res;
}

describe("published paper server route", () => {
  beforeEach(() => {
    storageMock.getPaperWithContributors.mockReset();
  });

  it("falls through for /papers/new so the SPA editor can load", async () => {
    storageMock.getPaperWithContributors.mockResolvedValue(undefined);
    const next = vi.fn();
    const res = response();

    await renderPublishedPaper({ params: { id: "new" } } as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("falls through for a draft so its authenticated editor route remains available", async () => {
    storageMock.getPaperWithContributors.mockResolvedValue({ id: "draft-id", status: "draft" });
    const next = vi.fn();
    const res = response();

    await renderPublishedPaper({ params: { id: "draft-id" } } as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("renders a published paper as crawlable HTML", async () => {
    storageMock.getPaperWithContributors.mockResolvedValue({
      id: "published-id",
      title: "A Public Finding",
      abstract: "A citable abstract.",
      content: "# Results\n\nEvidence.",
      status: "published",
      category: "consciousness",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-02-01T00:00:00Z"),
      publishedAt: new Date("2025-01-15T00:00:00Z"),
      contributors: [],
    });
    const next = vi.fn();
    const res = response();

    await renderPublishedPaper({ params: { id: "published-id" } } as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith("html");
    expect(res.send.mock.calls[0][0]).toContain("<h1>A Public Finding</h1>");
    expect(res.send.mock.calls[0][0]).toContain("A citable abstract.");
    expect(res.send.mock.calls[0][0]).toContain('src="/src/main.tsx"');
  });
});