"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ProgressRingProps {
  /** Completion percentage 0–100. */
  pct: number;
  size?: number;
  stroke?: number;
  /** Ring color (arbitrary Tailwind value or raw hex). */
  color?: string;
  /** Center label rendered in mono (e.g. the percentage). */
  centerLabel?: string;
  className?: string;
}

/**
 * Circular progress ring. The arc sweeps from 0 to `pct` exactly once on
 * mount (no repeat). Uses an inline SVG stroke-dashoffset transition via
 * framer-motion for a smooth single play.
 */
export function ProgressRing({
  pct,
  size = 168,
  stroke = 12,
  color = "#7C5CFF",
  centerLabel,
  className,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [target, setTarget] = useState(0);

  // Animate once after first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => setTarget(Math.max(0, Math.min(100, pct))));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const offset = circumference - (target / 100) * circumference;

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative" }}
      role="img"
      aria-label={`نسبة الإكمال ${Math.round(pct)} بالمئة`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      {centerLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-bold text-white" dir="ltr">
            {centerLabel}
          </span>
          <span className="mt-1 text-xs text-[#9AA0C0]">مكتمل</span>
        </div>
      )}
    </div>
  );
}
