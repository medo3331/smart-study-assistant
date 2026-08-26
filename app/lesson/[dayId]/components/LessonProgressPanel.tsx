"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, CircleDot } from "lucide-react";
import { GlassCard, Reveal } from "./LessonChrome";

/* ==========================================================================
   لوحة تقدّم الدرس: النسبة الحقيقية (0 → القيمة مرة واحدة) + أقسام الدرس
   + مكافأة XP من xp_reward فقط. مفيش أرقام ثابتة ولا عملات هنا.
   ========================================================================== */

interface LessonProgressPanelProps {
  /** نسبة التقدّم الفعلية في الخطة ٠–١٠٠. */
  percent: number;
  /** أقسام الدرس المشتقة من الحالة الحقيقية. */
  sections: { label: string; state: "done" | "current" | "todo" }[];
  xpReward?: number | null;
}

export function LessonProgressPanel({ percent, sections, xpReward }: LessonProgressPanelProps) {
  const reduceMotion = useReducedMotion();
  const shown = Math.max(0, Math.min(100, percent));

  return (
    <GlassCard className="p-5">
      <h3 className="text-[14px] font-bold text-white">تقدّمك في الخطة</h3>

      <div className="mt-2 flex items-baseline gap-1.5">
        <AnimatedPercent value={shown} />
        <span className="text-xs text-[#9AA0C0]">من الخطة</span>
      </div>

      {/* الشريط يمتلئ مرة واحدة للقيمة الحقيقية */}
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-l from-[#B69CFF] to-[#7C5CFF] shadow-[0_0_10px_rgba(124,92,255,0.5)]"
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${Math.max(shown, 1)}%` }}
          transition={{ duration: 1, ease: [0.22, 0.8, 0.36, 1], delay: 0.25 }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {sections.map((s) => (
          <SectionRow key={s.label} label={s.label} state={s.state} />
        ))}
      </div>

      {xpReward != null && (
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="text-xs text-[#9AA0C0]">مكافأة إكمال الدرس</span>
          <b className="font-mono tnum text-base font-bold text-[#FB923C]" dir="ltr">
            +{xpReward} XP
          </b>
        </div>
      )}
    </GlassCard>
  );
}

function SectionRow({ label, state }: { label: string; state: "done" | "current" | "todo" }) {
  if (state === "done") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-[#D9FDF6]">
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[rgba(45,212,191,0.15)]">
          <Check size={13} strokeWidth={2.6} className="stroke-[#2DD4BF]" />
        </span>
        <span>{label}</span>
      </div>
    );
  }
  if (state === "current") {
    return (
      <Reveal index={0}>
        <div className="flex items-center gap-2.5 rounded-xl border border-[rgba(124,92,255,0.28)] bg-[rgba(124,92,255,0.10)] px-2.5 py-2 text-[13px] font-bold text-white">
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[rgba(124,92,255,0.2)]">
            <CircleDot size={13} strokeWidth={2.4} className="stroke-[#B69CFF]" />
          </span>
          {label}
        </div>
      </Reveal>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-[#9AA0C0]">
      <span className="h-[26px] w-[26px] flex-none rounded-full border-[1.4px] border-dashed border-white/[0.18]" />
      {label}
    </div>
  );
}

/** عدّاد النسبة: من صفر إلى القيمة مرة واحدة بخط المونو. */
function AnimatedPercent({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduceMotion]);

  return (
    <b className="font-mono tnum text-[33px] font-bold leading-none text-white" dir="ltr">
      {display}%
    </b>
  );
}
