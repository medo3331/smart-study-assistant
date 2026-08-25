"use client";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { NextPrayerCard } from "@/components/worship/NextPrayerCard";
import { TodaysWorshipCards } from "@/components/worship/TodaysWorshipCards";
import { QuranWirdCard } from "@/components/worship/QuranWirdCard";
import { DailyProgress } from "@/components/worship/DailyProgress";
import { PrayerTimesList } from "@/components/worship/PrayerTimesList";
import { TasbihCounter } from "@/components/worship/TasbihCounter";
import { QiblaCard } from "@/components/worship/QiblaCard";
import { Reveal } from "@/components/ui/Reveal";
import { mockNavItems, mockUser } from "@/lib/mock-data";
import { useIslamicSettings } from "@/hooks/useIslamicSettings";
import { useTodayPrayerTimes } from "@/hooks/usePrayerTimes";
import {
  getCompletedPrayers,
  getAdhkarProgress,
  getQuranProgress,
  getDailyWorshipProgress,
} from "@/lib/islamic/worship-progress";
import {
  generateDailyProgressItems,
} from "@/lib/islamic/utils";
import { QuranAudioPlayer } from "@/components/worship/QuranAudioPlayer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Main Worship Dashboard Page
 * /worship
 *
 * Uses:
 * - useIslamicSettings for centralized settings
 * - useTodayPrayerTimes for real AlAdhan data
 * - worship-progress abstraction for persisted daily progress
 */
export default function WorshipPage() {
  const navItems = mockNavItems.map((item) =>
    item.href === "/worship"
      ? { ...item, active: true }
      : { ...item, active: false }
  );

  const { settings, isLoaded: settingsLoaded } = useIslamicSettings();

  const { data: prayerTimes, isLoading, error } = useTodayPrayerTimes(
    settings.latitude,
    settings.longitude,
    settings.timezone,
    settings.calculationMethod,
    settings.madhab
  );

  // Derive next prayer from API data
  const nextPrayer = prayerTimes?.nextPrayer ?? null;

  // Get persisted progress
  const completedPrayers = new Set(getCompletedPrayers());
  const morningProgress = getAdhkarProgress("morning");
  const eveningProgress = getAdhkarProgress("evening");
  const quranProgress = getQuranProgress();
  const completedAdhkar = new Set<string>();
  if (morningProgress.completed) completedAdhkar.add("morning");
  if (eveningProgress.completed) completedAdhkar.add("evening");

  const totalAdhkarCount = morningProgress.count + eveningProgress.count;

  // Generate daily progress items
  const nextPrayerIndex = prayerTimes?.times?.findIndex((p) => p.isNext) ?? 0;
  const dailyProgressItems = generateDailyProgressItems(
    prayerTimes?.times?.map((p) => p.time) ?? [],
    nextPrayerIndex >= 0 ? nextPrayerIndex : 0,
    completedPrayers,
    completedAdhkar
  );

  const currentDate = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (isLoading || !settingsLoaded) {
    return (
      <div className="flex min-h-screen bg-[#07091A]">
        <Sidebar items={navItems} user={mockUser} />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem)] md:pb-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7C5CFF]"></div>
              <span className="ml-3 text-[#9AA0C0]">جاري تحميل مواقيت الصلاة...</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen bg-[#07091A]">
        <Sidebar items={navItems} user={mockUser} />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem)] md:pb-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div className="text-center py-12">
              <p className="text-[#FB923C]">⚠️ {error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-[#7C5CFF] text-white rounded-lg hover:bg-[#6A4CE8] transition-colors"
              >
                إعادة المحاولة
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#07091A]">
      <Sidebar items={navItems} user={mockUser} />

      <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem)] md:pb-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {/* Header / Greeting */}
          <Reveal index={0}>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">
                  السلام عليكم، {mockUser.name} 👋
                </h1>
                <Link href="/worship/settings">
                  <button
                    aria-label="إعدادات العبادات"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-[#9AA0C0] hover:text-[#E7E9F5] hover:bg-white/[0.06] transition-colors"
                  >
                    ⚙️
                  </button>
                </Link>
              </div>
              <p className="text-[#B69CFF]">
                نسأل الله لك يومًا مباركًا مليئًا بالطاعات والتوفيق
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-[#9AA0C0]">
                <span>📅 {currentDate}</span>
                <span>🌙 {prayerTimes?.hijriDate}</span>
                <span>📍 {prayerTimes?.location ?? "غير محدد"}</span>
              </div>
            </section>
          </Reveal>

          {/* Today's worship progress summary */}
          <Reveal index={1}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">عباداتي اليوم</h2>
              <div className="text-left">
                <span className="font-mono font-bold text-[#2DD4BF]">
                  {getDailyWorshipProgress()}%
                </span>
                <span className="text-xs text-[#9AA0C0]"> مكتمل</span>
              </div>
            </div>
          </Reveal>

          {/* Next Prayer — HERO CARD */}
          <Reveal index={2}>
            {nextPrayer ? (
              <NextPrayerCard
                prayer={nextPrayer}
                location={prayerTimes?.location ?? "غير محدد"}
              />
            ) : (
              <NextPrayerCard
                prayer={null}
                location={prayerTimes?.location ?? "غير محدد"}
              />
            )}
          </Reveal>

          {/* Today's Worship Quick Cards */}
          <Reveal index={3}>
            <TodaysWorshipCards
              prayerProgress={{
                current: completedPrayers.size,
                target: 5,
                completed: completedPrayers.size >= 5,
              }}
              adhkarProgress={{
                current: totalAdhkarCount,
                target: 66, // morning(33) + evening(33) + more
                completed: morningProgress.completed && eveningProgress.completed,
              }}
              quranProgress={{
                current: quranProgress.dailyCount,
                target: settings.quranDailyTarget,
                completed: quranProgress.dailyCount >= settings.quranDailyTarget,
                surahName: "البقرة",
              }}
            />
          </Reveal>

          {/* Quran Daily Wird Card */}
          <Reveal index={4}>
            <QuranWirdCard
              surahName="Al-Baqarah"
              arabicSurahName="سورة البقرة"
              currentAyah={quranProgress.dailyCount}
              targetAyah={settings.quranDailyTarget}
              totalAyahs={286}
              progress={
                settings.quranDailyTarget > 0
                  ? (quranProgress.dailyCount / settings.quranDailyTarget) * 100
                  : 0
              }
              juzNumber={1}
              onContinue={() => {
                window.location.href = "/worship/quran";
              }}
              index={0}
            />
          </Reveal>

          {/* Daily Progress Tracker */}
          <Reveal index={5}>
            <DailyProgress
              items={dailyProgressItems}
              title="إنجازاتك اليوم"
              subtitle="تتبع عباداتك اليومية بكل سهولة ويسر"
            />
          </Reveal>

          {/* Full prayer times list */}
          <Reveal index={6}>
            {prayerTimes && (
              <PrayerTimesList
                data={prayerTimes}
                onSettingsClick={() => {
                  window.location.href = "/worship/settings";
                }}
              />
            )}
          </Reveal>

          {/* Tasbih counter + Qibla direction */}
          <div id="tasbih" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TasbihCounter index={7} />
            <QiblaCard index={8} />
          </div>

          {/* Quick Actions */}
          <Reveal index={9}>
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-white">الوصول السريع</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Link href="/worship/quran">
                  <button className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-[#2DD4BF]/20 transition-all text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF]">
                      📖
                    </span>
                    <span className="text-sm font-medium text-white">القرآن</span>
                  </button>
                </Link>
                <Link href="/worship/adhkar">
                  <button className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-[#7C5CFF]/20 transition-all text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C5CFF]/15 text-[#7C5CFF]">
                      🤲
                    </span>
                    <span className="text-sm font-medium text-white">الأذكار</span>
                  </button>
                </Link>
                <Link href="/worship/prayer-times">
                  <button className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-[#FB923C]/20 transition-all text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FB923C]/15 text-[#FB923C]">
                      🕌
                    </span>
                    <span className="text-sm font-medium text-white">مواقيت الصلاة</span>
                  </button>
                </Link>
                <Link href="/worship#tasbih">
                  <button className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-[#2DD4BF]/20 transition-all text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF]">
                      📿
                    </span>
                    <span className="text-sm font-medium text-white">التسبيح</span>
                  </button>
                </Link>
              </div>
            </section>
          </Reveal>
        </div>
      </main>

      {/* MobileNav + Sticky Audio Player */}
      <MobileNav />
      <QuranAudioPlayer />
    </div>
  );
}
