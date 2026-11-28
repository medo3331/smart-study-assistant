"use client";

/**
 * WheelCharts — الرسوم البيانية بتاعة عجلة ماجيك (recharts) في ملف منفصل.
 *
 * ⚡ الأداء: `recharts` + تبعياتها (d3) بتاخد ~360KB غير مضغوط، وكانت
 * بتتحمّل مع أول بايت من `/dashboard` رغم إنها مجرد كروت تحت الطيّة.
 * الملف ده بيتحمّل بـ `next/dynamic` + `ssr: false` من MagicWheelDashboard،
 * فبتبقى chunk منفصلة بتوصل بعد ما الهيكل يترسم.
 *
 * قاعدة مهمة: كل حاجة بترجع من هنا لازم تفضل «أوراق» بسيطة — الوالد
 * (MagicWheelDashboard) بيحتفظ بالكروت والعنوان والـ legend وبس.
 */

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * نفس ألوان أفرع العجلة اللي في MagicWheelDashboard — الكومبوننت ده بيتحمّل
 * لوحده فمش قادر يستورد الملف الوالد (هيبقى import دائري)، فالمصفوفة متكرّرة
 * هنا بنفس الترتيب. لو غيّرت الألوان هناك لازم تغيّرها هنا كمان.
 */
export const BRANCH_COLORS = [
  "#E8342F", // الرئيسية — أحمر
  "#F2994A", // الكورسات — برتقالي
  "#F2C94C", // الدرس — أصفر
  "#6FCF97", // مساحة العمل — أخضر
  "#2FD4C4", // العبادات — تركواز
  "#4FA9F5", // المساعد الذكي — أزرق
  "#7B7EF4", // المتجر — بنفسجي فاتح
  "#B57BF4", // التحليلات — بنفسجي
  "#F26FA1", // الإعدادات — وردي
];

export interface WheelChartPoint {
  label: string;
  minutes: number;
  tasks: number;
}

export interface WheelSubjectDatum {
  name: string;
  value: number;
  completed: number;
}

export interface WheelChartColors {
  accent: string;
  highlight: string;
  muted: string;
  rule: string;
  card: string;
  text: string;
}

const TOOLTIP_STYLE = (colors: WheelChartColors) => ({
  backgroundColor: colors.card,
  border: `1px solid ${colors.rule}`,
  borderRadius: 10,
  fontSize: 11,
  direction: "rtl" as const,
});

/** رسم أعمدة «دقايق التركيز» — نفس props اللي كانت inline في العجلة. */
export function WheelBarChart({
  data,
  colors,
}: {
  data: WheelChartPoint[];
  colors: WheelChartColors;
}) {
  if (!data || data.length === 0) return null;

  return (
    <div className="h-36 w-full md:h-40" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fill: colors.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: colors.rule, opacity: 0.35 }} contentStyle={TOOLTIP_STYLE(colors)} />
          <Bar dataKey="minutes" name="دقايق تركيز" radius={[3, 3, 0, 0]} fill={colors.accent} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** دوناتة توزيع المواد — الـ legend بتترسم في الوالد (MagicWheelDashboard). */
export function WheelDonutChart({
  data,
  colors,
  reduced,
}: {
  data: WheelSubjectDatum[];
  colors: WheelChartColors;
  reduced: boolean;
}) {
  if (!data || data.length === 0) return null;

  return (
    <div className="relative h-36 w-36 shrink-0 md:h-40 md:w-40" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={3}
            stroke={colors.card}
            strokeWidth={2}
            isAnimationActive={!reduced}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE(colors)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold md:text-xl" style={{ color: colors.text }}>
          {Math.round(
            (data.reduce((s, d) => s + d.completed, 0) / Math.max(1, data.reduce((s, d) => s + d.value, 0))) * 100,
          )}
          %
        </span>
        <span className="font-mono text-[0.5rem] uppercase tracking-widest" style={{ color: colors.muted }}>
          مكتمل
        </span>
      </div>
    </div>
  );
}
