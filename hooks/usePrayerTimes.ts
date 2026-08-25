"use client";

import { useState, useEffect, useCallback } from "react";
import type { PrayerTimes, PrayerTimesData } from "@/lib/islamic/types";
import { convertToLegacyFormat } from "@/lib/islamic/prayer-times";

interface UsePrayerTimesOptions {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  calculationMethod?: string;
  madhab?: string;
  date?: string;
  enabled?: boolean;
}

interface UsePrayerTimesReturn {
  data: PrayerTimesData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching prayer times from the API
 * Uses SWR-like pattern with local state
 */
export function usePrayerTimes(options: UsePrayerTimesOptions = {}): UsePrayerTimesReturn {
  const {
    latitude,
    longitude,
    timezone = "Africa/Cairo",
    calculationMethod = "egyptian",
    madhab = "shafi",
    date,
    enabled = true,
  } = options;

  const [data, setData] = useState<PrayerTimesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrayerTimes = useCallback(async () => {
    if (!enabled || !latitude || !longitude) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        timezone,
        calculationMethod,
        madhab,
      });

      if (date) {
        params.set("date", date);
      }

      // Worship Center uses its own AlAdhan-backed route; /api/islamic/prayer-times
      // keeps its original contract in this app and is left untouched.
      const response = await fetch(`/api/worship/prayer-times?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch prayer times");
      }

      // Convert to legacy format for backward compatibility
      const legacyData = convertToLegacyFormat(result.data);
      setData(legacyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch prayer times");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [latitude, longitude, timezone, calculationMethod, madhab, date, enabled]);

  useEffect(() => {
    fetchPrayerTimes();
  }, [fetchPrayerTimes]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchPrayerTimes,
  };
}

/**
 * Hook for fetching today's prayer times with automatic refresh
 */
export function useTodayPrayerTimes(
  latitude?: number,
  longitude?: number,
  timezone?: string,
  calculationMethod?: string,
  madhab?: string
) {
  const today = new Date().toISOString().split("T")[0];
  
  return usePrayerTimes({
    latitude,
    longitude,
    timezone,
    calculationMethod,
    madhab,
    date: today,
    enabled: !!latitude && !!longitude,
  });
}

/**
 * Hook for getting next prayer from prayer times data
 */
export function useNextPrayer(prayerTimes: PrayerTimesData | PrayerTimes | null) {
  if (!prayerTimes) return null;

  // Check if it's the new format (PrayerTimes) or legacy format (PrayerTimesData)
  if ("timestamps" in prayerTimes && prayerTimes.nextPrayer) {
    return prayerTimes.nextPrayer;
  }

  // Legacy format
  if ("nextPrayer" in prayerTimes && prayerTimes.nextPrayer) {
    return prayerTimes.nextPrayer;
  }

  return null;
}

/**
 * Hook for getting current prayer from prayer times data
 */
export function useCurrentPrayer(prayerTimes: PrayerTimesData | PrayerTimes | null) {
  if (!prayerTimes) return null;

  // Check if it's the new format
  if ("timestamps" in prayerTimes) {
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
  }

  // Legacy format
  if ("times" in prayerTimes) {
    const now = Date.now();
    for (const prayer of prayerTimes.times) {
      if (prayer.isCurrent) {
        return prayer;
      }
    }
  }

  return null;
}