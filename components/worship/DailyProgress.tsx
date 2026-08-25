"use client";

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
  Clock 
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DailyProgressItem } from "@/lib/islamic/types";

const ICON_MAP: Record<string, LucideIcon> = {
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

/**
 * Daily Progress Tracker
 * Lightweight overview of daily worship achievements
 * Not gamified - just a personal tracker
 */
export function DailyProgress({ 
  items, 
  title = "إنجازاتك اليوم", 
  subtitle 
}: DailyProgressProps) {
  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <section className="space-y-4">
      <Reveal index={0}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {subtitle && <p className="text-sm text-[#9AA0C0] mt-1">{subtitle}</p>}
          </div>
          <div className="text-left">
            <p className="text-lg font-mono font-bold text-[#2DD4BF]">{completedCount} / {totalCount}</p>
            <p className="text-xs text-[#9AA0C0]">مكتمل</p>
          </div>
        </div>
      </Reveal>

      <Reveal index={1}>
        <GlassCard className="p-4">
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-4">
            <motion.div
              className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#2DD4BF] rounded-full"
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
          return (
            <Reveal key={item.id} index={index + 2}>
              <div className={cn(
                "flex items-center gap-4 p-4 rounded-2xl transition-colors",
                item.completed 
                  ? "bg-white/[0.02] border border-[#2DD4BF]/20" 
                  : item.current 
                    ? "bg-[#7C5CFF]/5 border border-[#7C5CFF]/20" 
                    : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]"
              )}>
                {/* Status Indicator */}
                <div className={cn(
                  "flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl",
                  item.completed 
                    ? "bg-[#2DD4BF]/15 text-[#2DD4BF]" 
                    : item.current 
                      ? "bg-[#7C5CFF]/15 text-[#7C5CFF]" 
                      : "bg-white/[0.04] text-[#9AA0C0]"
                )}>
                  {item.completed ? (
                    <CheckCircle size={20} aria-hidden />
                  ) : (
                    <Circle size={20} aria-hidden />
                  )}
                </div>

                {/* Icon */}
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                  <Icon size={20} className={cn(
                    item.completed ? "text-[#2DD4BF]" : 
                    item.current ? "text-[#7C5CFF]" : "text-[#9AA0C0]"
                  )} aria-hidden />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "font-medium truncate",
                    item.completed ? "text-white" : 
                    item.current ? "text-[#B69CFF]" : "text-[#C7CBE6]"
                  )}>
                    {item.arabicLabel}
                  </p>
                  <p className="text-xs text-[#9AA0C0] mt-0.5">{item.label}</p>
                </div>

                {/* Time */}
                {item.time && (
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-mono font-medium text-[#B69CFF]">{item.time}</p>
                  </div>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}