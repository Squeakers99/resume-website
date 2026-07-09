"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Dashboard.module.css";

const DASHBOARDS = [
  { label: "/dashboard", subtitle: "Workspace", href: "/dashboard" },
  { label: "/budgeting", subtitle: "Budget tracker", href: "/dashboard/budgeting" },
];

export default function DashboardTitleMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = DASHBOARDS.find((d) => pathname === d.href) ?? DASHBOARDS[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.titleMenu} ref={rootRef}>
      <h1 className={styles.titleSectionHeading}>
        <button
          type="button"
          className={styles.titleMenuButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {current.label}
          <span className={styles.titleMenuCaret} aria-hidden="true">
            ▾
          </span>
        </button>
      </h1>
      <span className={styles.titleSectionSubtitle}>{current.subtitle}</span>

      {open && (
        <div className={styles.titleMenuList} role="menu" aria-label="Switch dashboard">
          {DASHBOARDS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              role="menuitem"
              aria-current={d.href === current.href ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`${styles.titleMenuItem} ${
                d.href === current.href ? styles.titleMenuItemActive : ""
              }`}
            >
              <span>{d.label}</span>
              <span className={styles.titleMenuItemHint}>{d.subtitle}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
