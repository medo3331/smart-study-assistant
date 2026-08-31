"use client";

import { motion, useReducedMotion } from "framer-motion";

interface ProgressRingProps {
  /** النسبة ٠–١٠٠ — القوس بيمسح مرة واحدة للقيمة الحقيقية. */
  pct: number;
  size?: number;
  stroke?: number;
  /** سطر صغير تحت النسبة (مثلاً «من الخطة»). */
  subLabel?: string;
  className?: string;
  ariaLabel: string;
}

/**
 * حلقة تقدّم — تتبع accent الثيم النشط.
 * المسح بيحصل مرة واحدة على الماونت — مفيش لوب، ومفيش أرقام مزيفة:
 * الصفر يظهر صفر. بتتحترم prefers-reduced-motion.
 */
export function ProgressRing({ pct, size = 150, stroke = 12, subLabel, className, ariaLabel }: ProgressRingProps) {
  const reduceMotion = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative" }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* المسار */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={stroke}
        />
        {/* التقدّم */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduceMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 40%, transparent))" }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        aria-hidden
      >
        <span className="font-mono text-[27px] font-bold leading-none" style={{ color: "var(--text)" }} dir="ltr">
          {clamped}%
        </span>
        {subLabel && (
          <span className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>{subLabel}</span>
        )}
      </div>
    </div>
  );
}
