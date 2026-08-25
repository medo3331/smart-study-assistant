"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconBadge } from "@/components/ui/IconBadge";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { PrayerTime, PrayerTimesData } from "@/lib/islamic/types";
import { formatTimeRemaining } from "@/lib/islamic/prayer-times";
import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Moon,
  Sunrise,
  Sunset,
  MapPin,
  Calendar,
  Settings,
  ChevronDown,
  Bell,
  Music,
  Globe,
  Landmark,
} from "lucide-react";

interface PrayerTimesListProps {
  data: PrayerTimesData;
  onSettingsClick?: () => void;
}

/**
 * Full Prayer Times Display
 * Shows all 5 prayers + sunrise with next prayer highlighted
 */
export function PrayerTimesList({ data, onSettingsClick }: PrayerTimesListProps) {
  const [showDetails, setShowDetails] = useState(false);

  const prayerIcons: Record<string, LucideIcon> = {
    Fajr: Sun,
    Sunrise: Sunrise,
    Dhuhr: Sun,
    Asr: Sun,
    Maghrib: Moon,
    Isha: Moon,
  };

  const prayerColors: Record<string, { color: string; bg: string }> = {
    Fajr: { color: "text-[#FB923C]", bg: "bg-[#FB923C]/15" },
    Sunrise: { color: "text-[#F97316]", bg: "bg-[#F97316]/15" },
    Dhuhr: { color: "text-[#2DD4BF]", bg: "bg-[#2DD4BF]/15" },
    Asr: { color: "text-[#06B6D4]", bg: "bg-[#06B6D4]/15" },
    Maghrib: { color: "text-[#F97316]", bg: "bg-[#F97316]/15" },
    Isha: { color: "text-[#7C5CFF]", bg: "bg-[#7C5CFF]/15" },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">مواقيت الصلاة</h2>
            <p className="text-sm text-[#9AA0C0]">{data.location}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={Settings} onClick={onSettingsClick} aria-label="إعدادات الصلاة">
              <span className="sr-only">إعدادات الصلاة</span>
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Date & Location Info */}
      <Reveal index={1}>
        <GlassCard className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 rounded-xl bg-white/[0.02]">
              <IconBadge icon={Calendar} color="text-[#B69CFF]" bg="bg-[#7C5CFF]/15" size={36} />
              <p className="text-xs text-[#9AA0C0] mt-1">التاريخ الميلادي</p>
              <p className="font-mono font-medium text-white">{new Date(data.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02]">
              <IconBadge icon={Calendar} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={36} />
              <p className="text-xs text-[#9AA0C0] mt-1">التاريخ الهجري</p>
              <p className="font-mono font-medium text-white" dir="ltr">{data.hijriDate}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02]">
              <IconBadge icon={MapPin} color="text-[#FB923C]" bg="bg-[#FB923C]/15" size={36} />
              <p className="text-xs text-[#9AA0C0] mt-1">الموقع</p>
              <p className="text-sm font-medium text-white truncate">{data.location}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02]">
              <IconBadge icon={Settings} color="text-[#7C5CFF]" bg="bg-[#7C5CFF]/15" size={36} />
              <p className="text-xs text-[#9AA0C0] mt-1">طريقة الحساب</p>
              <p className="text-xs font-medium text-white truncate">{data.calculationMethod}</p>
            </div>
          </div>

          {/* Expandable Details */}
          <Button
            variant="ghost"
            className="w-full mt-4 justify-center gap-2"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
          >
            <IconBadge icon={Globe} color="text-[#9AA0C0]" bg="bg-white/[0.04]" size={28} />
            <span className="text-sm text-[#9AA0C0]">تفاصيل الحساب</span>
            <ChevronDown size={16} className={cn("transition-transform", showDetails && "rotate-180")} aria-hidden />
          </Button>

          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 space-y-3 text-sm text-[#9AA0C0] border-t border-white/[0.04] pt-4"
            >
              <div className="flex justify-between">
                <span>المذهب</span>
                <span className="text-white font-medium">{data.madhab}</span>
              </div>
              <div className="flex justify-between">
                <span>خط العرض</span>
                <span className="text-white font-medium font-mono">{data.location}</span>
              </div>
              <div className="flex justify-between">
                <span>خط الطول</span>
                <span className="text-white font-medium font-mono">—</span>
              </div>
              <div className="flex justify-between">
                <span>المنطقة الزمنية</span>
                <span className="text-white font-medium font-mono">Africa/Cairo</span>
              </div>
              <div className="flex justify-between">
                <span>إشعارات الصلاة</span>
                <span className="text-white font-medium">مفعلة</span>
              </div>
              <div className="flex justify-between">
                <span>صوت الأذان</span>
                <span className="text-white font-medium">مفعل</span>
              </div>
              <div className="flex justify-between">
                <span>تنبيه قبل الصلاة</span>
                <span className="text-white font-medium font-mono">10 دقائق</span>
              </div>
            </motion.div>
          )}
        </GlassCard>
      </Reveal>

      {/* Prayer Times List */}
      <Reveal index={2}>
        <div className="space-y-2" role="list" aria-label="قائمة مواقيت الصلاة">
          {data.times.map((prayer, index) => (
            <PrayerTimeRow
              key={prayer.name}
              prayer={prayer}
              icons={prayerIcons}
              colors={prayerColors}
              index={index}
            />
          ))}
        </div>
      </Reveal>

      {/* Next Prayer Highlight */}
      {data.nextPrayer && (
        <Reveal index={3}>
          <GlassCard className="p-4 border-[#7C5CFF]/30 bg-[#7C5CFF]/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C5CFF]/20 text-[#7C5CFF]">
                  <Bell size={24} aria-hidden />
                </div>
                <div>
                  <p className="text-sm text-[#B69CFF] font-medium">الصلاة القادمة</p>
                  <p className="text-xl font-bold text-white">{data.nextPrayer.arabicName}</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-2xl font-mono font-bold text-[#B69CFF]">{data.nextPrayer.time}</p>
                <p className="text-xs text-[#9AA0C0]">متبقي: {formatTimeRemaining(data.nextPrayer.timestamp)}</p>
              </div>
            </div>
          </GlassCard>
        </Reveal>
      )}
    </div>
  );
}

interface PrayerTimeRowProps {
  prayer: PrayerTime;
  icons: Record<string, LucideIcon>;
  colors: Record<string, { color: string; bg: string }>;
  index: number;
}

function PrayerTimeRow({ prayer, icons, colors, index }: PrayerTimeRowProps) {
  const Icon = icons[prayer.name] || Sun;
  const { color, bg } = colors[prayer.name] || { color: "text-[#9AA0C0]", bg: "bg-white/[0.04]" };
  const isNext = prayer.isNext;
  const isCurrent = prayer.isCurrent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative flex items-center gap-4 p-4 rounded-2xl transition-all",
        isNext
          ? "bg-[#7C5CFF]/5 border border-[#7C5CFF]/30 shadow-[0_0_20px_rgba(124,92,255,0.15)]"
          : isCurrent
            ? "bg-[#2DD4BF]/5 border border-[#2DD4BF]/30"
            : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]"
      )}
      role="listitem"
    >
      {/* Next/Current indicator */}
      {isNext && (
        <div className="absolute -right-3 top-1/2 -translate-y-1/2">
          <span className="px-2 py-1 rounded-full bg-[#7C5CFF] text-white text-xs font-bold">
            القادمة
          </span>
        </div>
      )}
      {isCurrent && !isNext && (
        <div className="absolute -right-3 top-1/2 -translate-y-1/2">
          <span className="px-2 py-1 rounded-full bg-[#2DD4BF] text-[#06231F] text-xs font-bold">
            الآن
          </span>
        </div>
      )}

      {/* Prayer Icon */}
      <IconBadge icon={Icon} color={color} bg={bg} size={48} />

      {/* Prayer Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            "text-lg font-bold",
            isNext ? "text-[#B69CFF]" : isCurrent ? "text-[#2DD4BF]" : "text-white"
          )}>
            {prayer.arabicName}
          </p>
          <p className="text-xs text-[#9AA0C0] font-mono">{prayer.name}</p>
        </div>
        {isNext && (
          <p className="text-xs text-[#7C5CFF] mt-1">متبقي {formatTimeRemaining(prayer.timestamp)}</p>
        )}
      </div>

      {/* Time */}
      <div className="text-left">
        <p className={cn(
          "text-xl font-mono font-bold",
          isNext ? "text-[#B69CFF]" : isCurrent ? "text-[#2DD4BF]" : "text-white"
        )}>
          {prayer.time}
        </p>
        <p className="text-xs text-[#9AA0C0]">الساعة</p>
      </div>
    </motion.div>
  );
}