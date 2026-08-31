"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Play } from "lucide-react";
import { ProgressRing } from "./ProgressRing";
import type { StudyDay } from "./types";

interface CurrentStepCardProps {
  /** الخطوة الحالية من study_days — null معناها مافيش خطة فالكارت يختفي. */
  currentDay: StudyDay | null;
  completedSteps: number;
  totalSteps: number;
  /** هل دي الخطوة اللي واقف عندها المستخدم فعلاً (مش خطوة مستقبلية). */
  isCurrent: boolean;
  subjectName: string;
  onContinue: () => void;
}

const STYLE_LABELS: Record<string, string> = {
  academic: "أكاديمي",
  visual: "بصري",
  practical: "تطبيقي",
};

/**
 * كارت «الخطوة الحالية» — أبرز عنصر بعد الهيرو.
 *
 * الحلقة بتعرض نسبة إنجاز الخطة الحقيقية (المكتمل ÷ الإجمالي)، والزر
 * **ديناميكي** حسب حالة الخطوة الفعلية:
 *   ابدأ (لسه ما اتحفظتش) / تابع (قيد التقدم) / راجع (مكتملة).
 * مكافأة الـ XP بتيجي من عمود xp_reward نفسه — مفيش أي رقم مخترع.
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
  // خطوة مستقبلية (مش اليوم الحالي ومش مكتملة) تعني «ابدأ» مش «تابع».
  const state: "start" | "continue" | "review" = done ? "review" : isCurrent ? "continue" : "start";
  const ctaLabel =
    state === "review" ? "راجع الخطوة" : state === "continue" ? "تابع الخطوة" : "ابدأ الخطوة";
  const stateBadge =
    state === "review" ? "مكتملة ✓" : state === "continue" ? "تابع من حيث توقفت" : "التالية عليك";

  return (
    <motion.section
      aria-label="الخطوة الحالية"
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
      {/* خيط رفيع فوق الكارت — إشارة الأهمية بلون الأكسنت */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to left, transparent, var(--accent), transparent)",
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
        <ProgressRing
          pct={planPct}
          size={150}
          ariaLabel={`نسبة إنجاز الخطة ${planPct} بالمئة`}
          subLabel="من الخطة"
          className="shrink-0"
        />

        <div className="min-w-0 flex-1 text-center md:text-right">
          <p className="text-xs" style={{ color: "var(--muted)" }}>{subjectName}</p>
          <h2 className="mt-0.5 text-xl font-bold leading-relaxed" style={{ color: "var(--text)" }}>
            {currentDay.title}
          </h2>
          {currentDay.description && (
            <p className="mt-1 text-sm leading-7" style={{ color: "var(--muted)" }}>{currentDay.description}</p>
          )}

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
            {/* وصول سريع للدرس الكامل بنفس أسلوب الصفحة */}
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
