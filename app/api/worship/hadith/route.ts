import { NextResponse } from "next/server";

import {
  EXTRA_HADITH_REFS,
  HADITH_API_EDITIONS,
  HADITHS,
  type Hadith,
  type HadithCategory,
  type HadithCollection,
} from "@/lib/islamic/hadith-data";

/**
 * ==========================================================================
 * بروكسي الأحاديث — GET /api/worship/hadith
 *
 * يجيب أحاديث إضافية من الصحيحين مباشرة من dataset عربي موثّق على jsDelivr
 * (fawazahmed0/hadith-api)، بنداءٍ سيرفر-سايد فقط (ممنوع الـ fetch من
 * الكلاينت بسبب CSP)، مع:
 *   1. كاش Next.js Data Cache (revalidate أسبوع) + كاش داخل الذاكرة.
 *   2. fallback كامل على الداتا الثابتة HADITHS لو الـ API وقع أو رجّع
 *      نتيجة غير عربية — فالصفحة لا تتوقف أبداً.
 * ==========================================================================
 */

/** مدة صلاحية كاش الاستجابة الخارجية: أسبوع بالثواني. */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 7;

/** كاش داخل الذاكرة (يبقى على نفس الـ instance بعد أول جلب). */
type CachedEdition = { fetchedAt: number; byKey: Map<number, string> };
const editionCache = new Map<HadithCollection, CachedEdition>();

interface ApiHadithEntry {
  hadithnumber?: number;
  arabicnumber?: number;
  text?: string;
}

interface ApiEditionPayload {
  hadiths?: ApiHadithEntry[];
}

/** فحص أن النص عربي سليم فعلاً (نسبة حروف عربية عالية + طول معقول). */
function isArabicText(text: string | undefined): boolean {
  if (!text || text.trim().length < 40) return false;
  const arabicLetters = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return arabicLetters / text.length > 0.5;
}

/** جلب نسخة الكتاب (بخاري/مسلم) من jsDelivr مع كاش طبقتين. */
async function fetchEdition(
  collection: HadithCollection,
): Promise<Map<number, string> | null> {
  const cached = editionCache.get(collection);
  if (cached && Date.now() - cached.fetchedAt < REVALIDATE_SECONDS * 1000) {
    return cached.byKey;
  }

  try {
    const response = await fetch(HADITH_API_EDITIONS[collection], {
      // كاش Next.js Data Cache — يجيب مرة واحدة أسبوعياً مستوى المنصة.
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ApiEditionPayload;
    const hadiths = payload.hadiths;
    if (!Array.isArray(hadiths) || hadiths.length === 0) return null;

    const byKey = new Map<number, string>();
    for (const entry of hadiths) {
      const number = entry.hadithnumber ?? entry.arabicnumber;
      if (typeof number === "number" && isArabicText(entry.text)) {
        byKey.set(number, (entry.text as string).trim());
      }
    }
    if (byKey.size === 0) return null;

    editionCache.set(collection, { fetchedAt: Date.now(), byKey });
    return byKey;
  } catch {
    // أي فشل شبكة/تحليل → null والبروكسي يرجع للداتا الثابتة.
    return null;
  }
}

/** تحويل مرجع متحقَّق منه إلى حديث كامل من النسخة المجلوبة. */
function buildHadithFromRef(
  ref: (typeof EXTRA_HADITH_REFS)[number],
  edition: Map<number, string> | null,
): Hadith | null {
  if (!edition) return null;
  const text = edition.get(ref.hadithNumber);
  if (!isArabicText(text) || text === undefined) return null;
  const label =
    ref.collection === "bukhari" ? "صحيح البخاري" : "صحيح مسلم";
  return {
    id: `${ref.collection}-${ref.hadithNumber}`,
    category: ref.category,
    text: text,
    narrator: ref.narrator,
    collection: ref.collection,
    hadithNumber: ref.hadithNumber,
    source: `${label} ${ref.hadithNumber}`,
    sourceUrl: `https://sunnah.com/${ref.collection}:${ref.hadithNumber}`,
  };
}

/**
 * GET /api/worship/hadith
 * يرجّع الأحاديث الثابتة + الإضافات من الـ API إن توفّرت (source: "api")،
 * أو الثابتة وحدها لو الـ API وقع (source: "static").
 */
export async function GET() {
  // الجلب متوازي للصحيحين — وفشل أحدهما لا يُسقط الآخر.
  const [bukhari, muslim] = await Promise.all([
    fetchEdition("bukhari"),
    fetchEdition("muslim"),
  ]);

  const editions: Record<HadithCollection, Map<number, string> | null> = {
    bukhari,
    muslim,
  };

  const extras: Hadith[] = [];
  let apiSucceeded = false;
  for (const ref of EXTRA_HADITH_REFS) {
    const hadith = buildHadithFromRef(ref, editions[ref.collection]);
    if (hadith) {
      extras.push(hadith);
      apiSucceeded = true;
    }
  }

  const payload = {
    ok: true as const,
    // source: "api" لو جبت أحاديث إضافية من الـ API، وإلا "static".
    source: (apiSucceeded ? "api" : "static") as "api" | "static",
    hadiths: apiSucceeded ? extras : ([] as Hadith[]),
    fallback: HADITHS,
    categories: HADITHS.reduce<Record<string, number>>((acc, hadith) => {
      const category = hadith.category as HadithCategory;
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {}),
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      // كاش كلاينتي خفيف فوق كاش السيرفر — الحد الأدنى يمنع الضربات المتكررة.
      "Cache-Control": `public, max-age=3600, stale-while-revalidate=${REVALIDATE_SECONDS}`,
    },
  });
}
