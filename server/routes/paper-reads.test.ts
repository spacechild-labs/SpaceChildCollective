import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getPublishedPapers: vi.fn(),
  getAllPapers: vi.fn(),
  getPapersByUserId: vi.fn(),
  getPaperWithContributors: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: storageMock }));

import { getVisiblePaper, listVisiblePapers } from "./paper-reads";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("public paper API reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only published papers to anonymous listing requests", async () => {
    const published = [{ id: "public", status: "published" }];
    storageMock.getPublishedPapers.mockResolvedValue(published);
    const res = response();

    await listVisiblePapers({} as any, res as any, vi.fn());

    expect(res.json).toHaveBeenCalledWith(published);
    expect(storageMock.getAllPapers).not.toHaveBeenCalled();
  });

  it("returns 404 instead of exposing an anonymous draft detail", async () => {
    storageMock.getPaperWithContributors.mockResolvedValue({
      id: "draft",
      status: "draft",
      content: "private draft",
      contributors: [{ userId: "author" }],
    });
    const res = response();

    await getVisiblePaper({ params: { id: "draft" } } as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Paper not found" });
  });

  it("allows a contributor to retrieve their own draft", async () => {
    const draft = {
      id: "draft",
      status: "draft",
      content: "private draft",
      contributors: [{ userId: "author" }],
    };
    storageMock.getPaperWithContributors.mockResolvedValue(draft);
    const res = response();

    await getVisiblePaper({
      params: { id: "draft" },
      user: { id: "author", role: "user" },
    } as any, res as any, vi.fn());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(draft);
  });
});