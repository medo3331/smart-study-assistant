"use client";

import { useState } from "react";
import { SecondaryAssistantCard } from "./SecondaryAssistantCard";
import { SecondaryGoalInput } from "./SecondaryGoalInput";
import { SecondarySubjectGrid } from "./SecondarySubjectGrid";
import { SecondaryProgress } from "./SecondaryProgress";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import type { StudyDay, StudyConfig } from "@/app/dashboard/components/types";

interface SecondaryDashboardProps {
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

export function SecondaryDashboard({
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
}: SecondaryDashboardProps) {
  const [subjectGoal, setSubjectGoal] = useState<string | null>(null);

  function handleSubjectSelect(name: string) {
    setSubjectGoal(`عايز أذاكر ${name}`);
    if (onOpenAi) {
      setTimeout(() => onOpenAi(name), 250);
    }
  }

  const currentDayObj = days?.find((d) => d.day === currentDay) || days?.[0] || null;
  const isGradeNeedingTrack = gradeName && /2|3|الثاني|الثالث/.test(gradeName);
  const showTrackWarning = isGradeNeedingTrack && !trackName;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 sm:space-y-5">
      <div className="motion-safe:animate-[paReveal_.45s_cubic-bezier(.22,.8,.36,1)_both]">
        <SecondaryAssistantCard context={personalContext} displayName={displayName} gradeName={gradeName} trackName={trackName} subjectsCount={subjects.length} />
      </div>

      {showTrackWarning && (
        <section aria-label="تنبيه المسار" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">المسار غير محدد</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">أنت في {gradeName} واختيار المسار (علمي/رياضة/أدبي) يساعدنا نخصص موادك بدقة. يمكنك تحديثه من الإعدادات.</p>
        </section>
      )}

      {currentDayObj && (
        <section aria-label="تركيز اليوم" className="sheet-card p-5 sm:p-6 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">تركيز اليوم</p>
              <h3 className="font-display font-semibold text-[1.05rem] text-ink leading-6">{currentDayObj.topic}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft line-clamp-2">{currentDayObj.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="tag">اليوم {currentDayObj.day}</span>
                {trackName && <span className="tag bg-amber-50 border-amber-200">{trackName}</span>}
                {currentDayObj.isCompleted && <span className="tag bg-emerald-100 border-emerald-200 text-emerald-800">مكتمل</span>}
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button type="button" onClick={() => onOpenLesson?.()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-ink/90">
                دخول الدرس <span aria-hidden>→</span>
              </button>
              <button type="button" onClick={() => onOpenAi?.(currentDayObj.topic)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-white px-5 py-3 text-sm font-bold text-ink hover:bg-paper-3">
                اسأل المساعد <span aria-hidden>◈</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <SecondaryGoalInput
            onRecommendation={onGoalRecommendation}
            gradeName={gradeName}
            trackName={trackName}
            externalGoal={subjectGoal}
            onExternalGoalConsumed={() => setSubjectGoal(null)}
            onOpenAi={onOpenAi}
            onOpenLesson={onOpenLesson}
          />
          <section aria-label="أدوات الدراسة" className="sheet-card p-5">
            <h3 className="font-display font-semibold text-sm text-ink">أدوات الدراسة</h3>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => onOpenAi?.("مراجعة مركزة")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">مراجعة</button>
              <button type="button" onClick={() => onOpenAi?.("حل امتحان")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">امتحان</button>
              <button type="button" onClick={() => onOpenLesson?.()} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">خطة</button>
              <button type="button" onClick={() => onOpenAi?.("تلخيص")} className="rounded-xl border border-rule bg-paper-2 p-3 text-right hover:bg-paper-3 text-sm font-medium text-ink">تلخيص</button>
            </div>
          </section>
        </div>
        <div className="space-y-4">
          <SecondaryProgress completed={completed} total={total} progressPct={progressPct} currentDay={currentDay} />
          <section aria-label="توجيه أكاديمي" className="sheet-card p-5 bg-gradient-to-br from-slate-50 to-white border-slate-200">
            <div className="flex gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white">◆</span>
              <div>
                <p className="text-sm font-semibold text-ink">تركيز ثانوي</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">اعمل على مادة واحدة بعمق، ثم انتقل. الامتحانات تحتاج فهم + تدريب مستمر، ليس حفظاً فقط.</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <SecondarySubjectGrid subjects={subjects} loading={subjectsLoading} error={subjectsError} gradeName={gradeName} trackName={trackName} onSelect={handleSubjectSelect} />
    </div>
  );
}
