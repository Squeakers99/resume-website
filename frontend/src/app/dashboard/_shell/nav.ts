import type { IconType } from "react-icons";
import {
  FiCalendar,
  FiCheckSquare,
  FiFolder,
  FiGrid,
  FiMoreHorizontal,
  FiPieChart,
  FiTrendingUp,
} from "react-icons/fi";

export type NavItem = { id: string; label: string; href: string; icon: IconType };

export type PhoneTab = Omit<NavItem, "href"> & { href?: string };

export const DASHBOARD_NAV: NavItem[] = [
  { id: "overview", label: "Overview", href: "/dashboard", icon: FiGrid },
  { id: "budget", label: "Budget", href: "/dashboard/budgeting", icon: FiPieChart },
  { id: "stocks", label: "Stocks", href: "/dashboard/stocks", icon: FiTrendingUp },
  { id: "projects", label: "Projects", href: "/dashboard#projects", icon: FiFolder },
  { id: "tasks", label: "Tasks", href: "/dashboard#tasks", icon: FiCheckSquare },
  { id: "calendar", label: "Calendar", href: "/dashboard#calendar", icon: FiCalendar },
];

const byId = (id: string): NavItem => {
  const item = DASHBOARD_NAV.find((n) => n.id === id);
  if (!item) throw new Error(`Unknown nav item: ${id}`);
  return item;
};

export const PHONE_TABS: PhoneTab[] = [
  byId("overview"),
  byId("budget"),
  byId("stocks"),
  byId("tasks"),
  { id: "more", label: "More", icon: FiMoreHorizontal },
];

export const MORE_ITEMS: NavItem[] = [byId("projects"), byId("calendar")];

export const SUB_PAGES: Record<string, { label: string; href: string }[]> = {};

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href.includes("#")) return false;
  if (item.href === "/dashboard") return pathname === "/dashboard";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const HASH_HREFS = DASHBOARD_NAV.filter((n) => n.href.includes("#")).map((n) =>
  n.href.slice(n.href.indexOf("#")),
);

// Hash-aware active state. `/dashboard#x` items are active on /dashboard when
// the hash is `#x`; Overview is active on /dashboard unless one of them is.
export function isActiveAt(item: NavItem, pathname: string, hash: string): boolean {
  const hashIndex = item.href.indexOf("#");
  if (hashIndex >= 0) {
    return pathname === item.href.slice(0, hashIndex) && hash === item.href.slice(hashIndex);
  }
  if (item.href === "/dashboard") {
    return pathname === "/dashboard" && (hash === "" || !HASH_HREFS.includes(hash));
  }
  return isActive(item, pathname);
}

export function breadcrumbsFor(pathname: string): { label: string; href: string }[] {
  const crumbs = [{ label: "Dashboard", href: "/dashboard" }];
  if (pathname === "/dashboard") {
    crumbs.push({ label: "Overview", href: "/dashboard" });
    return crumbs;
  }
  const top = DASHBOARD_NAV.find((n) => n.href !== "/dashboard" && isActive(n, pathname));
  if (!top) return crumbs;
  crumbs.push({ label: top.label, href: top.href });
  const sub = (SUB_PAGES[top.href] ?? []).find(
    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
  );
  if (sub) crumbs.push(sub);
  return crumbs;
}
