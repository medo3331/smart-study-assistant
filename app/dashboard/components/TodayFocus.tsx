"use client";

import Link from "next/link";
import { Target, ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { StudyDay } from "./types";

interface TodayFocusProps {
  /** Current day object or null if no plan */
  currentDay: StudyDay | null;
  /** Overall progress 0-100 derived from study_days — real, null if no plan */
  progressPct: number | null;
  /** Total days in plan, for empty-state text */
  totalSteps: number;
  /** Completed steps count */
  completedSteps: number;
  subject: string;
  onContinue?: () => void;
}

/**
 * TodayFocus — §12 of spec.
 * Single prominent card after Quick Navigation.
 * - If a real task exists (currentDay + subject), shows title, subject, progress bar with REAL pct, and CTA.
 * - If no real task, shows honest empty state: "لم تحدد هدفًا لليوم بعد. ابدأ التخطيط →" linking to /dashboard/create (existing route).
 * - No fake Task invented.
 * - Button goes to existing route (/lesson/[id] or /dashboard/create).
 * - Progress uses REAL overallProgress; never fake 72%.
 */
export function TodayFocus({ currentDay, progressPct, totalSteps, completedSteps, subject, onContinue }: TodayFocusProps) {
  const reduce = useReducedMotion();
  const hasTask = !!currentDay && totalSteps > 0;
  const pct = progressPct !== null ? Math.min(100, Math.max(0, progressPct)) : null;

  const title = hasTask ? currentDay!.title || currentDay!.topic || `خطوة في ${subject || "خطتك"}` : null;
  const href = hasTask && (currentDay as unknown as { id?: string })?.id ? `/lesson/${(currentDay as unknown as { id: string }).id}` : "/dashboard/create";

  return (
    <motion.section
      aria-label="تركيز اليوم"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 0.8, 0.36, 1], delay: reduce ? 0 : 0.08 }}
      className="relative overflow-hidden rounded-2xl border backdrop-blur-xl p-5 sm:p-6"
      style={{
        backgroundColor: "var(--card-primary)",
        borderColor: "var(--rule)",
        boxShadow: "0 8px 28px var(--shade)",
      }}
    >
      {/* subtle top accent line */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(to left, transparent, var(--accent) 42%, transparent)", opacity: 0.5 }} />
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}
          aria-hidden
        >
          <Target size={18} strokeWidth={2} />
        </span>
        <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
          تركيز اليوم
        </h2>
        {hasTask && pct !== null && (
          <span className="mr-auto font-mono text-xs font-semibold tabular-nums" style={{ color: "var(--accent)" }} dir="ltr">
            {pct}%
          </span>
        )}
      </div>

      {hasTask ? (
        <>
          <div className="mt-4">
            <p className="text-sm font-semibold leading-6" style={{ color: "var(--text)" }}>
              {title}
            </p>
            {subject && (
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {subject} · {completedSteps} من {totalSteps} مكتمل
              </p>
            )}
          </div>

          {/* Real progress bar */}
          {pct !== null && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--card-secondary)", border: "1px solid var(--rule)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-highlight))" }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 0.8, 0.36, 1], delay: reduce ? 0 : 0.2 }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: "var(--muted)" }}>
                <span>التقدم الكلي</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {pct}%
                </span>
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-3">
            {/* Primary CTA — real lesson or create */}
            <Link
              href={href}
              aria-label={hasTask ? `الانتقال إلى ${title}` : "إنشاء خطة جديدة"}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition active:scale-[0.97] hover:brightness-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-primary)]"
              style={{ backgroundColor: "var(--accent)", color: "var(--on-marker)" }}
            >
              <span>{hasTask ? "إكمال المهمة" : "ابدأ التخطيط"}</span>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            </Link>
            {hasTask && onContinue && (
              <button
                type="button"
                onClick={onContinue}
                className="hidden sm:inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-medium transition hover:bg-[var(--card-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ borderColor: "var(--rule)", color: "var(--text)", backgroundColor: "transparent" }}
                aria-label="التمرير إلى تفاصيل الخطة"
              >
                عرض التفاصيل
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              لم تحدد هدفًا لليوم بعد.
            </p>
            <p className="mt-1 text-xs leading-6" style={{ color: "var(--muted)" }}>
              أنشئ خطتك الأولى لتبدأ رحلتك — كل تقدمك سيظهر هنا بدل البيانات الوهمية.
            </p>
          </div>
          <div className="mt-5">
            <Link
              href="/dashboard/create"
              aria-label="الانتقال إلى إنشاء خطة"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition active:scale-[0.97] hover:brightness-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ backgroundColor: "var(--accent)", color: "var(--on-marker)" }}
            >
              <span>ابدأ التخطيط</span>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </>
      )}
    </motion.section>
  );
}
