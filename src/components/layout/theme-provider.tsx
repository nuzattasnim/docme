import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark — used by the simple icon button. */
  toggle: () => void;
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

const STORAGE_KEY = "docme-theme";

function isValidTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    const stored = localStorage.getItem(STORAGE_KEY);
    // Migrate from any legacy "system" value to the OS-resolved theme.
    if (stored === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      return prefersDark ? "dark" : "light";
    }
    return isValidTheme(stored) ? stored : defaultTheme;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (next) => {
      localStorage.setItem(STORAGE_KEY, next);
      setThemeState(next);
    },
    toggle: () =>
      setThemeState((current) => {
        const next: Theme = current === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        return next;
      }),
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
