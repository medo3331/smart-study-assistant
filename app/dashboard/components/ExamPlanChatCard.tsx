"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  saveExamPlan,
  addDaysISO,
  todayISO,
  relativeDayLabel,
  toArabicNum,
  type DraftDay,
} from "@/lib/exam-plans";
import { DAY_KIND_LABEL, MAX_EXAM_DAYS, type ExamIntent } from "@/lib/exam-intent";
import type { ThemeStyles } from "./types";

/* ==========================================================================
   كارت خطة الطوارئ جوه الشات

   المستخدم كتب «عندي امتحان بعد ٣ أيام» في الشات. المساعد رد «تمام.
   هعملك خطة» — والكارت ده هو الخطة نفسها.

   ⚠️ ليه فيه خطوة تأكيد قبل التوليد؟ لأن الكاشف بيطلّع المدة بثقة عالية
   بس المادة بثقة واطية. لو المستخدم قال «عندي امتحان بعد ٣ أيام» بس،
   مفيش مادة خالص. نبني خطة اسمها «مادتك» = خطة زبالة. سؤال واحد
   («المادة إيه؟») بيحوّلها لخطة حقيقية.

   ولو المادة اتعرفت من الجملة، الحقل بيجي مليان والمستخدم بيضغط زرار
   واحد — فالخطوة مش عقبة، دي تأكيد.
   ========================================================================== */

type Phase = "confirm" | "generating" | "done" | "error";

/**
 * نسخة نصية من الخطة تتحط في تاريخ المحادثة.
 *
 * الشكل مقصود إنه زي اللي المستخدم طلبه بالظبط:
 *   النهاردة: …
 *   بكرة: …
 *   آخر يوم: اختبار شامل
 */
function summarizePlan(subject: string, days: DraftDay[], startISO: string): string {
  const lines = days.map(
    (d) => `${relativeDayLabel(addDaysISO(startISO, d.dayNumber - 1), startISO)}: ${d.title}`
  );
  return [
    `خطة ${subject} — ${toArabicNum(days.length)} ${days.length === 1 ? "يوم" : "أيام"}:`,
    ...lines,
    "",
    "حفظتها على الداشبورد. هفكّرك بمطلوب كل يوم.",
  ].join("\n");
}

interface ExamPlanChatCardProps {
  intent: ExamIntent;
  /** النص الأصلي اللي المستخدم كتبه — بيتحفظ للمرجعية. */
  sourceText: string;
  themeStyles: ThemeStyles;
  /** المادة من إعدادات المذاكرة — بتستعمل لو الجملة مافيهاش مادة. */
  fallbackSubject?: string;
  /**
   * بيتنده بعد الحفظ ومعاه نسخة نصية من الخطة.
   *
   * الكارت نفسه مش بيتحفظ في تاريخ المحادثة (ده UI مؤقت)، فلو المستخدم
   * قفل الشات وفتحه تاني كان هيلاقي «تمام. هعملك خطة» من غير خطة —
   * وكأن المساعد وعد وما نفّذش. النص ده بيتحط كرسالة عادية عشان
   * المحادثة تفضل مفهومة لوحدها.
   */
  onSaved?: (summary: string) => void;
  /** المستخدم قال «مش دلوقتي» — الكارت يتشال. */
  onDismiss: () => void;
}

export function ExamPlanChatCard({
  intent,
  sourceText,
  themeStyles,
  fallbackSubject,
  onSaved,
  onDismiss,
}: ExamPlanChatCardProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [subject, setSubject] = useState(intent.subject ?? fallbackSubject ?? "");
  const [topics, setTopics] = useState("");
  const [days, setDays] = useState<DraftDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * ⚠️ قفل بـ ref مش state: الـ state مابتتحدّثش فوراً، فضغطتين سريعتين
   * على «اعملها» بيبعتوا طلبين للموديل وبيتحفظ خطتين متطابقتين.
   */
  const busyRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // «بعد ٣ أيام» = النهاردة + ٣ أيام مذاكرة = ٤ أيام بالنهاردة
  const totalDays = Math.max(1, Math.min(MAX_EXAM_DAYS, intent.daysUntil + 1));
  const startISO = todayISO();
  /**
   * ⚠️ تاريخ الامتحان محسوب من `totalDays` مش من `intent.daysUntil`.
   *
   * الاتنين بيتساوا في كل الحالات إلا واحدة: امتحان بعد ٣٠ يوم بالظبط.
   * ساعتها totalDays = ٣١ وبيتقصّ لـ ٣٠ (السقف)، فلو حسبنا التاريخ من
   * daysUntil كان الكارت يقول «الامتحان يوم ٣١» وآخر يوم في الخطة يوم
   * ٣٠ — يعني الكويز الشامل قبل الامتحان بيوم والمستخدم يفتكر إن فيه
   * يوم ضايع. الحساب من نفس الرقم اللي الخطة اتبنت بيه بيقفل الفرق.
   */
  const examISO = addDaysISO(startISO, totalDays - 1);

  async function handleGenerate() {
    const cleanSubject = subject.trim();
    if (!cleanSubject) {
      setError("اكتب اسم المادة الأول.");
      return;
    }
    if (busyRef.current) return;

    busyRef.current = true;
    setPhase("generating");
    setError(null);

    try {
      const res = await fetch("/api/exam-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: cleanSubject, topics: topics.trim(), daysCount: totalDays }),
      });

      const json = await res.json().catch(() => null);
      if (!aliveRef.current) return;

      if (!res.ok || !json?.success) {
        setError(json?.error || "مقدرتش أبني الخطة. حاول تاني.");
        setPhase("error");
        return;
      }

      const draft: DraftDay[] = json.data.days;

      // بنحفظ فوراً — مش بنسأل مرتين. الخطة اللي مش محفوظة بتضيع أول ما
      // المستخدم يقفل الشات، وده بالظبط اللي المفروض الميزة تمنعه.
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) {
        setError("لازم تسجّل دخول عشان الخطة تتحفظ.");
        setPhase("error");
        return;
      }

      const saved = await saveExamPlan(supabase, userId, {
        subject: cleanSubject,
        examDate: examISO,
        sourceText,
        days: draft,
        startDate: startISO,
      });

      if (!aliveRef.current) return;

      if (saved.error) {
        // الخطة اتولدت بس ما اتحفظتش. بنعرضها برضه — المستخدم يشوف
        // اللي هيعمله النهاردة على الأقل — وبنقوله إنها ماتحفظتش.
        setDays(draft);
        setError(
          saved.error.kind === "MISSING_TABLE"
            ? "الخطة جاهزة تحت، بس جدول الخطط لسه ما اتعملش في الداتابيز فمش هتتحفظ."
            : saved.error.message
        );
        setPhase("done");
        return;
      }

      const savedDays = saved.data.days.map((d) => ({
        dayNumber: d.dayNumber,
        kind: d.kind,
        title: d.title,
        description: d.description ?? "",
      }));
      setDays(savedDays);
      setPhase("done");
      onSaved?.(summarizePlan(cleanSubject, savedDays, startISO));
    } catch (err) {
      if (!aliveRef.current) return;
      console.error("exam plan chat card:", err);
      setError("النت وقع أو الخدمة مشغولة. حاول تاني.");
      setPhase("error");
    } finally {
      busyRef.current = false;
    }
  }

  /* ---- ١) التأكيد ---- */
  if (phase === "confirm" || phase === "error") {
    return (
      <div className="bg-paper border border-rule border-s-[3px] border-s-redpen rounded-[var(--r-sm)] p-4 space-y-3 max-w-[90%]">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">خطة امتحان</p>
          <p className="text-xs text-ink leading-relaxed">
            فهمت إن عندك امتحان{" "}
            <span className="font-bold">{relativeDayLabel(examISO, startISO)}</span> — يعني{" "}
            <span className="ltr-num font-bold">{toArabicNum(totalDays)}</span>{" "}
            {totalDays === 1 ? "يوم" : "أيام"} مذاكرة بالنهاردة.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="exam-subject" className="mono block">
            المادة
          </label>
          <input
            id="exam-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="مثال: الرياضيات ١"
            className="field w-full text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="exam-topics" className="mono block">
            الفصول أو المواضيع <span className="text-ink-soft">(اختياري)</span>
          </label>
          <textarea
            id="exam-topics"
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            rows={2}
            placeholder="الفصل ٣ و٤ و٥…"
            className="field w-full text-xs resize-none"
          />
          <p className="text-[11px] text-ink-soft leading-relaxed">
            لو كتبتها، الخطة هتوزّعها على الأيام بالاسم. لو سيبتها فاضية هتبقى عامة.
          </p>
        </div>

        {error && (
          <div className="notice notice-error" role="alert">
            <span aria-hidden>⚠️</span>
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={handleGenerate} className="btn btn-marker text-xs py-2">
            {phase === "error" ? "جرّب تاني" : "اعملي الخطة"}
          </button>
          <button onClick={onDismiss} className="btn btn-quiet text-xs py-2">
            مش دلوقتي
          </button>
        </div>
      </div>
    );
  }

  /* ---- ٢) التوليد ---- */
  if (phase === "generating") {
    return (
      <div
        className="bg-paper border border-rule border-s-[3px] border-s-redpen rounded-[var(--r-sm)] p-4 max-w-[90%]"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="eyebrow eyebrow-flush mb-2">بيقسّم المنهج</p>
        <div className="space-y-2">
          {Array.from({ length: Math.min(4, totalDays) }, (_, i) => (
            <div key={i} className="skel skel-line" style={{ width: `${90 - i * 15}%` }} />
          ))}
        </div>
        <p className="text-[11px] text-ink-soft leading-relaxed mt-3">
          بيوزّع {subject.trim()} على {toArabicNum(totalDays)} {totalDays === 1 ? "يوم" : "أيام"}…
        </p>
      </div>
    );
  }

  /* ---- ٣) الخطة ---- */
  return (
    <div className="bg-paper border border-rule border-s-[3px] border-s-redpen rounded-[var(--r-sm)] p-4 space-y-3 max-w-[90%]">
      <div>
        <p className="eyebrow eyebrow-flush mb-1.5">الخطة جاهزة</p>
        <p className="text-xs text-ink leading-relaxed">
          <span className="font-bold">{subject.trim()}</span> — موزّعة على{" "}
          <span className="ltr-num">{toArabicNum(days.length)}</span>{" "}
          {days.length === 1 ? "يوم" : "أيام"}.
        </p>
      </div>

      <ol className="space-y-2">
        {days.map((day) => {
          // ⚠️ التاريخ من dayNumber مش من ترتيب المصفوفة: الحفظ بيحسب
          // study_date = البداية + (dayNumber − ١)، فلو يوم اتأخّر في
          // الترتيب لأي سبب، اللافتة تفضل مربوطة بنفس اليوم اللي اتحفظ.
          const dateISO = addDaysISO(startISO, day.dayNumber - 1);
          const isToday = dateISO === startISO;
          return (
            <li
              key={day.dayNumber}
              className={`flex items-start gap-2.5 p-2.5 rounded-[var(--r-sm)] border ${
                isToday ? "border-ink bg-paper-3" : "bg-paper-2 border-rule"
              }`}
            >
              <span className="mono shrink-0 mt-0.5 w-14">{relativeDayLabel(dateISO, startISO)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-ink leading-relaxed">{day.title}</span>
                {day.kind !== "content" && (
                  <span className="mono mt-0.5 inline-block">{DAY_KIND_LABEL[day.kind]}</span>
                )}
                {day.description && (
                  <span className="block text-[11px] text-ink-soft leading-relaxed mt-0.5">
                    {day.description}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="notice notice-error" role="alert">
          <span aria-hidden>⚠️</span>
          <span className="leading-relaxed">{error}</span>
        </div>
      ) : (
        <div className={`${themeStyles.lightBg} border ${themeStyles.border} rounded-[var(--r-sm)] p-3`}>
          <p className="text-[11px] text-ink leading-relaxed">
            الخطة اتحفظت وهتلاقيها على الداشبورد. هفكّرك بمطلوب كل يوم.
          </p>
        </div>
      )}
    </div>
  );
}
