"use client";

import { useState } from "react";
import { BaccalaureateAssistantCard } from "./BaccalaureateAssistantCard";
import { BaccalaureateGoalInput } from "./BaccalaureateGoalInput";
import { BaccalaureateSubjectGrid } from "./BaccalaureateSubjectGrid";
import { BaccalaureateProgress } from "./BaccalaureateProgress";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import type { StudyDay, StudyConfig } from "@/app/dashboard/components/types";

interface BaccalaureateDashboardProps {
  displayName: string;
  personalContext: PersonalAssistantContext;
  subjects: Array<{ id: string; name: string; code?: string; curriculum_id?: string }>;
  subjectsLoading: boolean;
  subjectsError: string | null;
  gradeName: string | null;
  trackName?: string | null;
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

export function BaccalaureateDashboard({
  displayName,
  personalContext,
  subjects,
  subjectsLoading,
  subjectsError,
  gradeName,
  trackName,
  completed,
  total,
  progressPct,
  currentDay,
  days,
  onOpenAi,
  onOpenLesson,
  onGoalRecommendation,
}: BaccalaureateDashboardProps) {
  const [subjectGoal, setSubjectGoal] = useState<string | null>(null);

  function handleSubjectSelect(name: string) {
    setSubjectGoal(`عايز أذاكر ${name}`);
    if (onOpenAi) setTimeout(() => onOpenAi(name), 250);
  }

  const currentDayObj = days?.find((d) => d.day === currentDay) || days?.[0] || null;
  const needsTrack = gradeName && /2|3|الثاني|الثالث/.test(gradeName);
  const showTrackWarning = needsTrack && !trackName;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 sm:space-y-5">
      <div className="motion-safe:animate-[paReveal_.45s_cubic-bezier(.22,.8,.36,1)_both]">
        <BaccalaureateAssistantCard context={personalContext} displayName={displayName} gradeName={gradeName} trackName={trackName} subjectsCount={subjects.length} />
      </div>

      {showTrackWarning && (
        <section aria-label="تنبيه المسار" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-900">اختر مسار البكالوريا</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">مسارك (طب/هندسة/إدارة/آداب) يحدد مواد تخصصك. حدثه من الإعدادات لتظهر موادك بدقة.</p>
        </section>
      )}

      {currentDayObj && (
        <section aria-label="تركيز البكالوريا" className="sheet-card p-5 sm:p-6 border border-amber-200/50 bg-gradient-to-br from-amber-50/40 to-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">تركيز البكالوريا</p>
              <h3 className="font-display font-semibold text-[1.05rem] text-ink leading-6">{currentDayObj.topic}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft line-clamp-2">{currentDayObj.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="tag">اليوم {currentDayObj.day}</span>
                {trackName && <span className="tag bg-amber-500 text-white border-amber-600">{trackName}</span>}
                {currentDayObj.isCompleted && <span className="tag bg-emerald-100 border-emerald-200 text-emerald-800">مكتمل</span>}
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button type="button" onClick={() => onOpenLesson?.()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-700">
                دخول الدرس <span aria-hidden>→</span>
              </button>
              <button type="button" onClick={() => onOpenAi?.(currentDayObj.topic)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white px-5 py-3 text-sm font-bold text-amber-800 hover:bg-amber-50">
                اسأل المساعد <span aria-hidden>🎓</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <BaccalaureateGoalInput
            onRecommendation={onGoalRecommendation}
            gradeName={gradeName}
            trackName={trackName}
            externalGoal={subjectGoal}
            onExternalGoalConsumed={() => setSubjectGoal(null)}
            onOpenAi={onOpenAi}
            onOpenLesson={onOpenLesson}
          />
          <section aria-label="أدوات البكالوريا" className="sheet-card p-5">
            <h3 className="font-display font-semibold text-sm text-ink">أدوات البكالوريا</h3>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => onOpenAi?.("مراجعة بكالوريا")} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-right hover:bg-amber-50 text-sm font-medium text-ink">مراجعة شاملة</button>
              <button type="button" onClick={() => onOpenAi?.("امتحان بكالوريا شامل")} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-right hover:bg-amber-50 text-sm font-medium text-ink">امتحان شامل</button>
              <button type="button" onClick={() => onOpenLesson?.()} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">خطة طويلة</button>
              <button type="button" onClick={() => onOpenAi?.("ملخص مسار")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">ملخص مسار</button>
            </div>
          </section>
        </div>
        <div className="space-y-4">
          <BaccalaureateProgress completed={completed} total={total} progressPct={progressPct} currentDay={currentDay} />
          <section aria-label="توجيه جامعي" className="sheet-card p-5 bg-gradient-to-br from-amber-50 to-orange-50/40 border-amber-200">
            <div className="flex gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">🎯</span>
              <div>
                <p className="text-sm font-semibold text-ink">طريق الجامعة</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">ركز على مواد مسارك الأساسية. كل درس تتقنه الآن هو خطوة نحو التخصص الذي تحلم به.</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <BaccalaureateSubjectGrid subjects={subjects} loading={subjectsLoading} error={subjectsError} gradeName={gradeName} trackName={trackName} onSelect={handleSubjectSelect} />
    </div>
  );
}
