"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

type Theme = "ocean" | "forest" | "sunset" | "light" | "solaris";

const THEMES: Array<{ id: Theme; label: string }> = [
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "sunset", label: "Sunset" },
  { id: "light", label: "Light" },
  { id: "solaris", label: "Solaris" },
];

const STORAGE_KEY = "site-theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "ocean";
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return saved && THEMES.some((t) => t.id === saved) ? saved : "ocean";
}

export default function ThemeToggle() {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [theme, setTheme] = useState<Theme | null>(null);
  const activeTheme = theme ?? (isHydrated ? readStoredTheme() : "ocean");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", activeTheme);
    localStorage.setItem(STORAGE_KEY, activeTheme);
  }, [activeTheme]);

  const applyTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
  };
  const activeIndex = Math.max(0, THEMES.findIndex((option) => option.id === activeTheme));

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Theme toggle"
      style={
        {
          "--theme-count": THEMES.length,
          "--active-index": activeIndex,
        } as CSSProperties
      }
    >
      <span className="theme-slider" aria-hidden="true" />
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`theme-btn ${activeTheme === option.id ? "theme-btn-active" : ""}`}
          onClick={() => applyTheme(option.id)}
          aria-pressed={activeTheme === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
