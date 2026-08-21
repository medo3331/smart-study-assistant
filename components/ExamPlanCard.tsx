"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchActiveExamPlan,
  setExamDayDone,
  archiveExamPlan,
  todayISO,
  relativeDayLabel,
  toArabicNum,
  daysUntilExam,
  planProgress,
  type ExamPlan,
  type ExamPlanDay,
} from "@/lib/exam-plans";
import { DAY_KIND_LABEL } from "@/lib/exam-intent";
import type { ThemeStyles } from "@/app/dashboard/components/types";

/* ==========================================================================
   كارت خطة الطوارئ

   ده الجزء اللي بيخلّي الميزة تحس إن «فيه حد بيتابعك». الخطة لو فضلت
   في المحادثة بس، المستخدم بيقفل الشات وتضيع. الكارت بيقعد على
   الداشبورد ويقول كل يوم: النهاردة مطلوب منك إيه، وفاضل كام يوم.

   ⚠️ تصميم: الأصفر هنا **لليوم الحالي بس**. باقي الأيام حبر هادي.
   (درس من ميزانية اللون — كارت فيه ٤ حاجات صفرا بيبقى حايط أصفر
   والعين ماتلاقيش تركّز فين.)
   ========================================================================== */

interface ExamPlanCardProps {
  userId: string;
  themeStyles: ThemeStyles;
  /** بيتنده بعد أي تغيير عشان الداشبورد تحدّث أي عدّادات مربوطة. */
  onChanged?: () => void;
}

export function ExamPlanCard({ userId, themeStyles, onChanged }: ExamPlanCardProps) {
  const [plan, setPlan] = useState<ExamPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  /**
   * قفل لكل يوم — نفس درس صفحة المخطط.
   *
   * ⚠️ من غيره: ضغطتين سريعتين على نفس الشيك بوكس بيبعتوا طلبين ومافيش
   * ضمان لترتيب وصولهم، فالشاشة تقول «خلص» والداتابيز تقول لأ **من غير
   * أي خطأ يظهر**. الـ ref هو مصدر الحقيقة وقت الضغطة لأن الـ state
   * ممكن تكون لسه ما اترسمتش.
   */
  const busyRef = useRef<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  /** بيمنع setState بعد ما الكومبوننت يتشال. */
  const aliveRef = useRef(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data, error } = await fetchActiveExamPlan(supabase, userId);
    if (!aliveRef.current) return;

    if (error) {
      // الجدول الناقص مش سبب نكسر الداشبورد — بنخفي الكارت ونسيب
      // الرسالة في الكونسول. الكارت ده إضافة مش أساس الصفحة.
      console.warn("exam-plan card:", error.message);
      setPlan(null);
    } else {
      setPlan(data);
    }
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  async function handleToggle(day: ExamPlanDay) {
    if (busyRef.current.has(day.id)) return;
    busyRef.current.add(day.id);
    setBusyIds(new Set(busyRef.current));
    setNotice(null);

    const next = !day.isDone;

    try {
      const { error } = await setExamDayDone(supabase, day.id, next);
      if (!aliveRef.current) return;

      if (error) {
        setNotice(error.message);
      } else {
        // تحديث محلي بدل إعادة تحميل — الكارت مايرمشش
        setPlan((p) =>
          p
            ? { ...p, days: p.days.map((d) => (d.id === day.id ? { ...d, isDone: next } : d)) }
            : p
        );
        onChanged?.();
      }
    } finally {
      // ⚠️ الفك في finally: لو الطلب رمى بدل ما يرجّع error، القفل كان
      // هيفضل شغال والشيك بوكس مقفول للأبد.
      busyRef.current.delete(day.id);
      if (aliveRef.current) setBusyIds(new Set(busyRef.current));
    }
  }

  async function handleArchive() {
    if (!plan) return;
    if (!confirm("تخلص الخطة دي وتشيلها من الداشبورد؟")) return;

    const { error } = await archiveExamPlan(supabase, plan.id);
    if (!aliveRef.current) return;

    if (error) {
      setNotice(error.message);
      return;
    }
    setPlan(null);
    onChanged?.();
  }

  // مفيش خطة = مفيش كارت. مش بنعرض حالة فاضية — الداشبورد مليانة أصلاً.
  if (loading || !plan) return null;

  const today = todayISO();
  const remaining = daysUntilExam(plan, today);
  const progress = planProgress(plan);

  // اليوم الحالي: تاريخ النهاردة بالظبط، وإلا أقرب يوم فايت ما اتعملش
  const currentDay =
    plan.days.find((d) => d.studyDate === today) ??
    plan.days.filter((d) => !d.isDone && d.studyDate < today).pop() ??
    null;

  const isLate = currentDay ? currentDay.studyDate < today : false;
  const visibleDays = expanded ? plan.days : plan.days.slice(0, 4);

  return (
    <section className="sheet-card sheet-card-live p-5 space-y-4" aria-labelledby="exam-plan-heading">
      {/* ---- الترويسة: المادة والعد التنازلي ---- */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="eyebrow eyebrow-flush mb-1.5">خطة الامتحان</p>
          <h3 id="exam-plan-heading" className="font-display font-extrabold text-base text-ink truncate">
            {plan.subject}
          </h3>
        </div>

        {/* العد التنازلي هو بطل الكارت — أصفر وكبير */}
        <div className={`${themeStyles.lightBg} border ${themeStyles.border} rounded-[var(--r-sm)] px-3 py-2 text-center shrink-0`}>
          <p className="font-display font-extrabold text-xl leading-none text-ink ltr-num">
            {remaining <= 0 ? "!" : toArabicNum(remaining)}
          </p>
          <p className="mono mt-1">{remaining <= 0 ? "النهاردة" : remaining === 1 ? "يوم فاضل" : "أيام فاضلة"}</p>
        </div>
      </div>

      {/* ---- اللي مطلوب النهاردة ---- */}
      {currentDay ? (
        <div className="bg-paper-2 border border-rule rounded-[var(--r-sm)] p-4 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="tag">{isLate ? "متأخر" : "النهاردة"}</span>
            <span className="mono">{DAY_KIND_LABEL[currentDay.kind]}</span>
          </div>
          <p className="text-sm font-bold text-ink leading-relaxed">{currentDay.title}</p>
          {currentDay.description && (
            <p className="text-xs text-ink-soft leading-relaxed">{currentDay.description}</p>
          )}
          {isLate && (
            <p className="text-[11px] text-ink-soft leading-relaxed pt-1">
              ده كان مطلوب {relativeDayLabel(currentDay.studyDate, today)} — لسه تقدر تلحّقه.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-paper-2 border border-rule rounded-[var(--r-sm)] p-4">
          <p className="text-xs text-ink-soft leading-relaxed">
            مفيش مطلوب محدد النهاردة — الخطة بتبدأ {relativeDayLabel(plan.days[0]?.studyDate ?? today, today)}.
          </p>
        </div>
      )}

      {/* ---- التقدم ---- */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="mono">التقدم</span>
          {/* ⚠️ .ltr-num لازمة: «٢ / ٤» جوه RTL بتتقلب لـ «٤ / ٢» */}
          <span className="mono ltr-num">
            {toArabicNum(plan.days.filter((d) => d.isDone).length)} / {toArabicNum(plan.days.length)}
          </span>
        </div>
        <div className="meter" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="تقدمك في خطة الامتحان">
          <div className={`meter-fill ${themeStyles.accentBg}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ---- الأيام ---- */}
      <ul className="space-y-1.5">
        {visibleDays.map((day) => {
          const isToday = day.studyDate === today;
          const busy = busyIds.has(day.id);
          return (
            <li key={day.id}>
              <button
                onClick={() => handleToggle(day)}
                disabled={busy}
                // ⚠️ الاسم ثابت و aria-pressed هو اللي يشيل الحالة. لو
                // الاتنين بيتغيّروا، قارئ الشاشة بينطق الحالة مرتين.
                aria-pressed={day.isDone}
                aria-label={`${relativeDayLabel(day.studyDate, today)}: ${day.title}`}
                className={`w-full text-start flex items-start gap-2.5 p-2.5 rounded-[var(--r-sm)] border transition disabled:opacity-50 ${
                  isToday ? "border-ink bg-paper-3" : "bg-paper border-rule hover:border-rule-strong"
                }`}
              >
                <span
                  className={`mono w-5 h-5 rounded-[4px] border flex items-center justify-center shrink-0 mt-0.5 ${
                    day.isDone ? "bg-ink text-paper-2 border-ink" : "border-rule-strong"
                  }`}
                  aria-hidden
                >
                  {busy ? "…" : day.isDone ? "✓" : ""}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="mono">{relativeDayLabel(day.studyDate, today)}</span>
                    {day.kind !== "content" && (
                      <span className="mono">{DAY_KIND_LABEL[day.kind]}</span>
                    )}
                  </span>
                  <span
                    className={`block text-xs leading-relaxed mt-0.5 ${
                      day.isDone ? "struck text-ink-soft" : "text-ink"
                    }`}
                  >
                    {day.title}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {plan.days.length > 4 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mono text-ink-soft hover:text-ink"
        >
          {expanded ? "اطوي" : `كل الأيام (${toArabicNum(plan.days.length)})`}
        </button>
      )}

      {notice && (
        <div className="notice notice-error" role="alert">
          <span aria-hidden>⚠️</span>
          <span className="leading-relaxed">{notice}</span>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button onClick={handleArchive} className="mono text-ink-soft hover:text-red-500">
          خلصت الخطة
        </button>
      </div>
    </section>
  );
}
