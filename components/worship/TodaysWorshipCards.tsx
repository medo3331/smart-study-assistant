"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { IconBadge } from "@/components/ui/IconBadge";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Sun, BookOpen, CheckCircle, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface WorshipCardProps {
  title: string;
  arabicTitle: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  progress: number;
  target: number;
  current: number;
  unit: string;
  completed: boolean;
  ctaText?: string;
  ctaHref?: string;
  index: number;
  children?: React.ReactNode;
}

/**
 * Individual worship card for Prayer, Adhkar, Quran
 */
export function WorshipCard({
  title,
  arabicTitle,
  icon: Icon,
  iconColor,
  iconBg,
  progress,
  target,
  current,
  unit,
  completed,
  ctaText,
  ctaHref,
  index,
  children,
}: WorshipCardProps) {
  return (
    <Reveal index={index}>
      <GlassCard className="p-5 h-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconBadge icon={Icon} color={iconColor} bg={iconBg} size={44} />
            <div>
              <p className="text-xs text-[#9AA0C0]">{title}</p>
              <p className="text-lg font-bold text-white">{arabicTitle}</p>
            </div>
          </div>
          {completed && (
            <div className="flex-shrink-0 flex items-center justify-center">
              <IconBadge icon={CheckCircle} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={32} />
            </div>
          )}
        </div>

        {children && <div className="mt-4">{children}</div>}

        {!children && (
          <div className="mt-4 space-y-3">
            {/* Progress Ring + Stats */}
            <div className="flex items-center gap-4">
              <ProgressRing
                pct={progress}
                size={80}
                stroke={8}
                color={iconColor.replace("text-", "").replace("[", "").replace("]", "")}
                centerLabel={`${current}/${target}`}
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[#9AA0C0]">التقدم</span>
                  <span className="font-mono font-bold text-white">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r rounded-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      background: `linear-gradient(90deg, ${iconColor.replace("text-", "")}80, ${iconColor.replace("text-", "")})`,
                    }}
                  />
                </div>
                <p className="text-xs text-[#9AA0C0]">
                  {current} / {target} {unit}
                  {completed && <span className="ml-2 text-[#2DD4BF] font-medium">✓ مكتمل</span>}
                </p>
              </div>
            </div>

            {ctaText && ctaHref && (
              <a href={ctaHref}>
                <Button variant="ghost" className="w-full justify-center">
                  {ctaText}
                </Button>
              </a>
            )}
          </div>
        )}
      </GlassCard>
    </Reveal>
  );
}

interface TodaysWorshipCardsProps {
  prayerProgress: { current: number; target: number; completed: boolean };
  adhkarProgress: { current: number; target: number; completed: boolean };
  quranProgress: { current: number; target: number; completed: boolean; surahName: string };
}

/**
 * Today's Worship section - three cards for Prayer, Adhkar, Quran
 */
export function TodaysWorshipCards({
  prayerProgress,
  adhkarProgress,
  quranProgress,
}: TodaysWorshipCardsProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">عباداتي اليوم</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Prayer Card */}
        <WorshipCard
          index={0}
          title="الصلاة"
          arabicTitle="الصلوات المفروضة"
          icon={Sun}
          iconColor="text-[#FB923C]"
          iconBg="bg-[#FB923C]/15"
          progress={prayerProgress.target > 0 ? (prayerProgress.current / prayerProgress.target) * 100 : 0}
          target={prayerProgress.target}
          current={prayerProgress.current}
          unit="صلاة"
          completed={prayerProgress.completed}
          ctaText="مواقيت الصلاة"
          ctaHref="/worship/prayer-times"
        />

        {/* Adhkar Card */}
        <WorshipCard
          index={1}
          title="الأذكار"
          arabicTitle="أذكار الصباح والمساء"
          icon={Sparkles}
          iconColor="text-[#7C5CFF]"
          iconBg="bg-[#7C5CFF]/15"
          progress={adhkarProgress.target > 0 ? (adhkarProgress.current / adhkarProgress.target) * 100 : 0}
          target={adhkarProgress.target}
          current={adhkarProgress.current}
          unit="ذكر"
          completed={adhkarProgress.completed}
          ctaText="فتح الأذكار"
          ctaHref="/worship/adhkar"
        />

        {/* Quran Card */}
        <WorshipCard
          index={2}
          title="القرآن"
          arabicTitle={`ورد القرآن - ${quranProgress.surahName}`}
          icon={BookOpen}
          iconColor="text-[#2DD4BF]"
          iconBg="bg-[#2DD4BF]/15"
          progress={quranProgress.target > 0 ? (quranProgress.current / quranProgress.target) * 100 : 0}
          target={quranProgress.target}
          current={quranProgress.current}
          unit="آية"
          completed={quranProgress.completed}
          ctaText="متابعة القراءة"
          ctaHref="/worship/quran"
        />
      </div>
    </section>
  );
}