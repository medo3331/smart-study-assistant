"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useState, useEffect, useCallback } from "react";

/**
 * Reciter shape — mirrors the /api/quran/reciters response +
 * an optional `audioUrl` builder used by the player.
 */
export interface Reciter {
  id: number;
  name: string;
  arabicName: string;
  server: string;
  surahs: number[];
  rewaya: string;
  language: string;
}

interface UseRecitersReturn {
  reciters: Reciter[];
  selectedReciter: Reciter | null;
  isLoading: boolean;
  error: string | null;
  selectReciter: (id: number) => void;
  refetch: () => Promise<void>;
}

const RECITER_STORAGE_KEY = "magicly-quran-reciter";
const DEFAULT_RECITER_ID = 1; // Al-Afasy

/**
 * Hook: fetch all reciters from the internal API route,
 * persist the selected reciter to localStorage, and expose
 * a stable API for the player / selector components.
 */
export function useReciters(): UseRecitersReturn {
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function default_reciter_exists(data: Reciter[]): boolean {
    return data.some((r) => r.id === DEFAULT_RECITER_ID);
  }

  const fetchReciters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quran/reciters");
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load reciters");
      }

      const data: Reciter[] = json.data?.reciters || [];
      setReciters(data);

      // Resolve selected reciter (from localStorage or default)
      const storedId = parseInt(
        localStorage.getItem(RECITER_STORAGE_KEY) || "",
        10
      );
      const match = storedId
        ? data.find((r) => r.id === storedId)
        : data.find((r) => r.id === DEFAULT_RECITER_ID);
      setSelectedReciter(match || data[0] || null);

      if (!storedId && default_reciter_exists(data)) {
        localStorage.setItem(
          RECITER_STORAGE_KEY,
          String(DEFAULT_RECITER_ID)
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reciters");
      setReciters([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReciters();
  }, [fetchReciters]);

  // Persist selection to localStorage whenever it changes
  const selectReciter = useCallback(
    (id: number) => {
      const reciter = reciters.find((r) => r.id === id);
      if (reciter) {
        setSelectedReciter(reciter);
        localStorage.setItem(RECITER_STORAGE_KEY, String(id));
      }
    },
    [reciters]
  );

  return {
    reciters,
    selectedReciter,
    isLoading,
    error,
    selectReciter,
    refetch: fetchReciters,
  };
}