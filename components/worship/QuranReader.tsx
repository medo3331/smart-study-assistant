"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Loader2,
} from "lucide-react";

interface QuranReaderProps {
  initialSurahId?: number;
  onProgressUpdate?: (surahId: number, ayahId: number) => void;
}

/**
 * Quran Reader Component
 * - Surah list with search
 * - FULL mushaf-style reading: all ayahs grouped into pages (Quran page numbers
 *   from the API) with page navigation
 * - Reading progress + daily ayah counter update as the user pages forward
 * - Real audio playback via QuranAudioContext + reciter selector
 */
export function QuranReader({ initialSurahId = 1, onProgressUpdate }: QuranReaderProps) {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSurahList, setShowSurahList] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);

  // Real audio integration
  const { state: audioState, currentSurahId, play, pause } = useQuranAudio();
  const { selectedReciter, isLoading: recitersLoading } = useReciters();
  const { progress: readProgress, updatePosition } = useQuranProgress();

  const isPlaying = audioState === "playing";
  const isLoadingAudio = audioState === "loading";

  // Resume position is read once at mount
  const resumeRef = useRef({ surahId: readProgress.surahId, ayahId: readProgress.ayahId });

  // Pages = ayahs grouped by mushaf page number (from the API).
  const pages = useMemo(() => {
    const groups: { pageNumber: number; ayahs: Ayah[] }[] = [];
    for (const ayah of ayahs) {
      const last = groups[groups.length - 1];
      if (last && last.pageNumber === ayah.pageNumber) {
        last.ayahs.push(ayah);
      } else {
        groups.push({ pageNumber: ayah.pageNumber, ayahs: [ayah] });
      }
    }
    return groups;
  }, [ayahs]);

  const currentPage = pages[pageIndex] ?? null;

  // Ayahs read so far within this surah (cumulative through the current page).
  const ayahsThroughPage = useMemo(
    () => pages.slice(0, pageIndex + 1).reduce((sum, p) => sum + p.ayahs.length, 0),
    [pages, pageIndex],
  );

  const loadAyahs = async (surahId: number, resumeAyahId?: number) => {
    try {
      const data = await getAyahs(surahId);
      setAyahs(data);
      const startIdx = resumeAyahId
        ? data.findIndex((a) => a.number >= resumeAyahId)
        : 0;
      let idx = 0;
      for (let i = 0; i < Math.max(0, startIdx); i++) {
        if (i === 0 || data[i].pageNumber !== data[i - 1].pageNumber) idx++;
      }
      setPageIndex(startIdx < 0 ? 0 : idx);
    } catch (error) {
      console.error("Failed to load ayahs:", error);
      setAyahs([]);
      setPageIndex(0);
    }
  };

  useEffect(() => {
    async function loadSurahs() {
      setLoading(true);
      try {
        const data = await getAllSurahs();
        setSurahs(data);

        const resumeSurah = resumeRef.current.surahId;
        const initial =
          data.find((s) => s.id === resumeSurah) ||
          data.find((s) => s.id === initialSurahId) ||
          data[0];

        if (initial) {
          setSelectedSurah(initial);
          setShowSurahList(false);
          await loadAyahs(initial.id, resumeRef.current.ayahId);
        }
      } catch (error) {
        console.error("Failed to load surahs:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSurahs();
  }, [initialSurahId]);

  const handleSurahSelect = async (surah: Surah) => {
    setSelectedSurah(surah);
    setShowSurahList(false);
    await loadAyahs(surah.id);
    onProgressUpdate?.(surah.id, 1);
    updatePosition(surah.id, 1, readProgress.dailyCount);
  };

  /** Navigate between mushaf pages; counts newly-read ayahs (forward only). */
  const goToPage = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= pages.length || !selectedSurah) return;
      const movingForward = nextIndex > pageIndex;
      setPageIndex(nextIndex);

      const targetPage = pages[nextIndex];
      const anchorAyah = movingForward
        ? targetPage.ayahs[targetPage.ayahs.length - 1]
        : targetPage.ayahs[0];
      onProgressUpdate?.(selectedSurah.id, anchorAyah.number);

      if (movingForward) {
        const newPageAyahs = pages
          .slice(pageIndex + 1, nextIndex + 1)
          .reduce((sum, p) => sum + p.ayahs.length, 0);
        updatePosition(
          selectedSurah.id,
          anchorAyah.number,
          readProgress.dailyCount + newPageAyahs,
        );
      } else {
        updatePosition(selectedSurah.id, anchorAyah.number, readProgress.dailyCount);
      }
    },
    [pages, pageIndex, selectedSurah, onProgressUpdate, updatePosition, readProgress.dailyCount],
  );

  const goToNextSurah = () => {
    if (selectedSurah && selectedSurah.id < 114) {
      const nextSurah = surahs.find((s) => s.id === selectedSurah.id + 1);
      if (nextSurah) {
        void handleSurahSelect(nextSurah);
      }
    }
  };

  const goToPrevSurah = () => {
    if (selectedSurah && selectedSurah.id > 1) {
      const prevSurah = surahs.find((s) => s.id === selectedSurah.id - 1);
      if (prevSurah) {
        void handleSurahSelect(prevSurah);
      }
    }
  };

  const handlePlayPause = useCallback(async () => {
    if (!selectedSurah || !selectedReciter) return;

    if (isPlaying && currentSurahId === selectedSurah.id) {
      pause();
    } else if (audioState === "paused" && currentSurahId === selectedSurah.id) {
      await play(selectedReciter, selectedSurah.id);
    } else {
      await play(selectedReciter, selectedSurah.id);
    }
  }, [selectedSurah, selectedReciter, isPlaying, currentSurahId, audioState, play, pause]);

  const filteredSurahs = surahs.filter(
    (s) =>
      s.arabicName.includes(searchQuery) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toString().includes(searchQuery)
  );

  const surahJuz = ayahs[0]?.juzNumber ?? selectedSurah?.juzNumber ?? 1;
  const readPercent = selectedSurah && selectedSurah.ayahCount > 0
    ? Math.min((ayahsThroughPage / selectedSurah.ayahCount) * 100, 100)
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
              <IconBadge icon={BookOpen} color="text-[#10B981]" bg="bg-[#10B981]/15" size={40} />
              <div className="text-center min-w-0">
                <p className="text-sm text-[#9AA0C0]">سورة</p>
                <p className="text-lg font-bold text-white truncate">
                  {selectedSurah.arabicName}
                </p>
              </div>
            </div>
          )}

          <div className="w-[72px] flex-shrink-0" />
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
                  className="w-full h-11 pl-4 pr-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#10B981]/50 focus:bg-white/[0.06]"
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
                        selectedSurah?.id === surah.id && "bg-[#10B981]/5"
                      )}
                      style={{ animationDelay: `${index * 0.02}s` }}
                    >
                      <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-[#10B981]/10 text-[#6EE7B7] font-mono font-bold">
                        {surah.id}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="font-bold text-white">{surah.arabicName}</p>
                        <p className="text-xs text-[#9AA0C0]">
                          {surah.name} • {surah.ayahCount} آية
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

      {/* Full-Surah Reading View */}
      {!showSurahList && selectedSurah && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Surah Header */}
          <Reveal index={1}>
            <GlassCard className="p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <IconBadge icon={BookOpen} color="text-[#10B981]" bg="bg-[#10B981]/15" size={44} />
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-white">{selectedSurah.arabicName}</p>
                    <p className="text-sm text-[#9AA0C0] flex items-center gap-2 flex-wrap">
                      <span>{selectedSurah.name}</span>
                      <span>•</span>
                      <span>{selectedSurah.ayahCount} آيات</span>
                      <span>•</span>
                      <span>جزء {surahJuz}</span>
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
                  <span className="text-[#9AA0C0]">
                    قرأت <bdi>{ayahsThroughPage}</bdi> من <bdi>{selectedSurah.ayahCount}</bdi> آية
                  </span>
                  <span className="font-mono font-bold text-white">{Math.round(readPercent)}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#34D399] to-[#10B981] rounded-full transition-all duration-300"
                    style={{ width: `${readPercent}%` }}
                  />
                </div>
              </div>
            </GlassCard>
          </Reveal>

          {/* Ayah Pages Display */}
          <Reveal index={2}>
            <div className="flex-1 overflow-y-auto pr-2">
              {loading || (!currentPage && ayahs.length === 0) ? (
                <GlassCard className="p-6 text-center text-[#9AA0C0]">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                  جاري تحميل الآيات...
                </GlassCard>
              ) : currentPage ? (
                <GlassCard className="p-6 mb-4">
                  {/* Mushaf page indicator */}
                  <div className="flex items-center justify-center mb-4">
                    <span className="px-3 py-1 rounded-full text-xs bg-[#10B981]/10 text-[#6EE7B7] font-mono">
                      صفحة {currentPage.pageNumber} • {pageIndex + 1} من {pages.length}
                    </span>
                  </div>

                  {/* All ayahs of this mushaf page */}
                  <div className="space-y-5" dir="rtl">
                    {currentPage.ayahs.map((ayah) => (
                      <div key={`${ayah.surahId}-${ayah.number}`} className="flex items-start gap-3">
                        <span className="flex-shrink-0 mt-1 flex h-8 min-w-8 px-1 items-center justify-center rounded-lg bg-[#10B981]/10 text-[#34D399] font-mono text-sm font-bold">
                          {ayah.number}
                        </span>
                        <p
                          className="flex-1 text-right text-2xl leading-loose text-white font-medium whitespace-pre-wrap"
                          style={{ fontFamily: "var(--font-plex-arabic)" }}
                        >
                          {ayah.text}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Audio Controls */}
                  <div className="flex flex-col items-center gap-3 mt-6 pt-4 border-t border-white/[0.06]">
                    <div className="w-full max-w-xs">
                      <ReciterSelector />
                    </div>
                    <div className="flex items-center gap-4">
                      {isLoadingAudio && (
                        <Loader2 size={22} className="animate-spin text-[#10B981]" aria-label="جاري التحميل" />
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
                          {isThisSurahPlaying ? "إيقاف" : "استماع للسورة"}
                        </Button>
                      )}
                    </div>
                    {selectedReciter && (
                      <p className="text-xs text-[#9AA0C0]">
                        {selectedReciter.arabicName} • {selectedReciter.rewaya}
                      </p>
                    )}
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="p-6 text-center text-[#9AA0C0]">
                  لا توجد آيات متاحة لهذه السورة
                </GlassCard>
              )}

              {/* Page Navigation */}
              {pages.length > 0 && (
                <div className="flex items-center justify-between gap-4 pb-2">
                  <Button
                    variant="ghost"
                    icon={ChevronRight}
                    iconPosition="start"
                    onClick={() => goToPage(pageIndex - 1)}
                    disabled={pageIndex === 0}
                  >
                    الصفحة السابقة
                  </Button>
                  <Button
                    variant="ghost"
                    icon={ChevronLeft}
                    iconPosition="end"
                    onClick={() => goToPage(pageIndex + 1)}
                    disabled={pageIndex >= pages.length - 1}
                  >
                    الصفحة التالية
                  </Button>
                </div>
              )}

              {/* Surah Navigation */}
              <div className="flex items-center justify-between gap-4">
                <Button
                  variant="ghost"
                  icon={ChevronRight}
                  iconPosition="start"
                  onClick={goToPrevSurah}
                  disabled={(selectedSurah?.id ?? 1) <= 1}
                >
                  السورة السابقة
                </Button>
                <Button
                  variant="ghost"
                  icon={ChevronLeft}
                  iconPosition="end"
                  onClick={goToNextSurah}
                  disabled={(selectedSurah?.id ?? 114) >= 114}
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
