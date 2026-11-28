"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import {
  Sun,
  Moon,
  Sparkles,
  CheckCircle,
  Circle,
  BookOpen,
  Clock,
} from "lucide-react";
import type { DailyProgressItem } from "@/lib/islamic/types";

const ICON_MAP: Record<string, typeof Sun> = {
  Sun,
  Moon,
  Sparkles,
  BookOpen,
  CheckCircle,
  Circle,
  Clock,
};

interface DailyProgressProps {
  items: DailyProgressItem[];
  title?: string;
  subtitle?: string;
}

/** Daily overview: prayers can be recorded here; other rows navigate to their real task. */
export function DailyProgress({
  items,
  title = "إنجازاتك اليوم",
  subtitle,
}: DailyProgressProps) {
  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <section className="space-y-4">
      <Reveal index={0}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-[#9AA0C0]">{subtitle}</p>}
          </div>
          <div className="text-left">
            <p className="text-lg font-mono font-bold text-[#2DD4BF]">{completedCount} / {totalCount}</p>
            <p className="text-xs text-[#9AA0C0]">مكتمل</p>
          </div>
        </div>
      </Reveal>

      <Reveal index={1}>
        <GlassCard className="p-4">
          <div
            className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-label="نسبة إنجاز العبادات اليومية"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#2DD4BF]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </GlassCard>
      </Reveal>

      <div className="space-y-2">
        {items.map((item, index) => {
          const Icon = ICON_MAP[item.iconName] || Circle;
          const className = cn(
            "flex w-full items-center gap-4 rounded-2xl p-4 text-right transition-colors",
            item.completed
              ? "border border-[#2DD4BF]/20 bg-white/[0.02]"
              : item.current
                ? "border border-[#7C5CFF]/20 bg-[#7C5CFF]/5"
                : "border border-white/[0.04] bg-white/[0.02]",
            (!item.completed && !!item.href) && "hover:bg-white/[0.04]",
          );
          const row = (
            <>
              <div
                className={cn(
                  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                  item.completed
                    ? "bg-[#2DD4BF]/15 text-[#2DD4BF]"
                    : item.current
                      ? "bg-[#7C5CFF]/15 text-[#7C5CFF]"
                      : "bg-white/[0.04] text-[#9AA0C0]",
                )}
              >
                {item.completed ? <CheckCircle size={20} aria-hidden /> : <Circle size={20} aria-hidden />}
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
                <Icon
                  size={20}
                  className={cn(
                    item.completed ? "text-[#2DD4BF]" : item.current ? "text-[#7C5CFF]" : "text-[#9AA0C0]",
                  )}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium", item.completed ? "text-white" : item.current ? "text-[#B69CFF]" : "text-[#C7CBE6]")}>{item.arabicLabel}</p>
                <p className="mt-0.5 text-xs text-[#9AA0C0]">{item.label}</p>
              </div>
              {item.time && <p className="flex-shrink-0 text-right text-sm font-mono font-medium text-[#B69CFF]">{item.time}</p>}
            </>
          );

          return (
            <Reveal key={item.id} index={index + 2}>
              {item.href ? (
                <Link
                  href={item.href}
                  aria-label={`${item.arabicLabel}${item.completed ? " — مكتمل" : " — عرض"}`}
                  className={cn(className, !item.completed && "cursor-pointer")}
                >
                  {row}
                </Link>
              ) : (
                <div className={className} aria-label={`${item.arabicLabel}${item.completed ? " — مكتمل" : ""}`}>
                  {row}
                </div>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
