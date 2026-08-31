"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { setTasbihCount } from "@/lib/islamic/worship-progress";

interface TasbihCounterProps {
  index?: number;
}

const DHIKR_PRESETS = [
  { id: "subhanallah", text: "سُبْحَانَ اللَّه", target: 33 },
  { id: "alhamdulillah", text: "الْحَمْدُ لِلَّه", target: 33 },
  { id: "allahuakbar", text: "اللَّهُ أَكْبَر", target: 34 },
  { id: "lailahaillallah", text: "لَا إِلَهَ إِلَّا اللَّه", target: 100 },
] as const;

type DhikrId = (typeof DHIKR_PRESETS)[number]["id"];

const STORAGE_KEY = "magicly:tasbih-v1";

interface StoredCounts {
  [dhikrId: string]: number;
}

function loadCounts(): StoredCounts {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredCounts) : {};
  } catch {
    return {};
  }
}

/**
 * Digital tasbih — dhikr counter with a tap-to-increment ring.
 *
 * Counts persist in localStorage so progress survives navigation and reloads.
 * Emerald worship accent, RTL-first layout, respects prefers-reduced-motion.
 */
export function TasbihCounter({ index = 0 }: TasbihCounterProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [activeId, setActiveId] = useState<DhikrId>("subhanallah");
  const [counts, setCounts] = useState<StoredCounts>({});

  // Hydrate once on mount (localStorage is client-only).
  useEffect(() => {
    setCounts(loadCounts());
  }, []);

  const persist = useCallback((next: StoredCounts) => {
    setCounts(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode) — keep counting in memory only.
    }
  }, []);

  const active = DHIKR_PRESETS.find((d) => d.id === activeId)!;
  const count = counts[active.id] ?? 0;
  const done = count >= active.target;
  const pct = Math.min(100, Math.round((count / active.target) * 100));

  // 🔄 جسر للتخزين المركزي (lib/islamic/worship-progress) — نفس العدّاد
  // المحلي زي ما هو، بس كمان بيتسجّل في سجل اليوم فيصل لـ Supabase
  // مع باقي تقدّم العبادة. فشل الشبكة مش بيأثر على العدّاد نفسه.
  useEffect(() => {
    if (count > 0) setTasbihCount(count);
  }, [active.id, count]);

  const increment = useCallback(() => {
    persist({ ...counts, [active.id]: Math.min(active.target, count + 1) });
  }, [counts, active.id, active.target, count, persist]);

  const reset = useCallback(() => {
    persist({ ...counts, [active.id]: 0 });
  }, [counts, active.id, persist]);

  return (
    <Reveal index={index}>
      <GlassCard className="p-5">
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                📿
              </span>
              <h2 className="text-lg font-bold text-white">المسبحة</h2>
            </div>

            {/* Dhikr selector chips */}
            <div className="flex flex-wrap justify-end gap-1.5">
              {DHIKR_PRESETS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveId(d.id)}
                  aria-pressed={activeId === d.id}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    activeId === d.id
                      ? "bg-[#2DD4BF]/15 text-[#2DD4BF]"
                      : "bg-white/[0.04] text-[#9AA0C0] hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  {d.text}
                </button>
              ))}
            </div>
          </div>

          {/* Counter */}
          <div className="flex flex-col items-center gap-4">
            <motion.button
              onClick={increment}
              disabled={done}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              aria-label={`سبّح ${active.text} — العدد الحالي ${count}`}
              className={cn(
                "relative flex h-44 w-44 select-none flex-col items-center justify-center rounded-full",
                "border transition-colors duration-200",
                done
                  ? "border-[#2DD4BF]/60 bg-[#2DD4BF]/10"
                  : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]",
                done && "cursor-default"
              )}
            >
              {/* Progress ring */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
                viewBox="0 0 176 176"
                aria-hidden
              >
                <circle
                  cx={88}
                  cy={88}
                  r={80}
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={6}
                />
                <circle
                  cx={88}
                  cy={88}
                  r={80}
                  fill="none"
                  stroke="#2DD4BF"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 80}
                  strokeDashoffset={2 * Math.PI * 80 * (1 - pct / 100)}
                  style={
                    reduceMotion
                      ? undefined
                      : { transition: "stroke-dashoffset 0.25s ease-out" }
                  }
                />
              </svg>

              {done ? (
                <span className="text-2xl" aria-hidden>
                  ✅
                </span>
              ) : (
                <>
                  <span className="font-mono text-4xl font-bold tabular-nums text-white">
                    {count}
                  </span>
                  <span className="mt-1 text-xs text-[#9AA0C0]">
                    من {active.target}
                  </span>
                </>
              )}
            </motion.button>

            {/* Current dhikr + reset */}
            <div className="flex items-center gap-3">
              <p className="text-base font-bold text-[#2DD4BF]" dir="rtl">
                {active.text}
              </p>
              <button
                onClick={reset}
                aria-label={`تصفير عداد ${active.text}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-[#9AA0C0] transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <RotateCcw size={14} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </GlassCard>
    </Reveal>
  );
}