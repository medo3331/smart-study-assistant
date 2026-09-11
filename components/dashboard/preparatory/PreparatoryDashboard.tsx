"use client";

import { useState } from "react";
import { PreparatoryAssistantCard } from "./PreparatoryAssistantCard";
import { PreparatoryGoalInput } from "./PreparatoryGoalInput";
import { PreparatorySubjectGrid } from "./PreparatorySubjectGrid";
import { PreparatoryProgress } from "./PreparatoryProgress";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import type { StudyDay, StudyConfig } from "@/app/dashboard/components/types";

interface PreparatoryDashboardProps {
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

export function PreparatoryDashboard({
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
}: PreparatoryDashboardProps) {
  const [subjectGoal, setSubjectGoal] = useState<string | null>(null);

  function handleSubjectSelect(name: string) {
    setSubjectGoal(`عايز أذاكر ${name}`);
    if (onOpenAi) {
      setTimeout(() => onOpenAi(name), 250);
    } else {
      setTimeout(() => {
        const el = document.getElementById("prep-goal-input");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }

  const currentDayObj = days?.find((d) => d.day === currentDay) || days?.[0] || null;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 sm:space-y-5">
      <div className="motion-safe:animate-[paReveal_.45s_cubic-bezier(.22,.8,.36,1)_both]">
        <PreparatoryAssistantCard context={personalContext} displayName={displayName} gradeName={gradeName} subjectsCount={subjects.length} />
      </div>

      {currentDayObj && (
        <section aria-label="تركيز اليوم" className="sheet-card p-5 sm:p-6 border border-violet-200/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">تركيز اليوم</p>
              <h3 className="font-display font-semibold text-[1.05rem] text-ink leading-6">{currentDayObj.topic}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft line-clamp-2">{currentDayObj.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="tag">اليوم {currentDayObj.day}</span>
                {currentDayObj.isCompleted && <span className="tag bg-emerald-100 text-emerald-800 border-emerald-200">مكتمل ✓</span>}
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button type="button" onClick={() => onOpenLesson?.()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-paper-2 hover:bg-ink/90">
                دخول الدرس <span aria-hidden>→</span>
              </button>
              <button type="button" onClick={() => onOpenAi?.(currentDayObj.topic)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-paper px-5 py-3 text-sm font-bold text-ink hover:bg-paper-3">
                اسأل المساعد <span aria-hidden>💬</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <PreparatoryGoalInput
            onRecommendation={onGoalRecommendation}
            gradeName={gradeName}
            externalGoal={subjectGoal}
            onExternalGoalConsumed={() => setSubjectGoal(null)}
            onOpenAi={onOpenAi}
            onOpenLesson={onOpenLesson}
          />
          <section aria-label="مهام سريعة" className="sheet-card p-5">
            <h3 className="font-display font-semibold text-sm text-ink">مهام سريعة</h3>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => onOpenAi?.("مراجعة عامة")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">مراجعة سريعة</button>
              <button type="button" onClick={() => onOpenAi?.("حل امتحان")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">حل امتحان</button>
              <button type="button" onClick={() => onOpenLesson?.()} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">خطة المذاكرة</button>
              <button type="button" onClick={() => onOpenAi?.("تلخيص درس")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">لخص درس</button>
            </div>
          </section>
        </div>
        <div className="space-y-4">
          <PreparatoryProgress completed={completed} total={total} progressPct={progressPct} currentDay={currentDay} />
          <section aria-label="نصيحة للمرحلة الإعدادية" className="sheet-card p-5 bg-gradient-to-br from-violet-50/60 to-sky-50/40">
            <div className="flex gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper-2 border border-rule">📋</span>
              <div>
                <p className="text-sm font-semibold text-ink">نصيحة منظمة</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">قسّم مذاكرتك لكتل 40 دقيقة + راحة 10 دقائق. بعد كل درس حل سؤالين لتثبيت المعلومة.</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <PreparatorySubjectGrid subjects={subjects} loading={subjectsLoading} error={subjectsError} gradeName={gradeName} onSelect={handleSubjectSelect} />
    </div>
  );
}
