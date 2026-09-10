"use client";

import React from "react";
import { CheckCircle2, Trophy, Flame, Target, Sparkles, Clock, TrendingUp, ShieldCheck } from "lucide-react";

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
    <div className="rounded-2xl border border-[#1f1f22] bg-[#0f0f11] p-5 shadow-sm hover:border-[#E23A3A]/40 transition-colors">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E23A3A]/10 text-[#E23A3A]">
          <Target size={18} strokeWidth={2} />
        </span>
        <h3 className="font-bold text-[#f1f1f4] text-sm">خطة اليوم</h3>
      </div>
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between text-[#a0a0a8]">
          <span>المادة</span>
          <span className="font-semibold text-[#f1f1f4]">{subject || "—"}</span>
        </div>
        <div className="flex items-center justify-between text-[#a0a0a8]">
          <span>اليوم الحالي</span>
          <span className="font-mono font-bold text-[#FF6B5B]">{currentDayNumber} / {daysLength}</span>
        </div>
        <div className="flex items-center justify-between text-[#a0a0a8]">
          <span>المكتمل</span>
          <span className="font-mono font-bold text-[#E23A3A]">{completedCount} مهمة</span>
        </div>
        <div className="flex items-center justify-between text-[#a0a0a8]">
          <span>الفصل</span>
          <span className="font-mono font-bold text-[#FF6B5B]">{chapterLabel}</span>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full rounded-full bg-[#1a1a1d] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#E23A3A] to-[#FF6B5B] transition-all"
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
    <div className="rounded-2xl border border-[#1f1f22] bg-[#0f0f11] p-5 shadow-sm hover:border-[#FF6B5B]/40 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF6B5B]/10 text-[#FF6B5B]">
            <Flame size={18} strokeWidth={2} />
          </span>
          <h3 className="font-bold text-[#f1f1f4] text-sm">مهام اليوم</h3>
        </div>
        <span className="text-[0.6rem] font-mono text-[#a0a0a8]">{completedToday} مكتملة</span>
      </div>
      <div className="space-y-2">
        {open.length === 0 ? (
          <p className="text-xs text-[#777]">لا توجد مهام معلقة — استمتع بيومك 🌟</p>
        ) : (
          open.map((g, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2 bg-[#111113] hover:bg-[#16161a] transition">
              <CheckCircle2 size={14} className="text-[#E23A3A] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#f1f1f4] truncate">{g.title}</p>
                {g.priority && (
                  <span className="inline-block mt-1 text-[0.55rem] font-mono text-[#FF6B5B] bg-[#FF6B5B]/10 px-1.5 py-0.5 rounded-full">
                    {g.priority}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-[#1f1f22]">
        <p className="text-[0.6rem] text-[#777]">مأخوذ من جدول planner_goals</p>
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
    <div className="rounded-2xl border border-[#1f1f22] bg-[#0f0f11] p-5 shadow-sm hover:border-[#2DD4BF]/40 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF]">
            <TrendingUp size={18} strokeWidth={2} />
          </span>
          <h3 className="font-bold text-[#f1f1f4] text-sm">تقدّم التركيز</h3>
        </div>
        <span className="text-[0.6rem] font-mono text-[#a0a0a8]">{weeklyFocusHoursLabel}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="text-center">
            <div
              className="mx-auto mb-1.5 rounded-md bg-[#1a1a1d] hover:bg-[#E23A3A]/20 transition-colors relative"
              style={{ height: `${Math.max(8, Math.min(48, (d.minutes || d.tasks ? 1 : 0) * 4))}px`, width: "100%" }}
            >
              {(d.minutes > 0 || d.tasks > 0) && (
                <div className="absolute bottom-0 left-0 right-0 h-1/2 rounded-b-md bg-gradient-to-t from-[#E23A3A] to-[#FF6B5B] opacity-80" />
              )}
            </div>
            <span className="text-[0.55rem] font-mono text-[#777] block truncate">{d.label}</span>
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
    <div className="rounded-2xl border border-[#1f1f22] bg-gradient-to-br from-[#111113] to-[#0a0a12] p-5 shadow-sm hover:border-[#FF6B5B]/40 transition-colors relative overflow-hidden">
      {/* زخرفة خفيفة */}
      <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[#FF6B5B]/5 blur-2xl pointer-events-none" aria-hidden />
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2DD4BF]/20 to-[#7C5CFF]/20 text-2xl shadow-inner">
          🐣
        </span>
        <div>
          <h3 className="font-bold text-[#f1f1f4] text-sm">{companionName}</h3>
          <p className="text-[0.6rem] text-[#a0a0a8]">رفيق دراستك</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-[#0f0f11] px-2 py-2 text-center border border-[#1f1f22]/60">
          <span className="block text-[0.6rem] text-[#777]">المستوى</span>
          <span className="block font-display font-extrabold text-lg text-[#f1f1f4]">L{level ?? 1}</span>
        </div>
        <div className="rounded-xl bg-[#0f0f11] px-2 py-2 text-center border border-[#1f1f22]/60">
          <span className="block text-[0.6rem] text-[#777]">XP</span>
          <span className="block font-mono font-bold text-sm text-[#FF6B5B]">{xp ?? 0}</span>
        </div>
        <div className="rounded-xl bg-[#0f0f11] px-2 py-2 text-center border border-[#1f1f22]/60">
          <span className="block text-[0.6rem] text-[#777]">سلسلة</span>
          <span className="block font-mono font-bold text-sm text-[#E23A3A]">{streak ?? 1} يوم</span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-[#18181b] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#E23A3A] via-[#FF6B5B] to-[#2DD4BF] transition-all"
          style={{ width: `${levelProgressPct ?? 0}%` }}
        />
      </div>
      <p className="text-[0.6rem] text-[#777] mt-2">تقدم المستوى الحالي</p>
      {hidden && (
        <p className="text-[0.55rem] text-[#555] mt-1">الرفيق مخفي حالياً — اضغط لإظهاره</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   تصدير المكونات الأربعة معًا
   -------------------------------------------------------------------------- */
export { TodayPlanCard, DailyMissionsCard, WeeklyProgressCard, CompanionStatusCard };
