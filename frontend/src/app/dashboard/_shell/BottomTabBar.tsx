"use client";

import { useState } from "react";
import Link from "next/link";
import MoreSheet from "./MoreSheet";
import { MORE_ITEMS, PHONE_TABS, isActiveAt, type NavItem } from "./nav";
import { useCurrentLocation } from "./useCurrentLocation";
import styles from "./Shell.module.css";

type Props = {
  email: string;
  signOutAction: () => Promise<void>;
};

export default function BottomTabBar({ email, signOutAction }: Props) {
  const { pathname, hash } = useCurrentLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((item) => isActiveAt(item, pathname, hash));

  return (
    <>
      <nav aria-label="Dashboard" className={styles.tabBar}>
        {PHONE_TABS.map((tab) => {
          const Icon = tab.icon;
          if (!tab.href) {
            return (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabItem} ${moreActive ? styles.tabItemActive : ""}`}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                onClick={() => setMoreOpen(true)}
              >
                <Icon className={styles.tabIcon} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          }
          const active = isActiveAt(tab as NavItem, pathname, hash);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`${styles.tabItem} ${active ? styles.tabItemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={styles.tabIcon} aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        email={email}
        signOutAction={signOutAction}
      />
    </>
  );
}
