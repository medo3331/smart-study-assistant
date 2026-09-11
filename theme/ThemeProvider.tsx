'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (localStorage/DOM) is intentional */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Theme foundation — Dashboard Premium Redesign Phase 1 + Magic Wheel design themes
// IDs are the single source of truth; they appear on <html data-theme="...">.
// Legacy values "light"/"dark" are accepted and mapped (indigo-light/warm-dark)
// so stored preferences from before Phase 1 do not break.
//
// 🎡 2026-09-10 — ثيمات تصميم magiclly-final الأربعة نُدمجت هنا بدل نظام
// متوازي منفصل:
//   colorful → «الملون الحالي» (نفس توكينز warm-dark، والعجلة ترسم أفرعها ملونة)
//   crimson  → «أسود وأحمر» (باليتة بريف العجلة: #0a0a0c / #E23A3A / #FF6B5B)
//   azure    → «أزرق»
//   mono     → «أبيض ورمادي»
// ThemeId القديم (indigo-light/warm-dark/slate/deep-green) فاضل شغال كما هو.
// ---------------------------------------------------------------------------

export type ThemeId =
  | 'colorful'
  | 'crimson'
  | 'azure'
  | 'mono'
  | 'indigo-light'
  | 'warm-dark'
  | 'slate'
  | 'deep-green';
/** Back-compat: old provider used 'light'|'dark' — still recognised on read. */
type LegacyTheme = 'light' | 'dark';
export type Theme = ThemeId | LegacyTheme;

export const THEME_IDS: ThemeId[] = [
  'colorful', 'crimson', 'azure', 'mono',
  'indigo-light', 'warm-dark', 'slate', 'deep-green',
];

/** الدوران بتاع زرار تبديل الثيم في العجلة = الثيمات الأربعة المعتمدة في التصميم. */
export const MAGIC_THEME_CYCLE: ThemeId[] = ['colorful', 'crimson', 'azure', 'mono'];

export const THEME_META: Record<ThemeId, { label: string; labelEn: string }> = {
  colorful: { label: 'ملوّن (حالي)', labelEn: 'Colorful' },
  crimson: { label: 'أسود وأحمر', labelEn: 'Black & Red' },
  azure: { label: 'أزرق', labelEn: 'Azure' },
  mono: { label: 'أبيض ورمادي', labelEn: 'White & Gray' },
  'indigo-light': { label: 'نيلي فاتح', labelEn: 'Indigo Light' },
  'warm-dark': { label: 'أسود دافي', labelEn: 'Warm Dark' },
  slate: { label: 'رمادي', labelEn: 'Slate' },
  'deep-green': { label: 'أخضر داكن', labelEn: 'Deep Green' },
};

const STORAGE_KEY = 'theme';
// «colorful» بيشارك توكينز warm-dark بالظبط + بيرسم العجلة ملونة — يعني
// المستخدم الجديد بيشوف نفس اللي كان شوفه قبل كده حرفيًا.
const DEFAULT_THEME: ThemeId = 'colorful';

/** الثيمات اللي العجلة ترسم فيها كل فرع بلونه المستقل (نمط «الملون»). */
export const COLORFUL_WHEEL_THEMES: ReadonlySet<ThemeId> = new Set<ThemeId>([
  'colorful', 'warm-dark', 'indigo-light',
]);


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
