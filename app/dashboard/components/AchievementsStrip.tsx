"use client";

import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { ThemeStyles } from "./types";

/* ==========================================================================
   شريط الإنجازات
   تلات شارات سداسية: المفتوح الأحدث الأول، وبعده أقرب حاجة لسه ما اتفتحتش.
   الهدف إن المستخدم يشوف الخطوة الجاية على بعد شارة واحدة، مش قايمة
   طويلة — القايمة الكاملة في /dashboard/achievements.

   ملحوظة على الأرقام: المرجع اللي شغالين عليه بيكتب "+100 XP" على كل
   شارة. مش بنعمل كده هنا لأن المشروع مابيديش XP على الإنجازات، فالرقم
   كان هيبقى مكتوب على الفاضي. بنكتب بدالها التقدّم الحقيقي (٣ / ٧).

   نفس معادلة المستوى بتاعة الداشبورد وصفحة الإنجازات — لو اتغيرت
   لازم تتغير في التلاتة.
   ========================================================================== */

interface AchievementsStripProps {
  streak: number;
  completedCount: number;
  level: number;
  /** عدد أوسمة تحدي نهاية الفصل */
  badgeCount: number;
  themeStyles: ThemeStyles;
}

interface Milestone {
  id: string;
  icon: string;
  title: string;
  /** المطلوب للفتح */
  target: number;
  /** الواقع الحالي */
  current: number;
  unit: string;
}

export function AchievementsStrip({
  streak,
  completedCount,
  level,
  badgeCount,
  themeStyles,
}: AchievementsStripProps) {
  const router = useRouter();

  const all: Milestone[] = [
    { id: "first-step", icon: "🌱", title: "أول خطوة", target: 1, current: completedCount, unit: "درس" },
    { id: "ten-steps", icon: "📗", title: "عشرة دروس", target: 10, current: completedCount, unit: "درس" },
    { id: "week-streak", icon: "📌", title: "أسبوع كامل", target: 7, current: streak, unit: "يوم" },
    { id: "month-streak", icon: "⚡", title: "شهر كامل", target: 30, current: streak, unit: "يوم" },
    { id: "level-five", icon: "⭐", title: "المستوى الخامس", target: 5, current: level, unit: "مستوى" },
    { id: "first-boss", icon: "🐉", title: "أول تحدي فصل", target: 1, current: badgeCount, unit: "وسام" },
  ];

  const unlocked = all.filter((m) => m.current >= m.target);
  const locked = all.filter((m) => m.current < m.target);

  // آخر اتنين مفتوحين + أقرب واحد جاي. لو لسه مافيش حاجة مفتوحة،
  // بنعرض أقرب تلاتة — الشريط ما يفضلش فاضي في أول يوم.
  const shown = [...unlocked.slice(-2), ...locked.slice(0, 3)].slice(0, 3);

  return (
    <div className="sheet-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="eyebrow eyebrow-flush">الإنجازات</p>
          <p className="mono text-ink-soft mt-1 m-0">
            <span className="ltr-num tnum">{unlocked.length}</span> من{" "}
            <span className="ltr-num tnum">{all.length}</span> مفتوح
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/achievements")}
          className="mono px-3 py-2 rounded-[var(--r-sm)] border border-rule bg-paper text-ink-soft hover:text-ink hover:bg-paper-3 transition"
        >
          شوف الكل
        </button>
      </div>

      <ul className="grid grid-cols-3 gap-3 list-none m-0 p-0">
        {shown.map((m, idx) => {
          const isUnlocked = m.current >= m.target;
          const pct = Math.min(Math.round((m.current / m.target) * 100), 100);

          return (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.07, ease: "easeOut" }}
              className="flex flex-col items-center text-center gap-2"
            >
              {/* السداسية: مفتوحة = لون القلم، مقفولة = ورق وحبر باهت */}
              <div
                className={`badge-hex w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl ${
                  isUnlocked ? `${themeStyles.accentBg} text-onmarker` : "bg-paper-3 text-ink-soft grayscale"
                }`}
                aria-hidden
              >
                {m.icon}
              </div>

              <p className="text-[11px] font-semibold text-ink leading-snug m-0">{m.title}</p>

              {isUnlocked ? (
                <span className="tag tag-box bg-emerald-950 text-emerald-400">مفتوح</span>
              ) : (
                <>
                  <span className="mono text-[0.62rem] text-ink-soft">
                    <span className="ltr-num tnum">
                      {m.current} / {m.target}
                    </span>{" "}
                    {m.unit}
                  </span>
                  <div className="meter meter-sm w-full">
                    <div className={`meter-fill ${themeStyles.accentBg}`} style={{ width: `${pct}%` }} />
                  </div>
                </>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
