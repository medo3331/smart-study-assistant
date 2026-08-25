"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { ExplanationMode } from "@/lib/types";
import { EXPLANATION_MODE_LABELS } from "@/lib/mock-data";

interface TabsProps<T extends string> {
  /** All selectable option values. */
  options: readonly T[];
  /** Current value. */
  value: T;
  onChange: (value: T) => void;
  /** Map a value to its display label. */
  labelFor: (value: T) => string;
  className?: string;
}

/**
 * UNIFIED tab / segmented control, reused for every mode-switch in the app
 * (dashboard explanation modes AND the lesson page نمط الشرح). Generic over T
 * so it works for any segmented choice with full typing.
 *
 * Visual: a single violet pill slides behind the active tab via framer-motion's
 * layout animation — smooth, no duplicate tab styles anywhere.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  labelFor,
  className,
}: TabsProps<T>) {
  const activeIndex = Math.max(0, options.indexOf(value));
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex w-full gap-1 rounded-2xl border border-white/[0.06]",
        "bg-[#0D1029]/70 p-1 backdrop-blur-xl",
        className
      )}
    >
      {/* Sliding violet pill behind the active tab */}
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="absolute inset-y-1 rounded-xl bg-[#7C5CFF] shadow-[0_4px_14px_rgba(124,92,255,0.35)]"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          left: `calc(4px + (100% - 8px) / ${options.length} * ${activeIndex})`,
        }}
        aria-hidden
      />
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "relative z-10 flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              active ? "text-white" : "text-[#9AA0C0] hover:text-[#E7E9F5]"
            )}
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

/** Convenience binding for the exact lesson explanation modes. */
export function ExplanationTabs({
  value,
  onChange,
}: {
  value: ExplanationMode;
  onChange: (value: ExplanationMode) => void;
}) {
  const options: readonly ExplanationMode[] = ["academic", "visual", "practical"];
  return (
    <Tabs
      options={options}
      value={value}
      onChange={onChange}
      labelFor={(v) => EXPLANATION_MODE_LABELS[v]}
    />
  );
}
