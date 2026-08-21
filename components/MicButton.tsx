"use client";

import React, { useCallback } from "react";
import { useMic } from "@/lib/speech";

/* ==========================================================================
   زرار المايك — إدخال السؤال بالصوت

   بيتحط جنب أي حقل نص. النص بيتحدّث لحظياً وهو بيتكلم، فالمستخدم يشوف
   إن التعرّف ماشي صح قبل ما يخلص.

   ⚠️ في فايرفوكس الـ API مش موجود خالص، والكمبوننت بيرجّع null —
   يعني الحقل بيفضل شغال عادي بالكتابة من غير أي زرار مكسور.

   ⚠️ الصوت مش بيتبعت لأي سيرفر: كروم بيحلّله عن طريق خدمة جوجل
   والنص الراجع هو اللي بنشوفه. مفيش تسجيل بيتخزن عندنا.
   ========================================================================== */

interface MicButtonProps {
  /** بيتنده بالنص المتعرَّف عليه — النص الكامل، مش المضاف بس. */
  onText: (text: string) => void;
  /** بيتنده لما الجملة تخلص، لو عايز تبعت على طول. */
  onFinal?: (text: string) => void;
  disabled?: boolean;
  /**
   * شكل الزرار. `sheet` = نمط `.btn` بتاع الصفحات (صفحة الدرس).
   * `square` = مربّع ١٠×١٠ بيطابق زراير مودال المحادثة في الداشبورد.
   */
  variant?: "sheet" | "square";
  className?: string;
}

/** الأشكال متعرّفة هنا مرة واحدة عشان الحالتين (ساكت/بيسمع) يفضلوا متطابقين. */
const SHAPES = {
  sheet: {
    base: "btn text-sm px-3.5 py-2.5",
    idle: "btn-quiet",
    active: "bg-redpen text-ondanger border-redpen hover:opacity-90",
  },
  square: {
    base: "mono w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center border transition",
    idle: "bg-paper-2 hover:bg-paper-3 border-rule text-ink-soft hover:text-ink",
    active: "bg-redpen text-ondanger border-redpen hover:opacity-90",
  },
} as const;

export function MicButton({
  onText,
  onFinal,
  disabled,
  variant = "sheet",
  className = "",
}: MicButtonProps) {
  const handleTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      onText(text);
      if (isFinal && text) onFinal?.(text);
    },
    [onText, onFinal]
  );

  const { supported, listening, error, start, stop } = useMic({
    onTranscript: handleTranscript,
  });

  if (!supported) return null;

  const shape = SHAPES[variant];

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-label={listening ? "إيقاف التسجيل" : "اسأل بالصوت"}
        aria-pressed={listening}
        title={listening ? "بسمعك… دوس تاني للإيقاف" : "اسأل بالصوت"}
        className={`${shape.base} disabled:opacity-40 disabled:cursor-not-allowed ${
          listening ? shape.active : shape.idle
        }`}
      >
        <span aria-hidden>{listening ? "◼" : "🎙"}</span>
      </button>

      {/* نبضة حمرا وهو بيسمع. `motion-safe` عشان اللي طالب تقليل الحركة. */}
      {listening && (
        <span
          aria-hidden
          className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-redpen motion-safe:animate-pulse"
        />
      )}

      <span className="sr-only" aria-live="polite">
        {listening ? "بسمعك، اتكلم دلوقتي" : ""}
        {error ?? ""}
      </span>

      {/* الخطأ لازم يبان بصرياً كمان — أغلبه بيبقى صلاحية مايك مرفوضة
          والمستخدم مش هيعرف ليه الزرار مش بيعمل حاجة. */}
      {error && (
        <p className="absolute top-full mt-1.5 end-0 w-52 text-[10.5px] leading-relaxed text-redpen bg-paper-2 border border-rule rounded-[var(--r-sm)] p-2 z-10">
          {error}
        </p>
      )}
    </div>
  );
}
