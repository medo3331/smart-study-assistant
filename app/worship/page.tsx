"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useLivePrayerTimes } from "@/hooks/useLivePrayerTimes";
import { generateDailyProgressItems } from "@/lib/islamic/utils";
import type { DailyProgressItem } from "@/lib/islamic/types";
import type { Surah } from "@/lib/islamic/types";
import { getAllSurahs } from "@/lib/islamic/quran";
import { localWorshipDate } from "@/lib/islamic/worship-progress";
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
 * • مراجع أيام المكافآت بيوم المستخدم المحلي (منطقة زمنية) — مرحلة العبادات ١.
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
  const [surahs, setSurahs] = useState<Surah[]>([]);
  // تنقّل client-side — window.location.href كان بيعمل full page reload
  // وبيقطع التلاوة الشغّالة (المشغّل معاه في الذاكرة بيفضى).
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void getAllSurahs().then((data) => {
      if (!cancelled) setSurahs(data);
    }).catch(() => {
      if (!cancelled) setSurahs([]);
    });
    return () => { cancelled = true; };
  }, []);

  const settings = shared?.settings;
  const settingsLoaded = !!settings;

  /* المواقيت الحيّة (useLivePrayerTimes): إعادة حساب كل دقيقة + تعويض
     drift عند الرجوع للتبويب — نفس مصدر الإعدادات (الإحداثيات/التوقيت). */
  const { data: prayerTimes, isLoading, error } = useLivePrayerTimes({
    latitude: settings?.latitude,
    longitude: settings?.longitude,
    timezone: settings?.timezone,
    calculationMethod: settings?.calculationMethod,
    madhab: settings?.madhab,
  });

  /* ── أحداث العبادة → مكافآت award_coins (مراجع يوم المستخدم المحلي) ──── */

  /** إتمام صلاة مفروضة: +٣ لكل صلاة (سقف ٥/يوم من قواعد الداتابيز). */
  const completePrayer = useCallback(
    async (prayerId: string) => {
      if (!shared || !shared.user || shared.user.is_anonymous) return;
      const day = localWorshipDate(new Date(), settings!.timezone);
      await shared.recordEvent(
        (d) => ({ ...d, prayers: { ...d.prayers, [prayerId]: true } }),
        "worship_prayer",
        `${day}-${prayerId}`,
        { activity: "prayer", prayer: prayerId, date: day },
        (reward) => showReward(reward.coins),
      );
    },
    [shared, showReward, settings?.timezone],
  );

  /** إتمام هدف ذكر (تصنيف كامل): +٣ لكل تصنيف (سقف ٣/يوم). */
  const completeDhikrTarget = useCallback(
    async (category: string, count: number) => {
      if (!shared || !shared.user || shared.user.is_anonymous) return;
      const day = localWorshipDate(new Date(), settings!.timezone);
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
    [shared, showReward, settings?.timezone],
  );

  /** إكمال ورد القرآن من قائمة المهام — نفس مرجع اليوم عشان مفيش صرف مزدوج. */
  const completeQuranWird = useCallback(
    async () => {
      if (!shared || !shared.user || shared.user.is_anonymous) return;
      const day = localWorshipDate(new Date(), settings!.timezone);
      const target = settings?.quranDailyTarget ?? 10;
      await shared.recordEvent(
        (d) => ({
          ...d,
          quran: {
            ...d.quran,
            dailyCount: Math.max(d.quran.dailyCount, target),
          },
        }),
        "worship_quran",
        day,
        { activity: "quran-wird", date: day, manual: true },
        (reward) => showReward(reward.coins),
      );
    },
    [shared, showReward, settings?.quranDailyTarget, settings?.timezone],
  );

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
      } else if (item.id === "quran_wird") {
        void completeQuranWird();
      }
    },
    [completePrayer, completeDhikrTarget, completeQuranWird],
  );

  /* ── الحالات ────────────────────────────────────────────────────────── */
  if (!settingsLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#10B981]" />
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
          className="mt-4 rounded-lg bg-[#10B981] px-4 py-2 text-white transition-colors hover:bg-[#059669]"
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
  const readingSurah = surahs.find((surah) => surah.id === progress.quran.surahId);
  const readingPosition = progress.quran.updatedAt
    ? `${readingSurah?.arabicName ?? `السورة ${progress.quran.surahId}`} — الآية ${progress.quran.ayahId}${readingSurah ? ` من ${readingSurah.ayahCount}` : ""}`
    : "افتح المصحف لتسجيل موضع القراءة";

  // قائمة المهام بتعرض الصلوات المفروضة فقط — الشروق مش صلاة.
  const prayerOnlyTimes = prayerTimes?.times.filter((prayer) => prayer.name !== "Sunrise") ?? [];
  const nextPrayerOnlyIndex = prayerOnlyTimes.findIndex((prayer) => prayer.isNext);
  const effectiveNextPrayerIndex = nextPrayerOnlyIndex >= 0
    ? nextPrayerOnlyIndex
    : prayerTimes?.times.find((prayer) => prayer.name === "Sunrise" && prayer.isNext)
      ? 1
      : 0;
  const dailyProgressItems = generateDailyProgressItems(
    prayerOnlyTimes.map((prayer) => prayer.time),
    effectiveNextPrayerIndex,
    completedPrayers,
    new Set<string>(
      [
        morningCompleted ? "morning" : null,
        eveningCompleted ? "evening" : null,
      ].filter((x): x is string => !!x),
    ),
    quranWirdDone,
    `${Math.min(quranDailyCount, quranTarget)}/${quranTarget} آية`,
  );

  const currentDate = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: settings!.timezone,
  });

  const prayersDoneCount = ["fajr", "dhuhr", "asr", "maghrib", "isha"].filter(
    (p) => completedPrayers.has(p),
  ).length;

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
          <p className="text-[#6EE7B7]">
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
            <span className="font-mono font-bold text-[#34D399]">
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
            surahName: readingSurah?.arabicName ?? `السورة ${progress.quran.surahId}`,
          }}
        />
      </Reveal>

      {/* Quran Daily Wird Card */}
      <Reveal index={4}>
        <QuranWirdCard
          surahName={readingSurah?.name ?? "Al-Fatihah"}
          arabicSurahName={readingSurah?.arabicName ?? `السورة ${progress.quran.surahId}`}
          currentAyah={quranDailyCount}
          targetAyah={quranTarget}
          totalAyahs={readingSurah?.ayahCount ?? 286}
          progress={
            quranTarget > 0 ? (quranDailyCount / quranTarget) * 100 : 0
          }
          juzNumber={readingSurah?.juzNumber ? readingSurah.juzNumber : 1}
          readingPosition={readingPosition}
          onContinue={() => {
            router.push("/worship/quran");
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
            completedPrayers={completedPrayers}
            onCompletePrayer={(prayer) => {
              if (!shared || completedPrayers.has(prayer)) return;
              const day = localWorshipDate(new Date(), settings!.timezone);
              const updatePrayer = (record: typeof progress) => ({
                ...record,
                prayers: { ...record.prayers, [prayer]: true },
              });
              if (!shared.user || shared.user.is_anonymous) {
                shared.updateProgress(updatePrayer);
                return;
              }
              void shared.recordEvent(
                updatePrayer,
                "worship_prayer",
                `${day}-${prayer}`,
                { activity: "prayer", prayer, date: day },
                (reward) => showReward(reward.coins),
              );
            }}
            onSettingsClick={() => {
              router.push("/worship/settings");
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
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#34D399]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#34D399]/15 text-xl text-[#34D399]">
                  📖
                </span>
                <span className="text-sm font-medium text-white">القرآن</span>
              </button>
            </Link>
            <Link href="/worship/adhkar">
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#10B981]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#10B981]/15 text-xl text-[#10B981]">
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
              <button className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 text-center transition-all hover:border-[#34D399]/20 hover:bg-white/[0.04]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#34D399]/15 text-xl text-[#34D399]">
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
