"use client";

import { useEffect } from "react";
import { QuranReader } from "@/components/worship/QuranReader";
import { ReciterSelector } from "@/components/worship/ReciterSelector";
import {
  WorshipChrome,
  useSharedWorshipData,
  useWorshipReward,
} from "@/components/worship/WorshipChrome";
import { SoundLibrary } from "@/app/dashboard/components/SoundLibrary";
import { THEME_STYLES } from "@/app/dashboard/components/theme-helpers";
import { todayUtc } from "@/lib/worship-data";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Quran Reader Page — /worship/quran
 *
 * القراءة بتتحفظ على حساب المستخدم (موضع + عدّاد آيات النهارده)، وبلوغ
 * الورد/مضاعفة الهدف بيصرف مكافأة مؤكدة من السيرفر.
 */
export default function QuranPage() {
  return (
    <WorshipChrome>
      <QuranHome />
    </WorshipChrome>
  );
}

function QuranHome() {
  const shared = useSharedWorshipData();
  const { showReward } = useWorshipReward();

  const target = shared?.settings.quranDailyTarget ?? 10;
  const readToday = shared?.progress.quran.dailyCount ?? 0;

  /* بلوغ ورد القرآن (+٥ مرة واحدة يوميًا) — الداتابيز بتتحقق من الهدف
     المحفوظ وبتمنع التكرار بالمرجع اليومي. */
  useEffect(() => {
    if (!shared || !shared.user || shared.user.is_anonymous) return;
    let cancelled = false;

    void (async () => {
      if (cancelled || target <= 0 || readToday < target) return;
      const day = todayUtc();
      await shared.recordEvent(
        () => shared.progress,
        "worship_quran",
        day,
        { activity: "quran", date: day, ayahs: readToday },
        (r) => showReward(r.coins),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [shared, readToday, target, showReward]);

  return (
    <>
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">القرآن الكريم</h1>
          <p className="mt-1 text-[#9AA0C0]">
            قراءة وتلاوة وتدبر كتاب الله
            {target > 0 && (
              <span className="mr-2 text-[#9AA0C0]/80">
                • ورد اليوم:{" "}
                <bdi>
                  {readToday}/{target}
                </bdi>{" "}
                آية
              </span>
            )}
          </p>
        </div>
        <Link
          href="/worship"
          className="flex items-center gap-1 text-sm text-[#B69CFF] transition-colors hover:text-[#7C5CFF]"
        >
          <ArrowLeft size={18} aria-hidden />
          <span>عباداتي</span>
        </Link>
      </div>

      {/* Reciter quick-select bar + audio list */}
      <div className="flex-shrink-0">
        <ReciterSelector />

        {/* 🗓️ مكتبة التلاوة: كانت جوه درج الإعدادات في الداشبورد — انتقلت
            هنا (القرآن مكانها الطبيعي جنب الورد والقرّاء). التلاوة بتشتغل
            على المشغّل العائم العام فبتكمل في أي صفحة. */}
        <details className="mt-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white hover:text-[#B69CFF] transition-colors marker:content-none">
            🎧 مكتبة التلاوة — كل السور والقرّاء
          </summary>
          <div className="px-3 pb-3">
            <SoundLibrary themeStyles={THEME_STYLES.amber} enabledTabs={["quran"]} />
          </div>
        </details>

        <div className="mt-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-[#9AA0C0]">
          <span>قائمة صوتية: </span>
          <span className="text-[#2DD4BF]">عبد الله بصفر</span>,{" "}
          <span className="text-[#B69CFF]">مشاري العفاسي</span>,{" "}
          <span className="text-[#FB923C]">سعد الغامدي</span>
        </div>
      </div>

      {/* Quran Reader */}
      <div className="flex-1 overflow-hidden">
        <QuranReader
          initialSurahId={2}
          onProgressUpdate={() => {
            // الحفظ والمكافآت جوّه QuranReader عبر useQuranProgress المحدَّثة.
          }}
        />
      </div>
    </>
  );
}
