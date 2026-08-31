"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import type { PrayerTime } from "@/lib/islamic/types";
import { formatTimeRemaining } from "@/lib/islamic/prayer-times";
import { Moon, Clock, MapPin, ChevronRight } from "lucide-react";
import Link from "next/link";

interface NextPrayerCardProps {
  prayer: PrayerTime | null;
  location: string;
}

/**
 * Next Prayer Card with live countdown
 * Updates every second without causing unnecessary re-renders
 * by isolating the countdown state
 */
export function NextPrayerCard({ prayer, location }: NextPrayerCardProps) {
  const [timeRemaining, setTimeRemaining] = useState("");
  const [now] = useState(() => Date.now());

  // Update countdown every second
  useEffect(() => {
    if (!prayer) return;

    const updateCountdown = () => {
      setTimeRemaining(formatTimeRemaining(prayer.timestamp));
    };

    // Initial update
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [prayer]);

  if (!prayer) {
    return (
      <GlassCard className="p-6">
        <div className="text-center text-[#9AA0C0]">
          <p>جاري تحميل مواقيت الصلاة...</p>
        </div>
      </GlassCard>
    );
  }

  // Calculate progress through the day (0-100)
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const dayProgress = Math.max(0, Math.min(100, ((now - dayStart) / (dayEnd - dayStart)) * 100));

  return (
    <GlassCard glow className="p-6 relative overflow-hidden">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7C5CFF]/5 via-transparent to-[#2DD4BF]/5" aria-hidden />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IconBadge icon={Moon} color="text-[#7C5CFF]" bg="bg-[#7C5CFF]/15" size={44} />
            <div>
              <p className="text-sm text-[#9AA0C0]">الصلاة القادمة</p>
              <p className="text-lg font-bold text-white">{prayer.arabicName}</p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-xs text-[#9AA0C0]">{location}</p>
            <p className="text-xs text-[#7C5CFF] font-medium">متبقي {timeRemaining}</p>
          </div>
        </div>

        {/* Main Countdown Display */}
        <div className="flex items-center justify-between gap-6">
          {/* Progress Ring */}
          <div className="flex-shrink-0">
            <ProgressRing
              pct={dayProgress}
              size={140}
              stroke={10}
              color="#7C5CFF"
              centerLabel={prayer.time}
              className="relative"
            />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex items-center gap-3 text-[#C7CBE6]">
              <IconBadge icon={Clock} color="text-[#B69CFF]" bg="bg-[#7C5CFF]/10" size={36} />
              <div>
                <p className="text-sm font-medium text-white">وقت الصلاة</p>
                <p className="text-lg font-mono font-bold text-[#B69CFF]">{prayer.time}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[#C7CBE6]">
              <IconBadge icon={MapPin} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/10" size={36} />
              <div>
                <p className="text-sm font-medium text-white">الموقع</p>
                <p className="text-sm text-[#9AA0C0] truncate">{location}</p>
              </div>
            </div>

            {/* Progress bar for day */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#9AA0C0]">بداية اليوم</span>
                <span className="text-[#9AA0C0]">{Math.round(dayProgress)}%</span>
                <span className="text-[#9AA0C0]">نهاية اليوم</span>
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#2DD4BF] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${dayProgress}%` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-6 pt-4 border-t border-white/[0.06]">
          <Link href="/worship/prayer-times">
            <Button variant="ghost" icon={ChevronRight} iconPosition="end" className="w-full">
              عرض مواقيت الصلاة
            </Button>
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}