/**
 * AlAdhan Prayer Times Service
 * 
 * Server-side service for fetching and normalizing prayer times from AlAdhan API.
 * Implements caching, error handling, and response normalization.
 * 
 * API Documentation: https://aladhan.com/prayer-times-api
 */

import type { PrayerTimes, PrayerTime } from "../types";
import type { CalculationMethodId, MadhabId } from "../prayer-times";
import { dateInTimeZone, zonedDateTimeToTimestamp } from "./timezone";

// ============================================================================
// Configuration
// ============================================================================

const ALADHAN_API_BASE = process.env.ALADHAN_API_BASE_URL || "https://api.aladhan.com/v1";
const DEFAULT_METHOD = parseInt(process.env.DEFAULT_CALCULATION_METHOD || "5", 10);
const DEFAULT_MADHAB = parseInt(process.env.DEFAULT_MADHAB || "1", 10);

// In-memory cache (in production, use Redis or similar)
interface CacheEntry {
  data: PrayerTimes;
  expiresAt: number;
}

const prayerTimesCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// ============================================================================
// Type Definitions
// ============================================================================

interface AlAdhanTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
  Imsak?: string;
  Midnight?: string;
}

interface AlAdhanResponse {
  code: number;
  status: string;
  data: {
    timings: AlAdhanTimings;
    date: {
      readable: string;
      timestamp: string;
      gregorian: { date: string };
      hijri: {
        date: string;
        format: string;
        day: string;
        weekday: { en: string; ar: string };
        month: { en: string; ar: string; number: number };
        year: string;
      };
    };
    meta: {
      latitude: number;
      longitude: number;
      timezone: string;
      method: {
        id: number;
        name: string;
        params: {
          Fajr: number | null;
          Isha: number | null;
          IshaInterval: number | null;
        };
      };
    };
  };
}

export interface PrayerTimesRequestParams {
  date: Date;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: CalculationMethodId;
  madhab: MadhabId;
  /** Explicit local calendar date (YYYY-MM-DD), when supplied by the caller. */
  localDate?: string;
}

// ============================================================================
// Calculation Method Mapping
// ============================================================================

const CALCULATION_METHOD_MAP: Record<CalculationMethodId, number> = {
  muslim_world_league: 3,
  egyptian: 5,
  karachi: 1,
  umm_al_qura: 4,
  dubai: 16,
  moonsighting_committee: 15,
  north_america: 2,
  kuwait: 9,
  qatar: 10,
  singapore: 11,
};

const MADHAB_MAP: Record<MadhabId, number> = {
  shafi: 1,
  hanafi: 2,
};

const METHOD_NAMES: Record<number, string> = {
  1: "University of Islamic Sciences, Karachi",
  2: "Islamic Society of North America (ISNA)",
  3: "Muslim World League",
  4: "Umm Al-Qura University, Makkah",
  5: "Egyptian General Authority of Survey",
  8: "Gulf Region",
  9: "Kuwait",
  10: "Qatar",
  11: "Singapore (MUIS)",
  12: "Turkey (Diyanet)",
  13: "Russia (Spiritual Administration)",
  14: "France (Union Organization)",
  15: "Moonsighting Committee",
  16: "Dubai",
  17: "Tunisia",
  18: "Algeria",
  19: "Malaysia (JAKIM)",
  20: "Portugal (Comunidate Islamica)",
  21: "Custom",
  99: "Custom",
};

// ============================================================================
// Cache Key Generation
// ============================================================================

function generateCacheKey(params: PrayerTimesRequestParams): string {
  const dateStr = params.localDate ?? dateInTimeZone(params.date, params.timezone);
  return `${dateStr}|${params.latitude}|${params.longitude}|${params.calculationMethod}|${params.madhab}|${params.timezone}`;
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Fetch prayer times from AlAdhan API
 */
async function fetchFromAlAdhan(params: PrayerTimesRequestParams): Promise<AlAdhanResponse> {
  const methodId = CALCULATION_METHOD_MAP[params.calculationMethod] ?? DEFAULT_METHOD;
  const madhabId = MADHAB_MAP[params.madhab] ?? DEFAULT_MADHAB;
  
  const dateStr = params.localDate ?? dateInTimeZone(params.date, params.timezone);
  const [year, month, day] = dateStr.split("-");
  
  const url = new URL(`${ALADHAN_API_BASE}/timings/${day}-${month}-${year}`);
  url.searchParams.set("latitude", params.latitude.toString());
  url.searchParams.set("longitude", params.longitude.toString());
  url.searchParams.set("method", methodId.toString());
  url.searchParams.set("school", madhabId.toString());
  url.searchParams.set("timezonestring", params.timezone);
  url.searchParams.set("iso8601", "false");

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
    },
    // 10 second timeout
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`AlAdhan API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as AlAdhanResponse;
  
  if (data.code !== 200 || data.status !== "OK") {
    throw new Error(`AlAdhan API returned error: ${data.status}`);
  }
  if (!data.data?.date?.gregorian?.date || !data.data?.timings || !data.data?.meta) {
    throw new Error("AlAdhan API returned an incomplete response");
  }

  const expectedDate = params.localDate ?? dateInTimeZone(params.date, params.timezone);
  const expectedAlAdhanDate = expectedDate.split("-").reverse().join("-");
  const responseDate = data.data?.date?.gregorian?.date;
  const [responseDay, responseMonth, responseYear] = responseDate?.split("-") ?? [];
  const normalizedResponseDate = `${responseYear}-${responseMonth}-${responseDay}`;
  if (normalizedResponseDate !== expectedDate) {
    throw new Error(`AlAdhan returned a different date than requested (${expectedDate})`);
  }

  return data;
}

/**
 * AlAdhan (iso8601=false) بيرجع أوقات زي "05:12 (EET)" — نشيل لاحقة المنطقة
 * الزمنية قبل تحليل الوقت، وإلا Number("12 (EET)") = NaN.
 */
function cleanTime(timeStr: string): string {
  return timeStr.replace(/\s*\(.*?\)\s*$/, "").trim();
}

/**
 * Normalize AlAdhan response to internal PrayerTimes model
 */
function normalizeAlAdhanResponse(
  response: AlAdhanResponse,
  params: PrayerTimesRequestParams
): PrayerTimes {
  const { data } = response;
  const { timings, meta, date } = data;
  const localDate = params.localDate ?? dateInTimeZone(params.date, params.timezone);

  // Compute methodId for METHOD_NAMES lookup
  const methodId = CALCULATION_METHOD_MAP[params.calculationMethod] ?? DEFAULT_METHOD;
  
  // Parse timestamps for each prayer
  const now = new Date();

  const parseTimeToTimestamp = (timeStr: string): number =>
    zonedDateTimeToTimestamp(localDate, cleanTime(timeStr), params.timezone);

  const prayerNames = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha", "Imsak", "Midnight"] as const;
  const timestamps: Record<string, number> = {};
  
  for (const prayer of prayerNames) {
    const timeStr = timings[prayer];
    if (timeStr) {
      timestamps[prayer.toLowerCase()] = parseTimeToTimestamp(timeStr);
    }
  }

  // Determine next prayer
  const nextPrayer = getNextPrayerFromTimestamps(timestamps, now, params.timezone, timings, localDate);

  // Build display location name
  const displayName = Number.isFinite(params.latitude) && Number.isFinite(params.longitude)
    ? `${params.latitude.toFixed(4)}, ${params.longitude.toFixed(4)}`
    : "Unknown Location";

  return {
    date: localDate,
    timezone: meta.timezone,
    location: {
      latitude: meta.latitude,
      longitude: meta.longitude,
      displayName,
    },
    calculationMethod: {
      id: params.calculationMethod,
      name: METHOD_NAMES[methodId] || params.calculationMethod,
      params: {
        fajrAngle: meta.method.params.Fajr,
        ishaAngle: meta.method.params.Isha,
        ishaInterval: meta.method.params.IshaInterval,
      },
    },
    madhab: {
      id: params.madhab,
      name: params.madhab === "shafi" ? "الشافعي" : "الحنفي",
    },
    prayers: {
      fajr: timings.Fajr.split(" ")[0],
      sunrise: timings.Sunrise.split(" ")[0],
      dhuhr: timings.Dhuhr.split(" ")[0],
      asr: timings.Asr.split(" ")[0],
      maghrib: timings.Maghrib.split(" ")[0],
      isha: timings.Isha.split(" ")[0],
      imsak: timings.Imsak?.split(" ")[0],
      midnight: timings.Midnight?.split(" ")[0],
    },
    timestamps: {
      fajr: timestamps.fajr,
      sunrise: timestamps.sunrise,
      dhuhr: timestamps.dhuhr,
      asr: timestamps.asr,
      maghrib: timestamps.maghrib,
      isha: timestamps.isha,
      imsak: timestamps.imsak,
      midnight: timestamps.midnight,
    },
    nextPrayer,
    hijriDate: date.hijri.date,
  };
}

/**
 * Get next prayer from timestamps
 */
function getNextPrayerFromTimestamps(
  timestamps: Record<string, number>,
  now: Date,
  timezone: string,
  timings: AlAdhanTimings,
  localDate: string,
): PrayerTime | null {
  const prayerOrder = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
  const arabicNames: Record<string, string> = {
    fajr: "الفجر",
    sunrise: "الشروق",
    dhuhr: "الظهر",
    asr: "العصر",
    maghrib: "المغرب",
    isha: "العشاء",
  };

  const currentTime = now.getTime();

  for (const prayer of prayerOrder) {
    const timestamp = timestamps[prayer];
    if (timestamp && timestamp > currentTime) {
      return {
        name: prayer.charAt(0).toUpperCase() + prayer.slice(1),
        arabicName: arabicNames[prayer],
        time: timings[prayer === "fajr" ? "Fajr" : prayer === "sunrise" ? "Sunrise" : prayer === "dhuhr" ? "Dhuhr" : prayer === "asr" ? "Asr" : prayer === "maghrib" ? "Maghrib" : "Isha"].split(" ")[0],
        timestamp,
        isNext: true,
        isCurrent: false,
      };
    }
  }

  // If all prayers passed, next is Fajr tomorrow
  const [year, month, day] = localDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextLocalDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;
  const fajrTomorrow = zonedDateTimeToTimestamp(nextLocalDate, cleanTime(timings.Fajr), timezone);
  
  return {
    name: "Fajr",
    arabicName: "الفجر",
    time: timings.Fajr.split(" ")[0],
    timestamp: fajrTomorrow,
    isNext: true,
    isCurrent: false,
  };
}

function nextPrayerForCached(
  prayerTimes: PrayerTimes,
  params: PrayerTimesRequestParams,
  now: Date,
): PrayerTime | null {
  const timestamps: Record<string, number> = { ...prayerTimes.timestamps };
  const timings: AlAdhanTimings = {
    Fajr: prayerTimes.prayers.fajr,
    Sunrise: prayerTimes.prayers.sunrise,
    Dhuhr: prayerTimes.prayers.dhuhr,
    Asr: prayerTimes.prayers.asr,
    Maghrib: prayerTimes.prayers.maghrib,
    Isha: prayerTimes.prayers.isha,
    Imsak: prayerTimes.prayers.imsak,
    Midnight: prayerTimes.prayers.midnight,
  };
  return getNextPrayerFromTimestamps(
    timestamps,
    now,
    params.timezone,
    timings,
    prayerTimes.date,
  );
}

// ============================================================================
// Public Service Functions
// ============================================================================

/**
 * Get prayer times for a specific date and location
 * Uses cache when available, otherwise fetches from AlAdhan API
 */
export async function getPrayerTimes(params: PrayerTimesRequestParams): Promise<PrayerTimes> {
  if (!Number.isFinite(params.latitude) || params.latitude < -90 || params.latitude > 90 || !Number.isFinite(params.longitude) || params.longitude < -180 || params.longitude > 180) {
    throw new Error("Invalid coordinates");
  }
  if (!Object.hasOwn(CALCULATION_METHOD_MAP, params.calculationMethod) || !Object.hasOwn(MADHAB_MAP, params.madhab)) {
    throw new Error("Invalid prayer calculation settings");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: params.timezone });
  } catch {
    throw new Error("Invalid IANA timezone");
  }

  const localDate = params.localDate ?? dateInTimeZone(params.date, params.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error("Invalid local date");
  const [year, month, day] = localDate.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== localDate) {
    throw new Error("Invalid local date");
  }

  const cacheKey = generateCacheKey({ ...params, localDate });
  const cached = prayerTimesCache.get(cacheKey);

  // Timings are cacheable, but the next-prayer marker must be recalculated
  // for every request (a previously upcoming prayer may have passed).
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, nextPrayer: nextPrayerForCached(cached.data, params, new Date()) };
  }

  try {
    const response = await fetchFromAlAdhan(params);
    const normalized = normalizeAlAdhanResponse(response, params);

    // Cache the result
    prayerTimesCache.set(cacheKey, {
      data: normalized,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return normalized;
  } catch (error) {
      // If the same date has stale timings, keep them but refresh the next prayer marker.
      if (cached) {
        console.warn("AlAdhan API failed, returning stale cache:", error);
        return { ...cached.data, nextPrayer: nextPrayerForCached(cached.data, params, new Date()) };
      }

      // Re-throw with more context - NEVER return mock data
      throw new Error(`Failed to fetch prayer times: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}

/**
 * Get prayer times for today (convenience function)
 */
export async function getTodayPrayerTimes(
  latitude: number,
  longitude: number,
  timezone: string,
  calculationMethod: CalculationMethodId = "egyptian",
  madhab: MadhabId = "shafi",
  date?: Date
): Promise<PrayerTimes> {
  const now = date ?? new Date();
  return getPrayerTimes({
    date: now,
    localDate: dateInTimeZone(now, timezone),
    latitude,
    longitude,
    timezone,
    calculationMethod,
    madhab,
  });
}

export async function getPrayerTimesForDate(
  localDate: string,
  latitude: number,
  longitude: number,
  timezone: string,
  calculationMethod: CalculationMethodId = "egyptian",
  madhab: MadhabId = "shafi",
): Promise<PrayerTimes> {
  const [year, month, day] = localDate.split("-").map(Number);
  // Noon UTC is only a stable carrier for the explicitly supplied local date;
  // AlAdhan receives that date and timezone as separate inputs.
  return getPrayerTimes({
    date: new Date(Date.UTC(year, month - 1, day, 12)),
    localDate,
    latitude,
    longitude,
    timezone,
    calculationMethod,
    madhab,
  });
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of prayerTimesCache.entries()) {
    if (entry.expiresAt <= now) {
      prayerTimesCache.delete(key);
    }
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  clearExpiredCache();
  return {
    size: prayerTimesCache.size,
    keys: Array.from(prayerTimesCache.keys()),
  };
}

/**
 * Preload prayer times for a date range (useful for calendar views)
 */
export async function preloadPrayerTimes(
  startDate: Date,
  endDate: Date,
  latitude: number,
  longitude: number,
  timezone: string,
  calculationMethod: CalculationMethodId,
  madhab: MadhabId
): Promise<PrayerTimes[]> {
  const results: PrayerTimes[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    try {
      const times = await getPrayerTimes({
        date: new Date(current),
        latitude,
        longitude,
        timezone,
        calculationMethod,
        madhab,
      });
      results.push(times);
    } catch (error) {
      console.warn(`Failed to preload prayer times for ${current.toISOString().split("T")[0]}:`, error);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return results;
}