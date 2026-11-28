"use client";

import { ArrowLeft, Sparkles, Zap } from "lucide-react";

export interface NextBestActionItem {
  key: string;
  eyebrow: string;
  title: string;
  description?: string;
  cta: string;
}

interface NextBestActionProps {
  action: NextBestActionItem | null;
  onAction: (key: string) => void;
  onOpenAi: () => void;
}

export function NextBestAction({ action, onAction, onOpenAi }: NextBestActionProps) {
  if (!action) {
    return (
      <section
        aria-label="اقتراح اليوم"
        className="dashboard-entrance flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 sm:p-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow eyebrow-flush">اقتراح اليوم</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">
              مفيش حاجة مستعجلة النهارده ✨
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              راجع تقدمك أو اسأل المعلم الذكي أي حاجة.
            </p>
          </div>
        </div>
        <button type="button" onClick={onOpenAi} className="btn btn-marker px-4 py-2 text-sm">
          اسأل المعلم الذكي
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="أهم خطوة الآن"
      className="dashboard-entrance rounded-[var(--r-lg)] border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 sm:p-5"
      style={{ animationDelay: "0ms" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-marker text-onmarker"
          >
            <Zap size={18} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow eyebrow-flush">{action.eyebrow} · أهم خطوة الآن</p>
            <p className="text-base font-bold leading-snug text-[var(--color-text-primary)] sm:text-lg">
              {action.title}
            </p>
            {action.description && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
                {action.description}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAction(action.key)}
          className="btn btn-marker shrink-0 px-4 py-2 text-sm"
        >
          {action.cta}
          <ArrowLeft size={16} aria-hidden className="inline-block" />
        </button>
      </div>
    </section>
  );
}
