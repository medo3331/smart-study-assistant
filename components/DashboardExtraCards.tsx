"use client";

import React from "react";
import { CheckCircle2, Flame, Target, TrendingUp } from "lucide-react";

/* ===========================================================================
   كاردات إضافية لـ GROUP C (العمل الحقيقي / دراسة اليوم)
   تربط ببيانات حقيقية من DB: study_configs, study_days, planner_goals, badges
   =========================================================================== */

/* --------------------------------------------------------------------------
   كارد 1: خطة اليوم / الخطوة الحالية (يربط بـ study_days + study_configs)
   -------------------------------------------------------------------------- */
function TodayPlanCard({
  currentDayNumber,
  daysLength,
  subject,
  completedCount,
  chapters,
  currentChapter,
}: {
  currentDayNumber: number;
  daysLength: number;
  subject?: string;
  completedCount: number;
  chapters: Array<{ chapterNumber: number; isComplete: boolean; topics: string[] }>;
  currentChapter?: number;
}) {
  const nextChapter = chapters?.find((c) => !c.isComplete);
  const chapterLabel = nextChapter ? `فصل ${nextChapter.chapterNumber}` : "مكتمل";
  return (
    <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm hover:border-[var(--accent)]/40 transition-colors">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Target size={18} strokeWidth={2} />
        </span>
        <h3 className="font-bold text-[var(--text)] text-sm">خطة اليوم</h3>
      </div>
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between text-[var(--muted)]">
          <span>المادة</span>
          <span className="font-semibold text-[var(--text)]">{subject || "—"}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--muted)]">
          <span>اليوم الحالي</span>
          <span className="font-mono font-bold text-[var(--accent-highlight)]">{currentDayNumber} / {daysLength}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--muted)]">
          <span>المكتمل</span>
          <span className="font-mono font-bold text-[var(--accent)]">{completedCount} مهمة</span>
        </div>
        <div className="flex items-center justify-between text-[var(--muted)]">
          <span>الفصل</span>
          <span className="font-mono font-bold text-[var(--accent-highlight)]">{chapterLabel}</span>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full rounded-full bg-[var(--card-secondary)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-highlight)] transition-all"
          style={{ width: `${daysLength ? (currentDayNumber / daysLength) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   كارد 2: المهام اليومية (يربط بـ planner_goals — pending + is_done)
   -------------------------------------------------------------------------- */
function DailyMissionsCard({
  pendingGoals,
  completedToday = 0,
}: {
  pendingGoals: Array<{ title: string; due_date?: string; priority?: string; is_done?: boolean }>;
  completedToday?: number;
}) {
  const open = (pendingGoals ?? []).filter((g) => !g.is_done).slice(0, 3);
  return (
    <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm hover:border-[var(--accent)]/40 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-highlight)]/10 text-[var(--accent-highlight)]">
            <Flame size={18} strokeWidth={2} />
          </span>
          <h3 className="font-bold text-[var(--text)] text-sm">مهام اليوم</h3>
        </div>
        <span className="text-[0.6rem] font-mono text-[var(--muted)]">{completedToday} مكتملة</span>
      </div>
      <div className="space-y-2">
        {open.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">لا توجد مهام معلقة — استمتع بيومك 🌟</p>
        ) : (
          open.map((g, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2 bg-[var(--card-secondary)] hover:bg-[var(--card-secondary)] transition">
              <CheckCircle2 size={14} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text)] truncate">{g.title}</p>
                {g.priority && (
                  <span className="inline-block mt-1 text-[0.55rem] font-mono text-[var(--accent-highlight)] bg-[var(--accent-highlight)]/10 px-1.5 py-0.5 rounded-full">
                    {g.priority}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--rule)]">
        <p className="text-[0.6rem] text-[var(--muted)]">مأخوذ من جدول planner_goals</p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   كارد 3: التقدم الأسبوعي / الشهري (يربط بـ activity_log + analyticsRange)
   -------------------------------------------------------------------------- */
function WeeklyProgressCard({
  weeklyChartData,
  monthlyChartData,
  analyticsRange,
  weeklyFocusHoursLabel,
}: {
  weeklyChartData: Array<{ label: string; minutes: number; tasks: number }>;
  monthlyChartData: Array<{ label: string; minutes: number; tasks: number }>;
  analyticsRange: "weekly" | "monthly";
  weeklyFocusHoursLabel: string;
}) {
  const data = analyticsRange === "weekly" ? weeklyChartData : monthlyChartData;
  return (
    <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm hover:border-[var(--accent)]/40 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <TrendingUp size={18} strokeWidth={2} />
          </span>
          <h3 className="font-bold text-[var(--text)] text-sm">تقدّم التركيز</h3>
        </div>
        <span className="text-[0.6rem] font-mono text-[var(--muted)]">{weeklyFocusHoursLabel}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="text-center">
            <div
              className="mx-auto mb-1.5 rounded-md bg-[var(--card-secondary)] hover:bg-[var(--accent)]/20 transition-colors relative"
              style={{ height: `${Math.max(8, Math.min(48, (d.minutes || d.tasks ? 1 : 0) * 4))}px`, width: "100%" }}
            >
              {(d.minutes > 0 || d.tasks > 0) && (
                <div className="absolute bottom-0 left-0 right-0 h-1/2 rounded-b-md bg-gradient-to-t from-[var(--accent)] to-[var(--accent-highlight)] opacity-80" />
              )}
            </div>
            <span className="text-[0.55rem] font-mono text-[var(--muted)] block truncate">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   كارد 4: الرفيق / StudyPet — حالة جديدة (يربط بـ companion + level + xp)
   -------------------------------------------------------------------------- */
function CompanionStatusCard({
  level,
  xp,
  streak,
  levelProgressPct,
  companionName = "رفيقك",
  hidden = false,
}: {
  level?: number;
  xp?: number;
  streak?: number;
  levelProgressPct?: number;
  companionName?: string;
  hidden?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--rule)] bg-gradient-to-br from-[var(--card-primary)] to-[var(--card-secondary)] p-5 shadow-sm hover:border-[var(--accent)]/40 transition-colors relative overflow-hidden">
      {/* زخرفة خفيفة */}
      <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[var(--accent)]/5 blur-2xl pointer-events-none" aria-hidden />
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-highlight)]/20 text-2xl shadow-inner">
          🐣
        </span>
        <div>
          <h3 className="font-bold text-[var(--text)] text-sm">{companionName}</h3>
          <p className="text-[0.6rem] text-[var(--muted)]">رفيق دراستك</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-[var(--card-primary)] px-2 py-2 text-center border border-[var(--rule)]">
          <span className="block text-[0.6rem] text-[var(--muted)]">المستوى</span>
          <span className="block font-display font-extrabold text-lg text-[var(--text)]">L{level ?? 1}</span>
        </div>
        <div className="rounded-xl bg-[var(--card-primary)] px-2 py-2 text-center border border-[var(--rule)]">
          <span className="block text-[0.6rem] text-[var(--muted)]">XP</span>
          <span className="block font-mono font-bold text-sm text-[var(--accent-highlight)]">{xp ?? 0}</span>
        </div>
        <div className="rounded-xl bg-[var(--card-primary)] px-2 py-2 text-center border border-[var(--rule)]">
          <span className="block text-[0.6rem] text-[var(--muted)]">سلسلة</span>
          <span className="block font-mono font-bold text-sm text-[var(--accent)]">{streak ?? 1} يوم</span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--card-secondary)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] via-[var(--accent-highlight)] to-[var(--accent)] transition-all"
          style={{ width: `${levelProgressPct ?? 0}%` }}
        />
      </div>
      <p className="text-[0.6rem] text-[var(--muted)] mt-2">تقدم المستوى الحالي</p>
      {hidden && (
        <p className="text-[0.55rem] text-[var(--muted)] mt-1">الرفيق مخفي حالياً — اضغط لإظهاره</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   تصدير المكونات الأربعة معًا
   -------------------------------------------------------------------------- */
export { TodayPlanCard, DailyMissionsCard, WeeklyProgressCard, CompanionStatusCard };
