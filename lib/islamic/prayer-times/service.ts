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

interface PrayerTimesRequestParams {
  date: Date;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: CalculationMethodId;
  madhab: MadhabId;
}

// ============================================================================
// Calculation Method Mapping
// ============================================================================

const CALCULATION_METHOD_MAP: Record<CalculationMethodId, number> = {
  muslim_world_league: 3,
  egyptian: 5,
  karachi: 4,
  umm_al_qura: 2,
  dubai: 8,
  moonsighting_committee: 6,
  north_america: 7,
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
  2: "Umm Al-Qura University, Makkah",
  3: "Muslim World League",
  4: "Islamic Society of North America (ISNA)",
  5: "Egyptian General Authority of Survey",
  6: "Moonsighting Committee",
  7: "North America (ISNA)",
  8: "Dubai",
  9: "Kuwait",
  10: "Qatar",
  11: "Singapore (MUIS)",
  12: "Turkey (Diyanet)",
  13: "Russia (Spiritual Administration)",
  14: "France (Union Organization)",
  15: "Morocco",
  16: "Indonesia (Kementerian Agama)",
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
  const dateStr = params.date.toISOString().split("T")[0];
  return `${dateStr}|${params.latitude}|${params.longitude}|${params.calculationMethod}|${params.madhab}|${params.timezone}`;
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Fetch prayer times from AlAdhan API
 */
async function fetchFromAlAdhan(params: PrayerTimesRequestParams): Promise<AlAdhanResponse> {
  const methodId = CALCULATION_METHOD_MAP[params.calculationMethod] || DEFAULT_METHOD;
  const madhabId = MADHAB_MAP[params.madhab] || DEFAULT_MADHAB;
  
  const dateStr = params.date.toISOString().split("T")[0];
  const [day, month, year] = dateStr.split("-").reverse().join("-").split("-"); // DD-MM-YYYY
  
  const url = new URL(`${ALADHAN_API_BASE}/timings/${day}-${month}-${year}`);
  url.searchParams.set("latitude", params.latitude.toString());
  url.searchParams.set("longitude", params.longitude.toString());
  url.searchParams.set("method", methodId.toString());
  url.searchParams.set("school", madhabId.toString());
  url.searchParams.set("timezone", params.timezone);
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

  return data;
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

  // Compute methodId for METHOD_NAMES lookup
  const methodId = CALCULATION_METHOD_MAP[params.calculationMethod] || DEFAULT_METHOD;
  
  // Parse timestamps for each prayer
  const now = new Date();
  const baseDate = new Date(now);
  baseDate.setHours(0, 0, 0, 0);
  
  const parseTimeToTimestamp = (timeStr: string, base: Date): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const result = new Date(base);
    result.setHours(hours, minutes, 0, 0);
    return result.getTime();
  };

  const prayerNames = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha", "Imsak", "Midnight"] as const;
  const timestamps: Record<string, number> = {};
  
  for (const prayer of prayerNames) {
    const timeStr = timings[prayer];
    if (timeStr) {
      timestamps[prayer.toLowerCase()] = parseTimeToTimestamp(timeStr, baseDate);
    }
  }

  // Determine next prayer
  const nextPrayer = getNextPrayerFromTimestamps(timestamps, now);

  // Build display location name
  const displayName = params.latitude && params.longitude 
    ? `${params.latitude.toFixed(4)}, ${params.longitude.toFixed(4)}`
    : "Unknown Location";

  return {
    date: params.date.toISOString().split("T")[0],
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
      fajr: timings.Fajr,
      sunrise: timings.Sunrise,
      dhuhr: timings.Dhuhr,
      asr: timings.Asr,
      maghrib: timings.Maghrib,
      isha: timings.Isha,
      imsak: timings.Imsak,
      midnight: timings.Midnight,
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
  now: Date
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
        time: new Date(timestamp).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: false }),
        timestamp,
        isNext: true,
        isCurrent: false,
      };
    }
  }

  // If all prayers passed, next is Fajr tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const fajrTomorrow = timestamps.fajr + 24 * 60 * 60 * 1000;
  
  return {
    name: "Fajr",
    arabicName: "الفجر",
    time: new Date(fajrTomorrow).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: false }),
    timestamp: fajrTomorrow,
    isNext: true,
    isCurrent: false,
  };
}

// ============================================================================
// Public Service Functions
// ============================================================================

/**
 * Get prayer times for a specific date and location
 * Uses cache when available, otherwise fetches from AlAdhan API
 */
export async function getPrayerTimes(params: PrayerTimesRequestParams): Promise<PrayerTimes> {
  const cacheKey = generateCacheKey(params);
  const cached = prayerTimesCache.get(cacheKey);

  // Return cached data if still valid
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
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
      // Try to return stale cache if available
      if (cached) {
        console.warn("AlAdhan API failed, returning stale cache:", error);
        return cached.data;
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
  madhab: MadhabId = "shafi"
): Promise<PrayerTimes> {
  return getPrayerTimes({
    date: new Date(),
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