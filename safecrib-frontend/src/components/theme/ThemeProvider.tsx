"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dim" | "dark";
type ResolvedTheme = Exclude<ThemeMode, "system">;
type ThemeContextValue = { mode: ThemeMode; resolvedTheme: ResolvedTheme; setMode: (mode: ThemeMode) => void };

const THEME_STORAGE_KEY = "safecrib_theme_mode";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readThemeMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dim" || value === "dark" ? value : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);
  const resolvedTheme: ResolvedTheme = mode === "system" ? "light" : mode;

  useEffect(() => {
    setMode(readThemeMode());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === "light" ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "light" ? "#FFFFFF" : resolvedTheme === "dim" ? "#0C1830" : "#000000");
    try { window.localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* Theme still applies for this session. */ }
  }, [mode, ready, resolvedTheme]);

  return <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider.");
  return context;
}
