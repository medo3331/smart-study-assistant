"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { Surah, Ayah } from "@/lib/islamic/types";
import { getAllSurahs, getAyahs } from "@/lib/islamic/quran";
import { useQuranAudio } from "@/hooks/useQuranAudio";
import { ReciterSelector } from "@/components/worship/ReciterSelector";
import { useReciters } from "@/hooks/useReciters";
import { useQuranProgress } from "@/hooks/useQuranProgress";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  Play,
  Pause,
  Bookmark,
  Share2,
  Loader2,
} from "lucide-react";

interface QuranReaderProps {
  initialSurahId?: number;
  onProgressUpdate?: (surahId: number, ayahId: number) => void;
}

/**
 * Quran Reader Component
 * - Surah list with search
 * - Ayah navigation
 * - Reading progress tracking
 * - Real audio playback via QuranAudioContext + reciter selector
 */
export function QuranReader({ initialSurahId = 1, onProgressUpdate }: QuranReaderProps) {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  // FULL SURAH VIEW (was single-ayah): display all ayahs + audio list
  const [showAllAyahs, setShowAllAyahs] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSurahList, setShowSurahList] = useState(true);
  const [loading, setLoading] = useState(true);

  // Real audio integration
  const { state: audioState, currentSurahId, play, pause } = useQuranAudio();
  const { selectedReciter, isLoading: recitersLoading } = useReciters();
  const { progress: readProgress, updatePosition } = useQuranProgress();

  const isPlaying = audioState === "playing";
  const isLoadingAudio = audioState === "loading";

  // Load surahs on mount only (resume position is read once at mount)
  const resumeRef = useRef({ surahId: readProgress.surahId, ayahId: readProgress.ayahId });

  useEffect(() => {
    async function loadSurahs() {
      setLoading(true);
      try {
        const data = await getAllSurahs();
        setSurahs(data);

        // Find initial surah — check resume position first, then param, then default
        const resumeSurah = resumeRef.current.surahId;
        const initial =
          data.find((s) => s.id === resumeSurah) ||
          data.find((s) => s.id === initialSurahId) ||
          data[0];

        if (initial) {
          setSelectedSurah(initial);
          setShowAllAyahs(true);
          // eslint-disable-next-line react-hooks/immutability -- loadAyahs defined below but hoisted
          await loadAyahs(initial.id);
        }
      } catch (error) {
        console.error("Failed to load surahs:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSurahs();
    }, [initialSurahId]);

  const loadAyahs = async (surahId: number) => {
    try {
      const data = await getAyahs(surahId);
      setAyahs(data);
      setShowAllAyahs(true);
    } catch (error) {
      console.error("Failed to load ayahs:", error);
      setAyahs([]);
    }
  };

  const handleSurahSelect = async (surah: Surah) => {
    setSelectedSurah(surah);
    setShowSurahList(false);
    await loadAyahs(surah.id);
    onProgressUpdate?.(surah.id, 1);
    updatePosition(surah.id, 1, readProgress.dailyCount);
  };

  const handleAyahChange = useCallback(
    (index: number) => {
      setShowAllAyahs(true);// index display only
      if (selectedSurah) {
        onProgressUpdate?.(selectedSurah.id, index + 1);
        updatePosition(selectedSurah.id, index + 1, readProgress.dailyCount);
      }
    },
    [selectedSurah, onProgressUpdate, updatePosition, readProgress.dailyCount]
  );

  const goToNextAyah = () => {
    if (showAllAyahs && ayahs.length > 0) {
      handleAyahChange(0); // full surah view
    } else if (selectedSurah && selectedSurah.id < 114) {
      const nextSurah = surahs.find((s) => s.id === selectedSurah.id + 1);
      if (nextSurah) {
        handleSurahSelect(nextSurah);
      }
    }
  };

  const goToPrevAyah = () => {
    if (showAllAyahs && ayahs.length > 0) {
      handleAyahChange(0);
    } else if (selectedSurah && selectedSurah.id > 1) {
      const prevSurah = surahs.find((s) => s.id === selectedSurah.id - 1);
      if (prevSurah) {
        handleSurahSelect(prevSurah);
        // full surah view (no single-ayah index)
      }
    }
  };

  const handlePlayPause = useCallback(async () => {
    if (!selectedSurah || !selectedReciter) return;

    // If currently playing this surah, just pause.
    if (isPlaying && currentSurahId === selectedSurah.id) {
      pause();
    } else if (audioState === "paused" && currentSurahId === selectedSurah.id) {
      // Same track, paused — resume.
      await play(selectedReciter, selectedSurah.id);
    } else {
      // Different surah or idle/error — start fresh.
      await play(selectedReciter, selectedSurah.id);
    }
  }, [selectedSurah, selectedReciter, isPlaying, currentSurahId, audioState, play, pause]);

  const filteredSurahs = surahs.filter(
    (s) =>
      s.arabicName.includes(searchQuery) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toString().includes(searchQuery)
  );

  const currentAyah = ayahs.length > 0 ? ayahs[0] : null; // full surah view
  const progress = selectedSurah
    ? 100
    : 0;

  const isThisSurahPlaying = isPlaying && currentSurahId === selectedSurah?.id;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between mb-6 gap-4">
          <Button
            variant="ghost"
            icon={ChevronRight}
            iconPosition="start"
            onClick={() => setShowSurahList(true)}
            className="gap-1"
          >
            السور
          </Button>

          {selectedSurah && (
            <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
              <IconBadge icon={BookOpen} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={40} />
              <div className="text-center min-w-0">
                <p className="text-sm text-[#9AA0C0]">سورة</p>
                <p className="text-lg font-bold text-white truncate">
                  {selectedSurah.arabicName}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" icon={Bookmark} aria-label="حفظ الموضع">
              <span className="sr-only">حفظ الموضع</span>
            </Button>
            <Button variant="ghost" icon={Share2} aria-label="مشاركة">
              <span className="sr-only">مشاركة</span>
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Surah List View */}
      {showSurahList && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <Reveal index={1}>
            <GlassCard className="p-4 mb-4">
              <div className="relative">
                <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA0C0]" aria-hidden />
                <input
                  type="search"
                  placeholder="ابحث عن سورة بالاسم أو الرقم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pl-4 pr-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06]"
                  dir="rtl"
                />
              </div>
            </GlassCard>
          </Reveal>

          <Reveal index={2}>
            <GlassCard className="flex-1 overflow-hidden">
              {loading ? (
                <div className="flex h-full items-center justify-center text-[#9AA0C0]">
                  <Loader2 size={24} className="animate-spin mr-2" />
                  جاري تحميل السور...
                </div>
              ) : filteredSurahs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[#9AA0C0]">
                  لا توجد سور مطابقة
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  {filteredSurahs.map((surah, index) => (
                    <button
                      key={surah.id}
                      onClick={() => handleSurahSelect(surah)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors text-right",
                        selectedSurah?.id === surah.id && "bg-[#7C5CFF]/5"
                      )}
                      style={{ animationDelay: `${index * 0.02}s` }}
                    >
                      <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C5CFF]/10 text-[#B69CFF] font-mono font-bold">
                        {surah.id}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="font-bold text-white">{surah.arabicName}</p>
                        <p className="text-xs text-[#9AA0C0]">
                          {surah.name} • {surah.ayahCount} آية • جزء {surah.juzNumber}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[#9AA0C0]">
                        <span className="px-2 py-1 rounded-full text-xs bg-white/[0.04]">
                          {surah.revelationType === "Meccan" ? "مكية" : "مدنية"}
                        </span>
                        <ChevronLeft size={20} aria-hidden />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          </Reveal>

          {/* Reciter selector at the bottom of surah list */}
          {!loading && (
            <div className="mb-4">
              <ReciterSelector />
            </div>
          )}
        </div>
      )}

      {/* Ayah Reading View */}
      {!showSurahList && selectedSurah && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Surah Header */}
          <Reveal index={1}>
            <GlassCard className="p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <IconBadge icon={BookOpen} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={44} />
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-white">{selectedSurah.arabicName}</p>
                    <p className="text-sm text-[#9AA0C0] flex items-center gap-2 flex-wrap">
                      <span>{selectedSurah.name}</span>
                      <span>•</span>
                      <span>{selectedSurah.ayahCount} آيات</span>
                      <span>•</span>
                      <span>جزء {selectedSurah.juzNumber}</span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-white/[0.04]">
                        {selectedSurah.revelationType === "Meccan" ? "مكية" : "مدنية"}
                      </span>
                    </p>
                  </div>
                </div>
                <Button variant="ghost" icon={Menu} onClick={() => setShowSurahList(true)} aria-label="قائمة السور">
                  <span className="sr-only">قائمة السور</span>
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#9AA0C0]">كل آيات السورة ({selectedSurah?.ayahCount ?? 0})</span>
                  <span className="font-mono font-bold text-white">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2DD4BF] to-[#7C5CFF] rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </GlassCard>
          </Reveal>

          {/* Ayah Display */}
          <Reveal index={2}>
            <div className="flex-1 overflow-y-auto pr-2">
              {currentAyah ? (
                <GlassCard className="p-6 mb-4">
                  <div className="text-center">
                    {/* Ayah Number */}
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <Button
                        variant="ghost"
                        icon={ChevronRight}
                        onClick={goToPrevAyah}
                        disabled={false}
                        className="h-10 w-10 p-0"
                        aria-label="الآية السابقة"
                      >
                        <span className="sr-only">الآية السابقة</span>
                      </Button>
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#2DD4BF]/10 text-[#2DD4BF] font-mono text-2xl font-bold">
                        {currentAyah.number}
                      </div>
                      <Button
                        variant="ghost"
                        icon={ChevronLeft}
                        onClick={goToNextAyah}
                        disabled={false}
                        className="h-10 w-10 p-0"
                        aria-label="الآية التالية"
                      >
                        <span className="sr-only">الآية التالية</span>
                      </Button>
                    </div>

                    {/* Arabic Text */}
                    <div className="text-2xl leading-loose text-white font-medium whitespace-pre-wrap mb-6" dir="rtl" style={{ fontFamily: "var(--font-plex-arabic)" }}>
                      {currentAyah.text}
                    </div>

                    {/* Audio Controls — REAL integration */}
                    <div className="flex flex-col items-center gap-4 mt-6">
                      {/* Reciter quick-select */}
                      <div className="w-full max-w-xs">
                        <ReciterSelector />
                      </div>

                      {/* Play / Pause */}
                      <div className="flex items-center gap-4">
                        {isLoadingAudio && (
                          <Loader2 size={22} className="animate-spin text-[#7C5CFF]" aria-label="جاري التحميل" />
                        )}

                        {!recitersLoading && selectedReciter && (
                          <Button
                            variant={isThisSurahPlaying ? "success" : "primary"}
                            icon={isThisSurahPlaying ? Pause : Play}
                            iconPosition="start"
                            onClick={handlePlayPause}
                            disabled={!selectedSurah}
                            className="px-6"
                            aria-label={isThisSurahPlaying ? "إيقاف التشغيل" : "تشغيل التلاوة"}
                          >
                            {isThisSurahPlaying ? "إيقاف" : isPlaying ? "استمع الآن" : "استماع"}
                          </Button>
                        )}
                      </div>

                      {/* Reciter info */}
                      {selectedReciter && (
                        <p className="text-xs text-[#9AA0C0]">
                          {selectedReciter.arabicName} • {selectedReciter.rewaya}
                        </p>
                      )}
                    </div>

                    {/* Navigation Hint */}
                    <p className="mt-4 text-xs text-[#9AA0C0]">
                      استخدم الأسهم للتنقل بين الآيات
                    </p>
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="p-6 text-center text-[#9AA0C0]">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                  جاري تحميل الآيات...
                </GlassCard>
              )}

              {/* Surah Navigation */}
              <div className="flex items-center justify-between gap-4">
                <Button
                  variant="ghost"
                  icon={ChevronRight}
                  iconPosition="start"
                  onClick={goToPrevAyah}
                  disabled={false}
                >
                  السورة السابقة
                </Button>
                <Button
                  variant="ghost"
                  icon={ChevronLeft}
                  iconPosition="end"
                  onClick={goToNextAyah}
                  disabled={false}
                >
                  السورة التالية
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      )}
    </div>
  );
}