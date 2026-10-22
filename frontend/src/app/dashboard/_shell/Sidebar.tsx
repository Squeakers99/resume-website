"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiChevronLeft, FiChevronRight, FiDroplet, FiLogOut } from "react-icons/fi";
import ThemeToggle from "@/app/components/ThemeToggle";
import { DASHBOARD_NAV, isActive } from "./nav";
import UserMenu from "./UserMenu";
import styles from "./Shell.module.css";

const STORAGE_KEY = "dashboard-sidebar";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// localStorage can throw (privacy modes, storage disabled); fall back to expanded.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Not persisted; nothing else to do, readCollapsed keeps returning its fallback.
  }
  listeners.forEach((notify) => notify());
}

type Props = {
  email: string;
  signOutAction: () => Promise<void>;
};

export default function Sidebar({ email, signOutAction }: Props) {
  const pathname = usePathname();
  // The server snapshot is always "expanded", so the first client render matches
  // the SSR markup; the stored value applies right after hydration.
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const toggleLabel = collapsed ? "Expand navigation" : "Collapse navigation";

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarBrand}>Soheil&apos;s dashboard</span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => writeCollapsed(!collapsed)}
        >
          {collapsed ? <FiChevronRight aria-hidden="true" /> : <FiChevronLeft aria-hidden="true" />}
        </button>
      </div>
      <nav aria-label="Dashboard navigation" className={styles.sidebarNav}>
        {DASHBOARD_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={styles.navIcon} aria-hidden="true" />
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className={styles.sidebarFooter}>
        {collapsed ? (
          <>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Change theme (expands navigation)"
              title="Change theme"
              onClick={() => writeCollapsed(false)}
            >
              <FiDroplet aria-hidden="true" />
            </button>
            <form action={signOutAction}>
              <button
                type="submit"
                className={styles.iconButton}
                aria-label={`Sign out ${email}`}
                title="Sign out"
              >
                <FiLogOut aria-hidden="true" />
              </button>
            </form>
          </>
        ) : (
          <>
            <div className={styles.sidebarTheme}>
              <span className={styles.sidebarThemeLabel}>Theme</span>
              <ThemeToggle />
            </div>
            <UserMenu email={email} signOutAction={signOutAction} />
          </>
        )}
      </div>
    </aside>
  );
}
