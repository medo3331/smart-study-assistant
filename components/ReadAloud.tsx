"use client";

import React, { useEffect } from "react";
import { useSpeak } from "@/lib/speech";

/* ==========================================================================
   زرار «اسمع الشرح»

   ثلاث حالات: ساكت (اسمع) → بيقرا (وقفة / إيقاف) → موقوف مؤقتاً (كمّل).
   السرعة بتتغيّر من نفس المكان لأن سرعة القراءة الافتراضية بطيئة على
   اللي بيذاكر، والعكس صحيح لو الموضوع صعب.

   ⚠️ اللون: الزرار **مش أصفر**. الأصفر في التصميم معناه «إنت هنا / ده
   اللي بعده»، وده زرار أداة جانبية. بياخد `btn-quiet`، ولما يبقى شغال
   بيتعلّم بالحبر زي باقي الحالات المفعّلة في المشروع.
   ========================================================================== */

const RATES = [
  { value: 0.75, label: "بطيء" },
  { value: 1, label: "عادي" },
  { value: 1.5, label: "سريع" },
];

interface ReadAloudProps {
  /** النص الخام (ماركداون مقبول — بيتنضّف جوه الهوك). */
  text: string;
  /** لو اتغيّر، القراءة بتقف. استخدمه للتبويب أو الدرس الحالي. */
  resetKey?: string | number;
  className?: string;
}

export function ReadAloud({ text, resetKey, className = "" }: ReadAloudProps) {
  const { supported, speaking, paused, speak, stop, toggle } = useSpeak();
  const [rate, setRate] = React.useState(1);

  // لو المحتوى نفسه اتغيّر (المستخدم بدّل النمط أو الدرس)، القراءة
  // القديمة بقت بتقرا حاجة مش على الشاشة — لازم تقف.
  useEffect(() => {
    stop();
  }, [resetKey, stop]);

  if (!supported || !text.trim()) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {!speaking ? (
        <button
          onClick={() => speak(text, rate)}
          className="btn btn-quiet text-xs px-3.5 py-2"
        >
          <span aria-hidden>🔊</span>
          اسمع الشرح
        </button>
      ) : (
        <>
          <button
            onClick={toggle}
            className="btn bg-ink text-paper-2 border-ink hover:opacity-90 text-xs px-3.5 py-2"
          >
            <span aria-hidden>{paused ? "▶" : "⏸"}</span>
            {paused ? "كمّل" : "وقفة"}
          </button>
          <button onClick={stop} className="btn btn-quiet text-xs px-3.5 py-2">
            إيقاف
          </button>
        </>
      )}

      {/* السرعة: نفس نمط محدد نمط الشرح في صفحة الدرس */}
      <div
        className="flex items-center bg-paper-2 border border-rule p-1 rounded-[var(--r-sm)] gap-1"
        role="group"
        aria-label="سرعة القراءة"
      >
        {RATES.map((r) => (
          <button
            key={r.value}
            onClick={() => {
              setRate(r.value);
              // لو بيقرا دلوقتي، السرعة الجديدة لازم تسمع فوراً —
              // الـ API مش بيسمح بتغيير سرعة utterance شغالة.
              if (speaking) speak(text, r.value);
            }}
            aria-pressed={rate === r.value}
            className={`mono px-2.5 py-1 rounded-[6px] transition ${
              rate === r.value ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* قارئات الشاشة تعرف إن فيه قراءة شغالة من غير ما تقاطع النص */}
      <span className="sr-only" aria-live="polite">
        {speaking ? (paused ? "القراءة موقوفة مؤقتاً" : "بيقرا الشرح") : ""}
      </span>
    </div>
  );
}
