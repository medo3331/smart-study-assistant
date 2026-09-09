"use client";

import { useState } from "react";
import { PrimaryAssistantCard } from "./PrimaryAssistantCard";
import { PrimaryGoalInput } from "./PrimaryGoalInput";
import { PrimarySubjectGrid } from "./PrimarySubjectGrid";
import { PrimaryQuickActions } from "./PrimaryQuickActions";
import { PrimaryProgress } from "./PrimaryProgress";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import type { StudyDay, StudyConfig } from "@/app/dashboard/components/types";

interface PrimaryDashboardProps {
  displayName: string;
  personalContext: PersonalAssistantContext;
  subjects: Array<{ id: string; name: string; code?: string; curriculum_id?: string }>;
  subjectsLoading: boolean;
  subjectsError: string | null;
  gradeName: string | null;
  completed: number;
  total: number;
  progressPct: number | null;
  currentDay: number | null;
  days?: StudyDay[];
  config?: StudyConfig | null;
  onOpenAi?: (subjectName: string) => void;
  onOpenLesson?: (subjectName?: string) => void;
  onGoalRecommendation?: (rec: { intent: string; message: string; recommendedActions: Array<{ capability: string; label: string; href: string; reason: string }> }, goal: string) => void;
}

export function PrimaryDashboard({
  displayName,
  personalContext,
  subjects,
  subjectsLoading,
  subjectsError,
  gradeName,
  completed,
  total,
  progressPct,
  currentDay,
  days,
  onOpenAi,
  onOpenLesson,
  onGoalRecommendation,
}: PrimaryDashboardProps) {
  const [subjectGoal, setSubjectGoal] = useState<string | null>(null);

  function handleSubjectSelect(name: string) {
    setSubjectGoal(`عايز أذاكر ${name}`);
    // For real study, also open AI assistant directly if available
    if (onOpenAi) {
      // small delay so goal input appears before modal
      setTimeout(() => onOpenAi(name), 300);
    } else {
      setTimeout(() => {
        const el = document.getElementById("primary-goal-input");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
      }, 100);
    }
  }

  const currentDayObj = days?.find((d) => d.day === currentDay) || days?.[0] || null;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 sm:space-y-5">
      <div className="motion-safe:animate-[paReveal_.45s_cubic-bezier(.22,.8,.36,1)_both]">
        <PrimaryAssistantCard
          context={personalContext}
          displayName={displayName}
          gradeName={gradeName}
          subjectsCount={subjects.length}
        />
      </div>

      {/* Current lesson entry - real study */}
      {currentDayObj && (
        <section aria-label="درسك اليوم" className="sheet-card p-5 sm:p-6 border-[1.5px] border-[var(--hl-yellow-ink)]/20 bg-gradient-to-br from-amber-50 to-sky-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1.5">درسك اليوم</p>
              <h3 className="font-display font-bold text-[1.05rem] text-ink leading-6">{currentDayObj.topic}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft line-clamp-2">{currentDayObj.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="tag">اليوم {currentDayObj.day}</span>
                {currentDayObj.isCompleted && <span className="tag bg-emerald-100 text-emerald-800 border-emerald-200">تم ✓</span>}
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenLesson?.()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-paper-2 hover:bg-ink/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                ادخل الدرس
                <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAi?.(currentDayObj.topic)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-paper px-5 py-3 text-sm font-bold text-ink hover:bg-paper-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
              >
                اسأل المساعد
                <span aria-hidden>💬</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-4 sm:space-y-5">
          <PrimaryGoalInput
            onRecommendation={onGoalRecommendation}
            gradeName={gradeName}
            externalGoal={subjectGoal}
            onExternalGoalConsumed={() => setSubjectGoal(null)}
            onOpenAi={onOpenAi}
            onOpenLesson={onOpenLesson}
          />
          <PrimaryQuickActions />
        </div>
        <div className="space-y-4 sm:space-y-5">
          <PrimaryProgress completed={completed} total={total} progressPct={progressPct} currentDay={currentDay} />
          <section aria-label="نصيحة صغيرة" className="sheet-card p-5">
            <div className="flex gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 border border-violet-200 text-lg">💡</span>
              <div>
                <p className="text-sm font-bold text-ink">نصيحة اليوم</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">ذاكر 20 دقيقة وبعدها خد راحة صغيرة. المخ بيحب الخطوات الصغيرة! 🌟</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <PrimarySubjectGrid
        subjects={subjects}
        loading={subjectsLoading}
        error={subjectsError}
        gradeName={gradeName}
        onSelect={handleSubjectSelect}
      />
    </div>
  );
}
