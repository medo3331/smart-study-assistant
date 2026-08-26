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
      className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#0D1029]/70 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-5 sm:p-6"
    >
      {/* خيط بنفسجي رفيع فوق الكارت — إشارة الأهمية */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to left, transparent, rgba(124,92,255,0.6), transparent)",
        }}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#7C5CFF]/15 px-3 py-1 text-xs font-semibold text-[#B69CFF]">
          {stateBadge}
        </span>
        <span className="text-xs text-[#9AA0C0]">الخطوة الحالية</span>
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
          <p className="text-xs text-[#9AA0C0]">{subjectName}</p>
          <h2 className="mt-0.5 text-xl font-bold text-white leading-relaxed">
            {currentDay.title}
          </h2>
          {currentDay.description && (
            <p className="mt-1 text-sm leading-7 text-[#9AA0C0]">{currentDay.description}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 text-xs text-[#9AA0C0]">
              اليوم{" "}
              <span className="font-mono font-bold text-[#E7E9F5]" dir="ltr">
                {currentDay.day}
              </span>{" "}
              من{" "}
              <span className="font-mono font-bold text-[#E7E9F5]" dir="ltr">
                {totalSteps}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FB923C]/10 px-3 py-1 text-xs font-medium text-[#FB923C]">
              <span dir="ltr">+{currentDay.xpReward} XP</span>
            </span>
            {STYLE_LABELS[currentDay.learningStyle] && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 text-xs text-[#9AA0C0]">
                {STYLE_LABELS[currentDay.learningStyle]}
              </span>
            )}
          </div>

          <div className="mt-5 flex justify-center md:justify-start">
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#7C5CFF] px-4 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(124,92,255,0.35)] transition-colors hover:bg-[#8E72FF] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF]"
            >
              <Play size={18} aria-hidden />
              {ctaLabel}
            </button>
            {/* وصول سريع للدرس الكامل بنفس أسلوب الصفحة */}
            {currentDay.id && (
              <Link
                href={`/lesson/${currentDay.id}`}
                className="ms-3 inline-flex h-11 items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-[#E7E9F5] transition-colors hover:bg-white/[0.08]"
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
