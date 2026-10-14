import { describe, expect, it } from "vitest";
import { accountNavItems, ledgerNavItems, navItemActive, visibleNavItems } from "./nav-items";

const urls = (u: Parameters<typeof visibleNavItems>[1]) => visibleNavItems(ledgerNavItems, u).map((i) => i.url);

describe("nav gating", () => {
  it("anonymous visitors see the public ledger and the archive only", () => {
    expect(urls(null)).toEqual(["/", "/ledger", "/projects", "/archive"]);
    expect(visibleNavItems(accountNavItems, null)).toEqual([]);
  });
  it("signed-in members also get /file", () => {
    expect(urls({ role: "user", userType: "human", canRelease: false })).toEqual(["/", "/ledger", "/projects", "/file", "/archive"]);
  });
  it("releases are for human releasers only, never agents", () => {
    expect(urls({ role: "user", userType: "human", canRelease: true })).toContain("/releases");
    expect(urls({ role: "user", userType: "agent", canRelease: true })).not.toContain("/releases");
    expect(urls({ role: "admin", userType: "human", canRelease: false })).not.toContain("/releases");
  });
  it("agents and keys is for admins", () => {
    expect(urls({ role: "admin", userType: "human", canRelease: false })).toContain("/admin/agents");
    expect(urls({ role: "user", userType: "human", canRelease: true })).not.toContain("/admin/agents");
  });
  it("highlights the item and its children, and / only exactly", () => {
    expect(navItemActive("/", "/")).toBe(true);
    expect(navItemActive("/", "/ledger")).toBe(false);
    expect(navItemActive("/archive", "/archive/discover")).toBe(true);
    expect(navItemActive("/ledger", "/ledgerx")).toBe(false);
  });
});
