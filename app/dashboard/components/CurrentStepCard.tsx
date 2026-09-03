"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Play, CheckCircle2, Clock } from "lucide-react";
import { ProgressRing } from "./ProgressRing";
import type { StudyDay } from "./types";

interface CurrentStepCardProps {
  currentDay: StudyDay | null;
  completedSteps: number;
  totalSteps: number;
  isCurrent: boolean;
  subjectName: string;
  onContinue: () => void;
}

const STYLE_LABELS: Record<string, string> = {
  academic: "أكاديمي",
  visual: "بصري",
  practical: "تطبيقي",
};

/* Phase 0.3 — Progress / Loss Aversion (smallest correct change)
   Only uses data the current architecture genuinely supports:
   - study_days.is_completed -> completedSteps / totalSteps -> real %
   - currentDay.isCompleted + isCurrent -> status (done / continue / start)
   - No schedule/date fields exist on study_configs/study_days, so NO calendar
     delay claim, NO projected date (omitted rather than faked).
   - Neutral motivation when step incomplete; positive when completed.
   - No new DB schema; complete_study_day remains sole completion source.
*/
export function CurrentStepCard({
  currentDay,
  completedSteps,
  totalSteps,
  isCurrent,
  subjectName,
  onContinue,
}: CurrentStepCardProps) {
  const reduceMotion = useReducedMotion();
  if (!currentDay || totalSteps === 0) return null;

  const planPct = Math.round((completedSteps / totalSteps) * 100);
  const done = currentDay.isCompleted;
  const state: "start" | "continue" | "review" = done ? "review" : isCurrent ? "continue" : "start";
  const ctaLabel =
    state === "review" ? "راجع الخطوة" : state === "continue" ? "تابع الخطوة" : "ابدأ الخطوة";
  const stateBadge =
    state === "review" ? "مكتملة ✓" : state === "continue" ? "تابع من حيث توقفت" : "التالية عليك";

  // REAL status based only on actual completion (no invented schedule comparison)
  const stepIncomplete = !done;

  return (
    <motion.section
      aria-label="الخطوة الحالية — تقدم الخطة + حالة اليوم"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.8, 0.36, 1], delay: 0.08 }}
      className="relative overflow-hidden rounded-[24px] border backdrop-blur-xl p-5 sm:p-6"
      style={{
        backgroundColor: "var(--card-primary)",
        borderColor: "var(--rule)",
        boxShadow: "0 8px 30px var(--shade)",
      }}
    >
      {/* خيط رفيع فوق الكارت */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(to left, transparent, var(--accent), transparent)",
          opacity: 0.6,
        }}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
            color: "var(--accent-highlight)",
          }}
        >
          {stateBadge}
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>الخطوة الحالية</span>
      </div>

      <div className="flex flex-col items-center gap-6 md:flex-row md:gap-8">
        {/* Real progress ring + real count */}
        <div className="shrink-0">
          <ProgressRing
            pct={planPct}
            size={150}
            ariaLabel={`نسبة إنجاز الخطة ${planPct} بالمئة`}
            subLabel="من الخطة"
          />
          <div className="mt-2 text-center" aria-label={`تم إنجاز ${completedSteps} من ${totalSteps} يوم`}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }} dir="ltr">
              <span className="font-mono font-bold">{completedSteps}</span> من{" "}
              <span className="font-mono font-bold">{totalSteps}</span> يوم
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {planPct}% مكتمل
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center md:text-right">
          <p className="text-xs" style={{ color: "var(--muted)" }}>{subjectName}</p>
          <h2 className="mt-0.5 text-xl font-bold leading-relaxed" style={{ color: "var(--text)" }}>
            {currentDay.title}
          </h2>
          {currentDay.description && (
            <p className="mt-1 text-sm leading-7" style={{ color: "var(--muted)" }}>{currentDay.description}</p>
          )}

          {/* Today's real status badge (no invented calendar delay) */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
            {stepIncomplete ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
                  color: "var(--accent)",
                }}
                aria-label="خطوة اليوم لم تكتمل بعد"
              >
                <Clock size={14} aria-hidden />
                لسه عندك خطوة النهارده — خلصها عشان تفضل ماشي في خطتك 💙
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: "color-mix(in srgb, #15803d 15%, transparent)",
                  color: "#15803d",
                }}
                aria-label="مكتمل اليوم"
              >
                <CheckCircle2 size={14} aria-hidden />
                ممتاز — مكتمل اليوم 💙
              </span>
            )}
          </div>

          {/* Daily step badges */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
              style={{ backgroundColor: "var(--card-secondary)", color: "var(--muted)" }}
            >
              اليوم{" "}
              <span className="font-mono font-bold" style={{ color: "var(--text)" }} dir="ltr">
                {currentDay.day}
              </span>{" "}
              من{" "}
              <span className="font-mono font-bold" style={{ color: "var(--text)" }} dir="ltr">
                {totalSteps}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
                color: "var(--accent)",
              }}
            >
              <span dir="ltr">+{currentDay.xpReward} XP</span>
            </span>
            {STYLE_LABELS[currentDay.learningStyle] && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                style={{ backgroundColor: "var(--card-secondary)", color: "var(--muted)" }}
              >
                {STYLE_LABELS[currentDay.learningStyle]}
              </span>
            )}
          </div>

          <div className="mt-5 flex justify-center md:justify-start">
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-[0_6px_20px_rgba(0,0,0,0.18)] transition-colors hover:brightness-110 motion-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--on-marker)",
                outlineColor: "var(--accent)",
              }}
            >
              <Play size={18} aria-hidden />
              {ctaLabel}
            </button>
            {currentDay.id && (
              <Link
                href={`/lesson/${currentDay.id}`}
                className="ms-3 inline-flex h-11 items-center rounded-2xl border px-4 text-sm font-semibold transition-colors hover:brightness-110 motion-press"
                style={{
                  borderColor: "var(--rule)",
                  backgroundColor: "var(--card-secondary)",
                  color: "var(--text)",
                }}
              >
                الدرس الكامل
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
