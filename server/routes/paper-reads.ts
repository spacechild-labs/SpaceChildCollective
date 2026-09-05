import type { RequestHandler } from "express";
import { storage } from "../storage";

export const listVisiblePapers: RequestHandler = async (req, res) => {
  try {
    const published = await storage.getPublishedPapers();
    if (!req.user) {
      res.json(published);
      return;
    }
    if (req.user.role === "admin") {
      res.json(await storage.getAllPapers());
      return;
    }

    const contributed = await storage.getPapersByUserId(req.user.id);
    const visible = new Map([...published, ...contributed].map((paper) => [paper.id, paper]));
    res.json([...visible.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getVisiblePaper: RequestHandler = async (req, res) => {
  try {
    const paper = await storage.getPaperWithContributors(req.params.id);
    const canReadUnpublished = Boolean(
      req.user && paper && (
        req.user.role === "admin" ||
        paper.contributors.some(({ userId }) => userId === req.user!.id)
      ),
    );

    if (!paper || (paper.status !== "published" && !canReadUnpublished)) {
      res.status(404).json({ error: "Paper not found" });
      return;
    }
    res.json(paper);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};