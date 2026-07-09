"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Dashboard.module.css";

const DASHBOARDS = [
  { label: "Overview", href: "/dashboard" },
  { label: "Budgeting", href: "/dashboard/budgeting" },
];

export default function DashboardSwitcher() {
  const pathname = usePathname();

  return (
    <nav className={styles.switcher} aria-label="Dashboards">
      {DASHBOARDS.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className={`${styles.switcherPill} ${
            pathname === d.href ? styles.switcherPillActive : ""
          }`}
          aria-current={pathname === d.href ? "page" : undefined}
        >
          {d.label}
        </Link>
      ))}
    </nav>
  );
}
