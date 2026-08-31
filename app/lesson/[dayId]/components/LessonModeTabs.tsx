"use client";

import React from "react";
import { useReducedMotion } from "framer-motion";

/* ==========================================================================
   التبويبات الموحّدة (أكاديمي / بصري / تطبيقي) بحبة بنفسجية منزلقة —
   مكوّن واحد قابل لإعادة الاستخدام في كل مكان يحتاج تبويبات أنماط.
   القيم الداخلية نفس قيم learning_style الموجودة (academic/visual/practical).
   ========================================================================== */

export type LessonMode = "academic" | "visual" | "practical";

interface LessonModeTabsProps {
  modes: { id: LessonMode; label: string }[];
  active: LessonMode;
  onChange: (id: LessonMode) => void;
}

/** هوية الحبة المنزلقة: تُقاس من الزر النشط وتتحرك بانزلاق قصير. */
const PILL_ID = "lesson-mode-pill";

export function LessonModeTabs({ modes, active, onChange }: LessonModeTabsProps) {
  const reduceMotion = useReducedMotion();
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // قياس الزر النشط لتموضع الحبة (RTL-safe: نحسب من اليمين)
  const placePill = React.useCallback(() => {
    const wrap = listRef.current;
    if (!wrap) return;
    const el = wrap.querySelector<HTMLButtonElement>(`[data-mode="${active}"]`);
    const pill = document.getElementById(PILL_ID);
    if (!el || !pill) return;
    const w = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    pill.style.width = `${r.width}px`;
    pill.style.right = `${w.right - r.right}px`;
  }, [active]);

  React.useEffect(() => {
    placePill();
    if (reduceMotion) return;
    const onResize = () => placePill();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [placePill, reduceMotion]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="أسلوب الشرح"
      className="relative inline-flex rounded-2xl border border-white/[0.08] bg-white/[0.04] p-[5px]"
    >
      <span
        id={PILL_ID}
        aria-hidden
        className="absolute bottom-[5px] top-[5px] z-0 rounded-xl bg-gradient-to-b from-[#DC4C4C] to-[#F2745C] shadow-[0_4px_18px_rgba(220,76,76,0.4),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
        style={{ right: 0, transition: reduceMotion ? "none" : "right .28s cubic-bezier(.22,.8,.36,1), width .28s cubic-bezier(.22,.8,.36,1)" }}
      />
      {modes.map((m) => {
        const isActive = m.id === active;
        return (
          <button
            key={m.id}
            type="button"
            data-mode={m.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(m.id)}
            className={
              "relative z-10 h-[38px] rounded-xl px-5 text-[13.5px] font-semibold transition-colors " +
              (isActive ? "text-white" : "text-[#9AA0C0] hover:text-[#E7E9F5]")
            }
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
