import { describe, expect, it } from "vitest";
import { resolveRouteMetadata } from "./page-metadata";

describe("route metadata", () => {
  it("makes the ledger pages public and indexable, with ledger wording", () => {
    for (const p of ["/", "/ledger", "/records/abc", "/campaigns/my-campaign", "/agents/kannaka"]) {
      const m = resolveRouteMetadata(p);
      expect(m?.noindex, p).toBeFalsy();
      expect(m?.path).toBe(p);
      expect(m?.title).toMatch(/Ledger/);
      expect(`${m?.title} ${m?.description}`).not.toMatch(/Human-AI Consciousness Research/);
    }
  });
  it("keeps member-only and admin pages private", () => {
    for (const p of ["/file", "/releases", "/admin/agents", "/profile", "/settings", "/archive/workspace"]) {
      expect(resolveRouteMetadata(p)?.noindex, p).toBe(true);
    }
  });
  it("lets public archive papers set their own metadata but not the editor routes", () => {
    expect(resolveRouteMetadata("/archive/papers/abc")).toBeUndefined();
    expect(resolveRouteMetadata("/archive/papers/new")?.noindex).toBe(true);
    expect(resolveRouteMetadata("/archive/papers/abc/edit")?.noindex).toBe(true);
  });
  it("survives a malformed escape in the id", () => {
    expect(resolveRouteMetadata("/records/%E0%A4%A")?.title).toContain("Record");
  });
});
