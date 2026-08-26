"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  NextPrayerCard,
} from "@/components/worship/NextPrayerCard";
import { TodaysWorshipCards } from "@/components/worship/TodaysWorshipCards";
import { QuranWirdCard } from "@/components/worship/QuranWirdCard";
import { DailyProgress } from "@/components/worship/DailyProgress";
import { PrayerTimesList } from "@/components/worship/PrayerTimesList";
import { TasbihCounter } from "@/components/worship/TasbihCounter";
import { QiblaCard } from "@/components/worship/QiblaCard";
import {
  WorshipChrome,
  useSharedWorshipData,
  useWorshipReward,
} from "@/components/worship/WorshipChrome";
import { Reveal } from "@/components/ui/Reveal";
import { useTodayPrayerTimes } from "@/hooks/usePrayerTimes";
import type { WorshipDayRecord } from "@/lib/islamic/worship-progress";
import { generateDailyProgressItems } from "@/lib/islamic/utils";
import type { DailyProgressItem } from "@/lib/islamic/types";
import { todayUtc } from "@/lib/worship-data";
import {
  WORSHIP_REWARD_LABELS,
} from "@/lib/worship-rewards";

/**
 * Main Worship Dashboard Page — /worship
 *
 * كل الأرقام حقيقية:
 * • المستخدم من جلسة Supabase (WorshipChrome).
 * • المواقيت من AlAdhan بإعدادات المستخدم المحفوظة.
 * • التقدّم من worship-progress المحلي مدموج مع worship_progress في الداتابيز.
 * • الكوينز والسلسلة من الداتابيز، والمكافأة بتظهر بعد تأكيد السيرفر فقط.
 */
export default function WorshipPage() {
  return (
    <WorshipChrome>
      <WorshipHome />
    </WorshipChrome>
  );
}

function WorshipHome() {
  const shared = useSharedWorshipData();
  const { showReward } = useWorshipReward();

  const settings = shared?.settings;
  const settingsLoaded = !!settings;

  const { data: prayerTimes, isLoading, error } = useTodayPrayerTimes(
    settings?.latitude,
    settings?.longitude,
    settings?.timezone,
    settings?.calculationMethod,
    settings?.madhab,
  );

  /* ── أحداث العبادة → مكافآت award_coins (مراجع حتمية يوم UTC) ────────── */

  /** إتمام صلاة مفروضة: +٣ لكل صلاة (سقف ٥/يوم من قواعد الداتابيز). */
  const completePrayer = useCallback(
    async (prayerId: string) => {
      if (!shared || !shared.user || shared.user.is_anonymous) return;
      const day = todayUtc();
      await shared.recordEvent(
        (d) => ({ ...d, prayers: { ...d.prayers, [prayerId]: true } }),
        "worship_prayer",
        `${day}-${prayerId}`,
        { activity: "prayer", prayer: prayerId, date: day },
        (reward) => showReward(reward.coins),
      );
    },
    [shared, showReward],
  );

  /** إتمام هدف ذكر (تصنيف كامل): +٣ لكل تصنيف (سقف ٣/يوم). */
  const completeDhikrTarget = useCallback(
    async (category: string, count: number) => {
      if (!shared || !shared.user || shared.user.is_anonymous) return;
      const day = todayUtc();
      await shared.recordEvent(
        (day2) => ({
          ...day2,
          adhkar: {
            ...day2.adhkar,
            [category]: { completed: true, count },
          },
        }),
        "worship_adhkar",
        `${day}-${category}`,
        { activity: "adhkar", category, date: day },
        (reward) => showReward(reward.coins),
      );
    },
    [shared, showReward],
  );

  /** بلوغ ورد القرآن اليومي: +٥ مرة واحدة يوميًا عند بلوغ الهدف الفعلي. */
  const claimQuranWird = useCallback(async () => {
    if (!shared || !shared.user || shared.user.is_anonymous) return;
    const day = todayUtc();
    await shared.recordEvent(
      () => shared.progress,
      "worship_quran",
      day,
      { activity: "quran", date: day, ayahs: shared.progress.quran.dailyCount },
      (reward) => showReward(reward.coins),
    );
  }, [shared, showReward]);

  /** مضاعفة هدف القرآن — نفس المصدر والمرجع اليومي، فالسيرفر بيرفضها بهدوء. */
  const claimQuranGoal = useCallback(async () => {
    if (!shared || !shared.user || shared.user.is_anonymous) return;
    const day = todayUtc();
    await shared.recordEvent(
      () => shared.progress,
      "worship_quran",
      day,
      { activity: "quran", date: day, ayahs: shared.progress.quran.dailyCount },
      (reward) => showReward(reward.coins),
    );
  }, [shared, showReward]);

  /** إتمام يوم العبادة الكامل — بدون مصدر مخصص في هذه المرحلة؛ التقدّم يُسجل فقط. */
  const claimDayComplete = useCallback(async () => {
    // مقصود: مفيش مكافأة مستقلة لإتمام اليوم كله في قواعد coin_source_rules
    // الحالية. الحدث بيتسجّل في تقدّم العبادة بس.
  }, []);

  /** معالج الأزرار في «إنجازاتك اليوم». */
  const handleCompleteItem = useCallback(
    (item: DailyProgressItem) => {
      if (item.completed || !item.id) return;
      if (
        ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(item.id)
      ) {
        void completePrayer(item.id);
      } else if (item.id === "morning_adhkar") {
        void completeDhikrTarget("morning", 33);
      } else if (item.id === "evening_adhkar") {
        void completeDhikrTarget("evening", 33);
      } else if (item.id === "sleep_adhkar") {
        // أذكار النوم حدث تتبّع بدون مكافأة مستقلة — ضمن أذكار اليوم.
        void completeDhikrTarget("sleep", 10);
      }
    },
    [completePrayer, completeDhikrTarget],
  );

  /* ── الحالات ────────────────────────────────────────────────────────── */
  if (!settingsLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#7C5CFF]" />
        <span className="ml-3 text-[#9AA0C0]">جاري تحميل مواقيت الصلاة…</span>
      </div>
    );
  }

  if (error || !shared) {
    return (
      <div className="py-12 text-center">
        <p className="text-[#FB923C]">⚠️ {error ?? "تعذر تحميل بيانات العبادة."}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-[#7C5CFF] px-4 py-2 text-white transition-colors hover:bg-[#6A4CE8]"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const progress = shared.progress;
  const completedPrayers = new Set(
    Object.entries(progress.prayers)
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
  const morningCount = progress.adhkar["morning"]?.count ?? 0;
  const eveningCount = progress.adhkar["evening"]?.count ?? 0;
  const morningCompleted =
    progress.adhkar["morning"]?.completed ||
    (shared.summary?.cloud.adhkar["morning"] ?? 0) >= 33;
  const eveningCompleted =
    progress.adhkar["evening"]?.completed ||
    (shared.summary?.cloud.adhkar["evening"] ?? 0) >= 33;

  const quranDailyCount = progress.quran.dailyCount;
  const quranTarget = settings!.quranDailyTarget;
  const quranWirdDone = quranDailyCount >= quranTarget && quranTarget > 0;

  const nextPrayerIndex = prayerTimes?.times?.findIndex((p) => p.isNext) ?? 0;
  const dailyProgressItems = generateDailyProgressItems(
    prayerTimes?.times?.map((p) => p.time) ?? [],
    nextPrayerIndex >= 0 ? nextPrayerIndex : 0,
    completedPrayers,
    new Set<string>(
      [
        morningCompleted ? "morning" : null,
        eveningCompleted ? "evening" : null,
      ].filter((x): x is string => !!x),
    ),
  );

  const currentDate = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const prayersDoneCount = ["fajr", "dhuhr", "asr", "maghrib", "isha"].filter(
    (p) => completedPrayers.has(p),
  ).length;
  const dayComplete =
    prayersDoneCount === 5 &&
    morningCompleted &&
    eveningCompleted &&
    quranWirdDone;

  return (
    <>
      {/* Header / Greeting */}
      <Reveal index={0}>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              السلام عليكم، {shared.profile?.name ?? ""} 👋
            </h1>
            <Link
              href="/worship/settings"
              aria-label="إعدادات العبادات"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-[#9AA0C0] transition-colors hover:bg-white/[0.06] hover:text-[#E7E9F5]"
            >
              ⚙️
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

      {/* ملخص النهارده — كل الأرقام من الداتابيز */}
      <Reveal index={1}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white">عباداتي اليوم</h2>
          <div className="flex flex-wrap items-center gap-3 text-left">
            {shared.isCloudReady && (
              <>
                <span className="rounded-full border border-[#FFD54D]/25 bg-[#FFD54D]/[0.07] px-3 py-1 font-mono text-sm font-bold text-[#FFD54D]">
                  🪙 <bdi>{shared.coinsBalance}</bdi>
                </span>
                <span className="text-xs text-[#9AA0C0]">
                  اليوم: <bdi>+{shared.coinsToday}</bdi> 🪙
                </span>
                <span className="text-xs text-[#FB923C]">
                  🔥 سلسلة <bdi>{shared.streak}</bdi> يوم
                </span>
              </>
            )}
            <span className="font-mono font-bold text-[#2DD4BF]">
              {getDailyPercent(
                prayersDoneCount,
                morningCompleted,
                eveningCompleted,
                Math.min(quranDailyCount, Math.max(quranTarget, 1)),
                quranTarget,
              )}
              %
            </span>
            <span className="text-xs text-[#9AA0C0]"> مكتمل</span>
          </div>
        </div>
      </Reveal>

      {/* Next Prayer — HERO CARD */}
      <Reveal index={2}>
        <NextPrayerCard
          prayer={prayerTimes?.nextPrayer ?? null}
          location={prayerTimes?.location ?? "غير محدد"}
        />
      </Reveal>

      {/* Today's Worship Quick Cards */}
      <Reveal index={3}>
        <TodaysWorshipCards
          prayerProgress={{
            current: prayersDoneCount,
            target: 5,
            completed: prayersDoneCount >= 5,
          }}
          adhkarProgress={{
            current: morningCount + eveningCount,
            target: 66,
            completed: morningCompleted && eveningCompleted,
          }}
          quranProgress={{
            current: quranDailyCount,
            target: quranTarget,
            completed: quranWirdDone,
            surahName: "البقرة",
          }}
        />
      </Reveal>

      {/* Quran Daily Wird Card */}
      <Reveal index={4}>
        <QuranWirdCard
          surahName="Al-Baqarah"
          arabicSurahName="سورة البقرة"
          currentAyah={quranDailyCount}
          targetAyah={quranTarget}
          totalAyahs={286}
          progress={
            quranTarget > 0 ? (quranDailyCount / quranTarget) * 100 : 0
          }
          juzNumber={1}
          onContinue={() => {
            window.location.href = "/worship/quran";
          }}
          index={0}
        />
      </Reveal>

      {/* Daily Progress Tracker — أزرار إتمام حقيقية */}
      <Reveal index={5}>
        <DailyProgress
          items={dailyProgressItems}
          title="إنجازاتك اليوم"
          subtitle="اضغط على أي عبادة لتسجيل إتمامها — المكافأة بتتأكد من السيرفر"
          onCompleteItem={handleCompleteItem}
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Link href="/worship/quran">
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#2DD4BF]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-xl text-[#2DD4BF]">
                  📖
                </span>
                <span className="text-sm font-medium text-white">القرآن</span>
              </button>
            </Link>
            <Link href="/worship/adhkar">
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#7C5CFF]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C5CFF]/15 text-xl text-[#7C5CFF]">
                  🤲
                </span>
                <span className="text-sm font-medium text-white">الأذكار</span>
              </button>
            </Link>
            <Link href="/worship/prayer-times">
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#FB923C]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FB923C]/15 text-xl text-[#FB923C]">
                  🕌
                </span>
                <span className="text-sm font-medium text-white">مواقيت الصلاة</span>
              </button>
            </Link>
            <Link href="/worship#tasbih">
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#2DD4BF]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-xl text-[#2DD4BF]">
                  📿
                </span>
                <span className="text-sm font-medium text-white">التسبيح</span>
              </button>
            </Link>
          </div>
        </section>
      </Reveal>

      {/* Reward rules hint */}
      <Reveal index={10}>
        <p className="pb-2 text-center text-xs text-[#9AA0C0]/70">
          🪙 الصلاة +{WORSHIP_REWARD_LABELS.worship_prayer} • هدف ذكر +
          {WORSHIP_REWARD_LABELS.worship_adhkar} • ورد القرآن +
          {WORSHIP_REWARD_LABELS.worship_quran}
        </p>
      </Reveal>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* نسبة الإنجاز اليومية — محسوبة من التقدّم الفعلي                              */
/* -------------------------------------------------------------------------- */

function getDailyPercent(
  prayers: number,
  morning: boolean,
  evening: boolean,
  quranRead: number,
  quranTarget: number,
): number {
  const score =
    (Math.min(prayers, 5) / 5) * 40 +
    ((morning ? 1 : 0) + (evening ? 1 : 0)) * (25 / 2) +
    (quranTarget > 0 ? Math.min(quranRead / quranTarget, 1) * 20 : 0);
  return Math.round(Math.max(0, Math.min(100, score)));
}
