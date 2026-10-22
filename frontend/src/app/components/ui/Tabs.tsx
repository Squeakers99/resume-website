"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./interactive.module.css";

export type TabItem = {
  href: string;
  label: string;
};

export type TabsProps = {
  items: TabItem[];
  ariaLabel: string;
};

function normalize(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/* The active tab is the exact match, otherwise the longest href that is a
   parent segment of the current path (so /a/b/c marks /a/b, not /a). */
function findActiveHref(items: TabItem[], pathname: string): string | null {
  const current = normalize(pathname);
  let best: string | null = null;
  for (const { href } of items) {
    const target = normalize(href);
    if (current === target) return href;
    const isParent = target === "/" ? false : current.startsWith(`${target}/`);
    if (isParent && (best === null || target.length > normalize(best).length)) best = href;
  }
  return best;
}

export function Tabs({ items, ariaLabel }: TabsProps) {
  const pathname = usePathname() ?? "";
  const activeHref = findActiveHref(items, pathname);

  return (
    <nav aria-label={ariaLabel} className={styles.tabs}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.tab}
          aria-current={item.href === activeHref ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
