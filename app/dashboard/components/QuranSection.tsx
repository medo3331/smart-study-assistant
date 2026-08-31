"use client";

import { useState } from "react";
import { POPULAR_SURAHS, SURAH_NAMES, quranTrack } from "./audio-library";
import { useReciters } from "./use-reciters";
import { loadRecentSurah, rememberQuranTrack, type RecentSurah } from "./quran-recent";
import { useAudio } from "@/components/audio/AudioProvider";
import type { ThemeStyles } from "./types";

/* ==========================================================================
   خانة القرآن الكريم

   🗓️ ١٢ أغسطس: طلب المستخدم «خانة للقرآن الكريم في الداشبورد». القرآن كان
   موجود خلاص — بس مدفون جوه درج الإعدادات، فاللي مافتحش الدرج عمره ما
   عرف إنه موجود.

   الكارت ده **مختصر عن قصد**: آخر سورة سمعتها بضغطة واحدة، وستة سور
   مشهورة، ورابط للمكتبة الكاملة (١١٤ سورة × كل القرّاء + بحث). المكتبة
   نفسها مانسختش هنا — الكارت اختصار ليها مش بديل عنها.

   الصوت نفسه عايش في `AudioProvider` في الـ root layout، فالسورة اللي
   تبدأ من هنا بتكمّل معاك في أي صفحة في الموقع.
   ========================================================================== */

interface QuranSectionProps {
  themeStyles: ThemeStyles;
  /** بيفتح درج الإعدادات على قسم المكتبة الصوتية */
  onOpenLibrary: () => void;
}

/** ستة كفاية لصف واحد أو اتنين — الباقي في المكتبة. */
const CARD_SURAHS = 6;

export function QuranSection({ themeStyles, onOpenLibrary }: QuranSectionProps) {
  const { activeTrack, isPlaying, selectTrack } = useAudio();
  const { reciters, stale, failed } = useReciters(true);

  /* القراءة في إيفكت مش في مُهيّئ الحالة: الـ localStorage مش موجود على
     السيرفر، فالقراءة بدري بتخلّي رسمة السيرفر مختلفة عن المتصفح ويكسر
     الترطيب. */
  const [recent, setRecent] = useState<RecentSurah | null>(() => loadRecentSurah());


  /* القارئ: اللي المستخدم سمع بيه آخر مرة لو لسه في القايمة، وإلا أول
     واحد فيها. ⚠️ الرابط بيتبني من القايمة اللي جاية من الراوت بتاعنا —
     الستوريج بيخزّن أرقام بس، عمره ما بيخزّن URL. */
  const reciter =
    reciters?.find((r) => recent && r.id === recent.reciterId) ?? reciters?.[0] ?? null;

  const play = (surah: number) => {
    if (!reciter) return;
    const track = quranTrack(reciter, surah);
    rememberQuranTrack(track);
    // الحالة المحلية بتتحدّث كمان عشان صف «كمّل» يتبع الضغطة على طول،
    // مش بعد ريفريش — الستوريج مالوش أي إشعار بيرجع لـ React.
    setRecent({ reciterId: reciter.id, surah });
    selectTrack(track);
  };

  const surahName = (n: number) => SURAH_NAMES[n - 1] ?? String(n);

  /* السطر تحت العنوان. لازم يعرف عن الفشل: لولا كده كان بيفضل يقول
     «بيحمّل القرّاء…» للأبد جوه كارت التنويه تحته بيقول إن الجيب وقع —
     سطرين متناقضين في نفس الكارت، واللي مش شايف التنويه (أو مستنّي)
     كان هيفضل مستنّي حاجة عمرها ما جاية. */
  const subtitle = reciter ? reciter.name : failed ? "مش متاح دلوقتي" : "بيحمّل القرّاء…";

  /** التراك ده هو المختار حالياً في المشغّل؟ */
  const isChosen = (surah: number) =>
    reciter !== null && activeTrack?.id === `quran:${reciter.id}:${surah}`;

  const popular = reciter
    ? POPULAR_SURAHS.filter((n) => reciter.surahs.includes(n)).slice(0, CARD_SURAHS)
    : [];

  // آخر سورة بتتعرض بس لو القارئ عنده السورة دي فعلاً — القرّاء الناقصين
  // موجودين، ومافيش فايدة من زرار بيشغّل ٤٠٤.
  const resumeSurah =
    recent && reciter && reciter.surahs.includes(recent.surah) ? recent.surah : null;

  return (
    <div className="sheet-card p-5" id="quran">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="eyebrow eyebrow-flush">القرآن الكريم</p>
          <p className="mono text-ink-soft mt-1 m-0">
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="mono px-3 py-2 rounded-[var(--r-sm)] border border-rule bg-paper text-ink-soft hover:text-ink hover:bg-paper-3 transition"
        >
          كل السور والقرّاء
        </button>
      </div>

      {/* الحالة بتتغيّر بعد نداء شبكة — من غير live region، اللي بيسمع
          الصفحة مش هيعرف إن التحميل خلص أو وقع. */}
      <div role="status" aria-live="polite">
        {failed && (
          <div className="notice notice-error text-[11px]">
            <p className="m-0">
              مش قادر أجيب قائمة القرّاء دلوقتي. اتأكد من النت وحدّث الصفحة.
            </p>
          </div>
        )}

        {!reciters && !failed && (
          <div className="space-y-2" aria-busy="true">
            <p className="sr-only">بيحمّل قائمة القرّاء</p>
            <div className="skel skel-line w-full" />
            <div className="skel skel-line w-2/3" />
          </div>
        )}
      </div>

      {reciter && (
        <div className="space-y-3">
          {stale && (
            <p className="text-[11px] text-ink-soft leading-relaxed m-0">
              دي قائمة قرّاء مختصرة — الخدمة مش راضية ترد دلوقتي.
            </p>
          )}

          {/* ---- كمّل آخر سورة ----
               ⚠️ `aria-pressed` بتوصف «دي المختارة؟» مش «بتشتغل؟». سورة
               مختارة ومتوقفة لسه مضغوطة، واللي بيقول بتشتغل ولا لأ هو
               النص اللي جوه الزرار والمشغّل العايم. */}
          {resumeSurah !== null && (
            <button
              type="button"
              onClick={() => play(resumeSurah)}
              aria-pressed={isChosen(resumeSurah)}
              className={`w-full flex items-center gap-3 p-3 rounded-[var(--r-sm)] border text-right transition ${
                isChosen(resumeSurah)
                  ? "bg-emerald-950 border-emerald-500 text-emerald-400"
                  : "bg-paper border-rule text-ink hover:border-rule-strong hover:bg-paper-3"
              }`}
            >
              <span
                aria-hidden
                className={`w-10 h-10 shrink-0 rounded-[var(--r-sm)] flex items-center justify-center text-lg ${
                  isChosen(resumeSurah)
                    ? "bg-emerald-500 text-onmarker"
                    : `${themeStyles.accentBg} text-onmarker`
                }`}
              >
                {isChosen(resumeSurah) && isPlaying ? "⏸" : "▶"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="tag mb-0.5">
                  {isChosen(resumeSurah) && isPlaying ? "بتشتغل" : "كمّل من آخر مرة"}
                </span>
                <span className="block text-sm font-bold truncate">
                  سورة {surahName(resumeSurah)}
                </span>
              </span>
            </button>
          )}

          {/* ---- سور بضغطة ---- */}
          {popular.length > 0 && (
            <div className="space-y-1.5">
              <p className="tag">الأكثر سماعاً</p>
              <div className="flex flex-wrap gap-1.5">
                {popular.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => play(n)}
                    aria-pressed={isChosen(n)}
                    className={`pill transition ${
                      isChosen(n)
                        ? `${themeStyles.accentBg} text-onmarker`
                        : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {surahName(n)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {resumeSurah === null && (
            <p className="text-[11px] text-ink-soft leading-relaxed m-0">
              اختار سورة وهي تكمّل معاك في أي صفحة في الموقع — حتى وإنت جوه درس.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
