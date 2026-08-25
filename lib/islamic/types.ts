/** Islamic/Worship domain types */

export interface PrayerTime {
  name: string;
  arabicName: string;
  time: string; // "05:30"
  timestamp: number; // Unix timestamp
  isNext: boolean;
  isCurrent: boolean;
}

/**
 * Normalized internal PrayerTimes model
 * This is the single source of truth for the UI - never expose raw AlAdhan response
 */
export interface PrayerTimes {
  date: string; // ISO date string (YYYY-MM-DD)
  timezone: string;
  location: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
    displayName: string;
  };
  calculationMethod: {
    id: string;
    name: string;
    params: {
      fajrAngle: number | null;
      ishaAngle: number | null;
      ishaInterval: number | null;
    };
  };
  madhab: {
    id: string;
    name: string;
  };
  prayers: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    imsak?: string;
    midnight?: string;
  };
  timestamps: {
    fajr: number;
    sunrise: number;
    dhuhr: number;
    asr: number;
    maghrib: number;
    isha: number;
    imsak?: number;
    midnight?: number;
  };
  nextPrayer: PrayerTime | null;
  hijriDate: string;
}

/**
 * Legacy interface for backward compatibility during migration
 * @deprecated Use PrayerTimes instead
 */
export interface PrayerTimesData {
  date: string; // ISO date string
  hijriDate: string;
  location: string;
  calculationMethod: string;
  madhab: string;
  times: PrayerTime[];
  nextPrayer: PrayerTime | null;
}

export interface Surah {
  id: number;
  name: string;
  arabicName: string;
  englishName: string;
  revelationType: "Meccan" | "Medinan";
  ayahCount: number;
  juzNumber: number;
}

export interface Ayah {
  number: number;
  text: string;
  surahId: number;
  juzNumber: number;
  pageNumber: number;
}

export interface QuranProgress {
  surahId: number;
  ayahId: number;
  dailyTarget: number;
  currentCount: number;
  lastReadAt: string;
}

export type AdhkarCategory = "morning" | "evening" | "after-prayer" | "sleep" | "general";

export interface Dhikr {
  id: string;
  category: AdhkarCategory;
  text: string;
  source?: string;
  repeatCount: number;
  transliteration?: string;
}

export interface AdhkarProgress {
  category: AdhkarCategory;
  date: string; // ISO date string
  completed: boolean;
  currentCount: number;
}

export interface UserIslamicSettings {
  userId: string;
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  calculationMethod: string; // e.g., "Muslim World League"
  madhab: "shafi" | "hanafi";
  prayerNotifications: boolean;
  adhanEnabled: boolean;
  reminderMinutes: number; // minutes before prayer
  morningAdhkarReminder: boolean;
  eveningAdhkarReminder: boolean;
  sleepAdhkarReminder: boolean;
  quranDailyTarget: number; // ayahs per day
}

export interface DailyProgressItem {
  id: string;
  label: string;
  arabicLabel: string;
  iconName: string;
  completed: boolean;
  current?: boolean;
  time?: string;
}