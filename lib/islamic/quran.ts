import type { Surah, Ayah, QuranProgress } from "./types";

/** Quran text is fetched verbatim from AlQuran Cloud's Uthmani edition. */
const QURAN_API_BASE = "https://api.alquran.cloud/v1";
const QURAN_EDITION = "quran-uthmani";

interface ApiResponse<T> {
  code: number;
  status: string;
  data: T;
}

interface ApiSurah {
  number: number;
  englishName: string;
  name: string;
  revelationType: string;
  numberOfAyahs: number;
}

interface ApiAyah {
  numberInSurah: number;
  text: string;
  juz: number;
  page: number;
}

const surahAyahCounts = new Map<number, number>();

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${QURAN_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Quran source returned HTTP ${response.status}`);

  const result = (await response.json()) as ApiResponse<T>;
  if (result.code !== 200 || result.status !== "OK" || result.data == null) {
    throw new Error("Quran source returned an invalid response");
  }
  return result.data;
}

function toSurah(s: ApiSurah): Surah {
  if (
    !Number.isInteger(s.number) || s.number < 1 || s.number > 114 ||
    !Number.isInteger(s.numberOfAyahs) || s.numberOfAyahs < 1 ||
    typeof s.name !== "string" || !s.name.trim() ||
    typeof s.englishName !== "string" || !s.englishName.trim() ||
    (s.revelationType !== "Meccan" && s.revelationType !== "Medinan")
  ) {
    throw new Error("Quran source returned invalid surah metadata");
  }

  return {
    id: s.number,
    name: s.englishName,
    arabicName: s.name,
    englishName: s.englishName,
    revelationType: s.revelationType,
    ayahCount: s.numberOfAyahs,
    // The surah list API does not include the starting juz; do not invent it.
    juzNumber: 0,
  };
}

export async function getAllSurahs(): Promise<Surah[]> {
  const raw = await fetchJson<ApiSurah[]>("/surah");
  if (!Array.isArray(raw) || raw.length !== 114) {
    throw new Error("Quran source did not return the complete surah list");
  }

  const surahs = raw.map(toSurah);
  if (surahs.some((surah, index) => surah.id !== index + 1)) {
    throw new Error("Quran source returned an incomplete or unordered surah list");
  }

  surahAyahCounts.clear();
  for (const surah of surahs) surahAyahCounts.set(surah.id, surah.ayahCount);
  return surahs;
}

export async function getSurah(surahId: number): Promise<Surah | null> {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) return null;
  const surah = toSurah(await fetchJson<ApiSurah>(`/surah/${surahId}`));
  if (surah.id !== surahId) throw new Error("Quran source returned a different surah");
  surahAyahCounts.set(surah.id, surah.ayahCount);
  return surah;
}

export async function getAyahs(surahId: number): Promise<Ayah[]> {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) {
    throw new Error("Invalid surah number");
  }

  const data = await fetchJson<{ number: number; ayahs: ApiAyah[] }>(
    `/surah/${surahId}/${QURAN_EDITION}`,
  );
  if (data.number !== surahId || !Array.isArray(data.ayahs) || data.ayahs.length === 0) {
    throw new Error("Quran source returned no complete ayah list");
  }

  const ayahs = data.ayahs.map((ayah, index) => {
    if (
      ayah.numberInSurah !== index + 1 ||
      typeof ayah.text !== "string" || !ayah.text.trim() ||
      !Number.isInteger(ayah.juz) || !Number.isInteger(ayah.page)
    ) {
      throw new Error("Quran source returned an incomplete ayah list");
    }
    return {
      number: ayah.numberInSurah,
      text: ayah.text,
      surahId,
      juzNumber: ayah.juz,
      pageNumber: ayah.page,
    };
  });

  let expectedCount = surahAyahCounts.get(surahId);
  if (expectedCount === undefined) {
    const surah = await getSurah(surahId);
    expectedCount = surah?.ayahCount;
  }
  if (expectedCount === undefined || ayahs.length !== expectedCount) {
    throw new Error("Quran source returned a truncated surah");
  }
  return ayahs;
}

export async function getAyah(surahId: number, ayahNumber: number): Promise<Ayah | null> {
  const ayahs = await getAyahs(surahId);
  return ayahs.find((ayah) => ayah.number === ayahNumber) ?? null;
}

/**
 * موقع آية واحدة في المصحف (رقم الصفحة + الجزء) — نداء خفيف بآية واحدة
 * بدون تحميل السورة كاملة؛ يُستخدم في شريط «متابعة القراءة» (٢/…).
 */
export async function getAyahLocation(
  surahId: number,
  ayahNumber: number,
): Promise<{ pageNumber: number; juzNumber: number } | null> {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) return null;
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > 286) return null;
  try {
    const data = await fetchJson<ApiAyah & { number: number }>(
      `/ayah/${surahId}:${ayahNumber}/${QURAN_EDITION}`,
    );
    if (!Number.isInteger(data.page) || !Number.isInteger(data.juz)) return null;
    return { pageNumber: data.page, juzNumber: data.juz };
  } catch {
    return null;
  }
}

export async function searchQuran(_query: string): Promise<Ayah[]> {
  void _query;
  return [];
}

/* ═══════════════════════════════════════════════════════════════════════
   المصحف (عرض صفحات كاملة) — ربط صفحة المصحف ↔ الآيات
   صفحات مصحف المدينة الرسمي (مجمع الملك فهد) كصور من CDN متحقق منه،
   وربط كل صفحة بأول/آخر آية فيها عبر endpoint /page/{N}/quran-uthmani
   (مُختبَر فعليًا: HTTP 200 للصفحات 1..604، و604 = سورة الناس آية 6).
   ═══════════════════════════════════════════════════════════════════════ */

/** عدد صفحات مصحف المدينة الرسمي. */
export const MUSHAF_PAGE_COUNT = 604;

/**
 * تقدير عدد آيات الصفحة الواحدة — يُستخدم فقط لعدّ ورد اليوم للأمام حين
 * يكون عدد آيات الصفحة الحقيقي غير محمَّل بعد في الكاش (الحالة النادرة
 * للقفز بعيدًا بسرعة). التقليب العادي صفحة بصفحة يعتمد على الكاش المسبق.
 */
export const MUSHAF_AYAHS_PER_PAGE_ESTIMATE = 20;

/** نسخة صورة الصفحة: فاتحة أو غامقة — نفس التخطيط تمامًا في النسختين. */
export type MushafPageVariant = "light" | "dark";

const MUSHAF_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/SakinaDevGroup/mushaf-madani-cdn@main";

/** رابط صورة صفحة مصحف كاملة — الصفحات 1..604 فقط. */
export function mushafPageImageUrl(
  pageNumber: number,
  variant: MushafPageVariant,
): string {
  const page = clampMushafPage(pageNumber);
  return `${MUSHAF_CDN_BASE}/${variant}/p${page}.png`;
}

/** حصر رقم الصفحة داخل 1..604 — أي قيمة غير صالحة ترجع لأقرب حد. */
export function clampMushafPage(pageNumber: number): number {
  if (!Number.isFinite(pageNumber)) return 1;
  return Math.min(Math.max(Math.round(pageNumber), 1), MUSHAF_PAGE_COUNT);
}

/** مرجع آية داخل المصحف — بدون نص (نص الآيات يُجلب في وضع «الآيات»). */
export interface MushafAyahRef {
  surahId: number;
  ayahNumber: number;
}

/** مرجع صفحة مصحف كاملة: أولها وآخرها وعدد آياتها. */
export interface MushafPageRef {
  pageNumber: number;
  ayahCount: number;
  firstAyah: MushafAyahRef;
  lastAyah: MushafAyahRef;
}

interface ApiPageAyah extends ApiAyah {
  surah: { number: number };
}

/** كاش في الذاكرة لمراجع الصفحات — يكفي لجلسة قراءة كاملة (604 صفحة صغيرة). */
const mushafPageCache = new Map<number, MushafPageRef>();

/** مرجع صفحة من الكاش فقط — بدون شبكة؛ لعدّ الآيات أثناء التقليب. */
export function getCachedMushafPage(pageNumber: number): MushafPageRef | null {
  return mushafPageCache.get(clampMushafPage(pageNumber)) ?? null;
}

/**
 * مرجع صفحة مصحف (أول/آخر آية + عدد الآيات) من المصدر مع كاش.
 * يرجع null عند فشل الشبكة بدل رمي خطأ — التقليب لا يجب أن يتعطل.
 */
export async function getMushafPage(
  pageNumber: number,
): Promise<MushafPageRef | null> {
  const page = clampMushafPage(pageNumber);
  const cached = mushafPageCache.get(page);
  if (cached) return cached;
  try {
    const data = await fetchJson<{ number: number; ayahs: ApiPageAyah[] }>(
      `/page/${page}/${QURAN_EDITION}`,
    );
    if (data.number !== page || !Array.isArray(data.ayahs) || data.ayahs.length === 0) {
      throw new Error("Quran source returned an invalid mushaf page");
    }
    const first = data.ayahs[0];
    const last = data.ayahs[data.ayahs.length - 1];
    if (
      !Number.isInteger(first.surah?.number) || !Number.isInteger(first.numberInSurah) ||
      !Number.isInteger(last.surah?.number) || !Number.isInteger(last.numberInSurah)
    ) {
      throw new Error("Quran source returned an invalid mushaf page");
    }
    const ref: MushafPageRef = {
      pageNumber: page,
      ayahCount: data.ayahs.length,
      firstAyah: { surahId: first.surah.number, ayahNumber: first.numberInSurah },
      lastAyah: { surahId: last.surah.number, ayahNumber: last.numberInSurah },
    };
    mushafPageCache.set(page, ref);
    return ref;
  } catch {
    return null;
  }
}

/**
 * عدد الآيات المقروءة بالتقليب للأمام من صفحة إلى صفحة (لعدّ ورد اليوم).
 * يعتمد على الكاش عند توفره، وإلا تقدير ثابت لكل صفحة — تقريبي كما كان.
 */
export function countMushafAyahsForward(fromPage: number, toPage: number): number {
  const from = clampMushafPage(fromPage);
  const to = clampMushafPage(toPage);
  if (to <= from) return 0;
  let total = 0;
  for (let page = from + 1; page <= to; page++) {
    total += getCachedMushafPage(page)?.ayahCount ?? MUSHAF_AYAHS_PER_PAGE_ESTIMATE;
  }
  return total;
}

/** Legacy data APIs retained for existing callers; Quran text never falls back to mock data. */
export async function getQuranProgress(_userId: string): Promise<QuranProgress> {
  void _userId;
  const { mockQuranProgress } = await import("./mock-data");
  return mockQuranProgress;
}

export async function updateQuranProgress(
  userId: string,
  progress: Partial<QuranProgress>,
): Promise<QuranProgress> {
  void userId;
  const { mockQuranProgress } = await import("./mock-data");
  return { ...mockQuranProgress, ...progress };
}
