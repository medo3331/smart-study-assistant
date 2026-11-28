/**
 * Magic Chess — ثيمات الرقعة وأطقم القطع.
 *
 * Phase 1: الثيمات دي كلها مجانية كإعدادات افتراضية.
 * المرحلة الجاية (Chess Shop): أطقم مميزة تتفتح بالـ Magic Coins.
 *
 * pure — بدون React runtime، بس أنواع CSS للاستخدام في الواجهة.
 */
import type { CSSProperties } from "react";
import { glyphOf, type Piece } from "./engine";

export type BoardTheme = {
  id: string;
  name: string;
  light: string; // لون المربع الفاتح
  dark: string; // لون المربع الغامق
  frame: string; // لون إطار الرقعة
};

/** ٨ رقع جاهزة — كلها مبنية على ألوان flat، من غير صور */
export const BOARD_THEMES: readonly BoardTheme[] = [
  { id: "wooden", name: "خشب كلاسيك", light: "#e9d7b9", dark: "#9c7a58", frame: "#5d4037" },
  { id: "walnut", name: "جوز", light: "#d6c7a1", dark: "#6b4a32", frame: "#4e342e" },
  { id: "marble", name: "رخام", light: "#f4f4f5", dark: "#a3b1c6", frame: "#64748b" },
  { id: "dark", name: "دارك مود", light: "#3f3f46", dark: "#27272a", frame: "#18181b" },
  { id: "neon", name: "نيون سايبر", light: "#164e63", dark: "#083344", frame: "#164e63" },
  { id: "blue", name: "ماجيك بلو", light: "#dbeafe", dark: "#93c5fd", frame: "#1d4ed8" },
  { id: "minimal", name: "أبيض مينيمال", light: "#ffffff", dark: "#e4e4e7", frame: "#d4d4d8" },
  { id: "egyptian", name: "مصري فرعوني", light: "#e8d5a3", dark: "#b08d57", frame: "#b8860b" },
];

export function boardThemeById(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

/* ------------------------------------------------------------------ */
/* أطقم القطع                                                          */
/* ------------------------------------------------------------------ */

export type PieceSet = "classic" | "minimal" | "neon";

export const PIECE_SETS: readonly { id: PieceSet; name: string }[] = [
  { id: "classic", name: "كلاسيك" },
  { id: "minimal", name: "مينيمال" },
  { id: "neon", name: "نيون" },
];

// رموز القطع المفرغة (Unicode outline) — لطقم المينيمال
const GLYPH_OUTLINE: Record<Piece["t"], string> = {
  k: "\u2654", q: "\u2655", r: "\u2656", b: "\u2657", n: "\u2658", p: "\u2659",
};

/** رمز القطعة حسب الطقم: كلاسيك/نيون = مملوءة، مينيمال = مفرغة */
export function glyphFor(set: PieceSet, piece: Piece): string {
  return set === "minimal" ? GLYPH_OUTLINE[piece.t] : glyphOf(piece);
}

/** ستايل القطعة حسب الطقم ولونها */
export function pieceStyleFor(set: PieceSet, c: Piece["c"]): CSSProperties {
  switch (set) {
    case "neon":
      return c === "w"
        ? { color: "#67e8f9", textShadow: "0 0 8px rgba(103,232,249,.55)" }
        : { color: "#f0abfc", textShadow: "0 0 8px rgba(240,171,252,.55)" };
    case "minimal":
      return c === "w"
        ? { color: "#fafaf9", WebkitTextStroke: "1px #57534e" }
        : { color: "#1c1917", WebkitTextStroke: "1px #e7e5e4" };
    default: // classic
      return c === "w"
        ? { color: "#fdfdfb", WebkitTextStroke: "1px #3f3f46" }
        : { color: "#27272a", WebkitTextStroke: "1px #d6d3d1" };
  }
}

/* ------------------------------------------------------------------ */
/* إعدادات اللاعب — بتتحفظ في localStorage                             */
/* ------------------------------------------------------------------ */

export type ChessSettings = {
  theme: string;
  pieceSet: PieceSet;
  sound: boolean;
  showLegal: boolean;
  coords: boolean;
  flipped: boolean;
};

export const DEFAULT_SETTINGS: ChessSettings = {
  theme: "wooden",
  pieceSet: "classic",
  sound: true,
  showLegal: true,
  coords: true,
  flipped: false,
};

const SETTINGS_KEY = "magic-chess-settings";

export function loadSettings(): ChessSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ChessSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: ChessSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* التخزين غير متاح — نتجاهل */
  }
}
