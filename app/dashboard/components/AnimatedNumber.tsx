"use client";

import { useEffect, useRef, useState } from "react";

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
 */
export function AnimatedNumber({ value, durationMs = 900, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
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
  }, [value, durationMs]);

  return (
    <span className={className} dir="ltr">
      {display.toLocaleString("en-US")}
    </span>
  );
}
