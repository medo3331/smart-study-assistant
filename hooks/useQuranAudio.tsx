"use client";
/* eslint-disable react-hooks/exhaustive-deps -- TODO: stable deps */

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import type { Reciter } from "./useReciters";
import type { RecitationStyle } from "@/app/dashboard/components/audio-library";
// أسماء السور للـ MediaSession metadata (بيانات بحتة — مفيش React هنا).
import { SURAH_NAMES } from "@/app/dashboard/components/audio-library";

/**
 * Quran Audio Player — SINGLE source of truth for playback.
 *
 * Architecture:
 *   QuranAudioProvider (app root or /worship tree)
 *    → creates ONE HTMLAudioElement
 *    → exposes play / pause / next / prev / seek / volume
 *    → exposes playback state (state, surahId, reciterId, style, currentTime, duration, progress, error)
 *    → persists resume position to localStorage per (reciterId, surahId, style)
 *
 * Consumers:
 *   - useQuranAudio()  — read-only state + control actions
 *   - QuranAudioPlayer — sticky bottom player UI (always available)
 *   - QuranReader      — sends play/pause/next/prev
 *   - ReciterSelector  — changes reciter + recitation style (مرتل/مجود)
 *
 * Audio URL format (mp3quran.net):
 *   {reciter.server}{surah: 3-digit-zero-padded}.mp3
 *   e.g. https://server10.mp3quran.net/afs/002.mp3
 *
 * الأداء (مرتل/مجود): القرار عايش هنا جوّه الـ provider مش عند الكومبوننت
 * اللي بتنادي play() — عشان QuranReader بينادي play(reciter, surahId)
 * من غير ما يعرف حاجة عن الأداء، والاختيار يتحترم برضه. لو القارئ
 * ماعندوش نسخة مجودة، getAudioUrl بترجع لسيرفر المرتل تلقائياً (مفيش
 * صوت بيفشل).
 */

/** الأداءات الصالحة — حارس لقيم الـ localStorage من بره. */
function isValidStyle(value: unknown): value is RecitationStyle {
  return value === "murattal" || value === "mujawwad";
}

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
  /** أداء التلاوة الحالي — مرتل (الافتراضي) أو مجود. */
  currentStyle: RecitationStyle;
  currentTime: number; // seconds
  duration: number; // seconds
  progress: number; // 0–1
  volume: number; // 0–1
  error: string | null;
}

export interface QuranAudioContextValue extends QuranAudioState {
  /**
   * تشغيل سورة. الأداء اختياري — لو ماتحددش بنستخدم الأداء المختار
   * حالياً (عشان المستهلكين القدامى زي QuranReader يفضلوا شغالين
   * من غير ما يعرفوا حاجة عن الأداء).
   */
  play: (reciter: Reciter, surahId: number, style?: RecitationStyle) => Promise<void>;
  pause: () => void;
  resume: () => void;
  nextSurah: () => void;
  prevSurah: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  /**
   * تغيير أداء التلاوة (مرتل ↔ مجود). لو في تراك شغّال/محمّل، بنبدّل
   * الملف ونبدأ من أول السورة (نفس آلية startTrack) — عشان التجويد
   * يبدأ من بداية السورة مش نصها.
   */
  setStyle: (style: RecitationStyle) => void;
  /** Load last-saved position for a reciter+surah (بالأسلوب الحالي). */
  loadPosition: (reciterId: number, surahId: number) => number | null;
}

const QuranAudioContext = createContext<QuranAudioContextValue | null>(null);

const RESUME_KEY_PREFIX = "quran-audio-resume";
const STYLE_STORAGE_KEY = "magicly-quran-style";

/**
 * مفتاح موضع الاستئناف بيشمل الأداء: موضع المرتل وموضع المجود مختلفين
 * (نفس السورة بأدائين = ملفين بأطوال مختلفة تماماً).
 */
function storageKey(reciterId: number, surahId: number, style: RecitationStyle): string {
  return `${RESUME_KEY_PREFIX}-${reciterId}-${surahId}-${style}`;
}

/** المفتاح القديم (قبل إضافة الأداء) — للقراءة بس، المرتل كان هو الوحيد. */
function legacyStorageKey(reciterId: number, surahId: number): string {
  return `${RESUME_KEY_PREFIX}-${reciterId}-${surahId}`;
}

/** Resolve the mp3 URL for a given reciter + surah + recitation style. */
export function getAudioUrl(
  reciter: Reciter,
  surahId: number,
  style: RecitationStyle = "murattal"
): string {
  const padded = String(surahId).padStart(3, "0");
  // لو المستخدم طلب مجود والقارئ ماعندوش، بنرجع للمرتل بدل ما نبنى
  // رابط مكسور — الصوت يفضل شغال حتى لو الأداء مش متاح.
  const base =
    style === "mujawwad" && reciter.mujawwadServer
      ? reciter.mujawwadServer
      : reciter.server;
  return `${base}${padded}.mp3`;
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
  // آخر قارئ اتاستخدم في play() — next/prev والتلاوة المتصلة محتاجين يبنوا
  // رابط الملف بنفس القارئ من غير ما يستلموا كائن Reciter من الكومبوننت.
  const reciterRef = useRef<Reciter | null>(null);
  // أداء التلاوة الحالي — next/prev والتلاوة المتصلة بيكمّلوا بنفس الأداء.
  const styleRef = useRef<RecitationStyle>("murattal");
  // handleEnded بيعيش في إيفكت التركيب (deps فاضية) — بيقرأ nextSurah
  // عن طريق ref عشان ميحافظش على نسخة قديمة من الكولباك.
  const nextSurahRef = useRef<() => void>(() => {});
  const [state, setState] = useState<QuranAudioState>({
    state: "idle",
    currentSurahId: null,
    currentReciterId: null,
    currentStyle: "murattal",
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
      // التلاوة المتصلة: أول ما السورة تخلص نشغّل اللي بعدها تلقائيًا بنفس
      // القارئ — المستخدم هو اللي يوقف من زرار الإيقاف. عند آخر سورة (114)
      // بنقف عادي بدل ما نلف من الأول.
      const current = stateRef.current.currentSurahId;
      if (current !== null && current < 114) {
        nextSurahRef.current();
      } else {
        setState((s) => ({
          ...s,
          state: "paused",
          currentTime: s.duration,
          progress: 1,
        }));
      }
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
          storageKey(s.currentReciterId, s.currentSurahId, s.currentStyle),
          JSON.stringify({ position: s.currentTime, savedAt: Date.now() })
        );
      } catch {
        /* ignore */
      }
    }
  }, [state.currentTime, state.state]);

  // استرجاع الأداء المختار من localStorage — بعد الترطيب عشان مفيش
  // hydration mismatch (القيمة الأولية ثابتة murattal على السيرفر والكلاينت).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STYLE_STORAGE_KEY);
      if (isValidStyle(stored) && stored !== styleRef.current) {
        styleRef.current = stored;
        setState((s) => ({ ...s, currentStyle: stored }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** قراءة موضع الاستئناف المحفوظ لقارئ + سورة (بالأسلوب الحالي). */
  const loadPosition = useCallback((reciterId: number, surahId: number) => {
    try {
      let raw = localStorage.getItem(storageKey(reciterId, surahId, styleRef.current));
      // توافق رجعي: المفاتيح القديمة (قبل إضافة الأداء) كانت للمرتل بس.
      if (!raw && styleRef.current === "murattal") {
        raw = localStorage.getItem(legacyStorageKey(reciterId, surahId));
      }
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

  /**
   * تحميل تراك جديد فعليًا (src + reset الحالة) وتشغيله — الأساس المشترك
   * بين play() و next/prev والتلاوة المتصلة وتبديل الأداء، عشان السلوك
   * يفضل واحد.
   *
   * `seedResume` بيتحكم في استئناف آخر موضع محفوظ: next/prev والتلاوة
   * المتصلة بيكملوا من حيث المستخدم كان، لكن تبديل الأداء بيبني من
   * أول السورة — فبيتبعت بـ false.
   */
  const startTrack = useCallback(
    async (
      reciter: Reciter,
      surahId: number,
      style: RecitationStyle = "murattal",
      opts?: { seedResume?: boolean }
    ) => {
      const audio = audioRef.current;
      if (!audio) return;

      const url = getAudioUrl(reciter, surahId, style);

      setState((s) => ({
        ...s,
        state: "loading",
        currentSurahId: surahId,
        currentReciterId: reciter.id,
        currentStyle: style,
        error: null,
        currentTime: 0,
        progress: 0,
      }));

      audio.src = url;
      audio.load();

      reciterRef.current = reciter;
      styleRef.current = style;

      // Seed resume position if we have one (والأداء مطلوب من الأول).
      const saved =
        opts?.seedResume === false ? null : loadPosition(reciter.id, surahId);
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
          storageKey(reciter.id, surahId, style),
          JSON.stringify({ position: saved ?? 0, savedAt: Date.now() })
        );
      } catch {
        /* ignore */
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
    [loadPosition]
  );

  const play = useCallback(
    async (reciter: Reciter, surahId: number, style?: RecitationStyle) => {
      const audio = audioRef.current;
      if (!audio) return;

      // الأداء الصريح بيفوز، وإلا بنكمّل بالأداء المختار حالياً — عشان
      // المستهلك اللي بينادي play(reciter, surahId) يتحترم اختيار الأداء.
      const effectiveStyle = style ?? styleRef.current;

      const isSameTrack =
        stateRef.current.currentSurahId === surahId &&
        stateRef.current.currentReciterId === reciter.id &&
        stateRef.current.currentStyle === effectiveStyle;

      // نفس التراك: استئناف بس. تراك جديد (سورة/قارئ/أداء مختلف):
      // تحميل فعلي عبر startTrack.
      if (!isSameTrack) {
        await startTrack(reciter, surahId, effectiveStyle);
        return;
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
    [startTrack]
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

  /**
   * تنقّل فعلي لسورة تانية بنفس القارئ ونفس الأداء الحالي — بيغيّر
   * audio.src ويكمّل شغّال، مش بيحدّث الـ state بس (كان ده سبب إن
   * زراير next/prev مش بتغيّر الملف الفعلي).
   */
  const goToSurah = useCallback(
    async (surahId: number) => {
      const reciter = reciterRef.current;
      if (!reciter) return;
      await startTrack(reciter, surahId, styleRef.current);
    },
    [startTrack]
  );

  const nextSurah = useCallback(() => {
    const current = stateRef.current.currentSurahId;
    if (current && current < 114) void goToSurah(current + 1);
  }, [goToSurah]);

  const prevSurah = useCallback(() => {
    const current = stateRef.current.currentSurahId;
    if (current && current > 1) void goToSurah(current - 1);
  }, [goToSurah]);

  /**
   * تغيير أداء التلاوة (مرتل ↔ مجود):
   *   - لو في تراك شغّال/محمّل/موقوف: بنبدّل الملف فوراً ونبدا من أول
     *   السورة (seedResume: false — التجويد بيبقى من البداية مش نصها).
   *   - لو مفيش تراك: بنحدّث الاختيار وتخزينه بس، وأول play() هيبني
   *     على الأداء الجديد.
   * لو القارئ ماعندوش نسخة مجودة، getAudioUrl بترجع للمرتل تلقائياً
   * فالصوت مابيقطعش — والواجهة هي اللي بتمنع الوصول للحالة دي أصلاً.
   */
  const setStyle = useCallback(
    (style: RecitationStyle) => {
      if (!isValidStyle(style) || style === styleRef.current) return;

      styleRef.current = style;
      setState((s) => ({ ...s, currentStyle: style }));

      try {
        localStorage.setItem(STYLE_STORAGE_KEY, style);
      } catch {
        /* ignore */
      }

      // تراك شغّال (أو حتى موقوف على سورة): بدّل الملف فعلاً من أول
      // السورة — بدل ما الـ state يقول مجود والملف لسه مرتل.
      const s = stateRef.current;
      const hasLiveTrack =
        s.currentSurahId !== null &&
        s.currentReciterId !== null &&
        (s.state === "playing" ||
          s.state === "paused" ||
          s.state === "loading");
      if (hasLiveTrack && reciterRef.current) {
        void startTrack(reciterRef.current, s.currentSurahId as number, style, {
          seedResume: false,
        });
      }
    },
    [startTrack]
  );

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

  // مزامنة nextSurah داخل ref — handleEnded (إيفكت التركيب) بيناديها عن طريقه.
  useEffect(() => {
    nextSurahRef.current = nextSurah;
  }, [nextSurah]);

  /* ── MediaSession: metadata ──────────────────────────────────────────
     عشان كنترولز نظام التشغيل (ويندوز/موبايل) توري اسم السورة واسم
     القارئ، والصوت يفضل مُدار من بره المتصفح لو التاب في الخلفية. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const surahId = state.currentSurahId;
    if (!surahId) return;

    const surahName = SURAH_NAMES[surahId - 1] ?? `سورة ${surahId}`;
    const styleSuffix =
      state.currentStyle === "mujawwad" ? " — مجوّد" : "";
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `سورة ${surahName}`,
        artist:
          (reciterRef.current?.arabicName ?? "القرآن الكريم") + styleSuffix,
        album: "القرآن الكريم",
      });
      navigator.mediaSession.playbackState =
        state.state === "playing" ? "playing" : "paused";
    } catch {
      /* متصفح مش مدعوم — تجاهل */
    }
  }, [state.currentSurahId, state.state, state.currentStyle]);

  /* ── MediaSession: أزرار الكنترولز (play/pause/next/prev) ───────────── */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, () => void]> = [
      ["play", () => resume()],
      ["pause", () => pause()],
      ["nexttrack", () => nextSurah()],
      ["previoustrack", () => prevSurah()],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* الأكشن مش مدعوم في المتصفح ده — تجاهل */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* تجاهل */
        }
      }
    };
  }, [resume, pause, nextSurah, prevSurah]);

  const value: QuranAudioContextValue = {
    ...state,
    play,
    pause,
    resume,
    nextSurah,
    prevSurah,
    seek,
    setVolume,
    setStyle,
    loadPosition,
  };

  return (
    <QuranAudioContext.Provider value={value}>
      {children}
    </QuranAudioContext.Provider>
  );
}