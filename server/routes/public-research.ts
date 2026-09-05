import type { RequestHandler } from "express";
import fs from "fs/promises";
import path from "path";
import type { Paper, PaperContributor, User } from "@shared/schema";
import { storage } from "../storage";

const SITE_URL = (process.env.BASE_URL || "https://spacechild.love").replace(/\/+$/, "");

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatDate(value: Date | null): string {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
}

async function appShell(content: string, title: string, description: string, canonicalPath: string): Promise<string> {
  const templatePath = process.env.NODE_ENV === "production"
    ? path.resolve(process.cwd(), "dist/public/index.html")
    : path.resolve(process.cwd(), "client/index.html");
  let template = await fs.readFile(templatePath, "utf8");

  template = template.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<script type="module"/,
    `<div id="root">${content}</div>
    <script type="module"`,
  );
  template = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  template = template.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(description)}" />`,
  );
  template = template.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${SITE_URL}${canonicalPath}" />`,
  );

  return template;
}

export const renderResearchIndex: RequestHandler = async (_req, res, next) => {
  try {
    const papers = await storage.getPublishedPapers();
    const paperList = papers.length
      ? papers.map((paper) => `
          <article>
            <h2><a href="/papers/${encodeURIComponent(paper.id)}">${escapeHtml(paper.title)}</a></h2>
            <p>${escapeHtml(paper.abstract)}</p>
            <p>Category: ${escapeHtml(paper.category)} · Published: ${escapeHtml(formatDate(paper.publishedAt || paper.createdAt))}</p>
          </article>`).join("\n")
      : "<p>No published papers are currently available.</p>";
    const content = `
      <main>
        <h1>Discover Research</h1>
        <p>Explore published consciousness research created through human-AI collaboration.</p>
        <section id="published-papers" aria-label="Published papers">${paperList}</section>
      </main>`;

    res
      .status(200)
      .type("html")
      .send(await appShell(
        content,
        "Discover Published Research | SpaceChild Research Collective",
        "Browse published consciousness research created through human-AI collaboration.",
        "/discover",
      ));
  } catch (error) {
    next(error);
  }
};

type PaperWithContributors = Paper & {
  contributors: (PaperContributor & { user: User })[];
};

function contributorNames(paper: PaperWithContributors): string {
  return paper.contributors
    .filter(({ role }) => role === "author")
    .map(({ user }) => user.displayName || user.username)
    .filter(Boolean)
    .join(", ");
}

export const renderPublishedPaper: RequestHandler = async (req, res, next) => {
  try {
    const paper = await storage.getPaperWithContributors(req.params.id);
    if (!paper || paper.status !== "published") {
      next();
      return;
    }

    const authors = contributorNames(paper);
    const content = `
      <main>
        <article>
          <header>
            <p><a href="/discover">Published research</a></p>
            <h1>${escapeHtml(paper.title)}</h1>
            ${authors ? `<p>Authors: ${escapeHtml(authors)}</p>` : ""}
            <p>Published: ${escapeHtml(formatDate(paper.publishedAt || paper.createdAt))} · Updated: ${escapeHtml(formatDate(paper.updatedAt))}</p>
            <p>Category: ${escapeHtml(paper.category)}</p>
          </header>
          <section aria-labelledby="abstract-heading">
            <h2 id="abstract-heading">Abstract</h2>
            <p>${escapeHtml(paper.abstract)}</p>
          </section>
          <section aria-labelledby="paper-heading">
            <h2 id="paper-heading">Paper</h2>
            <div style="white-space: pre-wrap">${escapeHtml(paper.content)}</div>
          </section>
        </article>
      </main>`;

    res
      .status(200)
      .type("html")
      .send(await appShell(
        content,
        `${paper.title} | SpaceChild Research Collective`,
        paper.abstract,
        `/papers/${encodeURIComponent(paper.id)}`,
      ));
  } catch (error) {
    next(error);
  }
};