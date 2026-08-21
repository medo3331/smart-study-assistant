"use client";

import React from "react";
import { motion } from "framer-motion";
import type { ThemeStyles } from "./types";

/* ==========================================================================
   تقدّم الأسبوع
   سبع أعمدة مرسومة بالإيد على ورق مسطّر — مش recharts. السبب: ده كارت
   نظرة سريعة جنب الهيرو، مش أداة تحليل. الأداة نفسها موجودة تحت في
   قسم التحليلات وبتعرض دقائق التركيز. الكارت ده بيعرض حاجة تانية:
   كام درس/مهمة خلّصت كل يوم.

   خطوط القياس هي سطور الكشكول نفسها (.chart-grid كل ٢٥٪)، وعامود
   النهارده هو الوحيد اللي بلون القلم — أصفر = "إنت هنا"، مش "متحدد".
   ========================================================================== */

interface WeekPoint {
  label: string;
  minutes: number;
  tasks: number;
}

interface WeeklyProgressProps {
  data: WeekPoint[];
  themeStyles: ThemeStyles;
}

export function WeeklyProgress({ data, themeStyles }: WeeklyProgressProps) {
  const peak = Math.max(...data.map((d) => d.tasks), 0);
  // أرضية ٤ عشان يوم واحد فيه مهمة واحدة ما يطلعش عامود ملو الكارت
  const scale = Math.max(peak, 4);
  const total = data.reduce((sum, d) => sum + d.tasks, 0);
  const todayIdx = data.length - 1;

  return (
    <div className="sheet-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="eyebrow eyebrow-flush">تقدّم الأسبوع</p>
          <p className="mono text-ink-soft mt-1 m-0">
            <span className="ltr-num tnum">{total}</span> مهمة في آخر <span className="ltr-num tnum">7</span> أيام
          </p>
        </div>
        <span className="tag tag-quiet">
          الأعلى <span className="ltr-num tnum">{peak}</span> في اليوم
        </span>
      </div>

      {/* الأعمدة. القيم مكتوبة كمان في جدول مخفي تحت عشان قارئ الشاشة
          ما يقفش قدام رسم مالوش نص. */}
      <div className="chart-grid h-40 flex items-end gap-1.5 sm:gap-2.5 px-1" aria-hidden>
        {data.map((d, idx) => {
          const isToday = idx === todayIdx;
          const ratio = scale > 0 ? d.tasks / scale : 0;
          return (
            <div key={`${d.label}-${idx}`} className="flex-1 flex flex-col justify-end h-full min-w-0">
              {d.tasks > 0 && (
                <span
                  className={`mono text-[0.6rem] text-center mb-1 tnum ${isToday ? "text-ink font-bold" : "text-ink-soft"}`}
                >
                  {d.tasks}
                </span>
              )}
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.5, delay: idx * 0.05, ease: "easeOut" }}
                // ٣px أرضية عشان اليوم الفاضي يفضل باين كخانة، مش يختفي
                style={{ height: `${Math.max(ratio * 100, 3)}%` }}
                className={`chart-bar ${
                  isToday ? themeStyles.accentBg : d.tasks > 0 ? "bg-rule-strong" : "bg-paper-3"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* أسماء الأيام تحت الخط الأساسي */}
      <div className="flex gap-1.5 sm:gap-2.5 px-1 pt-2 border-t border-rule">
        {data.map((d, idx) => (
          <span
            key={`${d.label}-label-${idx}`}
            className={`flex-1 mono text-[0.6rem] text-center truncate ${
              idx === todayIdx ? "text-ink font-bold" : "text-ink-soft"
            }`}
          >
            {idx === todayIdx ? "النهارده" : d.label}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>مهام مخلّصة كل يوم في آخر أسبوع</caption>
        <tbody>
          {data.map((d, idx) => (
            <tr key={`row-${idx}`}>
              <th scope="row">{idx === todayIdx ? "النهارده" : d.label}</th>
              <td>{d.tasks} مهمة</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
