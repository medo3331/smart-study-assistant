/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
/**
 * Worship Progress — DB-first (worship_progress) + localStorage fallback — fixed after user reported "mizuot"
 *
 * A single, typed layer over localStorage so components never call
 * localStorage.getItem / localStorage.setItem directly.
 *
 * Persists:
 * - daily prayer completion (per date)
 * - adhkar completion (per category, per date)
 * - quran reading position + daily ayah count
 * - tasbih session count
 */

export type WorshipCategory =
  | "prayers"
  | "morning_adhkar"
  | "evening_adhkar"
  | "after_prayer_adhkar"
  | "sleep_adhkar"
  | "general_adhkar"
  | "quran";

/** Shape of a single day's worship record. */
export interface WorshipDayRecord {
  date: string; // YYYY-MM-DD in the device's local timezone
  prayers: Record<string, boolean>; // e.g. { fajr: true, dhuhr: false }
  adhkar: Record<string, { completed: boolean; count: number; itemCounts?: Record<string, number> }>;
  quran: {
    surahId: number;
    ayahId: number;
    dailyCount: number; // ayahs read today
    updatedAt?: string;
  };
  tasbih: {
    count: number;
  };
}

const STORAGE_KEY = "magicly-worship-progress";
const QURAN_POSITION_KEY = "magicly-quran-reading-position";
const SETTINGS_KEY = "islamic-settings";

/** Local calendar date; daily worship must not roll over at UTC midnight. */
export function localWorshipDate(
  now = new Date(),
  preferredTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): string {
  let timeZone = preferredTimeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(now);
  } catch {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Safe default for a fresh day. */
function createEmptyDay(date: string): WorshipDayRecord {
  return {
    date,
    prayers: {},
    adhkar: {},
    quran: { surahId: 1, ayahId: 1, dailyCount: 0 },
    tasbih: { count: 0 },
  };
}

/* ------------------------------------------------------------------ */
/* Internal read/write helpers                                         */
/* ------------------------------------------------------------------ */

function readAll(): Record<string, WorshipDayRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, WorshipDayRecord>;
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, WorshipDayRecord>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // إشارة للمكوّنات الحيّة (useWorshipData) إن التقدّم المحلي اتغيّر.
    window.dispatchEvent(new Event("worship-progress-change"));
  } catch {
    /* quota exceeded — ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns today's record (creating an empty one in storage if missing).
 */
export function getTodayWorship(dateStr?: string): WorshipDayRecord {
  const today = dateStr ?? localWorshipDate();
  const all = readAll();
  if (!all[today]) {
    all[today] = createEmptyDay(today);
    writeAll(all);
    return all[today];
  }
  return all[today];
}

/** Persist one daily record locally and notify mounted worship surfaces. */
export function saveWorshipDay(record: WorshipDayRecord): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return;
  writeAll({ ...readAll(), [record.date]: record });
}

/** Mark a prayer as completed for today. */
export function markPrayerCompleted(prayer: string, dateStr?: string): WorshipDayRecord {
  const today = getTodayWorship(dateStr);
  today.prayers[prayer] = true;
  writeAll({ ...readAll(), [today.date]: today });
  return today;
}

/** Get the set of completed prayer names for a day. */
export function getCompletedPrayers(dateStr?: string): string[] {
  return Object.entries(getTodayWorship(dateStr).prayers)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/** Mark an adhkar category as completed (with count) for today. */
export function markAdhkarCompleted(
  category: string,
  count: number,
  dateStr?: string
): WorshipDayRecord {
  const today = getTodayWorship(dateStr);
  today.adhkar[category] = { completed: true, count };
  writeAll({ ...readAll(), [today.date]: today });
  return today;
}

/** Save per-item recitation counts locally while keeping a category total for cloud sync. */
export function setAdhkarItemCounts(
  category: string,
  itemCounts: Record<string, number>,
  dateStr?: string,
): WorshipDayRecord {
  const today = getTodayWorship(dateStr);
  const safeCounts = Object.fromEntries(
    Object.entries(itemCounts).filter(([, count]) => Number.isInteger(count) && count >= 0),
  );
  const count = Object.values(safeCounts).reduce((sum, value) => sum + value, 0);
  const previous = today.adhkar[category];
  today.adhkar[category] = {
    completed: previous?.completed ?? false,
    count,
    itemCounts: safeCounts,
  };
  writeAll({ ...readAll(), [today.date]: today });
  return today;
}

/** Update the running adhkar count (does not mark complete). */
export function setAdhkarCount(
  category: string,
  count: number,
  dateStr?: string
): WorshipDayRecord {
  const today = getTodayWorship(dateStr);
  today.adhkar[category] = {
    ...today.adhkar[category],
    completed: count > 0,
    count,
  };
  writeAll({ ...readAll(), [today.date]: today });
  return today;
}

/** Get adhkar progress for a category today. */
export function getAdhkarProgress(category: string, dateStr?: string) {
  const today = getTodayWorship(dateStr);
  return today.adhkar[category] ?? { completed: false, count: 0 };
}

/** Update Quran reading position for today. */
export function setQuranPosition(
  surahId: number,
  ayahId: number,
  dailyCount: number,
  dateStr?: string,
  updatedAt = new Date().toISOString(),
): WorshipDayRecord {
  const today = getTodayWorship(dateStr);
  today.quran = { surahId, ayahId, dailyCount, updatedAt };
  writeAll({ ...readAll(), [today.date]: today });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(QURAN_POSITION_KEY, JSON.stringify({ surahId, ayahId, updatedAt }));
    } catch { /* local fallback unavailable */ }
  }
  return today;
}

/** Daily count resets by day; the reading position persists across days. */
export function getQuranProgress(dateStr?: string) {
  const daily = getTodayWorship(dateStr).quran;
  const position = getQuranReadingPosition();
  return position ? { ...daily, ...position } : daily;
}

export function getQuranReadingPosition(): { surahId: number; ayahId: number; updatedAt?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(QURAN_POSITION_KEY);
    if (!saved) return null;
    const position = JSON.parse(saved) as { surahId?: number; ayahId?: number; updatedAt?: string };
    if (
      Number.isInteger(position.surahId) && position.surahId! >= 1 && position.surahId! <= 114 &&
      Number.isInteger(position.ayahId) && position.ayahId! >= 1 &&
      typeof position.updatedAt === "string"
    ) {
      return { surahId: position.surahId!, ayahId: position.ayahId!, updatedAt: position.updatedAt };
    }
  } catch { /* no saved reading position */ }
  return null;
}

/** Set the tasbih session count for today. */
export function setTasbihCount(count: number, dateStr?: string): WorshipDayRecord {
  const today = getTodayWorship(dateStr);
  today.tasbih.count = count;
  writeAll({ ...readAll(), [today.date]: today });
  return today;
}

/** Get the tasbih count for today. */
export function getTasbihCount(dateStr?: string): number {
  return getTodayWorship(dateStr).tasbih.count;
}

/**
 * Overall daily completion percentage (0–100).
 * Weighted: prayers 40%, adhkar 25%, quran 20%, tasbih 15%.
 */
export function getDailyWorshipProgress(dateStr?: string): number {
  const today = getTodayWorship(dateStr);
  let score = 0;

  const prayerCount = Object.keys(today.prayers).length;
  if (prayerCount > 0) {
    score += (prayerCount / 5) * 40;
  }

  const adhkarCategories = Object.keys(today.adhkar).length;
  if (adhkarCategories > 0) {
    score += (adhkarCategories / 3) * 25;
  }

  if (today.quran.dailyCount > 0) {
    score += Math.min(today.quran.dailyCount / 10, 1) * 20;
  }

  if (today.tasbih.count > 0) {
    score += Math.min(today.tasbih.count / 100, 1) * 15;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/* ------------------------------------------------------------------ */
/* ورد القرآن اليومي — وحدات القياس (آيات | صفحات | أرباع | أحزاب | أجزاء) */
/* طبقة عرض/تخطيط نقية فوق عدّاد الآيات: عدّاد quran.dailyCount بالآيات    */
/* يفضل هو مصدر الحقيقة (ومكافأة worship_quran عليه)، والوحدات هنا بس      */
/* بتحوّل العدّاد لشكل الورد اللي المستخدم مختاره.                        */
/* ------------------------------------------------------------------ */

/** وحدات ورد القرآن المدعومة. */
export type QuranWordUnit = "ayat" | "pages" | "quarters" | "ahzab" | "ajzaa";

/** ثوابت المصحف المعتمدة في التحويل. */
export const QURAN_TOTAL_AYAHS = 6236;
export const QURAN_TOTAL_PAGES = 604;
export const QURAN_TOTAL_AJZAA = 30;
export const QURAN_TOTAL_AHZAB = 60; // حزبان لكل جزء
export const QURAN_TOTAL_QUARTERS = 240; // أربعة أرباع لكل جزء

/** متوسط الآيات في الصفحة — التقدير المعتمد لتحويل الآيات لصفحات. */
export const AYAHS_PER_PAGE = QURAN_TOTAL_AYAHS / QURAN_TOTAL_PAGES; // ≈ 10.32

/** عدد الصفحات التقريبي للوحدة — الجزء ≈ 20 صفحة، الحزب ≈ 10، الربع ≈ 2.5. */
export const PAGES_PER_JUZ = QURAN_TOTAL_PAGES / QURAN_TOTAL_AJZAA; // ≈ 20.13
export const PAGES_PER_HIZB = QURAN_TOTAL_PAGES / QURAN_TOTAL_AHZAB; // ≈ 10.07
export const PAGES_PER_QUARTER = QURAN_TOTAL_PAGES / QURAN_TOTAL_QUARTERS; // ≈ 2.52

/** الكمية الافتراضية لكل وحدة عند اختيارها أول مرة (الآيات بتاخد الهدف الموجود). */
export const DEFAULT_WORD_AMOUNT: Record<QuranWordUnit, number> = {
  ayat: 10,
  pages: 1,
  quarters: 4,
  ahzab: 2,
  ajzaa: 1,
};

const UNIT_META: Record<QuranWordUnit, { singular: string; dual: string; plural: string; pagesPerUnit: number }> = {
  ayat: { singular: "آية", dual: "آيتين", plural: "آيات", pagesPerUnit: 1 / AYAHS_PER_PAGE },
  pages: { singular: "صفحة", dual: "صفحتين", plural: "صفحات", pagesPerUnit: 1 },
  quarters: { singular: "ربع", dual: "ربعين", plural: "أرباع", pagesPerUnit: PAGES_PER_QUARTER },
  ahzab: { singular: "حِزب", dual: "حزبين", plural: "أحزاب", pagesPerUnit: PAGES_PER_HIZB },
  ajzaa: { singular: "جزء", dual: "جزئين", plural: "أجزاء", pagesPerUnit: PAGES_PER_JUZ },
};

/** قائمة الوحدات للعرض في الإعدادات. */
export const QURAN_WORD_UNIT_OPTIONS: { id: QuranWordUnit; label: string }[] = [
  { id: "ayat", label: "آيات" },
  { id: "pages", label: "صفحات" },
  { id: "quarters", label: "أرباع" },
  { id: "ahzab", label: "أحزاب" },
  { id: "ajzaa", label: "أجزاء" },
];

/** التحقق من قيمة وحدة قادمة من تخزين/سحابة غير موثوقة. */
export function isQuranWordUnit(value: unknown): value is QuranWordUnit {
  return value === "ayat" || value === "pages" || value === "quarters" || value === "ahzab" || value === "ajzaa";
}

/** تنسيق كمية الورد بصيغة عربية سليمة (١ جزء / ٢ جزئين / ٣ أجزاء). */
export function formatWordAmount(unit: QuranWordUnit, amount: number): string {
  const meta = UNIT_META[unit];
  const rounded = Math.round(amount * 100) / 100;
  if (rounded === 1) return meta.singular;
  if (rounded === 2) return meta.dual;
  if (Number.isInteger(rounded) && rounded >= 3 && rounded <= 10) return `${rounded} ${meta.plural}`;
  return `${rounded} ${meta.singular}`;
}

/**
 * تحويل عدد آيات مقروءة إلى كميات الورد المختارة — نقية بلا أي I/O.
 * التقدير: الآيات ← صفحات (بمتوسط AYAHS_PER_PAGE) ← الوحدة.
 */
export function ayahsToWordAmount(ayahsRead: number, unit: QuranWordUnit): number {
  const safeAyahs = Math.max(0, ayahsRead);
  if (unit === "ayat") return safeAyahs;
  const pages = (safeAyahs * QURAN_TOTAL_PAGES) / QURAN_TOTAL_AYAHS;
  return pages / UNIT_META[unit].pagesPerUnit;
}

/** التحويل العكسي: كمية بالوحدة ← تقدير بعدد الآيات (للعرض فقط). */
export function wordAmountToAyahs(amount: number, unit: QuranWordUnit): number {
  const safeAmount = Math.max(0, amount);
  if (unit === "ayat") return safeAmount;
  const pages = safeAmount * UNIT_META[unit].pagesPerUnit;
  return (pages * QURAN_TOTAL_AYAHS) / QURAN_TOTAL_PAGES;
}

/** شكل تقدم الورد الجاهز للعرض. */
export interface QuranWordProgress {
  unit: QuranWordUnit;
  targetAmount: number;
  completedAmount: number;
  /** نسبة إنجاز 0..100. */
  percent: number;
  /** نصوص جاهزة: «٠٫٥ جزء من ١ جزء». */
  completedLabel: string;
  targetLabel: string;
  /** تقدير الهدف بعدد الآيات (طبقة العرض فقط — المكافأة على العدّاد الحقيقي). */
  ayahsEquivalent: number;
}

/**
 * حساب تقدم ورد اليوم بالوحدة المختارة من عدد الآيات المقروءة.
 * نقية بالكامل — تُختبر في lib/islamic/__tests__ وتُستخدم في القارئ والإعدادات.
 */
export function computeQuranWordProgress(
  ayahsRead: number,
  unit: QuranWordUnit,
  targetAmount: number,
): QuranWordProgress {
  const safeTarget = Math.max(0, targetAmount);
  const completedAmount = ayahsToWordAmount(ayahsRead, unit);
  const percent = safeTarget > 0 ? Math.min((completedAmount / safeTarget) * 100, 100) : 0;
  return {
    unit,
    targetAmount: safeTarget,
    completedAmount,
    percent: Math.round(percent * 10) / 10,
    completedLabel: formatWordAmount(unit, completedAmount),
    targetLabel: formatWordAmount(unit, safeTarget),
    ayahsEquivalent: Math.round(wordAmountToAyahs(safeTarget, unit)),
  };
}

/** تحديد الكمية الافتراضية المناسبة عند تبديل الوحدة (للإعدادات). */
export function defaultAmountForUnit(unit: QuranWordUnit): number {
  return DEFAULT_WORD_AMOUNT[unit];
}

/* ------------------------------------------------------------------ */
/* Settings — also centralized here so no scattered localStorage calls */
/* ------------------------------------------------------------------ */

export interface IslamicSettings {
  /** Location object (kept for backward compat with stored shape). */
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  locationMode?: "automatic" | "manual";
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: string;
  madhab: "shafi" | "hanafi";
  quranDailyTarget: number;
  /** وحدة ورد القرآن اليومي — الافتراضي «آيات» (نفس الهدف القديم). */
  quranWordUnit: QuranWordUnit;
  /** كمية الورد بالوحدة المختارة (للوحدات غير الآيات — الآيات على quranDailyTarget). */
  quranWordAmount: number;
  selectedReciterId: number | null;
  prayerNotifications: boolean;
  adhanEnabled: boolean;
  reminderMinutes: number;
  morningAdhkarReminder: boolean;
  eveningAdhkarReminder: boolean;
  sleepAdhkarReminder: boolean;
}

/** Map legacy stored method NAMES back to ids (pre-fix stored value bug). */
const METHOD_NAME_TO_ID: Record<string, string> = {
  "رابطة العالم الإسلامي": "muslim_world_league",
  "الهيئة المصرية للمساحة": "egyptian",
  "جامعة العلوم الإسلامية كراتشي": "karachi",
  "أم القرى": "umm_al_qura",
  "دبي": "dubai",
  "لجنة رؤية الهلال": "moonsighting_committee",
  "أمريكا الشمالية (ISNA)": "north_america",
  "الكويت": "kuwait",
  "قطر": "qatar",
  "سنغافورة": "singapore",
};

/** Normalize a calculationMethod value (id or legacy Arabic name) to id. */
export function normalizeCalculationMethod(value: string): string {
  if (!value) return "egyptian";
  // Already an id?
  if (value === value.toLowerCase() && !/\s/.test(value.trim())) {
    return value;
  }
  return METHOD_NAME_TO_ID[value] ?? "egyptian";
}

export const DEFAULT_ISLAMIC_SETTINGS: IslamicSettings = {
  location: {
    city: "القاهرة",
    country: "مصر",
    latitude: 30.0444,
    longitude: 31.2357,
    timezone: "Africa/Cairo",
  },
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: "Africa/Cairo",
  locationMode: "manual",
  calculationMethod: "egyptian",
  madhab: "shafi",
  quranDailyTarget: 10,
  quranWordUnit: "ayat",
  quranWordAmount: 10,
  selectedReciterId: 1, // Al-Afasy
  prayerNotifications: false,
  adhanEnabled: false,
  reminderMinutes: 10,
  morningAdhkarReminder: false,
  eveningAdhkarReminder: false,
  sleepAdhkarReminder: false,
};

export function loadSettings(): IslamicSettings {
  if (typeof window === "undefined") return DEFAULT_ISLAMIC_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_ISLAMIC_SETTINGS;
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_ISLAMIC_SETTINGS, ...parsed };

    // Normalize legacy stored location object into flat + nested fields.
    if (parsed.location) {
      merged.location = { ...DEFAULT_ISLAMIC_SETTINGS.location, ...parsed.location };
      if (merged.latitude === DEFAULT_ISLAMIC_SETTINGS.latitude && parsed.location.latitude !== undefined) {
        merged.latitude = parsed.location.latitude;
      }
      if (merged.longitude === DEFAULT_ISLAMIC_SETTINGS.longitude && parsed.location.longitude !== undefined) {
        merged.longitude = parsed.location.longitude;
      }
      if (parsed.location.timezone) {
        merged.timezone = parsed.location.timezone;
      }
    }

    // Normalize calculation method (fixes legacy name-value bug).
    merged.calculationMethod = normalizeCalculationMethod(merged.calculationMethod);

    // Normalize وحدة الورد — قيم قديمة/تالفة ترجع للافتراضي المتوافق.
    if (!isQuranWordUnit(merged.quranWordUnit)) {
      merged.quranWordUnit = DEFAULT_ISLAMIC_SETTINGS.quranWordUnit;
    }
    const wordUnit: QuranWordUnit = merged.quranWordUnit;
    if (!Number.isFinite(merged.quranWordAmount) || (merged.quranWordAmount ?? 0) < 1) {
      merged.quranWordAmount = DEFAULT_WORD_AMOUNT[wordUnit];
    }

    return merged;
  } catch {
    return DEFAULT_ISLAMIC_SETTINGS;
  }
}

export function saveSettings(settings: IslamicSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** Subscribe to settings changes (other tabs / components). */
export function subscribeSettings(callback: (settings: IslamicSettings) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(loadSettings());
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/* ================================================================ */
/* DB-backed version (replaces localStorage abstraction)          */
/* Call after db/worship.sql has been applied in Supabase         */
/* ================================================================ */

import { createClient } from "@/lib/supabase/client";

export async function getWorshipProgressDB(userId: string, day?: string): Promise<any> {
  const supabase = createClient();
  const targetDay = day || localWorshipDate(new Date(), loadSettings().timezone);
  const { data, error } = await supabase
    .from("worship_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("day", targetDay)
    .single();
  if (error) return null;
  return data;
}

export async function upsertWorshipProgressDB(
  userId: string,
  prayers?: any,
  adhkar?: any,
  quranAyahs?: number
): Promise<void> {
  const supabase = createClient();
  const day = localWorshipDate(new Date(), loadSettings().timezone);
  const { error } = await supabase.rpc("upsert_worship_progress", {
    p_prayers: prayers ?? {},
    p_adhkar: adhkar ?? {},
    p_quran_ayahs: quranAyahs ?? 0,
    p_day: day,
  });
  if (error) console.error("worship-progress DB upsert failed:", error);
}

export async function getWorshipSettingsDB(): Promise<any> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_worship_settings");
  if (error) return { isDefault: true, quran_daily_target: 10 };
  return (data && (data as any[])[0]) || null;
}