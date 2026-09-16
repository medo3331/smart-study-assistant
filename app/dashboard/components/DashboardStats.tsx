"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Flame, TrendingUp, Bell, BookOpen } from "lucide-react";

interface DashboardStatsProps {
  streak: number | null;
  progressPct: number | null; // 0-100 or null if no plan
  notificationsCount: number | null; // null → honest —
  coursesCount: number | null;
}

/**
 * DashboardStats — 4 small equal cards per spec §5.
 *   Streak · Progress · Notifications · Courses
 * Real data only: null renders "—" with aria-label, never fake 0/7/64.
 * Design: rounded-2xl, subtle border, card-primary bg, 40-48px icon container, mono numbers.
 * Responsive: 2×2 on mobile, 4 cols on desktop.
 * Animation: subtle fade+translateY staggered 50ms, respects reduced-motion.
 */
export function DashboardStats({ streak, progressPct, notificationsCount, coursesCount }: DashboardStatsProps) {
  const reduce = useReducedMotion();

  const items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    value: number | null;
    unit?: string;
    sublabel?: string;
  }> = [
    {
      key: "streak",
      label: "Streak",
      icon: <Flame size={18} strokeWidth={2} aria-hidden />,
      value: streak,
      unit: streak !== null ? "يوم" : undefined,
      sublabel: "السلسلة",
    },
    {
      key: "progress",
      label: "التقدم",
      icon: <TrendingUp size={18} strokeWidth={2} aria-hidden />,
      value: progressPct,
      unit: progressPct !== null ? "%" : undefined,
      sublabel: "التقدم",
    },
    {
      key: "notifications",
      label: "الإشعارات",
      icon: <Bell size={18} strokeWidth={2} aria-hidden />,
      value: notificationsCount,
      sublabel: "الإشعارات",
    },
    {
      key: "courses",
      label: "الكورسات",
      icon: <BookOpen size={18} strokeWidth={2} aria-hidden />,
      value: coursesCount,
      sublabel: "الكورسات",
    },
  ];

  return (
    <section aria-label="إحصائيات سريعة" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {items.map((it, idx) => (
        <motion.div
          key={it.key}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: reduce ? 0 : idx * 0.05, ease: [0.22, 0.8, 0.36, 1] }}
          className="group relative flex items-center gap-3 rounded-2xl border p-4 backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5"
          style={{
            backgroundColor: "var(--card-primary)",
            borderColor: "var(--rule)",
            boxShadow: "0 6px 20px var(--shade)",
          }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:h-11 md:w-11"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
              color: "var(--accent)",
            }}
            aria-hidden
          >
            {it.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-wide" style={{ color: "var(--muted)" }}>
              {it.sublabel}
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              {it.value !== null && it.value !== undefined ? (
                <>
                  <span
                    className="font-mono text-xl font-bold leading-none tabular-nums md:text-2xl"
                    style={{ color: "var(--text)" }}
                    dir="ltr"
                    aria-label={`${it.label} ${it.value}${it.unit ?? ""}`}
                  >
                    {it.value}
                  </span>
                  {it.unit && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {it.unit}
                    </span>
                  )}
                </>
              ) : (
                <span
                  className="font-mono text-xl font-bold leading-none md:text-2xl"
                  style={{ color: "var(--muted)" }}
                  aria-label={`${it.label} لا توجد بيانات`}
                >
                  —
                </span>
              )}
            </p>
          </div>
        </motion.div>
      ))}
    </section>
  );
}
