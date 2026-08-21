"use client";

import React from "react";
import { motion } from "framer-motion";
import type { ThemeStyles } from "./types";

/* ==========================================================================
   كروت الأرقام الأربعة
   أربع أرقام بس، وكل رقم معاه سطر واحد بيقول يعني إيه. القاعدة اللي
   ماشيين عليها هنا: مافيش رقم متكتب من غير مصدر حقيقي. لو الفرق مش
   محسوب من سجل النشاط، بنكتب سياق (فاضل كام للمستوى) مش سهم مزوّق.

   الشكل من .kpi-card / .kpi-icon / .kpi-delta في globals.css،
   والألوان من Tailwind عشان تمشي مع قلم الثيم لوحدها.
   ========================================================================== */

export interface KpiSectionProps {
  completedCount: number;
  totalDays: number;
  /** مهام اتخلّصت في آخر ٧ أيام — من activity_log */
  weeklyTasks: number;
  xp: number;
  level: number;
  xpRemaining: number;
  weeklyFocusMinutes: number;
  /** الأسبوع اللي قبله، عشان الفرق يبقى فرق حقيقي */
  prevWeekFocusMinutes: number;
  streak: number;
  daysSinceLastActivity: number | null;
  themeStyles: ThemeStyles;
}

interface Kpi {
  id: string;
  icon: string;
  label: string;
  value: string;
  /** سطر تحت الرقم: سياق مكتوب، مش سهم */
  hint: string;
  /** كبسولة الفرق — بتظهر بس لما يبقى فيه فرق محسوب */
  delta?: { text: string; up: boolean };
  live?: boolean;
}

const fmtHours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}د`;
  return `${h}س ${m}د`;
};

export function KpiSection({
  completedCount,
  totalDays,
  weeklyTasks,
  xp,
  level,
  xpRemaining,
  weeklyFocusMinutes,
  prevWeekFocusMinutes,
  streak,
  daysSinceLastActivity,
  themeStyles,
}: KpiSectionProps) {
  const focusDiff = weeklyFocusMinutes - prevWeekFocusMinutes;

  const cards: Kpi[] = [
    {
      id: "lessons",
      icon: "📗",
      label: "دروس مخلّصة",
      value: `${completedCount}`,
      hint: totalDays > 0 ? `من ${totalDays} في الخطة` : "لسه مافيش خطة",
      delta: weeklyTasks > 0 ? { text: `+${weeklyTasks} الأسبوع ده`, up: true } : undefined,
    },
    {
      id: "xp",
      icon: "⭐",
      label: "نقاط الخبرة",
      value: `${xp}`,
      hint: `المستوى ${level} · فاضل ${xpRemaining}`,
    },
    {
      id: "focus",
      icon: "⏱️",
      label: "تركيز ٧ أيام",
      value: fmtHours(weeklyFocusMinutes),
      hint: prevWeekFocusMinutes > 0 ? `الأسبوع اللي فات ${fmtHours(prevWeekFocusMinutes)}` : "أول أسبوع بيتسجّل",
      delta:
        prevWeekFocusMinutes > 0 && focusDiff !== 0
          ? { text: `${focusDiff > 0 ? "+" : "−"}${fmtHours(Math.abs(focusDiff))}`, up: focusDiff > 0 }
          : undefined,
    },
    {
      id: "streak",
      icon: "📌",
      label: "السلسلة",
      value: `${streak}`,
      hint:
        daysSinceLastActivity === null
          ? "ابدأ النهارده"
          : daysSinceLastActivity === 0
          ? "ذاكرت النهارده"
          : `آخر نشاط من ${daysSinceLastActivity} يوم`,
      live: daysSinceLastActivity === 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, idx) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: idx * 0.06, ease: "easeOut" }}
          className={`kpi-card p-4 sm:p-5 ${card.live ? "kpi-card-live" : ""}`}
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <span
              aria-hidden
              className={`kpi-icon text-base ${card.live ? `${themeStyles.accentBg} text-onmarker` : "bg-paper-3"}`}
            >
              {card.icon}
            </span>
            {card.delta && (
              <span
                className={`kpi-delta ${
                  card.delta.up ? "bg-emerald-500/15 text-emerald-400" : "bg-paper-3 text-ink-soft"
                }`}
              >
                <span aria-hidden>{card.delta.up ? "↑" : "↓"}</span>
                <span className="ltr-num">{card.delta.text}</span>
              </span>
            )}
          </div>

          <p className="font-display font-extrabold text-2xl sm:text-3xl text-ink leading-none m-0 tnum ltr-num">
            {card.value}
          </p>
          <p className="text-xs font-semibold text-ink mt-2 m-0">{card.label}</p>
          <p className="mono text-[0.66rem] text-ink-soft mt-1 m-0">{card.hint}</p>
        </motion.div>
      ))}
    </div>
  );
}
