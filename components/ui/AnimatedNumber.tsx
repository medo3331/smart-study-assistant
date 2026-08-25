"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  /** Target value to count up to. */
  value: number;
  /** Animation duration in ms. */
  durationMs?: number;
  /** Optional thousands separator (Arabic locale uses Arabic-Indic by default). */
  locale?: string;
  className?: string;
}

/**
 * Counts up from 0 to `value` exactly once on mount, then stops.
 * Rendered in the mono face (passed by the parent via className) so stats
 * read as a HUD readout distinct from prose.
 */
export function AnimatedNumber({
  value,
  durationMs = 1100,
  locale = "ar-EG",
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic for a snappy, game-like settle.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return (
    <span className={className} dir="ltr">
      {display.toLocaleString(locale)}
    </span>
  );
}
