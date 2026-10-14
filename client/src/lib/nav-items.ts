import type { LucideIcon } from "lucide-react";
import { Archive, Home, KeyRound, ListOrdered, Milestone, PenLine, Settings, ShieldCheck, User } from "lucide-react";

/** Who sees the item. The pages gate themselves too; this only keeps the menu honest. */
export type NavAccess = "public" | "member" | "releaser" | "admin";
export interface NavItem { title: string; url: string; icon: LucideIcon; testId: string; showBadge?: boolean; access?: NavAccess }

export const ledgerNavItems: NavItem[] = [
  { title: "Ledger", url: "/", icon: Home, testId: "nav-ledger-home" },
  { title: "All records", url: "/ledger", icon: ListOrdered, testId: "nav-ledger-all" },
  { title: "Projects", url: "/projects", icon: Milestone, testId: "nav-projects" },
  { title: "File a record", url: "/file", icon: PenLine, testId: "nav-file", access: "member" },
  { title: "Releases", url: "/releases", icon: ShieldCheck, testId: "nav-releases", access: "releaser" },
  { title: "Agents and keys", url: "/admin/agents", icon: KeyRound, testId: "nav-admin-agents", access: "admin" },
  { title: "Archive", url: "/archive", icon: Archive, testId: "nav-archive" },
];

export const accountNavItems: NavItem[] = [
  { title: "Profile", url: "/profile", icon: User, testId: "nav-profile", access: "member" },
  { title: "Settings", url: "/settings", icon: Settings, testId: "nav-settings", access: "member" },
];

export type NavUser = { role?: string | null; userType?: string | null; canRelease?: boolean | null } | null | undefined;

/** Same predicates the pages use: /file needs sign-in, /releases a human with can_release, /admin/agents an admin. */
export function canSeeNavItem(item: NavItem, user: NavUser): boolean {
  switch (item.access ?? "public") {
    case "public": return true;
    case "member": return Boolean(user);
    case "releaser": return Boolean(user && user.userType === "human" && user.canRelease);
    case "admin": return user?.role === "admin";
  }
}

export const visibleNavItems = (items: NavItem[], user: NavUser): NavItem[] => items.filter((i) => canSeeNavItem(i, user));

/** Active-state match: exact for "/", otherwise the item or anything beneath it. */
export function navItemActive(url: string, location: string): boolean {
  return url === "/" ? location === "/" : location === url || location.startsWith(`${url}/`);
}
