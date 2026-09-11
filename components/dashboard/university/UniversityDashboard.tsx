"use client";

import { useState } from "react";
import { UniversityAssistantCard } from "./UniversityAssistantCard";
import { UniversityGoalInput } from "./UniversityGoalInput";
import { UniversitySubjectGrid } from "./UniversitySubjectGrid";
import { UniversityProgress } from "./UniversityProgress";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import type { StudyDay, StudyConfig } from "@/app/dashboard/components/types";

interface UniversityDashboardProps {
  displayName: string;
  personalContext: PersonalAssistantContext;
  subjects: Array<{ id: string; name: string; code?: string; type?: string; curriculum_id?: string }>;
  subjectsLoading: boolean;
  subjectsError: string | null;
  facultyName?: string | null;
  departmentName?: string | null;
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

export function UniversityDashboard({
  displayName,
  personalContext,
  subjects,
  subjectsLoading,
  subjectsError,
  facultyName,
  departmentName,
  completed,
  total,
  progressPct,
  currentDay,
  days,
  onOpenAi,
  onOpenLesson,
  onGoalRecommendation,
}: UniversityDashboardProps) {
  const [subjectGoal, setSubjectGoal] = useState<string | null>(null);

  function handleSubjectSelect(name: string) {
    setSubjectGoal(`عايز أذاكر ${name}`);
    if (onOpenAi) setTimeout(() => onOpenAi(name), 250);
  }

  const currentDayObj = days?.find((d) => d.day === currentDay) || days?.[0] || null;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 sm:space-y-5">
      <div className="motion-safe:animate-[paReveal_.45s_cubic-bezier(.22,.8,.36,1)_both]">
        <UniversityAssistantCard context={personalContext} displayName={displayName} facultyName={facultyName} departmentName={departmentName} subjectsCount={subjects.length} />
      </div>

      {currentDayObj && (
        <section aria-label="تركيز جامعي" className="sheet-card p-5 sm:p-6 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">تركيز اليوم الجامعي</p>
              <h3 className="font-display font-semibold text-[1.05rem] text-ink leading-6">{currentDayObj.topic}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft line-clamp-2">{currentDayObj.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="tag">اليوم {currentDayObj.day}</span>
                {departmentName && <span className="tag bg-sky-50 border-sky-200 text-sky-900">{departmentName}</span>}
                {currentDayObj.isCompleted && <span className="tag bg-emerald-100 border-emerald-200 text-emerald-800">مكتمل</span>}
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button type="button" onClick={() => onOpenLesson?.()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-ink/90">
                دخول الدرس <span aria-hidden>→</span>
              </button>
              <button type="button" onClick={() => onOpenAi?.(currentDayObj.topic)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-paper-2 px-5 py-3 text-sm font-bold text-ink hover:bg-paper-3">
                اسأل المساعد <span aria-hidden>🎓</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <UniversityGoalInput
            onRecommendation={onGoalRecommendation}
            departmentName={departmentName}
            externalGoal={subjectGoal}
            onExternalGoalConsumed={() => setSubjectGoal(null)}
            onOpenAi={onOpenAi}
            onOpenLesson={onOpenLesson}
          />
          <section aria-label="أدوات جامعية" className="sheet-card p-5">
            <h3 className="font-display font-semibold text-sm text-ink">أدوات جامعية</h3>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => onOpenAi?.("تلخيص محاضرة")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">تلخيص</button>
              <button type="button" onClick={() => onOpenAi?.("حل واجب")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">واجب</button>
              <button type="button" onClick={() => onOpenLesson?.()} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">خطة فصل</button>
              <button type="button" onClick={() => onOpenAi?.("مراجعة للامتحان")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">مراجعة</button>
            </div>
          </section>
        </div>
        <div className="space-y-4">
          <UniversityProgress completed={completed} total={total} progressPct={progressPct} currentDay={currentDay} />
          <section aria-label="توجيه مهني" className="sheet-card p-5 bg-gradient-to-br from-slate-50 to-white border-slate-200">
            <div className="flex gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">◆</span>
              <div>
                <p className="text-sm font-semibold text-ink">تخصصك هو مستقبلك</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">ركز على مواد التخصص، ابنِ مشاريع تطبيقية، واستعن بالمساعد لربط النظرية بالتطبيق.</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <UniversitySubjectGrid subjects={subjects} loading={subjectsLoading} error={subjectsError} facultyName={facultyName} departmentName={departmentName} onSelect={handleSubjectSelect} />
    </div>
  );
}
