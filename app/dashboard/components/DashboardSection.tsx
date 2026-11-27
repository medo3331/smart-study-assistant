"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Syncing with localStorage (external system) is intentional */

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "magicly_dashboard_sections";

interface DashboardSectionProps {
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  domId?: string;
  children: React.ReactNode;
}

function readStored(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function DashboardSection({
  id,
  title,
  hint,
  defaultOpen = true,
  domId,
  children,
}: DashboardSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = readStored()[id];
    if (typeof stored === "boolean") setOpen(stored);
  }, [id]);

  return (
    <details
      id={domId}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        setOpen((prev) => {
          if (prev === now) return prev;
          try {
            const stored = readStored();
            stored[id] = now;
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
          } catch {}
          return now;
        });
      }}
      className={`group scroll-mt-6 rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] transition-colors hover:border-[var(--color-text-muted)]/40 ${
        open ? "" : "dashboard-entrance"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-[var(--color-surface-2)] [&::-webkit-details-marker]:hidden marker:content-none">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold text-[var(--color-text-primary)] sm:text-base">
            {title}
          </span>
          {hint && (
            <span className="truncate text-xs text-[var(--color-text-muted)]">{hint}</span>
          )}
        </span>
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-[var(--color-border)] p-4">{children}</div>
    </details>
  );
}
