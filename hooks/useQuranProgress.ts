"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useState, useEffect, useCallback } from "react";
import {
  getQuranProgress,
  getQuranReadingPosition,
  setQuranPosition,
  localWorshipDate,
} from "@/lib/islamic/worship-progress";

interface UseQuranProgressReturn {
  progress: { surahId: number; ayahId: number; dailyCount: number; updatedAt?: string };
  updatePosition: (surahId: number, ayahId: number, dailyCount?: number, updatedAt?: string, countRead?: boolean) => void;
  dailyTarget: number;
  dailyProgress: number;
  isLoaded: boolean;
}

/**
 * Hook: Quran reading position + daily count.
 * Persists to localStorage via the centralized worship-progress abstraction.
 */
export function useQuranProgress(
  dailyTarget: number = 10,
  timezone?: string,
): UseQuranProgressReturn {
  const [progress, setProgress] = useState<{
    surahId: number;
    ayahId: number;
    dailyCount: number;
    updatedAt?: string;
  }>({ surahId: 1, ayahId: 1, dailyCount: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const daily = getQuranProgress(localWorshipDate(new Date(), timezone));
    const position = getQuranReadingPosition();
    setProgress({
      surahId: position?.surahId ?? daily.surahId,
      ayahId: position?.ayahId ?? daily.ayahId,
      dailyCount: daily.dailyCount,
      updatedAt: position?.updatedAt ?? daily.updatedAt,
    });
    setIsLoaded(true);
  }, [timezone]);

  const updatePosition = useCallback(
    (surahId: number, ayahId: number, dailyCount?: number, updatedAt?: string, countRead = true) => {
      const timestamp = updatedAt ?? new Date().toISOString();
      const date = localWorshipDate(new Date(), timezone);
      const todayProgress = getQuranProgress(date);
      const previousPosition = getQuranReadingPosition();
      const positionChanged = previousPosition?.surahId !== surahId || previousPosition?.ayahId !== ayahId;
      const next = {
        surahId,
        ayahId,
        dailyCount: dailyCount ?? todayProgress.dailyCount + (countRead && positionChanged ? 1 : 0),
        updatedAt: timestamp,
      };
      setProgress(next);
      setQuranPosition(surahId, ayahId, next.dailyCount, date, timestamp);
    },
    [progress.dailyCount, progress.ayahId, progress.surahId, timezone]
  );

  const dailyProgress =
    dailyTarget > 0 ? Math.min((progress.dailyCount / dailyTarget) * 100, 100) : 0;

  return {
    progress,
    updatePosition,
    dailyTarget,
    dailyProgress,
    isLoaded,
  };
}