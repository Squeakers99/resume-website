"use client";

import { useEffect, useState } from "react";

type Theme = "ocean" | "slate" | "forest" | "sunset";

const THEMES: Array<{ id: Theme; label: string }> = [
  { id: "ocean", label: "Ocean" },
  { id: "slate", label: "Slate" },
  { id: "forest", label: "Forest" },
  { id: "sunset", label: "Sunset" },
];

const STORAGE_KEY = "site-theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "ocean";
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved && THEMES.some((t) => t.id === saved) ? saved : "ocean";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const applyTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="Theme toggle">
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`theme-btn ${theme === option.id ? "theme-btn-active" : ""}`}
          onClick={() => applyTheme(option.id)}
          aria-pressed={theme === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
