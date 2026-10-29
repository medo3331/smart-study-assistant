"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // focus the panel
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-[var(--ink)]/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--color-border)]",
          "bg-[var(--color-surface-1)] p-5 shadow-lg outline-none",
          className
        )}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}