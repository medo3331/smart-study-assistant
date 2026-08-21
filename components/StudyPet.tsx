"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { DEFAULT_STAGES } from "@/lib/shop/catalog";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * StudyPet
 * كائن أليف بيعكس حماس/مجهود المستخدم في المذاكرة:
 * - بيكبر ويتطور مع الـ level
 * - بيفرح لو الـ streak عالي
 * - بيزعل/يشتاق لو فيه أيام مفيش فيها نشاط (daysSinceLastActivity)
 *
 * ⚠️ الرفيق المشتري من المتجر **جلد** فوق الكمبوننت ده مش نظام تاني:
 * `stages` بتيجي من العنصر الملبوس في خانة `companion`، والافتراضي
 * (`DEFAULT_STAGES`) هو نفس إيموجي النسخة القديمة بالحرف. يعني اللي
 * معندهوش رفيق مشتري بيشوف نفس اللي كان بيشوفه بالظبط.
 *
 * ⚠️ الحركة كلها بتتقفل مع `prefers-reduced-motion` — الرفيق بيهتز
 * وبيتنفّس، ودي بالظبط الحركة اللي بتوجع اللي عندهم حساسية للحركة.
 */

type ThemeColor = "amber" | "emerald" | "purple" | "cyan";

// لون قلم الثيم — الشريط والنص بس. الكارت نفسه ورق زي باقي الكروت
// (`sheet-card`)، عشان يقعد جنب `AchievementsStrip` من غير ما يبان غريب.
const THEME_BAR: Record<ThemeColor, string> = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
};

const THEME_TEXT: Record<ThemeColor, string> = {
  amber: "text-amber-400",
  emerald: "text-emerald-400",
  purple: "text-purple-400",
  cyan: "text-cyan-400",
};

interface StudyPetProps {
  level: number;
  xp: number;
  /**
   * التقدّم جوّه المستوى الحالي **بالنسبة المئوية** (٠–١٠٠).
   *
   * ⚠️ مش نقط الـ XP الخام. الاسم القديم كان `xpInCurrentLevel` وده بالظبط
   * اسم متغيّر في الداشبورد قيمته خام (٠–٢٠٠)، فتمريره كان بيدّي شريط
   * مليان على نص مستوى.
   */
  levelProgressPct: number;
  streak: number;
  daysSinceLastActivity?: number | null;
  theme?: ThemeColor;
  /**
   * مراحل الرفيق الملبوس الأربع بترتيب `getPetStage`.
   * مش مبعوتة = الرفيق الأصلي، فالنسخة القديمة بتفضل زي ما هي.
   */
  stages?: readonly string[];
  /** اسم الرفيق الملبوس — بيبان تحت المرحلة */
  companionName?: string;
  /** بيوري زرار «خبّيه». مش مبعوت = مفيش زرار */
  onDismiss?: () => void;
}

function getPetMood(streak: number, daysSinceLastActivity?: number | null) {
  if (daysSinceLastActivity && daysSinceLastActivity >= 3) {
    return { emoji: "😢", label: "مشتاقلك... يلا رجعلي", active: false };
  }
  if (daysSinceLastActivity && daysSinceLastActivity >= 1) {
    return { emoji: "😐", label: "مستنيك النهارده", active: false };
  }
  if (streak >= 14) {
    return { emoji: "🤩", label: "في قمة نشاطه بسببك!", active: true };
  }
  if (streak >= 5) {
    return { emoji: "😄", label: "مبسوط جدًا منك", active: true };
  }
  return { emoji: "🙂", label: "مبدئي وسعيد بالبداية", active: true };
}

/**
 * المرحلة من المستوى. بترجّع **الفهرس** مش الإيموجي — الإيموجي بتيجي من
 * `stages` عشان الرفيق المشتري يستخدم نفس السلّم ده بالظبط.
 */
function getPetStage(level: number): { index: 0 | 1 | 2 | 3; label: string } {
  if (level >= 15) return { index: 3, label: "الشكل النهائي" };
  if (level >= 10) return { index: 2, label: "شبه مكتمل" };
  if (level >= 5) return { index: 1, label: "بيكبر" };
  return { index: 0, label: "لسه في البداية" };
}

/** المستوى اللي المرحلة الجاية بتفتح عنده — `null` لو خلص التطوّر */
function nextStageLevel(level: number): number | null {
  if (level < 5) return 5;
  if (level < 10) return 10;
  if (level < 15) return 15;
  return null;
}

export function StudyPet({
  level,
  xp,
  levelProgressPct,
  streak,
  daysSinceLastActivity,
  theme = "amber",
  stages,
  companionName,
  onDismiss,
}: StudyPetProps) {
  const reduced = useReducedMotion();
  const mood = useMemo(
    () => getPetMood(streak, daysSinceLastActivity),
    [streak, daysSinceLastActivity],
  );
  const stage = useMemo(() => getPetStage(level), [level]);
  const progress = Math.min(Math.max(levelProgressPct, 0), 100);

  // الطول مضمون من `companionStages`، بس الافتراضي هنا كمان عشان
  // الكمبوننت يفضل يشتغل لو حد ناداه من غير المتجر خالص.
  const art = stages && stages.length >= 4 ? stages : DEFAULT_STAGES;
  const emoji = art[stage.index] ?? DEFAULT_STAGES[stage.index];
  const nextAt = nextStageLevel(level);

  return (
    <div className="sheet-card p-5" dir="rtl">
      <div className="flex items-center gap-4">
        {/* الإيموجي نفسه هو صورة الكائن، فسايبينه — مش زينة.
            بيتنفّس لما يكون نشيط، وساكت لما يكون زعلان: الحركة نفسها
            معلومة مش تزويق. */}
        <motion.div
          role="img"
          aria-label={`${companionName ?? "الرفيق"} — ${stage.label}`}
          className="w-16 h-16 shrink-0 rounded-[var(--r-md)] bg-paper-2 border border-rule flex items-center justify-center text-3xl"
          animate={
            reduced || !mood.active
              ? { scale: 1, rotate: 0 }
              : { scale: [1, 1.06, 1], rotate: [0, -3, 3, 0] }
          }
          transition={
            reduced || !mood.active
              ? { duration: 0 }
              : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
          }
        >
          {emoji}
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className={`tag ${THEME_TEXT[theme]}`}>
            <span>{companionName ?? "رفيقك"}</span>
            <span className="ltr-num tnum">Level {level}</span>
          </p>
          <p className="text-sm font-bold text-ink mt-1">
            <span aria-hidden="true">{mood.emoji}</span> {mood.label}
          </p>
        </div>

        {/* الإخفاء اختياري: الرفيق حاجة شخصية، واللي مش عايزه مايتفرضش
            عليه. الزرار في الركن ومش فوق أي حاجة تانية بتتضغط. */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="خبّي الرفيق"
            className="shrink-0 self-start text-ink-soft hover:text-ink p-1 rounded-[6px] hover:bg-paper-3 transition"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* شريط المراحل الأربع — اللي وصلها واضح واللي جاي باهت. من غيره
          «المرحلة الجاية» تبقى كلام، ودي أكتر حاجة بتخلّي حد يكمّل. */}
      <div className="flex items-center gap-1.5 mt-4" aria-hidden>
        {art.slice(0, 4).map((s, i) => (
          <span
            key={i}
            className={`w-7 h-7 rounded-[6px] border flex items-center justify-center text-sm transition ${
              i <= stage.index
                ? "border-rule-strong bg-paper-2"
                : "border-rule bg-paper opacity-40 grayscale"
            }`}
          >
            {s}
          </span>
        ))}
        {nextAt !== null && (
          <span className="mono text-[0.62rem] text-ink-soft ms-1">
            الجاي في <span className="ltr-num tnum">Level {nextAt}</span>
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="tag">تقدم المستوى</span>
          <span className="mono tnum ltr-num font-bold text-ink">{progress}%</span>
        </div>
        <div className="meter meter-sm">
          <div
            className={`meter-fill ${THEME_BAR[theme]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 mt-4">
        <div>
          <p className="tag mb-0.5">إجمالي النقط</p>
          <p className="mono tnum ltr-num font-bold text-ink">{xp} XP</p>
        </div>
        <div className="text-left">
          <p className="tag justify-end mb-0.5">السلسلة</p>
          <p className="mono tnum font-bold text-ink">{streak} يوم</p>
        </div>
      </div>
    </div>
  );
}
