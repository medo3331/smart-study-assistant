"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Flame, GraduationCap, Sparkles, Timer } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";

interface StatCardsProps {
  xp: number;
  streak: number;
  completedSteps: number;
  weeklyFocusMinutes: number;
}

interface Stat {
  key: string;
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  tone: "amber" | "violet" | "teal";
}

/**
 * كروت الإحصائيات الأربعة بنظام الألوان الجديد:
 *   XP → عنبري · السلسلة → عنبري · الخطوات المكتملة → تيل · تركيز الأسبوع → بنفسجي
 *
 * كل قيمة حقيقية من حالة الصفحة (profiles.xp / profiles.streak /
 * study_days / activity_log) — مفيش أصفار مزيفة لملء التصميم.
 * العد من ٠ بيحصل مرة واحدة بخط المونو (طابع HUD).
 */
export function StatCards({ xp, streak, completedSteps, weeklyFocusMinutes }: StatCardsProps) {
  const stats: Stat[] = [
    {
      key: "xp",
      label: "نقاط الخبرة",
      value: xp,
      unit: "XP",
      icon: <Sparkles size={18} aria-hidden />,
      tone: "amber",
    },
    {
      key: "streak",
      label: "سلسلة التعلّم",
      value: streak,
      unit: "يوم",
      icon: <Flame size={18} aria-hidden />,
      tone: "amber",
    },
    {
      key: "completed",
      label: "خطوات مكتملة",
      value: completedSteps,
      unit: "خطوة",
      icon: <GraduationCap size={18} aria-hidden />,
      tone: "teal",
    },
    {
      key: "weekly",
      label: "تركيز هذا الأسبوع",
      value: weeklyFocusMinutes,
      unit: "دقيقة",
      icon: <Timer size={18} aria-hidden />,
      tone: "violet",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {stats.map((s) => (
        <StatCard key={s.key} stat={s} />
      ))}
    </div>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  const reduceMotion = useReducedMotion();
  const isAccentTone = stat.tone !== "teal";
  const iconStyle: React.CSSProperties = isAccentTone
    ? { backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }
    : { backgroundColor: "color-mix(in srgb, var(--accent-highlight) 15%, transparent)", color: "var(--accent-highlight)" };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.8, 0.36, 1], delay: 0.05 }}
      className="rounded-[24px] border backdrop-blur-xl p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: "var(--card-primary)",
        borderColor: "var(--rule)",
        boxShadow: "0 8px 30px var(--shade)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={iconStyle}
          aria-hidden
        >
          {stat.icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm" style={{ color: "var(--muted)" }}>{stat.label}</p>
          <p className="mt-1 flex items-baseline gap-1" style={{ color: "var(--text)" }}>
            <AnimatedNumber
              value={stat.value}
              className="font-mono text-2xl font-bold"
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>{stat.unit}</span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
