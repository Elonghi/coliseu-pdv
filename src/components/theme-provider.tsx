"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { updateThemeAction } from "@/modules/auth/theme-actions";
import type { UserTheme } from "@/modules/auth/session";

type ThemeContextValue = {
  theme: UserTheme;
  resolvedTheme: "light" | "dark";
  pending: boolean;
  setTheme: (theme: UserTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: UserTheme, media?: MediaQueryList): "light" | "dark" {
  if (theme === "DARK") return "dark";
  if (theme === "LIGHT") return "light";
  return media?.matches ? "dark" : "light";
}

export function ThemeProvider({ initialTheme, children }: { initialTheme: UserTheme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(initialTheme === "DARK" ? "dark" : "light");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = resolveTheme(theme, media);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      setResolvedTheme(resolved);
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.style.colorScheme = "";
    };
  }, [theme]);

  const setTheme = useCallback((nextTheme: UserTheme) => {
    setThemeState(nextTheme);
    startTransition(async () => {
      try {
        await updateThemeAction(nextTheme);
      } catch {
        setThemeState(theme);
      }
    });
  }, [theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, pending, setTheme }), [theme, resolvedTheme, pending, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  return context;
}
