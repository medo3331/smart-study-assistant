"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { BookOpen, ChevronRight, Play, CheckCircle } from "lucide-react";

interface QuranWirdCardProps {
  surahName: string;
  arabicSurahName: string;
  currentAyah: number;
  targetAyah: number;
  totalAyahs: number;
  progress: number;
  juzNumber: number;
  onContinue: () => void;
  index: number;
}

/**
 * Quran Daily Wird Card
 * Shows current surah, ayah range, daily target, and progress
 */
export function QuranWirdCard({
  surahName,
  arabicSurahName,
  currentAyah,
  targetAyah,
  totalAyahs,
  progress,
  juzNumber,
  onContinue,
  index,
}: QuranWirdCardProps) {
  const startAyah = Math.max(1, currentAyah - (currentAyah - 1) % 10 + 1);
  const endAyah = Math.min(totalAyahs, startAyah + 9);

  return (
    <Reveal index={index}>
      <GlassCard glow className="p-6 relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#7C5CFF]/5 via-transparent to-[#2DD4BF]/5" aria-hidden />
        
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={BookOpen} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={44} />
              <div>
                <p className="text-sm text-[#9AA0C0]">ورد القرآن اليومي</p>
                <p className="text-xl font-bold text-white">{arabicSurahName}</p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-xs text-[#9AA0C0]">جزء {juzNumber}</p>
              <p className="text-xs text-[#7C5CFF] font-medium">{surahName}</p>
            </div>
          </div>

          {/* Ayah Range */}
          <div className="mb-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF] font-mono text-xl font-bold">
                  {startAyah}
                </div>
                <div className="text-center">
                  <div className="w-px h-8 bg-white/[0.1] mx-auto" />
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF] font-mono text-xl font-bold">
                  {endAyah}
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-[#9AA0C0]">نطاق الآيات</p>
                <p className="text-lg font-bold text-white font-mono">{startAyah} - {endAyah}</p>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div className="flex items-center gap-6 mb-4">
            <div className="relative flex-shrink-0">
              <ProgressRing
                pct={progress}
                size={100}
                stroke={10}
                color="#2DD4BF"
                centerLabel={`${currentAyah}/${targetAyah}`}
                className="flex-shrink-0"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <IconBadge icon={BookOpen} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/10" size={40} />
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#9AA0C0]">الهدف اليومي</span>
                <span className="font-mono font-bold text-white">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#7C5CFF] rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[#9AA0C0]">
                {currentAyah} / {targetAyah} آيات
                {progress >= 100 && <span className="ml-2 text-[#2DD4BF] font-medium">✓ تم الهدف اليومي</span>}
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between text-sm text-[#9AA0C0] mb-4">
            <div className="flex items-center gap-1">
              <CheckCircle size={14} className="text-[#2DD4BF]" aria-hidden />
              <span>{currentAyah} آيات مقروءة</span>
            </div>
            <div className="flex items-center gap-1">
              <BookOpen size={14} aria-hidden />
              <span>{totalAyahs} إجمالي السورة</span>
            </div>
          </div>

          {/* CTA Button */}
          <Button
            variant="primary"
            icon={Play}
            iconPosition="start"
            onClick={onContinue}
            className="w-full"
          >
            متابعة القراءة
          </Button>
        </div>
      </GlassCard>
    </Reveal>
  );
}