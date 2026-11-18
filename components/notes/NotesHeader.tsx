"use client";

import React from "react";
import { useTheme, type ThemeId } from "@/theme/ThemeProvider";

/**
 * Notes chrome — shared header, status chips and the light/dark switch.
 *
 * The switch drives the site's own theme system (`data-theme` on <html>) rather
 * than a parallel one, so a student who picks dark here sees every other page
 * dark too, and the choice survives a reload.
 */

/** Themes whose --app-bg is a light surface. */
const LIGHT_THEMES: readonly string[] = ["indigo-light", "mono"];
const LIGHT_TARGET: ThemeId = "indigo-light";
const DARK_TARGET: ThemeId = "warm-dark";

export function NotesThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isLight = LIGHT_THEMES.includes(theme);

  return (
    <div className="notes-theme-toggle" role="group" aria-label="نمط الألوان">
      <button
        type="button"
        data-active={isLight}
        aria-pressed={isLight}
        aria-label="النمط الفاتح"
        title="النمط الفاتح"
        onClick={() => setTheme(LIGHT_TARGET)}
      >
        ☀
      </button>
      <button
        type="button"
        data-active={!isLight}
        aria-pressed={!isLight}
        aria-label="النمط الداكن"
        title="النمط الداكن"
        onClick={() => setTheme(DARK_TARGET)}
      >
        ☾
      </button>
    </div>
  );
}

export function NotesChip({
  tone,
  children,
  title,
}: {
  tone?: "ok" | "warn" | "danger";
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span className="notes-chip" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function NotesHeader({
  title,
  subtitle,
  chips,
}: {
  title: string;
  subtitle?: string;
  chips?: React.ReactNode;
}) {
  return (
    <header className="notes-header">
      <h1 className="notes-title">{title}</h1>
      <div className="notes-spacer" />
      {chips}
      <NotesThemeToggle />
      {subtitle ? <p className="notes-sub">{subtitle}</p> : null}
    </header>
  );
}
