"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getQuranProgress,
  setQuranPosition,
  type WorshipDayRecord,
} from "@/lib/islamic/worship-progress";
import type { Surah, Ayah } from "@/lib/islamic/types";

interface UseQuranProgressReturn {
  progress: { surahId: number; ayahId: number; dailyCount: number };
  updatePosition: (surahId: number, ayahId: number, dailyCount?: number) => void;
  dailyTarget: number;
  dailyProgress: number;
  isLoaded: boolean;
}

/**
 * Hook: Quran reading position + daily count.
 * Persists to localStorage via the centralized worship-progress abstraction.
 */
export function useQuranProgress(
  dailyTarget: number = 10
): UseQuranProgressReturn {
  const [progress, setProgress] = useState<{
    surahId: number;
    ayahId: number;
    dailyCount: number;
  }>({ surahId: 1, ayahId: 1, dailyCount: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const p = getQuranProgress();
    setProgress({
      surahId: p.surahId,
      ayahId: p.ayahId,
      dailyCount: p.dailyCount,
    });
    setIsLoaded(true);
  }, []);

  const updatePosition = useCallback(
    (surahId: number, ayahId: number, dailyCount?: number) => {
      // عدّاد آيات النهارده بيزيد فعليًا مع كل آية جديدة بتتقرا في اليوم
      // (وليس موضع القراءة) — بيتصفّر طبيعيًا مع أول يوم جديد.
      const newCount =
        dailyCount !== undefined
          ? dailyCount
          : Math.max(progress.dailyCount + (ayahId !== progress.ayahId ? 1 : 0), ayahId);
      const next = {
        surahId,
        ayahId,
        dailyCount: newCount,
      };
      setProgress(next);
      setQuranPosition(surahId, ayahId, newCount);
    },
    [progress.dailyCount, progress.ayahId]
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
