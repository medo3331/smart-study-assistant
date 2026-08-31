"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import {
  MUSIC_TRACKS,
  POPULAR_SURAHS,
  SURAH_NAMES,
  quranTrack,
  type SoundTrack,
} from "./audio-library";
import { useReciters } from "./use-reciters";
import { rememberQuranTrack, loadRecentSurah } from "./quran-recent";
import {
  addCustomTrack,
  loadCustomTracks,
  looksLikeAudio,
  normalizeAudioUrl,
  removeCustomTrack,
  MAX_CUSTOM_TRACKS,
} from "./custom-audio";
import type { ThemeStyles } from "./types";
import { useAudio } from "@/components/audio/AudioProvider";

/* ==========================================================================
   المكتبة الصوتية

   ٣ تبويبات: قرآن (قارئ + سورة)، موسيقى (مجانية الحقوق)، صوتياتي
   (روابط المستخدم). بتتحط جوه درج الإعدادات.

   🗓️ ٨ أغسطس: بديل «أصوات التركيز» القديمة — ٦ أزرار ثابتة (مطر/بحر/
   غابة/…) اتشالت بالكامل بطلب المستخدم.

   القرّاء بييجوا من /api/quran/reciters. النداء بيحصل **أول ما تفتح
   تبويب القرآن** مش أول ما الدرج يفتح — أغلب الناس بتفتح الإعدادات
   لحاجة تانية خالص.
   ========================================================================== */

type TabId = "quran" | "music" | "custom";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "quran", label: "قرآن", icon: "📖" },
  { id: "music", label: "موسيقى", icon: "🎧" },
  { id: "custom", label: "صوتياتي", icon: "🎵" },
];

interface SoundLibraryProps {
  themeStyles: ThemeStyles;
}

export function SoundLibrary({ themeStyles }: SoundLibraryProps) {
  /* الحالة بتتقرا من المزوّد العام مباشرة مش بروبس. المشغّل عايش في
     `app/layout.tsx` عشان الصوت ما يفصلش مع التنقّل، فالحالة مابقتش
     ملك صفحة الداشبورد أصلاً — تمريرها كبروبس عبر Sidebar كان بيوهم
     إنها كده. */
  const { activeTrack, isPlaying, selectTrack, forgetTrack } = useAudio();

  /* كل اختيار لسورة بيتسجّل عشان كارت القرآن في الداشبورد يعرف يقول
     «كمّل سورة كذا». اللفّة دي على `selectTrack` كله — مش على أزرار
     القرآن بس — عشان مستحيل مسار يفتكر ومسار ينسى. الدالة نفسها بتتجاهل
     أي تراك مش قرآن. */
  const choose = useCallback(
    (track: SoundTrack) => {
      rememberQuranTrack(track);
      selectTrack(track);
    },
    [selectTrack]
  );

  const [tab, setTab] = useState<TabId>("quran");

  // معرّفات فريدة: لو الكومبوننت اتركّب مرتين (درج + صفحة مثلاً) الـ
  // IDs الثابتة كانت هتتكرّر و`aria-controls` هيشاور على الغلط.
  const uid = useId();
  const tabId = (id: TabId) => `${uid}-tab-${id}`;
  const panelId = (id: TabId) => `${uid}-panel-${id}`;
  const urlHintId = `${uid}-url-hint`;

  const { reciters, stale, failed } = useReciters(tab === "quran");
  const [reciterId, setReciterId] = useState<number | null>(null);
  const [surahQuery, setSurahQuery] = useState("");

  const [customTracks, setCustomTracks] = useState<SoundTrack[]>(() => loadCustomTracks());
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [customError, setCustomError] = useState("");


  /* القارئ الافتراضي: اللي المستخدم سمع بيه آخر مرة لو لسه موجود في
     القايمة، وإلا أول واحد فيها (القايمة مرتّبة بالمصاحف الكاملة الأول).
     من غير الفقرة دي، اللي اختار قارئه من الكارت في الداشبورد كان بيفتح
     الإعدادات ويلاقي قارئ تاني — نفس المكتبة بتقول حاجتين مختلفتين. */
  useEffect(() => {
    if (!reciters || !reciters.length || reciterId !== null) return;
    const recent = loadRecentSurah();
    const remembered = recent && reciters.some((r) => r.id === recent.reciterId);
    setReciterId(remembered ? recent.reciterId : reciters[0].id);
  }, [reciters, reciterId]);

  const reciter = useMemo(
    () => reciters?.find((r) => r.id === reciterId) ?? null,
    [reciters, reciterId]
  );

  const surahs = useMemo(() => {
    if (!reciter) return [];
    const q = surahQuery.trim();
    const available = reciter.surahs;
    if (!q) return available;

    // بحث بالرقم أو بالاسم. الأسماء فيها همزات وألفات بتتكتب بأشكال
    // مختلفة (الأعراف/الاعراف)، فبنطبّعها قبل المقارنة.
    const asNumber = Number(q);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 114) {
      return available.filter((n) => n === asNumber);
    }
    const norm = normalizeArabic(q);
    return available.filter((n) => normalizeArabic(SURAH_NAMES[n - 1] ?? "").includes(norm));
  }, [reciter, surahQuery]);

  const handleAddCustom = () => {
    const result = addCustomTrack(customTracks, { name: newName, url: newUrl });
    if (!result.ok) {
      setCustomError(result.error);
      return;
    }
    setCustomTracks(result.tracks);
    setNewName("");
    setNewUrl("");
    setCustomError("");
  };

  /**
   * الاختيار مش التشغيل. `aria-pressed` بتوصف «ده المختار؟» — لو ربطناها
   * بالتشغيل، التراك المختار وهو متوقف بيقول «مش مضغوط» وهو مضغوط فعلاً.
   * حالة التشغيل بتتقال في السطر اللي فوق وفي المشغّل العائم.
   */
  const isChosen = (track: SoundTrack) => activeTrack?.id === track.id;
  const isSounding = (track: SoundTrack) => isChosen(track) && isPlaying;

  // التلميحة بتظهر بس لما الرابط يبقى صالح شكلاً بس مش شكل ملف صوت.
  // لو الرابط نفسه غلط، رسالة الخطأ عند الإضافة أوضح من دي.
  const normalizedNewUrl = normalizeAudioUrl(newUrl);
  const showAudioHint = normalizedNewUrl !== null && !looksLikeAudio(normalizedNewUrl);

  // الأسهم في شريط التبويبات — ده اللي `role="tablist"` بيوعد بيه.
  // ⚠️ الصفحة rtl فـ ArrowLeft بيروح للـ«بعده» بصرياً مش للي قبله.
  const onTabKey = (e: KeyboardEvent, index: number) => {
    const delta =
      e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : e.key === "Home" ? -index : e.key === "End" ? TABS.length - 1 - index : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  /* 🗓️ ١٢ أغسطس: الترويسة اللي كانت هنا (تاج «المكتبة الصوتية» + سطر
     «بيشتغل: كذا») اتشالت. الدرج بقى أقسام مسمّاة، وعنوان القسم نفسه
     بقى بيقول الاسم والحالة — فالترويسة دي كانت بتتكرر حرفياً جوه
     القسم. الملف ده بقى محتواه بس. */
  return (
    <div className="space-y-3">
      {/* ---- التبويبات ----
           الـ tabIndex المتنقّل: تبويب واحد بس في ترتيب التاب، والباقي
           بالأسهم. ده السلوك اللي قارئ الشاشة بيتوقعه من tablist. */}
      <div role="tablist" aria-label="نوع الصوت" className="flex gap-1 bg-paper p-1 rounded-[var(--r-sm)] border border-rule">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={panelId(t.id)}
            id={tabId(t.id)}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`mono flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-[6px] transition ${
              tab === t.id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ⚠️ اللوحات التلاتة بتتركّب دايماً و`hidden` هي اللي بتخفي —
          مش `{tab === "x" && …}`. لو التركيب شرطي، الـ `aria-controls`
          في التبويبات المقفولة بيشاور على عناصر مش موجودة أصلاً. */}

      {/* ================= قرآن ================= */}
      <div
        id={panelId("quran")}
        role="tabpanel"
        aria-labelledby={tabId("quran")}
        hidden={tab !== "quran"}
        className="space-y-2.5"
      >
          {/* الحالة بتتغيّر بعد نداء شبكة — من غير live region، اللي
              بيسمع الصفحة مش هيعرف إن التحميل خلص أو وقع. */}
          <div role="status" aria-live="polite">
            {failed && (
              <div className="notice notice-error text-[11px]">
                <p className="m-0">مش قادر أجيب قائمة القرّاء دلوقتي. اتأكد من النت وافتح الإعدادات تاني.</p>
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

          {reciters && (
            <>
              {stale && (
                <p className="text-[11px] text-ink-soft leading-relaxed">
                  دي قائمة مختصرة — الخدمة مش راضية ترد دلوقتي، جرّب تاني بعدين لو عايز قرّاء أكتر.
                </p>
              )}

              <label className="block space-y-1.5">
                <span className="tag">القارئ</span>
                <select
                  value={reciterId ?? ""}
                  onChange={(e) => setReciterId(Number(e.target.value))}
                  className="field"
                >
                  {reciters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.surahs.length < 114 ? ` — ${r.surahs.length} سورة` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {reciter && (
                <>
                  {/* السور المشهورة: اختصار للي بيسمع نفس السور كل يوم */}
                  {!surahQuery && (
                    <div className="space-y-1.5">
                      <span className="tag">الأكثر سماعاً</span>
                      <div className="flex flex-wrap gap-1.5">
                        {POPULAR_SURAHS.filter((n) => reciter.surahs.includes(n)).map((n) => {
                          const track = quranTrack(reciter, n);
                          return (
                            <button
                              key={n}
                              onClick={() => choose(track)}
                              aria-pressed={isChosen(track)}
                              className={`pill transition ${
                                isChosen(track)
                                  ? `${themeStyles.accentBg} text-onmarker`
                                  : "text-ink-soft hover:text-ink"
                              }`}
                            >
                              {SURAH_NAMES[n - 1]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="block space-y-1.5">
                    <span className="tag">كل السور</span>
                    <input
                      type="search"
                      value={surahQuery}
                      onChange={(e) => setSurahQuery(e.target.value)}
                      placeholder="دوّر بالاسم أو الرقم…"
                      className="field"
                    />
                  </label>

                  <div className="max-h-56 overflow-y-auto rounded-[var(--r-sm)] border border-rule bg-paper">
                    {surahs.length === 0 ? (
                      <p className="text-[11px] text-ink-soft p-3 m-0">مفيش سورة بالاسم ده.</p>
                    ) : (
                      <ul className="list-none m-0 p-1 space-y-0.5" aria-label="السور">
                        {surahs.map((n) => {
                          const track = quranTrack(reciter, n);
                          const chosen = isChosen(track);
                          return (
                            <li key={n}>
                              <button
                                onClick={() => choose(track)}
                                aria-pressed={chosen}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-right transition ${
                                  chosen
                                    ? "bg-emerald-950 text-emerald-400"
                                    : "text-ink-soft hover:bg-paper-3 hover:text-ink"
                                }`}
                              >
                                <span className="mono text-[0.62rem] tnum ltr-num shrink-0 opacity-70">
                                  {String(n).padStart(3, "0")}
                                </span>
                                <span className="flex-1 text-xs font-semibold truncate">
                                  {SURAH_NAMES[n - 1]}
                                </span>
                                {chosen && (
                                  <span aria-hidden className="mono shrink-0">
                                    {isSounding(track) ? "▶" : "⏸"}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}
      </div>

      {/* ================= موسيقى ================= */}
      <div
        id={panelId("music")}
        role="tabpanel"
        aria-labelledby={tabId("music")}
        hidden={tab !== "music"}
        className="space-y-2"
      >
          <ul className="list-none m-0 p-0 space-y-1.5" aria-label="مقاطع الموسيقى">
            {MUSIC_TRACKS.map((track) => {
              const chosen = isChosen(track);
              return (
                <li key={track.id}>
                  <button
                    onClick={() => choose(track)}
                    aria-pressed={chosen}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-[var(--r-sm)] border text-right transition ${
                      chosen
                        ? "bg-emerald-950 border-emerald-500 text-emerald-400"
                        : "bg-paper border-rule text-ink-soft hover:text-ink hover:border-rule-strong"
                    }`}
                  >
                    <span aria-hidden className="text-base leading-none shrink-0">
                      {track.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold truncate">{track.name}</span>
                      {track.subtitle && (
                        <span className="block mono text-ink-soft/80 truncate">{track.subtitle}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-ink-soft leading-relaxed">
            كلها موسيقى بدون كلمات وحقوقها مفتوحة، عشان ما تشتّتش وإنت بتذاكر.
          </p>
      </div>

      {/* ================= صوتياتي ================= */}
      <div
        id={panelId("custom")}
        role="tabpanel"
        aria-labelledby={tabId("custom")}
        hidden={tab !== "custom"}
        className="space-y-2.5"
      >
          {customTracks.length > 0 && (
            <ul className="list-none m-0 p-0 space-y-1.5" aria-label="صوتياتي">
              {customTracks.map((track) => {
                const chosen = isChosen(track);
                return (
                  <li key={track.id} className="flex items-center gap-1.5">
                    <button
                      onClick={() => choose(track)}
                      aria-pressed={chosen}
                      className={`flex-1 min-w-0 flex items-center gap-2.5 p-2.5 rounded-[var(--r-sm)] border text-right transition ${
                        chosen
                          ? "bg-emerald-950 border-emerald-500 text-emerald-400"
                          : "bg-paper border-rule text-ink-soft hover:text-ink hover:border-rule-strong"
                      }`}
                    >
                      <span aria-hidden className="text-base leading-none shrink-0">
                        {track.icon}
                      </span>
                      <span className="flex-1 text-xs font-semibold truncate">{track.name}</span>
                    </button>
                    <button
                      onClick={() => {
                        setCustomTracks(removeCustomTrack(customTracks, track.id));
                        // لازم المشغّل يقف كمان: مسح حاجة وهي لسه بتشتغل
                        // بيسيب المستخدم بصوت مش عارف يوقفه من المكتبة.
                        forgetTrack(track.id);
                      }}
                      aria-label={`امسح ${track.name}`}
                      className="mono text-ink-soft hover:text-red-400 px-2 py-2 rounded-[6px] hover:bg-paper-3 transition shrink-0"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="bg-paper rounded-[var(--r-sm)] p-3 space-y-2 border border-rule">
            <p className="tag">أضف صوت بالرابط</p>

            {/* الـ placeholder مش اسم: بيختفي أول ما تكتب، وقارئ الشاشة
                مش مضمون ينطقه. فكل حقل ليه label حقيقي مخفي بصرياً. */}
            <label className="block">
              <span className="sr-only">اسم الصوت</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCustomError("");
                }}
                placeholder="الاسم (مثلاً: مقطعي المفضل)"
                className="field"
                maxLength={60}
              />
            </label>

            <label className="block">
              <span className="sr-only">رابط الصوت</span>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value);
                  // الخطأ القديم بيتشال أول ما يبدأ يصلّح — من غير كده
                  // بيفضل تحت الحقل وهو بيكتب حاجة صح
                  setCustomError("");
                }}
                placeholder="https://…/track.mp3"
                className="field mono"
                dir="ltr"
                aria-describedby={urlHintId}
              />
            </label>

            <div id={urlHintId}>
              {customError ? (
                <p className="text-[11px] text-red-400 m-0" role="alert">
                  {customError}
                </p>
              ) : (
                /* بنفحص الرابط بعد التطبيع: من غير كده اللي كاتب
                   "example.com/a.mp3" كان بياخد «مش شكله ملف صوت»
                   والمشكلة الحقيقية إن الـ https ناقص. */
                showAudioHint && (
                  <p className="text-[11px] text-ink-soft m-0">
                    الرابط ده مش شكله ملف صوت — لو مشتغلش، الغالب إنه صفحة مش ملف.
                  </p>
                )
              )}
            </div>

            <button
              onClick={handleAddCustom}
              disabled={!newName.trim() || !newUrl.trim()}
              className="btn btn-marker btn-block text-sm disabled:opacity-45"
            >
              أضف
            </button>
          </div>

          <p className="text-[11px] text-ink-soft leading-relaxed">
            الروابط بتتحفظ على جهازك ده بس، والصوت بيتشغّل من مصدره مباشرة — إحنا مش
            بنرفع ولا بنخزّن أي ملفات. متأكد إن اللي بتسمعه من حقك.
            {customTracks.length > 0 && ` (${customTracks.length}/${MAX_CUSTOM_TRACKS})`}
          </p>
      </div>
    </div>
  );
}

/** بتوحّد الهمزات والألف المقصورة عشان البحث ما يفشلش على «الاعراف». */
function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "")
    .toLowerCase();
}