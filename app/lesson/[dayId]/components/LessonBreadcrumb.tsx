"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Home, Check } from "lucide-react";
import { GlassCard } from "./LessonChrome";

/* ==========================================================================
   فاتحة صفحة الدرس: مسار التنقل + تقدّم الوحدة المجزّأ.
   كل الأرقام من الخطة الحقيقية — مفيش أي رقم ثابت، والنبضة مرة واحدة فقط.
   ========================================================================== */

interface LessonBreadcrumbProps {
  subject?: string;
  /** عنوان الدرس الحقيقي — الجزء المضيء في آخر المسار. */
  title: string;
}

/** الرئيسية / لوحة التحكم / {المادة} / {عنوان الدرس} */
export function LessonBreadcrumb({ subject, title }: LessonBreadcrumbProps) {
  return (
    <nav
      aria-label="مسار التنقل"
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-[#9AA0C0]"
    >
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 transition-colors hover:text-[#B69CFF]"
      >
        <Home size={13} aria-hidden />
        الرئيسية
      </Link>
      <Sep />
      <Link href="/dashboard" className="transition-colors hover:text-[#B69CFF]">
        لوحة التحكم
      </Link>
      {subject && (
        <>
          <Sep />
          <span>{subject}</span>
        </>
      )}
      <Sep />
      <span className="font-semibold text-[#E7E9F5]" aria-current="page">
        {title}
      </span>
    </nav>
  );
}

function Sep() {
  return (
    <span aria-hidden className="opacity-45">
      /
    </span>
  );
}

/* ------------------------------------------------------------------ */

interface UnitDay {
  day_number: number;
  is_completed: boolean;
}

interface LessonUnitProgressProps {
  /** أيام نفس الخطة مرتّبة بـ day_number (من الاستعلام الموجود أصلًا). */
  days: UnitDay[];
  currentDayNumber: number;
}

/**
 * شريط الوحدة المجزّأ:
 *   مكتمل → نقطة تيل بعلامة ✓ · الحالي → نقطة بنفسجية متوهجة · القادم → حلقة باهتة.
 * النبضة على النقطة الحالية تحدث مرة واحدة عند الظهور (احترام reduced-motion).
 */
export function LessonUnitProgress({ days, currentDayNumber }: LessonUnitProgressProps) {
  const reduceMotion = useReducedMotion();
  const completed = days.filter((d) => d.is_completed).length;
  const total = days.length;

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-[#9AA0C0]">تقدّمك في الخطة</span>
        <span className="text-[13px] text-[#9AA0C0]">
          <b className="font-mono tnum text-[15px] font-bold text-white" dir="ltr">
            {completed}
          </b>{" "}
          /{" "}
          <b className="font-mono tnum text-[15px] font-bold text-white" dir="ltr">
            {total}
          </b>{" "}
          دروس مكتملة
        </span>
      </div>

      <div
        className="flex items-center"
        role="img"
        aria-label={`${completed} دروس مكتملة من ${total}`}
      >
        {days.map((d, i) => {
          const done = d.is_completed;
          const cur = !done && d.day_number === currentDayNumber;
          return (
            <React.Fragment key={d.day_number}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={
                    "mx-1 h-[2px] min-w-[8px] flex-1 rounded-full " +
                    (done
                      ? "bg-gradient-to-l from-[rgba(124,92,255,0.5)] to-[rgba(45,212,191,0.55)]"
                      : "bg-white/[0.07]")
                  }
                />
              )}
              {cur && !reduceMotion ? (
                /* النقطة الحالية: نبضة واحدة عند الدخول */
                <motion.span
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 12 }}
                  className="dot-cur relative flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full"
                  aria-hidden
                >
                  <span className="absolute inset-[5px] rounded-full bg-white" />
                </motion.span>
              ) : (
                <span
                  aria-hidden
                  className={
                    "flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full " +
                    (done
                      ? "bg-[#2DD4BF] text-[#052e29] shadow-[0_0_9px_rgba(45,212,191,0.5)]"
                      : cur
                        ? "bg-[#7C5CFF] shadow-[0_0_0_4px_rgba(124,92,255,0.18),0_0_14px_rgba(124,92,255,0.65)]"
                        : "border-[1.6px] border-dashed border-white/[0.16]")
                  }
                >
                  {done && <Check size={9} strokeWidth={3.4} />}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </GlassCard>
  );
}
