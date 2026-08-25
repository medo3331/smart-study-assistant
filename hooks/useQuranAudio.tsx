"use client";

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import type { Reciter } from "./useReciters";

/**
 * Quran Audio Player — SINGLE source of truth for playback.
 *
 * Architecture:
 *   QuranAudioProvider (app root or /worship tree)
 *    → creates ONE HTMLAudioElement
 *    → exposes play / pause / next / prev / seek / volume
 *    → exposes playback state (state, surahId, reciterId, currentTime, duration, progress, error)
 *    → persists resume position to localStorage per (reciterId, surahId)
 *
 * Consumers:
 *   - useQuranAudio()  — read-only state + control actions
 *   - QuranAudioPlayer — sticky bottom player UI (always available)
 *   - QuranReader      — sends play/pause/next/prev
 *   - ReciterSelector  — changes reciter (reloads current track under new reciter)
 *
 * Audio URL format (mp3quran.net):
 *   {reciter.server}{surah: 3-digit-zero-padded}.mp3
 *   e.g. https://server10.mp3quran.net/afs/002.mp3
 */

export type AudioState =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error"
  | "unavailable";

export interface QuranAudioState {
  state: AudioState;
  currentSurahId: number | null;
  currentReciterId: number | null;
  currentTime: number; // seconds
  duration: number; // seconds
  progress: number; // 0–1
  volume: number; // 0–1
  error: string | null;
}

export interface QuranAudioContextValue extends QuranAudioState {
  play: (reciter: Reciter, surahId: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  nextSurah: () => void;
  prevSurah: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  /** Load last-saved position for a reciter+surah. */
  loadPosition: (reciterId: number, surahId: number) => number | null;
}

const QuranAudioContext = createContext<QuranAudioContextValue | null>(null);

const RESUME_KEY_PREFIX = "quran-audio-resume";

function storageKey(reciterId: number, surahId: number): string {
  return `${RESUME_KEY_PREFIX}-${reciterId}-${surahId}`;
}

/** Resolve the mp3 URL for a given reciter + surah. */
export function getAudioUrl(reciter: Reciter, surahId: number): string {
  const padded = String(surahId).padStart(3, "0");
  return `${reciter.server}${padded}.mp3`;
}

/** Hook for components to consume the audio context. */
export function useQuranAudio(): QuranAudioContextValue {
  const ctx = useContext(QuranAudioContext);
  if (!ctx) {
    throw new Error(
      "useQuranAudio must be used within a QuranAudioProvider"
    );
  }
  return ctx;
}

interface QuranAudioProviderProps {
  children: React.ReactNode;
}

/**
 * Provider that owns a single HTMLAudioElement and exposes playback state.
 * Place this at the app root (or above the worship section) so the sticky
 * player always has access.
 */
export function QuranAudioProvider({ children }: QuranAudioProviderProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<QuranAudioState>({
    state: "idle",
    currentSurahId: null,
    currentReciterId: null,
    currentTime: 0,
    duration: 0,
    progress: 0,
    volume: 1,
    error: null,
  });

  // Keep a ref so callbacks can read the latest state.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Create the single audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setState((s) => ({
        ...s,
        duration: audio.duration || 0,
      }));
    };
    const handleTimeUpdate = () => {
      setState((s) => ({
        ...s,
        currentTime: audio.currentTime,
        progress: audio.duration
          ? Math.min(audio.currentTime / audio.duration, 1)
          : 0,
      }));
    };
    const handlePlay = () => {
      setState((s) => ({ ...s, state: "playing" }));
    };
    const handlePause = () => {
      setState((s) => ({ ...s, state: "paused" }));
    };
    const handleEnded = () => {
      setState((s) => ({
        ...s,
        state: "paused",
        currentTime: s.duration,
        progress: 1,
      }));
    };
    const handleError = (e: Event) => {
      const target = e.target as HTMLAudioElement;
      const error = target.error;
      let message = "خطأ في التشغيل";
      if (error?.code === 4) {
        message = "تعذر تشغيل الصوت — تحقق من الاتصال";
      } else if (error?.code === 2) {
        message = "ملف الصوت غير مدعوم";
      } else if (error?.code === 3) {
        message = "الملف غير متاح للتشغيل";
      }
      setState((s) => ({
        ...s,
        state: "error",
        error: message,
      }));
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
    };
  }, []);

  // Persist current playback position on change.
  useEffect(() => {
    const s = stateRef.current;
    if (s.currentSurahId && s.currentReciterId && s.state !== "idle") {
      try {
        localStorage.setItem(
          storageKey(s.currentReciterId, s.currentSurahId),
          JSON.stringify({ position: s.currentTime, savedAt: Date.now() })
        );
      } catch {
        /* ignore */
      }
    }
  }, [state.currentTime, state.state]);

  const play = useCallback(
    async (reciter: Reciter, surahId: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      const isSameTrack =
        stateRef.current.currentSurahId === surahId &&
        stateRef.current.currentReciterId === reciter.id;

      if (!isSameTrack) {
        const url = getAudioUrl(reciter, surahId);

        setState((s) => ({
          ...s,
          state: "loading",
          currentSurahId: surahId,
          currentReciterId: reciter.id,
          error: null,
          currentTime: 0,
          progress: 0,
        }));

        audio.src = url;
        audio.load();

        // Seed resume position if we have one.
        const saved = loadPosition(reciter.id, surahId);
        if (saved && saved > 0) {
          // Defer seeking until metadata loads.
          const onMeta = () => {
            audio.currentTime = saved;
            audio.removeEventListener("loadedmetadata", onMeta);
          };
          audio.addEventListener("loadedmetadata", onMeta);
        }

        // Persist track as resume target.
        try {
          localStorage.setItem(
            storageKey(reciter.id, surahId),
            JSON.stringify({ position: saved ?? 0, savedAt: Date.now() })
          );
        } catch {
          /* ignore */
        }
      }

      try {
        await audio.play();
      } catch (err) {
        setState((s) => ({
          ...s,
          state: "error",
          error: err instanceof Error ? err.message : "فشل التشغيل",
        }));
      }
    },
    []
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (audio && stateRef.current.currentSurahId) {
      audio.play().catch(() => {});
    }
  }, []);

  const nextSurah = useCallback(() => {
    const current = stateRef.current.currentSurahId;
    if (current && current < 114) {
      setState((s) => ({
        ...s,
        currentSurahId: current + 1,
        currentTime: 0,
        progress: 0,
      }));
    }
  }, []);

  const prevSurah = useCallback(() => {
    const current = stateRef.current.currentSurahId;
    if (current && current > 1) {
      setState((s) => ({
        ...s,
        currentSurahId: current - 1,
        currentTime: 0,
        progress: 0,
      }));
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      setState((s) => ({
        ...s,
        currentTime: seconds,
        progress: audio.duration ? Math.min(seconds / audio.duration, 1) : 0,
      }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const audio = audioRef.current;
    if (audio) {
      const v = Math.max(0, Math.min(1, volume));
      audio.volume = v;
      setState((s) => ({ ...s, volume: v }));
    }
  }, []);

  const loadPosition = useCallback((reciterId: number, surahId: number) => {
    try {
      const raw = localStorage.getItem(storageKey(reciterId, surahId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
        return null;
      }
      return parsed.position;
    } catch {
      return null;
    }
  }, []);

  const value: QuranAudioContextValue = {
    ...state,
    play,
    pause,
    resume,
    nextSurah,
    prevSurah,
    seek,
    setVolume,
    loadPosition,
  };

  return (
    <QuranAudioContext.Provider value={value}>
      {children}
    </QuranAudioContext.Provider>
  );
}
