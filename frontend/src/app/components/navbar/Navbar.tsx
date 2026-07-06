"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./Navbar.module.css";

const DESKTOP_MIN_WIDTH = 901;

export default function Navbar() {
  const [collapsed, setCollapsed] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const closeDurationMs = 460;
  const closeTimerRef = useRef<number | null>(null);
  const isMenuHidden = collapsed && !isClosing;
  const navIsInert = !isDesktop && isMenuHidden;

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const handler = () => setIsDesktop(mql.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const closeMenu = () => {
    if (collapsed) return;
    setIsClosing(true);
    setCollapsed(true);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      closeTimerRef.current = null;
    }, closeDurationMs);
  };

  const toggleMenu = () => {
    if (collapsed) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      setCollapsed(false);
      return;
    }
    closeMenu();
  };

  return (
    <header
      className={`${styles.siteHeader} ${collapsed ? styles.isCollapsed : styles.isExpanded}`}
      aria-label="Primary site navigation"
    >
      <div className={styles.siteHeaderInner}>
        <div className={styles.brand}>
          <span className={styles.brandLogoShell}>
            <img className={styles.brandLogo} src="/Logo.png" alt="Soheil Rajabali logo" />
          </span>
          <span className={styles.brandName}>SOHEIL RAJABALI</span>
        </div>

        <div className={styles.siteNav}>
          <button
            type="button"
            className={`${styles.navToggle} ${collapsed ? "" : styles.isOpen}`}
            aria-label={collapsed ? "Open navigation menu" : "Close navigation menu"}
            aria-expanded={!collapsed}
            aria-controls="primary-navigation"
            onClick={toggleMenu}
          >
            <span className={styles.navToggleBar} />
            <span className={styles.navToggleBar} />
            <span className={styles.navToggleBar} />
          </button>
        </div>

        <nav
          id="primary-navigation"
          className={`${styles.mainNav} ${collapsed ? "" : styles.open} ${isClosing ? styles.closing : ""}`}
          aria-label="Main navigation"
          aria-hidden={navIsInert}
          inert={navIsInert || undefined}
        >
          <ul className={styles.navList}>
            <li>
              <Link href="/" onClick={closeMenu} tabIndex={navIsInert ? -1 : undefined}>
                Home
              </Link>
            </li>
            <li>
              <Link href="/projects" onClick={closeMenu} tabIndex={navIsInert ? -1 : undefined}>
                Projects
              </Link>
            </li>
            <li>
              <Link href="/dashboard" onClick={closeMenu} tabIndex={navIsInert ? -1 : undefined}>
                Dashboard
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
