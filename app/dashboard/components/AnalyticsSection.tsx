"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ThemeColor } from "./types";
import { useCssVars } from "./use-css-vars";

interface ChartPoint {
  label: string;
  minutes: number;
  tasks: number;
}

interface HeatmapCell {
  key: string;
  level: number;
  minutes: number;
  tasks: number;
  dateLabel: string;
}

interface AnalyticsSectionProps {
  analyticsRange: "weekly" | "monthly";
  onChangeRange: (range: "weekly" | "monthly") => void;
  weeklyFocusHoursLabel: string;
  overallProgress: number;
  streak: number;
  activeChartData: ChartPoint[];
  theme: ThemeColor;
  heatmapCells: HeatmapCell[];
  heatmapColors: string[];
}

// كل لون قلم وله التوكن بتاعه — الرسم البياني بيتلوّن بنفس قلم الثيم
const BAR_TOKEN: Record<ThemeColor, string> = {
  amber: "--hl-yellow-fill",
  emerald: "--hl-green-fill",
  coral: "--hl-purple-fill",
  cyan: "--hl-blue-fill",
};

const CHART_TOKENS = ["--rule", "--ink", "--ink-soft", "--paper-2", "--r-md"] as const;

export function AnalyticsSection({
  analyticsRange,
  onChangeRange,
  weeklyFocusHoursLabel,
  overallProgress,
  streak,
  activeChartData,
  theme,
  heatmapCells,
  heatmapColors,
}: AnalyticsSectionProps) {
  // 🎨 recharts محتاج قيم لون صريحة مش كلاسات، فبنقرا التوكنز نفسها.
  // كانت مكتوبة hex ثابتة (#1e293b وكده) فكانت بتفضل غامقة في الثيم الفاتح.
  const v = useCssVars([...CHART_TOKENS, BAR_TOKEN[theme]] as const);
  const barColor = v[BAR_TOKEN[theme]] || "#E2C95C";

  return (
    <div className="sheet-card p-5 space-y-5 scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow eyebrow-flush">التحليلات</p>

        {/* نطاق العرض إعداد، فبيتعلّم بالحبر مش بالفسفوري */}
        <div className="flex gap-1 bg-paper p-1 rounded-[var(--r-sm)] border border-rule">
          {([
            { id: "weekly", label: "أسبوعي" },
            { id: "monthly", label: "شهري" },
          ] as const).map((r) => (
            <button
              key={r.id}
              onClick={() => onChangeRange(r.id)}
              className={`mono px-3 py-1.5 rounded-[6px] transition ${
                analyticsRange === r.id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- ثلاث قراءات: كل واحدة رقم كبير بخط العرض ولافتة مونوسبيس ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-paper rounded-[var(--r-sm)] p-4">
          <p className="tag mb-1.5">تركيز ٧ أيام</p>
          <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum">
            {weeklyFocusHoursLabel}
          </p>
        </div>
        <div className="bg-paper rounded-[var(--r-sm)] p-4">
          <p className="tag mb-1.5">إنجاز الخطة</p>
          <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum">
            {overallProgress}<span className="text-base text-ink-soft">%</span>
          </p>
        </div>
        <div className="bg-paper rounded-[var(--r-sm)] p-4 col-span-2 md:col-span-1">
          <p className="tag mb-1.5">السلسلة</p>
          <p className="font-display font-extrabold text-2xl text-ink leading-none tnum">
            {streak}<span className="text-base text-ink-soft"> يوم</span>
          </p>
        </div>
      </div>

      {/* ---- دقائق التركيز ---- */}
      <div>
        <p className="tag mb-2">
          دقائق التركيز · {analyticsRange === "weekly" ? "آخر أسبوع" : "آخر شهر"}
        </p>
        <div className="h-48 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activeChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={v["--rule"]} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: v["--ink-soft"], fontSize: 10 }}
                axisLine={{ stroke: v["--rule"] }}
                tickLine={false}
              />
              <YAxis tick={{ fill: v["--ink-soft"], fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: v["--rule"], opacity: 0.35 }}
                contentStyle={{
                  background: v["--paper-2"],
                  border: `1px solid ${v["--rule"]}`,
                  borderRadius: 8,
                  fontSize: 11,
                  direction: "rtl",
                  boxShadow: "0 18px 44px -18px rgba(0,0,0,0.25)",
                }}
                labelStyle={{ color: v["--ink"], fontWeight: 700 }}
                itemStyle={{ color: v["--ink"] }}
                formatter={(value) => [`${value} دقيقة`, "تركيز"]}
              />
              {/* زوايا مربّعة تقريباً — الأعمدة تقرا كأعمدة مرسومة بالمسطرة */}
              <Bar dataKey="minutes" radius={[3, 3, 0, 0]} fill={barColor} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---- خريطة النشاط: كثافة ضربة القلم على مدار ٧٠ يوم ---- */}
      <div>
        <p className="tag mb-2">خريطة النشاط · آخر ٧٠ يوم</p>
        <div className="grid grid-cols-10 gap-1.5 sm:gap-2" dir="ltr">
          {heatmapCells.map((cell) => (
            <div
              key={cell.key}
              title={`${cell.dateLabel} · ${cell.minutes} دقيقة تركيز · ${cell.tasks} مهام منجزة`}
              className={`aspect-square rounded-[2px] border ${heatmapColors[cell.level]} transition hover:ring-2 hover:ring-redpen`}
            />
          ))}
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-2.5" dir="ltr">
          <span className="tag">أقل</span>
          {heatmapColors.map((c, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-[2px] border ${c}`} />
          ))}
          <span className="tag">أكثر</span>
        </div>
      </div>
    </div>
  );
}
