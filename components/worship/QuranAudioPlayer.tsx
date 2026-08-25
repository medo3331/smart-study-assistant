"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useQuranAudio } from "@/hooks/useQuranAudio";
import { useReciters } from "@/hooks/useReciters";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  ChevronUp,
  Loader2,
  AlertCircle,
  BookOpen,
} from "lucide-react";

/**
 * Quran Audio Player — sticky bottom player.
 *
 * - Compact on mobile (bottom-safe, respects safe-area insets)
 * - Full-width on desktop
 * - Always renders when a track is loaded (audioContext !== idle)
 * - Collapses to a mini-bar when not expanded
 * - ONE player — powered by the shared QuranAudioContext
 *
 * States handled: loading, playing, paused, error, unavailable.
 */
export function QuranAudioPlayer() {
  const {
    state: audioState,
    currentSurahId,
    currentReciterId,
    currentTime,
    duration,
    progress,
    volume,
    error,
    play,
    pause,
    resume,
    nextSurah,
    prevSurah,
    seek,
    setVolume,
  } = useQuranAudio();

  const { reciters, selectedReciter, isLoading: recitersLoading } = useReciters();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // Don't render anything in idle state.
  if (audioState === "idle" || !currentSurahId || !currentReciterId) {
    return null;
  }

  const reciter =
    reciters.find((r) => r.id === currentReciterId) || selectedReciter;

  const getSurahName = (id: number): string => {
    // We don't have the full surah list here; use a minimal lookup
    // for display. The full list is fetched in QuranReader/QuranPage.
    const names: Record<number, string> = {
      1: "الفاتحة",
      2: "البقرة",
      3: "آل عمران",
      4: "النساء",
      5: "المائدة",
      // ... we'll get the rest from the Quran service
    };
    return names[id] || `سورة ${id}`;
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isPlaying = audioState === "playing";
  const isLoading = audioState === "loading";
  const isError = audioState === "error";
  const isUnavailable = audioState === "unavailable";

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else if (audioState === "paused") {
      resume();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const newTime = pct * (duration || 0);
    seek(newTime);
  };

  return (
    <AnimatePresence>
      <motion.div
        layout={reduceMotion ? false : undefined}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom,0px)]",
          expanded ? "p-4" : "p-2"
        )}
      >
        <GlassCard
          className={cn(
            "mx-auto w-full max-w-5xl border-white/[0.06] shadow-[0_-8px_30px_rgba(0,0,0,0.4)]",
            expanded ? "p-4" : "p-2"
          )}
        >
          {/* Error / Unavailable state */}
          {isError && (
            <motion.div
              className="flex items-center gap-3 text-[#FB923C]"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AlertCircle size={20} />
              <span className="text-sm">{error || "خطأ في التشغيل"}</span>
            </motion.div>
          )}

          {!isError && !isUnavailable && (
            <>
              {/* Collapsed mini-bar */}
              {!expanded && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpanded(true)}
                    className="flex-shrink-0"
                    aria-label="توسيع المشغل"
                  >
                    <ChevronUp size={18} className="text-[#9AA0C0]" />
                  </button>

                  <div className="flex-shrink-0">
                    <IconBadge
                      icon={BookOpen}
                      color="text-[#2DD4BF]"
                      bg="bg-[#2DD4BF]/15"
                      size={40}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {reciter?.arabicName || "القرآن الكريم"}
                    </p>
                    <p className="text-xs text-[#9AA0C0]">
                      سورة {getSurahName(currentSurahId)}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    {isLoading ? (
                      <Loader2 size={20} className="text-[#9AA0C0] animate-spin" />
                    ) : isPlaying ? (
                      <Pause size={20} onClick={pause} className="cursor-pointer text-[#B69CFF]" />
                    ) : (
                      <Play size={20} onClick={handlePlayPause} className="cursor-pointer text-[#B69CFF]" />
                    )}
                  </div>
                </div>
              )}

              {/* Expanded player */}
              {expanded && (
                <div className="flex flex-col gap-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <IconBadge
                        icon={BookOpen}
                        color="text-[#2DD4BF]"
                        bg="bg-[#2DD4BF]/15"
                        size={44}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-white">
                          {getSurahName(currentSurahId)}
                        </p>
                        <p className="text-sm text-[#9AA0C0] truncate">
                          {reciter?.arabicName || "مقصور"}
                          {reciter?.rewaya && ` • ${reciter.rewaya}`}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setExpanded(false)}
                      className="flex-shrink-0 text-[#9AA0C0] hover:text-white"
                      aria-label="طي المشغل"
                    >
                      <ChevronUp size={20} />
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="relative h-1.5 cursor-pointer rounded-full bg-white/[0.06] overflow-hidden"
                    onClick={handleSeek}
                  >
                    <div
                      className="absolute inset-0 h-full bg-white/[0.04] rounded-full"
                      style={{ width: `${progress * 100}%` }}
                    >
                      <motion.div
                        className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#2DD4BF] rounded-full"
                        style={{ width: `${progress * 100}%` }}
                        layout={reduceMotion ? false : undefined}
                      />
                    </div>
                  </div>

                  {/* Time + volume row */}
                  <div className="flex items-center justify-between text-xs text-[#9AA0C0]">
                    <span className="font-mono">{formatTime(currentTime)}</span>
                    <span className="font-mono">{formatTime(duration)}</span>
                  </div>

                  {/* Controls row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const v = volume < 0.01 ? setVolume(0.5) : setVolume(0);
                        }}
                        className="p-2 text-[#9AA0C0] hover:text-white"
                        aria-label={volume < 0.01 ? "تشغيل الصوت" : "كتم الصوت"}
                      >
                        {volume < 0.01 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>

                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-20 accent-[#7C5CFF]"
                        aria-label="مستوى الصوت"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        onClick={prevSurah}
                        disabled={currentSurahId <= 1}
                        className={cn(
                          "p-2 text-[#9AA0C0] hover:text-white disabled:opacity-30"
                        )}
                        aria-label="السورة السابقة"
                      >
                        <SkipBack size={20} />
                      </button>

                      {isLoading ? (
                        <Loader2 size={22} className="animate-spin text-[#7C5CFF]" />
                      ) : (
                        <button
                          onClick={handlePlayPause}
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                            isPlaying
                              ? "bg-[#7C5CFF]/15 text-[#B69CFF]"
                              : "bg-[#7C5CFF] text-white hover:bg-[#8E72FF]"
                          )}
                          aria-label={isPlaying ? "إيقاف" : "تشغيل"}
                        >
                          {isPlaying ? <Pause size={20} /> : <Play size={18} />}
                        </button>
                      )}

                      <button
                        onClick={nextSurah}
                        disabled={currentSurahId >= 114}
                        className={cn(
                          "p-2 text-[#9AA0C0] hover:text-white disabled:opacity-30"
                        )}
                        aria-label="السورة التاليةة"
                      >
                        <SkipForward size={20} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => pause()}
                        className="text-xs text-[#9AA0C0] hover:text-white"
                        aria-label="إغلاق المشغل"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
}
