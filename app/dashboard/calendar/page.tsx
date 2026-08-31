"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, EmptyState, LoadingSheets, DataNotice, usePenTheme } from "../components/PageShell";
import { useAuthUser, localDateKey } from "../components/use-page-data";
import { HEATMAP_COLORS, THEME_STYLES } from "../components/theme-helpers";
import {
  fetchActivityRange,
  fetchGoals,
  type ActivityDay,
  type PlannerGoal,
} from "@/lib/pages-data";

/* ==========================================================================
   التقويم — شهرك على ورقة واحدة

   حاجتين في نفس الشبكة:
     النشاط  → من activity_log، كثافة اللون = دقايق التركيز + المراحل
     الأهداف → من planner_goals، اللي ليها موعد في الشهر ده

   ⚠️ مراحل التراك **مش** هنا عن قصد. `study_days` مفيهاش تاريخ، والداشبورد
   بتحدد المرحلة الحالية من عدد الخالص مش من النهارده — التراك تسلسل مش جدول
   مواعيد. لو حسبنا تاريخ لكل مرحلة كنا بنخترع مواعيد المستخدم ما اختارهاش.
   شوف التعليق في lib/pages-data.ts.

   الصفحة **قراءة بس**: النشاط بيتكتب من الدرس والبومودورو، والأهداف بتتعدّل
   في المخطط. أي حاجة هنا بتوصّلك للمكان الصح بدل ما تعمل مكان تاني للتعديل.

   ⚠️ محتاج جدول planner_goals — db/pages.sql. (activity_log موجود من الأصل.)
   ========================================================================== */

/* --------------------------------------------------------------------------
   الشهر

   بنشيل الشهر كـ { year, month } مش كـ Date. السبب إن Date بيحمل ساعة
   ويوم، وإضافة شهر عليه بتغلط في آخر الشهر (٣١ يناير + شهر = ٣ مارس).
   -------------------------------------------------------------------------- */

interface YearMonth {
  year: number;
  /** ١–١٢ زي ما البني آدم بيعدّها، مش ٠–١١ */
  month: number;
}

function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  // بنعدّ بالشهور من الصفر ونسيب Date تظبّط السنة — أرخص من شرط لكل طرف
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

function monthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** "أغسطس ٢٠٢٦" */
function monthLabel({ year, month }: YearMonth): string {
  return new Date(year, month - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

/** مفتاح يوم في الشهر ده. `day` من ١ لآخر الشهر. */
function dayKey({ year, month }: YearMonth, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth({ year, month }: YearMonth): number {
  // اليوم صفر من الشهر الجاي = آخر يوم في الشهر ده
  return new Date(year, month, 0).getDate();
}

/** الأسبوع بيبدأ سبت في مصر. getDay() بيرجّع الأحد=٠، فبنلف عشان السبت=٠. */
function weekColumn(date: Date): number {
  return (date.getDay() + 1) % 7;
}

const WEEKDAYS: { short: string; full: string }[] = [
  { short: "سبت", full: "السبت" },
  { short: "حد", full: "الأحد" },
  { short: "اتن", full: "الاتنين" },
  { short: "تلات", full: "التلات" },
  { short: "أربع", full: "الأربع" },
  { short: "خميس", full: "الخميس" },
  { short: "جمعة", full: "الجمعة" },
];

/* --------------------------------------------------------------------------
   الأرقام والصيغ
   -------------------------------------------------------------------------- */

/** أرقام هندية — نفس اللي `toLocaleDateString("ar-EG")` بتطلّعها، عشان ما
    يبقاش في نفس السطر «٣ أغسطس» جنب «3 دقيقة». */
function arNum(n: number): string {
  return n.toLocaleString("ar-EG");
}

/** "١س ٢٠د" أو "٢٠د". الساعات بتظهر بس لو فيها ساعة. */
function formatMinutes(total: number): string {
  if (total <= 0) return "٠د";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${arNum(minutes)}د`;
  if (minutes === 0) return `${arNum(hours)}س`;
  return `${arNum(hours)}س ${arNum(minutes)}د`;
}

/** "٣ أغسطس ٢٠٢٦" من مفتاح يوم. مش بنستخدم new Date(key) لأنها بتفهم
    النص كـ UTC فبتقفز يوم لورا في التوقيتات اللي قبل جرينتش. */
function formatDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** نفس معادلة الداشبورد بالظبط (page.tsx:897). المرحلة بتحسب ١٥ دقيقة عشان
    يوم خلّص مرحلة من غير بومودورو ما يبانش فاضي.

    ⚠️ لو غيّرتها هنا غيّرها هناك — الصفحتين بيرسموا نفس الخريطة. */
function activityLevel(focusMinutes: number, tasksCompleted: number): number {
  const score = focusMinutes + tasksCompleted * 15;
  if (score >= 70) return 4;
  if (score >= 45) return 3;
  if (score >= 20) return 2;
  if (score > 0) return 1;
  return 0;
}

/* --------------------------------------------------------------------------
   مربع اليوم

   ⚠️ في جذر الملف مش جوه CalendarPage. لو اتعرّف جوه، React يشوفه نوع جديد
   كل رندر فبيهدّ الـ ٣١ مربع ويبنيهم من الأول مع كل ضغطة على السهم.
   -------------------------------------------------------------------------- */

interface DayCell {
  key: string;
  day: number;
  activity: ActivityDay | null;
  goals: PlannerGoal[];
}

function DayBox({
  cell,
  isToday,
  isSelected,
  isFuture,
  colors,
  ring,
  onSelect,
}: {
  cell: DayCell;
  isToday: boolean;
  isSelected: boolean;
  /** الأيام الجاية مالهاش نشاط أصلاً — بتبان أهدى */
  isFuture: boolean;
  colors: string[];
  ring: string;
  onSelect: (key: string) => void;
}) {
  const { key, day, activity, goals } = cell;
  const level = activity ? activityLevel(activity.focusMinutes, activity.tasksCompleted) : 0;
  const openGoals = goals.filter((g) => !g.isDone).length;

  /* الاسم المتاح لازم يوصف اليوم كله — قارئ الشاشة بيسمع الزرار لوحده
     من غير الشبكة حواليه، فـ "٣" مش معلومة. */
  const parts = [`${arNum(day)} ${monthLabel({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) })}`];
  if (isToday) parts.push("النهاردة");
  if (activity && activity.focusMinutes > 0) parts.push(`تركيز ${formatMinutes(activity.focusMinutes)}`);
  if (activity && activity.tasksCompleted > 0) parts.push(`${arNum(activity.tasksCompleted)} مرحلة خلصت`);
  if (goals.length > 0) parts.push(openGoals > 0 ? `${arNum(openGoals)} هدف مفتوح` : "أهدافه خلصت");
  if (!activity && goals.length === 0) parts.push("مافيش حاجة");

  return (
    <button
      onClick={() => onSelect(key)}
      aria-pressed={isSelected}
      aria-label={parts.join("، ")}
      className={`relative aspect-square rounded-[7px] border p-1 flex flex-col items-center justify-center gap-1 transition ${
        colors[level]
      } ${isSelected ? `ring-2 ${ring}` : ""} ${isToday ? "border-ink" : ""} ${
        isFuture && level === 0 ? "opacity-55" : ""
      } hover:border-ink-soft`}
    >
      <span
        className={`mono text-[11px] leading-none ltr-num ${
          level >= 3 ? "text-paper" : isToday ? "text-ink font-bold" : "text-ink-soft"
        }`}
      >
        {arNum(day)}
      </span>

      {/* نقطة الأهداف: مليانة = فيه مفتوح، فاضية = كلها خلصت. المعنى في
          الـ aria-label فوق، فالنقطة نفسها مخفية. */}
      {goals.length > 0 && (
        <span
          aria-hidden
          className={`w-[5px] h-[5px] rounded-full ${
            openGoals > 0
              ? level >= 3
                ? "bg-paper"
                : "bg-redpen"
              : level >= 3
                ? "bg-paper/50"
                : "border border-ink-soft"
          }`}
        />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

export default function CalendarPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const theme = usePenTheme();
  const themeStyles = THEME_STYLES[theme];
  const heatColors = HEATMAP_COLORS[theme];

  /* النهاردة بيتحسب مرة واحدة. لو الصفحة فضلت مفتوحة عبر منتصف الليل
     بيبقى قديم بيوم — مقبول، والريفريش بيصلّحه. */
  const today = useMemo(() => {
    const now = new Date();
    return { key: localDateKey(now), ym: { year: now.getFullYear(), month: now.getMonth() + 1 } };
  }, []);

  const [viewMonth, setViewMonth] = useState<YearMonth>(today.ym);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [goals, setGoals] = useState<PlannerGoal[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [isLoadingMonth, setIsLoadingMonth] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  /* ---- كاش النشاط بالشهر ----
     التنقل بين الشهور رايح وجاي شايع، ومافيش داعي لطلب جديد لشهر فات خلاص.
     الكاش في ref مش state: مالوش لازمة في الرسم، وحطّه في state معناه رندر
     زيادة كل مرة نكتب فيه. الريفريش بيفضّيه — مقبول لصفحة قراءة. */
  const monthCache = useRef<Map<string, ActivityDay[]>>(new Map());

  /* ---- الأهداف: مرة واحدة لكل الشهور ----
     الأهداف قليلة (المخطط بيوريها كلها في صفحة واحدة أصلاً)، فطلب واحد
     أرخص من طلب لكل شهر — والتنقل بيبقى فوري. */
  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      router.push("/dashboard");
      return;
    }
    if (session.status === "error") {
      setNotice(session.message);
                  setIsLoadingGoals(false);
      setIsLoadingMonth(false);
      return;
    }

    (async () => {
      const { data, error } = await fetchGoals(supabase, session.user.id);
      if (error) setNotice(error.message);
      else setGoals(data);
      setIsLoadingGoals(false);
    })();
  }, [session, supabase, router]);

  /* ---- النشاط: طلب لكل شهر، بالمدى ----
     مش بنجيب السجل كله زي الداشبورد: بيكبر يوم كل يوم والشبكة بتوري
     شهر واحد. */
  useEffect(() => {
    if (session.status !== "ready") return;

    const key = monthKey(viewMonth);
    const cached = monthCache.current.get(key);
    if (cached) {
      setActivity(cached);
      setIsLoadingMonth(false);
      return;
    }

    // ⚠️ الشهر ممكن يتغيّر قبل ما الطلب يرجع (ضغطتين سريعتين على السهم).
    // من غير العلم ده، رد الشهر القديم لو وصل متأخر بيكتب فوق الجديد.
    let isCurrent = true;
    setIsLoadingMonth(true);

    (async () => {
      const from = dayKey(viewMonth, 1);
      const to = dayKey(viewMonth, daysInMonth(viewMonth));
      const { data, error } = await fetchActivityRange(supabase, session.user.id, from, to);
      if (!isCurrent) return;

      if (error) {
        setNotice(error.message);
        setActivity([]);
      } else {
        monthCache.current.set(key, data);
        setActivity(data);
        setNotice(null);
      }
      setIsLoadingMonth(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [session, supabase, viewMonth]);

  /* ---- بناء الشبكة ----
     الفلترة جوه الـ memo مش بره: لو كانت بره، المصفوفة بتبقى مرجع جديد كل
     رندر والـ memo ما بتحفظ حاجة. */
  const { cells, leadingBlanks, monthTotals } = useMemo(() => {
    const activityByKey = new Map(activity.map((a) => [a.date, a]));

    const goalsByKey = new Map<string, PlannerGoal[]>();
    const prefix = `${monthKey(viewMonth)}-`;
    for (const goal of goals) {
      if (!goal.dueDate || !goal.dueDate.startsWith(prefix)) continue;
      const list = goalsByKey.get(goal.dueDate);
      if (list) list.push(goal);
      else goalsByKey.set(goal.dueDate, [goal]);
    }

    const total = daysInMonth(viewMonth);
    const built: DayCell[] = [];
    let focusMinutes = 0;
    let tasksCompleted = 0;
    let activeDays = 0;
    let goalCount = 0;

    for (let day = 1; day <= total; day++) {
      const key = dayKey(viewMonth, day);
      const dayActivity = activityByKey.get(key) ?? null;
      const dayGoals = goalsByKey.get(key) ?? [];

      if (dayActivity) {
        focusMinutes += dayActivity.focusMinutes;
        tasksCompleted += dayActivity.tasksCompleted;
        if (dayActivity.focusMinutes > 0 || dayActivity.tasksCompleted > 0) activeDays++;
      }
      goalCount += dayGoals.length;

      built.push({ key, day, activity: dayActivity, goals: dayGoals });
    }

    return {
      cells: built,
      leadingBlanks: weekColumn(new Date(viewMonth.year, viewMonth.month - 1, 1)),
      monthTotals: { focusMinutes, tasksCompleted, activeDays, goalCount },
    };
  }, [activity, goals, viewMonth]);

  /* ---- اليوم المختار ---- */
  const selected = useMemo(
    () => (selectedKey ? cells.find((c) => c.key === selectedKey) ?? null : null),
    [selectedKey, cells]
  );

  /** بنقفل لو ضغطت على نفس اليوم تاني — اللوحة مش لازقة. */
  const handleSelect = useCallback((key: string) => {
    setSelectedKey((prev) => (prev === key ? null : key));
  }, []);

  /** التنقل بيقفل اللوحة: اليوم المختار مش في الشهر الجديد أصلاً. */
  const goToMonth = (delta: number) => {
    setSelectedKey(null);
    setViewMonth((prev) => shiftMonth(prev, delta));
  };

  const isViewingToday = sameMonth(viewMonth, today.ym);
  const isLoading = isLoadingGoals && isLoadingMonth;

  /* ---------------------------------------------------------------------- */

  return (
    <PageShell
      eyebrow="التقويم"
      title="شهرك"
      lede="كل يوم فيه لون على قدر ما ذاكرت فيه، ونقطة لو كان فيه هدف بموعده. اضغط على أي يوم تشوف تفاصيله."
      feedbackPage="calendar"
      feedbackLabel="التقويم"
    >
      {notice && <DataNotice message={notice} />}

      {/* ---- شريط الشهر ---- */}
      <div className="sheet-card p-4 flex items-center justify-between gap-3">
        {/* في RTL السهم اللي على اليمين معناه «اللي فات». الأسماء صريحة
            عشان ما نعتمدش على اتجاه الرسم في المعنى. */}
        <button onClick={() => goToMonth(-1)} className="btn btn-quiet text-sm" aria-label="الشهر اللي فات">
          <span aria-hidden>→</span>
        </button>

        <div className="text-center min-w-0">
          <p className="font-display font-extrabold text-sm text-ink">{monthLabel(viewMonth)}</p>
          {!isViewingToday && (
            <button
              onClick={() => {
                setSelectedKey(null);
                setViewMonth(today.ym);
              }}
              className={`text-[11px] ${themeStyles.accentText} hover:underline mt-0.5`}
            >
              رجّعني للشهر ده
            </button>
          )}
        </div>

        <button onClick={() => goToMonth(1)} className="btn btn-quiet text-sm" aria-label="الشهر الجاي">
          <span aria-hidden>←</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingSheets count={2} />
      ) : (
        <div className="space-y-4">
          {/* ---- الشبكة ----
              aria-busy بس وقت تحميل شهر جديد: الشبكة القديمة تفضل مكانها
              عشان الصفحة ما تنقزش، والقارئ يعرف إن الأرقام بتتحدّث. */}
          <div className="sheet-card p-4 sm:p-5" aria-busy={isLoadingMonth}>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday.full} className="text-center">
                  <span className="sr-only">{weekday.full}</span>
                  <span className="mono text-[10px] text-ink-soft" aria-hidden>
                    {weekday.short}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {/* خانات فاضية لحد أول يوم في الشهر */}
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <div key={`blank-${i}`} aria-hidden />
              ))}

              {cells.map((cell) => (
                <DayBox
                  key={cell.key}
                  cell={cell}
                  isToday={cell.key === today.key}
                  isSelected={cell.key === selectedKey}
                  isFuture={cell.key > today.key}
                  colors={heatColors}
                  ring={themeStyles.ring}
                  onSelect={handleSelect}
                />
              ))}
            </div>

            {/* ---- مفتاح الخريطة ---- */}
            <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-3 border-t border-rule">
              <div className="flex items-center gap-1.5">
                <span className="mono text-[10px] text-ink-soft">أقل</span>
                {heatColors.map((color, level) => (
                  <span key={level} className={`w-3 h-3 rounded-[3px] border ${color}`} aria-hidden />
                ))}
                <span className="mono text-[10px] text-ink-soft">أكتر</span>
              </div>
              <p className="text-[10px] text-ink-soft flex items-center gap-1.5">
                <span className="w-[5px] h-[5px] rounded-full bg-redpen" aria-hidden />
                <span>نقطة = هدف بموعده</span>
              </p>
            </div>
          </div>

          {/* ---- اليوم المختار ----
              قراءة بس: النشاط بيتكتب من الدرس والبومودورو، والأهداف من
              المخطط. اللوحة بتوصّلك للمكان الصح بدل ما تعمل مكان تعديل تاني. */}
          {selected && (
            <div className="sheet-card sheet-card-live p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="font-display font-extrabold text-sm text-ink">
                  {formatDayKey(selected.key)}
                  {selected.key === today.key && <span className="text-ink-soft font-normal"> — النهاردة</span>}
                </p>
                <button
                  onClick={() => setSelectedKey(null)}
                  className="mono text-ink-soft hover:text-redpen text-[11px]"
                  aria-label="اقفل تفاصيل اليوم"
                >
                  <span aria-hidden>اقفل</span>
                </button>
              </div>

              {selected.activity &&
              (selected.activity.focusMinutes > 0 || selected.activity.tasksCompleted > 0) ? (
                <p className="tag">
                  {selected.activity.focusMinutes > 0 && (
                    <span>تركيز {formatMinutes(selected.activity.focusMinutes)}</span>
                  )}
                  {selected.activity.tasksCompleted > 0 && (
                    <span>
                      <span className="ltr-num">{arNum(selected.activity.tasksCompleted)}</span> مرحلة خلصت
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-ink-soft">
                  {selected.key > today.key ? "لسه ما جاش." : "مافيش نشاط مسجّل في اليوم ده."}
                </p>
              )}

              {selected.goals.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="eyebrow eyebrow-flush">أهداف بموعدها</p>
                  {selected.goals.map((goal) => (
                    <p key={goal.id} className="flex items-start gap-2 text-xs leading-relaxed">
                      <span aria-hidden className={goal.isDone ? "text-ink-soft" : themeStyles.accentText}>
                        {goal.isDone ? "✓" : "•"}
                      </span>
                      <span className={goal.isDone ? "text-ink-soft line-through" : "text-ink"}>
                        <span className="sr-only">{goal.isDone ? "خلص: " : "مفتوح: "}</span>
                        {goal.title}
                      </span>
                    </p>
                  ))}
                  <button
                    onClick={() => router.push("/dashboard/planner")}
                    className={`text-[11px] ${themeStyles.accentText} hover:underline`}
                  >
                    عدّلها في المخطط
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---- حصيلة الشهر ---- */}
          {monthTotals.activeDays === 0 && monthTotals.goalCount === 0 ? (
            <EmptyState
              icon="📅"
              title={isViewingToday ? "الشهر ده لسه فاضي" : "مافيش حاجة في الشهر ده"}
              body={
                isViewingToday
                  ? "افتح مرحلة من الداشبورد أو شغّل البومودورو، وأول لون هيظهر هنا."
                  : "لا نشاط ولا أهداف كان لها موعد في الشهر ده."
              }
              action={
                isViewingToday ? (
                  <button onClick={() => router.push("/dashboard")} className="btn btn-marker text-sm">
                    يلا نذاكر
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sheet-card p-4">
                <p className="eyebrow eyebrow-flush mb-1.5">تركيز</p>
                <p className={`font-display font-extrabold text-lg leading-none ${themeStyles.accentText}`}>
                  {formatMinutes(monthTotals.focusMinutes)}
                </p>
              </div>
              <div className="sheet-card p-4">
                <p className="eyebrow eyebrow-flush mb-1.5">مراحل</p>
                <p className={`font-display font-extrabold text-lg leading-none ${themeStyles.accentText}`}>
                  <span className="ltr-num">{arNum(monthTotals.tasksCompleted)}</span>
                </p>
              </div>
              <div className="sheet-card p-4">
                <p className="eyebrow eyebrow-flush mb-1.5">أيام مذاكرة</p>
                <p className={`font-display font-extrabold text-lg leading-none ${themeStyles.accentText}`}>
                  <span className="ltr-num">
                    {arNum(monthTotals.activeDays)}/{arNum(cells.length)}
                  </span>
                </p>
              </div>
              <div className="sheet-card p-4">
                <p className="eyebrow eyebrow-flush mb-1.5">أهداف</p>
                <p className={`font-display font-extrabold text-lg leading-none ${themeStyles.accentText}`}>
                  <span className="ltr-num">{arNum(monthTotals.goalCount)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}