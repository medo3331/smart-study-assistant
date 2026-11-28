/* ==========================================================================
   تقدّم العبادة في الداتابيز — الجسر بين نظام localStorage الموجود
   (lib/islamic/worship-progress.ts) وحساب المستخدم الحقيقي.

   الفكرة: كل كتابة محلية بتنادي `syncToSupabase` (fire-and-forget) فالتقدّم
   يبقى على الحساب مش على الجهاز. القراءة للعرض بتاخد **أقصى** المحلي
   والمُحمَّل من الداتابيز — عشان أول ثانية بعد الفتح (قبل ما Supabase يرد)
   المستخدم يشوف تقدّمه المحلي، وبعد المزامنة الأعلى هو الصح.

   ⚠️ مفيش مكافآت هنا خالص — الصرف كله في lib/worship-rewards.ts والداتابيز.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WorshipDayRecord,
  IslamicSettings,
} from "@/lib/islamic/worship-progress";

/* -------------------------------------------------------------------------- */
/* أنواع                                                                      */
/* -------------------------------------------------------------------------- */

export interface WorshipCloudDay {
  prayers: Record<string, boolean>;
  adhkar: Record<string, number>;
  quranAyahs: number;
}

export interface WorshipSummary {
  day: string;
  cloud: WorshipCloudDay;
  coinsBalance: number;
  coinsToday: number;
  streak: number;
}

export interface QuranReadingPosition {
  surahId: number;
  ayahId: number;
  updatedAt: string;
}

interface SummaryRow {
  day: string;
  prayers: Record<string, boolean> | null;
  adhkar: Record<string, number> | null;
  quran_ayahs: number | null;
  coins_balance: number | null;
  coins_today: number | null;
  streak: number | null;
}

/* -------------------------------------------------------------------------- */
/* أدوات صغيرة                                                                */
/* -------------------------------------------------------------------------- */

/** اليوم بتوقيت UTC — نفس اللي دوال الداتابيز بتستخدمه. */
export function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

function numMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" && v > 0) out[k] = v;
    }
  }
  return out;
}

/** تحويل سجل اليوم المحلي لشكل الداتابيز. */
export function recordToCloud(record: WorshipDayRecord): WorshipCloudDay {
  const prayers: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(record.prayers ?? {})) {
    if (v) prayers[k] = true;
  }
  const adhkar: Record<string, number> = {};
  for (const [k, v] of Object.entries(record.adhkar ?? {})) {
    if (typeof v?.count === "number" && v.count > 0) adhkar[k] = v.count;
  }
  return {
    prayers,
    adhkar,
    quranAyahs: Math.max(0, Math.floor(record.quran?.dailyCount ?? 0)),
  };
}

/* -------------------------------------------------------------------------- */
/* الكتابة                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * مزامنة تقدّم اليوم مع الداتابيز (fire-and-forget من الطبقة المحلية).
 * فشلها مسموح ومسجّل في الكونسول — التقدّم المحلي هو الأساس، والمزامنة
 * بترفع الأرقام، ومابتصرفش أي مكافأة.
 */
export async function syncWorshipProgress(
  supabase: SupabaseClient,
  record: WorshipDayRecord,
): Promise<boolean> {
  const cloud = recordToCloud(record);
  try {
    const { error } = await supabase.rpc("upsert_worship_progress", {
      p_prayers: cloud.prayers,
      p_adhkar: cloud.adhkar,
      p_quran_ayahs: cloud.quranAyahs,
      p_day: record.date,
    });
    if (error) {
      console.warn("syncWorshipProgress:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("syncWorshipProgress failed:", err);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* القراءة                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * ملخص اليوم من الداتابيز: تقدّم مُخزَّن + رصيد الكوينز + مكافآت النهارده +
 * السلسلة. `null` لو الجداول مش متعمولة أو مفيش جلسة — الواجهة بتتعامل
 * مع ده برجوع للمحلي بس، من غير رسايل حمرا.
 */
export async function fetchWorshipSummary(
  supabase: SupabaseClient,
): Promise<WorshipSummary | null> {
  try {
    const { data, error } = await supabase.rpc("worship_daily_summary");
    if (error || !data) {
      // جداول العبادة مش متعمولة بعد — وضع متوقع، مش عطل.
      console.warn("fetchWorshipSummary:", error?.message ?? "no data");
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as SummaryRow;
    return {
      day: row.day,
      cloud: {
        prayers: row.prayers ?? {},
        adhkar: numMap(row.adhkar),
        quranAyahs: row.quran_ayahs ?? 0,
      },
      coinsBalance: row.coins_balance ?? 0,
      coinsToday: row.coins_today ?? 0,
      streak: row.streak ?? 0,
    };
  } catch (err) {
    console.warn("fetchWorshipSummary failed:", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* موضع قراءة القرآن — حساب المستخدم مع localStorage كنسخة احتياطية            */
/* -------------------------------------------------------------------------- */

export async function fetchCloudQuranPosition(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuranReadingPosition | null> {
  try {
    const { data, error } = await supabase
      .from("quran_reading_positions")
      .select("surah_id, ayah_id, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { surah_id: number; ayah_id: number; updated_at: string };
    if (!Number.isInteger(row.surah_id) || row.surah_id < 1 || row.surah_id > 114 || !Number.isInteger(row.ayah_id) || row.ayah_id < 1 || !row.updated_at) return null;
    return { surahId: row.surah_id, ayahId: row.ayah_id, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

export async function saveCloudQuranPosition(
  supabase: SupabaseClient,
  userId: string,
  position: QuranReadingPosition,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("quran_reading_positions").upsert({
      user_id: userId,
      surah_id: position.surahId,
      ayah_id: position.ayahId,
      updated_at: position.updatedAt,
    }, { onConflict: "user_id" });
    if (error) {
      console.warn("saveCloudQuranPosition:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("saveCloudQuranPosition failed:", error);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* الإعدادات السحابية                                                          */
/* -------------------------------------------------------------------------- */

export interface CloudIslamicSettings {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculation_method: string;
  madhab: string;
  quran_daily_target: number;
  /** وحدة ورد القرآن اليومي (db/122) — «ayat» افتراضي متوافق. */
  quran_word_unit?: string;
  /** كمية الورد بالوحدة المختارة. */
  quran_word_amount?: number;
}

interface SettingsRow {
  islamic_settings: Partial<CloudIslamicSettings> | null;
}

/**
 * إعدادات العبادة المحفوظة على البروفايل — أو `null` لو مفيش.
 * القاهرة هنا مش موجودة: مفيش fallback مكتوب في السحابة، الفول باك
 * المحلي (القاهرة) بيقرر بس لو مافيش ولا إعداد محفوظ في أي مكان.
 */
export async function fetchCloudSettings(
  supabase: SupabaseClient,
): Promise<Partial<IslamicSettings> | null> {
  try {
    const { data, error } = await supabase.rpc("get_worship_settings");
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as SettingsRow;
    const s = row?.islamic_settings;
    if (!s || typeof s !== "object") return null;

    const out: Partial<IslamicSettings> = {};
    if (typeof s.latitude === "number") out.latitude = s.latitude;
    if (typeof s.longitude === "number") out.longitude = s.longitude;
    if (typeof s.timezone === "string") out.timezone = s.timezone;
    if (typeof s.calculation_method === "string")
      out.calculationMethod = s.calculation_method;
    if (s.madhab === "shafi" || s.madhab === "hanafi") out.madhab = s.madhab;
    if (typeof s.quran_daily_target === "number")
      out.quranDailyTarget = s.quran_daily_target;
    // وحدة ورد القرآن (db/122) — قيم غير معروفة تتجاهل بهدوء والافتراضي محلي.
    if (
      s.quran_word_unit === "ayat" ||
      s.quran_word_unit === "pages" ||
      s.quran_word_unit === "quarters" ||
      s.quran_word_unit === "ahzab" ||
      s.quran_word_unit === "ajzaa"
    ) {
      out.quranWordUnit = s.quran_word_unit;
    }
    if (
      typeof s.quran_word_amount === "number" &&
      Number.isInteger(s.quran_word_amount) &&
      s.quran_word_amount >= 1 &&
      s.quran_word_amount <= 240
    ) {
      out.quranWordAmount = s.quran_word_amount;
    }
    if (typeof s.city === "string" && typeof s.country === "string") {
      out.location = {
        city: s.city,
        country: s.country,
        latitude: s.latitude ?? 0,
        longitude: s.longitude ?? 0,
        timezone: s.timezone ?? "UTC",
      };
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * حفظ إعدادات العبادة على البروفايل (RPC security definer).
 * بيرجع true لو اتحفظت فعلاً — الفشل مسموح ومتجاهل (المحلي شغّال زي ما هو).
 */
export async function saveCloudSettings(
  supabase: SupabaseClient,
  settings: IslamicSettings,
): Promise<boolean> {
  try {
    const payload = {
      city: settings.location?.city ?? "",
      country: settings.location?.country ?? "",
      latitude: settings.latitude,
      longitude: settings.longitude,
      timezone: settings.timezone,
      calculation_method: settings.calculationMethod,
      madhab: settings.madhab,
      quran_daily_target: settings.quranDailyTarget,
      // ورد القرآن (db/122) — آيات على العدّاد القديم، وباقي الوحدات كمية مستقلة.
      quran_word_unit: settings.quranWordUnit,
      quran_word_amount: settings.quranWordAmount,
    };
    const { error } = await supabase.rpc("save_worship_settings", {
      p_settings: payload,
    });
    if (error) {
      console.warn("saveCloudSettings:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("saveCloudSettings failed:", err);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* الأسئلة الدينية — لوحة الترتيب الأسبوعية (db/120)                            */
/* -------------------------------------------------------------------------- */

export interface QuizLeaderboardRow {
  userId: string;
  playerName: string;
  bestScore: number;
  sessionsCount: number;
}

interface LeaderboardRow {
  player_name: string | null;
  best_score: number | null;
  sessions_count: number | null;
}

/**
 * أفضل النتائج في آخر ٧ أيام — عبر worship_quiz_top() (SECURITY DEFINER):
 * لوحة الترتيب العامة بتفضح الأعمدة الآمنة بس وبتتجاوز RLS owner-only.
 * `null` لو الجدول/الـ view مش متعمول بعد — الواجهة بتتعامل مع ده بهدوء.
 */
export async function fetchWorshipQuizLeaderboard(
  supabase: SupabaseClient,
  limit = 10,
): Promise<QuizLeaderboardRow[] | null> {
  try {
    const { data, error } = await supabase.rpc("worship_quiz_top", { n: limit });
    if (error || !data) {
      console.warn("fetchWorshipQuizLeaderboard:", error?.message ?? "no data");
      return null;
    }
    return (data as LeaderboardRow[]).map((row, i) => ({
      userId: `rank-${i}`,
      playerName: row.player_name || "قارئ",
      bestScore: row.best_score ?? 0,
      sessionsCount: row.sessions_count ?? 0,
    }));
  } catch (err) {
    console.warn("fetchWorshipQuizLeaderboard failed:", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* العلامات المرجعية للقرآن — حساب المستخدم (db/122) مع localStorage كاحتياطي   */
/* -------------------------------------------------------------------------- */

export interface QuranBookmark {
  surahId: number;
  ayahId: number;
}

function isValidBookmark(b: unknown): b is QuranBookmark {
  if (!b || typeof b !== "object") return false;
  const candidate = b as { surah_id?: unknown; ayah_id?: unknown };
  return (
    Number.isInteger(candidate.surah_id) && (candidate.surah_id as number) >= 1 && (candidate.surah_id as number) <= 114 &&
    Number.isInteger(candidate.ayah_id) && (candidate.ayah_id as number) >= 1 && (candidate.ayah_id as number) <= 286
  );
}

/**
 * العلامات المرجعية المحفوظة على الحساب — `null` لو الجدول مش متعمول بعد
 * أو فشل النداء (وضع متوقع للزوار/قبل تطبيق db/122 — مش عطل).
 */
export async function fetchCloudQuranBookmarks(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuranBookmark[] | null> {
  try {
    const { data, error } = await supabase
      .from("quran_bookmarks")
      .select("surah_id, ayah_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("fetchCloudQuranBookmarks:", error.message);
      return null;
    }
    if (!Array.isArray(data)) return null;
    return (data as { surah_id: number; ayah_id: number }[]).filter(isValidBookmark).map((row) => ({
      surahId: row.surah_id,
      ayahId: row.ayah_id,
    }));
  } catch (err) {
    console.warn("fetchCloudQuranBookmarks failed:", err);
    return null;
  }
}

/** إضافة علامة مرجعية على الحساب — fire-and-forget، الفشل مسموح (المحلي شغّال). */
export async function addCloudQuranBookmark(
  supabase: SupabaseClient,
  userId: string,
  bookmark: QuranBookmark,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("quran_bookmarks")
      .upsert(
        { user_id: userId, surah_id: bookmark.surahId, ayah_id: bookmark.ayahId },
        { onConflict: "user_id,surah_id,ayah_id" },
      );
    if (error) {
      console.warn("addCloudQuranBookmark:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("addCloudQuranBookmark failed:", err);
    return false;
  }
}

/** حذف علامة مرجعية من الحساب — fire-and-forget. */
export async function removeCloudQuranBookmark(
  supabase: SupabaseClient,
  userId: string,
  bookmark: QuranBookmark,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("quran_bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("surah_id", bookmark.surahId)
      .eq("ayah_id", bookmark.ayahId);
    if (error) {
      console.warn("removeCloudQuranBookmark:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("removeCloudQuranBookmark failed:", err);
    return false;
  }
}
