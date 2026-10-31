"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: "start" | "end";
  className?: string;
}

export function Drawer({ open, onClose, title, children, side = "start", className }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sideClasses =
    side === "start"
      ? "inset-inline-start-0"
      : "inset-inline-end-0";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="absolute inset-0 bg-[var(--ink)]/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 w-[86%] max-w-xs bg-[var(--color-surface-1)] outline-none",
          "border-[var(--color-border)] overflow-y-auto",
          sideClasses,
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
          {title && (
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}