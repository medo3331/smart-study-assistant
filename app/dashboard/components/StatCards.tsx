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
  const toneBg =
    stat.tone === "amber"
      ? "bg-[#FB923C]/15 text-[#FB923C]"
      : stat.tone === "teal"
        ? "bg-[#2DD4BF]/15 text-[#2DD4BF]"
        : "bg-[#DC4C4C]/15 text-[#F5A25C]";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.8, 0.36, 1], delay: 0.05 }}
      className="rounded-[24px] border border-white/[0.06] bg-[#0D0906]/70 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(220,76,76,0.12)]"
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneBg}`}
          aria-hidden
        >
          {stat.icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-[#9AA0C0]">{stat.label}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <AnimatedNumber
              value={stat.value}
              className="font-mono text-2xl font-bold text-white"
            />
            <span className="text-xs text-[#9AA0C0]">{stat.unit}</span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
