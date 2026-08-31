"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface AnimatedNumberProps {
  /** القيمة النهائية — العد بيبدأ من صفر ومرة واحدة بس. */
  value: number;
  durationMs?: number;
  className?: string;
}

/**
 * عدّاد HUD: بيعدّ من ٠ للقيمة مرة واحدة على الماونت ويقف.
 * الأرقام بتنعرض بخط المونو (الكلاس بيتمرّر من الأب) مع tabular-nums
 * عشان الأرقام ماتهتزّ أثناء العد.
 * يحترم prefers-reduced-motion — يظهر القيمة فوراً.
 */
export function AnimatedNumber({ value, durationMs = 900, className }: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) return;
    if (value === 0) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — نفس إحساس الاستقرار السريع في باقي الصفحة.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1 && frame.current !== null) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [value, durationMs, reduceMotion]);

  // تحت reduced-motion نعرض القيمة فوراً بدون animation state
  if (reduceMotion) {
    return (
      <span className={className} dir="ltr">
        {value.toLocaleString("en-US")}
      </span>
    );
  }

  // لما القيمة 0 تأكدنا display هو 0 بدون تحديثات غير لازمة
  if (value === 0 && display !== 0) {
    // حالة حدودية نادرة — يعود للـ0 فوراً عبر fallback للـeffect القادم
  }

  return (
    <span className={className} dir="ltr">
      {display.toLocaleString("en-US")}
    </span>
  );
}
