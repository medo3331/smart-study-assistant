/**
 * Centralized Next Prayer Calculation
 * 
 * Single source of truth for determining the next prayer.
 * Used by all UI components to ensure consistency.
 */

import type { PrayerTimes, PrayerTime } from "../types";

/**
 * Get the next prayer from PrayerTimes data
 * Handles edge cases: after Isha, midnight, timezone correctly
 */
export function getNextPrayer(prayerTimes: PrayerTimes): PrayerTime | null {
  if (!prayerTimes || !prayerTimes.timestamps) {
    return null;
  }

  const now = Date.now();
  const prayerOrder = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
  const arabicNames: Record<string, string> = {
    fajr: "الفجر",
    sunrise: "الشروق",
    dhuhr: "الظهر",
    asr: "العصر",
    maghrib: "المغرب",
    isha: "العشاء",
  };

  // Check today's prayers
  for (const prayer of prayerOrder) {
    const timestamp = prayerTimes.timestamps[prayer];
    if (timestamp && timestamp > now) {
      return {
        name: prayer.charAt(0).toUpperCase() + prayer.slice(1),
        arabicName: arabicNames[prayer],
        time: new Date(timestamp).toLocaleTimeString("ar-EG", { 
          hour: "2-digit", 
          minute: "2-digit", 
          hour12: false 
        }),
        timestamp,
        isNext: true,
        isCurrent: false,
      };
    }
  }

  // After Isha - next is Fajr tomorrow
  // We need to calculate tomorrow's Fajr
  // Use the existing Fajr timestamp + 24 hours as approximation
  const fajrToday = prayerTimes.timestamps.fajr;
  if (fajrToday) {
    const fajrTomorrow = fajrToday + 24 * 60 * 60 * 1000;
    return {
      name: "Fajr",
      arabicName: "الفجر",
      time: new Date(fajrTomorrow).toLocaleTimeString("ar-EG", { 
        hour: "2-digit", 
        minute: "2-digit", 
        hour12: false 
      }),
      timestamp: fajrTomorrow,
      isNext: true,
      isCurrent: false,
    };
  }

  return null;
}

/**
 * Get the current prayer (the one that has started but not ended)
 */
export function getCurrentPrayer(prayerTimes: PrayerTimes): PrayerTime | null {
  if (!prayerTimes || !prayerTimes.timestamps) {
    return null;
  }

  const now = Date.now();
  const prayerOrder = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
  const arabicNames: Record<string, string> = {
    fajr: "الفجر",
    sunrise: "الشروق",
    dhuhr: "الظهر",
    asr: "العصر",
    maghrib: "المغرب",
    isha: "العشاء",
  };

  for (let i = 0; i < prayerOrder.length; i++) {
    const currentPrayer = prayerOrder[i];
    const nextPrayer = prayerOrder[i + 1];
    
    const currentTimestamp = prayerTimes.timestamps[currentPrayer];
    const nextTimestamp = prayerTimes.timestamps[nextPrayer];
    
    if (currentTimestamp && currentTimestamp <= now) {
      // Check if we're before the next prayer
      if (!nextTimestamp || nextTimestamp > now) {
        return {
          name: currentPrayer.charAt(0).toUpperCase() + currentPrayer.slice(1),
          arabicName: arabicNames[currentPrayer],
          time: new Date(currentTimestamp).toLocaleTimeString("ar-EG", { 
            hour: "2-digit", 
            minute: "2-digit", 
            hour12: false 
          }),
          timestamp: currentTimestamp,
          isNext: false,
          isCurrent: true,
        };
      }
    }
  }

  return null;
}

/**
 * Get time remaining until next prayer in milliseconds
 */
export function getTimeUntilNextPrayer(prayerTimes: PrayerTimes): number {
  const nextPrayer = getNextPrayer(prayerTimes);
  if (!nextPrayer) return 0;
  
  const remaining = nextPrayer.timestamp - Date.now();
  return Math.max(0, remaining);
}

/**
 * Format time remaining as human-readable string
 * Accepts either absolute timestamp (Unix ms) or relative milliseconds
 */
export function formatTimeRemaining(inputMs: number): string {
  // Detect if input is absolute timestamp (future date) or relative milliseconds
  const now = Date.now();
  const ms = inputMs > now ? inputMs - now : inputMs;
  
  if (ms <= 0) return "حان الوقت";
  
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get day progress percentage (0-100)
 */
export function getDayProgress(_prayerTimes: PrayerTimes): number {
  void _prayerTimes;
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  
  const progress = ((now - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * 100;
  return Math.max(0, Math.min(100, progress));
}

/**
 * Check if it's currently prayer time (within a few minutes of a prayer)
 */
export function isPrayerTime(prayerTimes: PrayerTimes, windowMinutes = 5): boolean {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  
  const prayerOrder = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
  
  for (const prayer of prayerOrder) {
    const timestamp = prayerTimes.timestamps[prayer];
    if (timestamp && Math.abs(timestamp - now) <= windowMs) {
      return true;
    }
  }
  
  return false;
}