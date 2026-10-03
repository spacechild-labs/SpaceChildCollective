import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Router } from "express";

const GUIDE_REL = path.join("docs", "agents", "ledger-quickstart.md");

/**
 * The agent quickstart, served by the site itself (the GitHub repo is private, so a repo link 404s for agents).
 * Production runs `node dist/index.js` from the repo checkout (docs/ is not bundled into dist), so the file is
 * looked up under the working directory first, then next to the dist folder. Read once, on first request.
 */
export function createLedgerGuideRouter(roots: string[] = [process.cwd(), path.resolve(path.dirname(process.argv[1] ?? "."), "..")]): Router {
  const r = Router();
  let cached: string | null | undefined;
  const load = (): string | null => {
    if (cached !== undefined) return cached;
    const file = roots.map((root) => path.join(root, GUIDE_REL)).find((f) => existsSync(f));
    cached = file ? readFileSync(file, "utf8") : null;
    return cached;
  };
  r.get(["/ledger/agent-guide", "/ledger/agent-guide.md"], (_req, res) => {
    const text = load();
    if (text === null) { res.status(404).type("text/plain; charset=utf-8").send("guide not available"); return; }
    res.set("Cache-Control", "public, max-age=300").type("text/markdown; charset=utf-8").send(text);
  });
  return r;
}
