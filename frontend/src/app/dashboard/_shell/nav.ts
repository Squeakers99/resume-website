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
  { id: "budget", label: "Budget", href: "/dashboard/budget", icon: FiPieChart },
  { id: "stocks", label: "Stocks", href: "/dashboard/stocks", icon: FiTrendingUp },
  { id: "projects", label: "Projects", href: "/dashboard/projects", icon: FiFolder },
  { id: "tasks", label: "Tasks", href: "/dashboard/tasks", icon: FiCheckSquare },
  { id: "calendar", label: "Calendar", href: "/dashboard/calendar", icon: FiCalendar },
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

export type SubPage = { href: string; label: string };

export const BUDGET_TABS: SubPage[] = [
  { href: "/dashboard/budget", label: "Overview" },
  { href: "/dashboard/budget/transactions", label: "Transactions" },
  { href: "/dashboard/budget/statements", label: "Statements" },
  { href: "/dashboard/budget/insights", label: "Insights" },
];

export const STOCKS_TABS: SubPage[] = [
  { href: "/dashboard/stocks", label: "Overview" },
  { href: "/dashboard/stocks/positions", label: "Positions" },
];

export const SUB_PAGES: Record<string, SubPage[]> = {
  "/dashboard/budget": BUDGET_TABS,
  "/dashboard/stocks": STOCKS_TABS,
};

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
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
  // Most specific match wins: the section's own Overview href is a prefix of
  // every other sub-page href.
  const sub = (SUB_PAGES[top.href] ?? [])
    .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (sub) crumbs.push({ label: sub.label, href: sub.href });
  return crumbs;
}
