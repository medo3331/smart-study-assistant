"use client";

import type { SoundTrack } from "./audio-library";

/* ==========================================================================
   آخر سورة سمعتها

   كارت القرآن في الداشبورد بيقول «كمّل سورة الكهف» — فمحتاجين نفتكر
   اختيار المستخدم. مزوّد الصوت **مابيحفظش** التراك الشغّال عن قصد (تحديث
   الصفحة بيوقّف الصوت لأن المتصفح مابيسمحش باستئناف من غير لمسة)، فالذاكرة
   دي حاجة منفصلة خالص: تفضيل مش حالة تشغيل.

   ⚠️ اللي بيتخزّن **رقمين وبس** — رقم القارئ ورقم السورة. الرابط نفسه
   مابيتخزّنش أبداً، وبيتبني من جديد من قايمة القرّاء اللي جاية من الراوت
   بتاعنا. السبب: أي `<audio src>` بييجي من الستوريج معناه إن حد عدّل
   الستوريج يقدر يخلي المتصفح يطلب أي دومين هو عايزه — وده تسريب IP
   وReferer. الرقم مايعملش كده.
   ========================================================================== */

const RECENT_KEY = "quran_recent";

export interface RecentSurah {
  reciterId: number;
  /** ١ لـ ١١٤ */
  surah: number;
}

/** الـ id بتاع تراك القرآن شكله `quran:<reciterId>:<surah>` — شوف
    `quranTrack` في audio-library.ts. */
const QURAN_ID = /^quran:(\d+):(\d+)$/;

function validSurah(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 114;
}

/**
 * بيفتكر التراك لو كان قرآن، وبيتجاهل أي حاجة تانية.
 *
 * كده مكان النداء يقدر يلفّ `selectTrack` كله من غير ما يفحص النوع بنفسه،
 * فمستحيل يتنسى في مسار واحد ويفتكر في التاني.
 */
export function rememberQuranTrack(track: SoundTrack): void {
  if (track.kind !== "quran") return;
  const match = QURAN_ID.exec(track.id);
  if (!match) return;

  const reciterId = Number(match[1]);
  const surah = Number(match[2]);
  if (!Number.isInteger(reciterId) || !validSurah(surah)) return;

  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify({ reciterId, surah }));
  } catch {
    // الستوريج مقفول (تصفح خفي) — الكارت هيوري السور المشهورة وبس
  }
}

/**
 * ⚠️ الستوريج مدخل غير موثوق: أي حد فاتح الكونسول يقدر يحط فيه أي حاجة.
 * فكل رقم بيتفحص، وأي شكل غير متوقع بيرجّع null بدل ما يتمرّر جوه.
 */
export function loadRecentSurah(): RecentSurah | null {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const reciterId = Number(obj.reciterId);
    const surah = Number(obj.surah);
    if (!Number.isInteger(reciterId) || reciterId <= 0) return null;
    if (!validSurah(surah)) return null;
    return { reciterId, surah };
  } catch {
    return null;
  }
}
