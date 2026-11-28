"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useState, useEffect, useCallback } from "react";
import { FALLBACK_RECITERS } from "@/app/dashboard/components/audio-library";

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
 * الـ API بيرجع {id, name, server, surahs} بس (شوف lib/quran.ts).
 * الواجهة بتعرض arabicName/rewaya — من غير التطبيع ده يبقوا undefined
 * وأي `.includes()` عليهم بيسقّط الصفحة.
 */
function normalizeReciter(r: {
  id: number;
  name: string;
  server: string;
  surahs: number[];
}): Reciter {
  return {
    id: r.id,
    name: r.name,
    arabicName: r.name,
    server: r.server,
    surahs: r.surahs ?? [],
    rewaya: "حفص عن عاصم — مرتل",
    language: "ar",
  };
}

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

  /** اختيار القارئ من قايمة جاهزة: المحفوظ، ثم الافتراضي، ثم الأول. */
  function pickSelected(data: Reciter[]): Reciter | null {
    const storedId = parseInt(
      typeof window !== "undefined"
        ? localStorage.getItem(RECITER_STORAGE_KEY) || ""
        : "",
      10
    );
    return (
      (storedId ? data.find((r) => r.id === storedId) : undefined) ||
      data.find((r) => r.id === DEFAULT_RECITER_ID) ||
      data[0] ||
      null
    );
  }

  const fetchReciters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quran/reciters");
      const json = await res.json();

      // شكل الرد الفعلي: { reciters: [...], stale } — الراوت مابيبعتش
      // غلاف { success, data } خالص (شوف app/api/quran/reciters/route.ts).
      const raw: unknown = json?.reciters;
      if (!res.ok || !Array.isArray(raw) || raw.length === 0) {
        throw new Error("Failed to load reciters");
      }

      const data = (raw as Parameters<typeof normalizeReciter>[0][])
        .filter((r) => r && typeof r.id === "number" && typeof r.server === "string")
        .map(normalizeReciter);
      if (data.length === 0) throw new Error("Failed to load reciters");

      setReciters(data);
      setSelectedReciter(pickSelected(data));

      if (!localStorage.getItem(RECITER_STORAGE_KEY) && default_reciter_exists(data)) {
        localStorage.setItem(RECITER_STORAGE_KEY, String(DEFAULT_RECITER_ID));
      }
    } catch (err) {
      // الليستة الاحتياطية بروابط حقيقية شغّالة — أفضل من قايمة فاضية
      // تخفي زرار التشغيل وتخلي الصوت ميشتغلش خالص.
      const fallback = FALLBACK_RECITERS.map(normalizeReciter);
      setReciters(fallback);
      setSelectedReciter(pickSelected(fallback));
      setError(
        err instanceof Error && err.message !== "Failed to load reciters"
          ? err.message
          : "تعذر تحميل قائمة القرّاء الكاملة — بتعرض قائمة مختصرة"
      );
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