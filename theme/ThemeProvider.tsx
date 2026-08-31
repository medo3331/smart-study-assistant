'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (localStorage/DOM) is intentional */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

// ---------------------------------------------------------------------------
// 4-theme foundation — Dashboard Premium Redesign Phase 1
// IDs are the single source of truth; they appear on <html data-theme="...">.
// Legacy values "light"/"dark" are accepted and mapped (indigo-light/warm-dark)
// so stored preferences from before Phase 1 do not break.
// ---------------------------------------------------------------------------

export type ThemeId = 'indigo-light' | 'warm-dark' | 'slate' | 'deep-green';
/** Back-compat: old provider used 'light'|'dark' — still recognised on read. */
type LegacyTheme = 'light' | 'dark';
export type Theme = ThemeId | LegacyTheme;

export const THEME_IDS: ThemeId[] = ['indigo-light', 'warm-dark', 'slate', 'deep-green'];

export const THEME_META: Record<ThemeId, { label: string; labelEn: string }> = {
  'indigo-light': { label: 'نيلي فاتح', labelEn: 'Indigo Light' },
  'warm-dark': { label: 'أسود دافي', labelEn: 'Warm Dark' },
  slate: { label: 'رمادي', labelEn: 'Slate' },
  'deep-green': { label: 'أخضر داكن', labelEn: 'Deep Green' },
};

const STORAGE_KEY = 'theme';
const DEFAULT_THEME: ThemeId = 'warm-dark';

function isThemeId(v: string | null): v is ThemeId {
  return v !== null && (THEME_IDS as string[]).includes(v);
}

function normalizeTheme(raw: string | null): ThemeId {
  if (isThemeId(raw)) return raw;
  // legacy bridge
  if (raw === 'light') return 'indigo-light';
  if (raw === 'dark') return 'warm-dark';
  return DEFAULT_THEME;
}

function applyThemeAttr(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme);
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: ThemeId) => void;
  /** Legacy toggle kept for any consumer still calling it — cycles warm-dark ↔ indigo-light. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initial = normalizeTheme(saved);
    if (saved !== initial) {
      // migrate legacy value so next paint is already canonical
      try {
        localStorage.setItem(STORAGE_KEY, initial);
      } catch {}
    }
    setThemeState(initial);
    applyThemeAttr(initial);
    // If no stored value, persist default so no-flash script and React agree
    if (!saved) {
      try {
        localStorage.setItem(STORAGE_KEY, initial);
      } catch {}
    }
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    if (!isThemeId(next)) return;
    setThemeState(next);
    applyThemeAttr(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    const next: ThemeId = theme === 'warm-dark' ? 'indigo-light' : 'warm-dark';
    setTheme(next);
  }, [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Pure helper for non-React consumers (e.g. layout no-flash script keeps its own copy). */
export const themeConstants = {
  STORAGE_KEY,
  DEFAULT_THEME,
  THEME_IDS,
  THEME_META,
  normalizeTheme,
  isThemeId,
} as const;
