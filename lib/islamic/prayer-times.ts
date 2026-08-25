import type { PrayerTimesData, PrayerTime } from "./types";
import type { PrayerTimes } from "./types";

export { 
  getPrayerTimes, 
  getTodayPrayerTimes, 
  clearExpiredCache, 
  getCacheStats, 
  preloadPrayerTimes 
} from "./prayer-times/service";

export { 
  getNextPrayer, 
  getCurrentPrayer, 
  getTimeUntilNextPrayer, 
  formatTimeRemaining, 
  getDayProgress, 
  isPrayerTime 
} from "./prayer-times/next-prayer";

// Re-export types for convenience
export type { PrayerTimes } from "./types";

/** Calculation methods */
export const CALCULATION_METHODS = [
  { id: "muslim_world_league", name: "رابطة العالم الإسلامي" },
  { id: "egyptian", name: "الهيئة المصرية للمساحة" },
  { id: "karachi", name: "جامعة العلوم الإسلامية كراتشي" },
  { id: "umm_al_qura", name: "أم القرى" },
  { id: "dubai", name: "دبي" },
  { id: "moonsighting_committee", name: "لجنة رؤية الهلال" },
  { id: "north_america", name: "أمريكا الشمالية (ISNA)" },
  { id: "kuwait", name: "الكويت" },
  { id: "qatar", name: "قطر" },
  { id: "singapore", name: "سنغافورة" },
] as const;

export type CalculationMethodId = typeof CALCULATION_METHODS[number]["id"];

/** Madhabs */
export const MADHABS = [
  { id: "shafi", name: "الشافعي" },
  { id: "hanafi", name: "الحنفي" },
] as const;

export type MadhabId = typeof MADHABS[number]["id"];

/**
 * Best-effort local Gregorian→Hijri conversion (civil tabular calendar).
 *
 * NOTE: This is a fallback only. The authoritative Hijri date comes from the
 * AlAdhan API response (`PrayerTimes.hijriDate`) and is what the UI shows in
 * normal operation. This function is used solely when the API is unavailable,
 * where an approximate date is better than nothing. For exact dates, rely on
 * the API value.
 */
export function getHijriDate(date: Date): string {
  const L = jd(date) - 1948440 + 10632;
  const n = Math.floor((L - 1) / 10631);
  const m = L - 10631 * n;
  let yc = 0;
  let rem = m - 1;
  while (yc < 30) {
    const leap = (11 * (yc + 1) + 14) % 30 < 11;
    const yearLen = leap ? 355 : 354;
    if (rem < yearLen) break;
    rem -= yearLen;
    yc++;
  }
  const hYear = 30 * n + yc - 29;
  const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
  let hMonth = 1;
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    if (rem < acc + monthLengths[i]) {
      hMonth = i + 1;
      break;
    }
    acc += monthLengths[i];
  }
  const hDay = rem - acc + 1;
  return `${hYear}-${hMonth.toString().padStart(2, "0")}-${hDay.toString().padStart(2, "0")}`;
}

/** Julian Day Number from a Gregorian date (used by getHijriDate fallback). */
function jd(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const m = month <= 2 ? month + 12 : month;
  const y = month <= 2 ? year - 1 : year;
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
}

/** Hijri month Arabic names (for display alongside the numeric date). */
export const HIJRI_MONTHS_AR: Record<number, string> = {
  1: "محرم",
  2: "صفر",
  3: "ربيع الأول",
  4: "ربيع الآخر",
  5: "جمادى الأولى",
  6: "جمادى الآخرة",
  7: "رجب",
  8: "شعبان",
  9: "رمضان",
  10: "شوال",
  11: "ذو القعدة",
  12: "ذو الحجة",
};

/** Returns e.g. "١٤٤٦ رمضان ١٢" given a Gregorian date. */
export function formatHijriLong(date: Date): string {
  const [hYear, hMonth, hDay] = getHijriDate(date).split("-").map(Number);
  return `${hYear} ${HIJRI_MONTHS_AR[hMonth] ?? ""} ${hDay}`;
}

/**
 * Convert normalized PrayerTimes to legacy PrayerTimesData for backward compatibility
 */
export function convertToLegacyFormat(prayerTimes: PrayerTimes): PrayerTimesData {
  const arabicNames: Record<string, string> = {
    fajr: "الفجر",
    sunrise: "الشروق",
    dhuhr: "الظهر",
    asr: "العصر",
    maghrib: "المغرب",
    isha: "العشاء",
  };

  const times: PrayerTime[] = [
    {
      name: "Fajr",
      arabicName: "الفجر",
      time: prayerTimes.prayers.fajr,
      timestamp: prayerTimes.timestamps.fajr,
      isNext: prayerTimes.nextPrayer?.name === "Fajr",
      isCurrent: false,
    },
    {
      name: "Sunrise",
      arabicName: "الشروق",
      time: prayerTimes.prayers.sunrise,
      timestamp: prayerTimes.timestamps.sunrise,
      isNext: prayerTimes.nextPrayer?.name === "Sunrise",
      isCurrent: false,
    },
    {
      name: "Dhuhr",
      arabicName: "الظهر",
      time: prayerTimes.prayers.dhuhr,
      timestamp: prayerTimes.timestamps.dhuhr,
      isNext: prayerTimes.nextPrayer?.name === "Dhuhr",
      isCurrent: false,
    },
    {
      name: "Asr",
      arabicName: "العصر",
      time: prayerTimes.prayers.asr,
      timestamp: prayerTimes.timestamps.asr,
      isNext: prayerTimes.nextPrayer?.name === "Asr",
      isCurrent: false,
    },
    {
      name: "Maghrib",
      arabicName: "المغرب",
      time: prayerTimes.prayers.maghrib,
      timestamp: prayerTimes.timestamps.maghrib,
      isNext: prayerTimes.nextPrayer?.name === "Maghrib",
      isCurrent: false,
    },
    {
      name: "Isha",
      arabicName: "العشاء",
      time: prayerTimes.prayers.isha,
      timestamp: prayerTimes.timestamps.isha,
      isNext: prayerTimes.nextPrayer?.name === "Isha",
      isCurrent: false,
    },
  ];

  return {
    date: prayerTimes.date,
    hijriDate: prayerTimes.hijriDate,
    location: prayerTimes.location.displayName,
    calculationMethod: prayerTimes.calculationMethod.name,
    madhab: prayerTimes.madhab.name,
    times,
    nextPrayer: prayerTimes.nextPrayer,
  };
}