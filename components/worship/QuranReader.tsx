"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { Surah, Ayah } from "@/lib/islamic/types";
import { getAllSurahs, getAyahs } from "@/lib/islamic/quran";
import { useQuranAudio } from "@/hooks/useQuranAudio";
import { ReciterSelector } from "@/components/worship/ReciterSelector";
import { useReciters } from "@/hooks/useReciters";
import { useQuranProgress } from "@/hooks/useQuranProgress";
import { useSharedWorshipData } from "@/components/worship/WorshipChrome";
import { fetchCloudQuranPosition, saveCloudQuranPosition } from "@/lib/worship-data";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  Play,
  Pause,
  Bookmark,
  Loader2,
} from "lucide-react";

interface QuranReaderProps {
  initialSurahId?: number;
  onProgressUpdate?: (surahId: number, ayahId: number) => void;
}

const BOOKMARKS_KEY = "magicly-quran-bookmarks";

/** Quran reader: complete source-validated surah, explicit loading/errors, local + account position. */
export function QuranReader({ initialSurahId = 1, onProgressUpdate }: QuranReaderProps) {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [selectedAyahIndex, setSelectedAyahIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSurahList, setShowSurahList] = useState(true);
  const [loadingSurahs, setLoadingSurahs] = useState(true);
  const [loadingAyahs, setLoadingAyahs] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [cloudPositionReadyFor, setCloudPositionReadyFor] = useState<string | null>(null);
  const [positionSync, setPositionSync] = useState<"local" | "saving" | "saved" | "error">("local");
  const loadRequest = useRef(0);
  const lastSavedPosition = useRef("");
  const { state: audioState, currentSurahId, play, pause } = useQuranAudio();
  const { selectedReciter, isLoading: recitersLoading } = useReciters();
  const shared = useSharedWorshipData();
  const { progress, updatePosition, isLoaded: progressLoaded } = useQuranProgress(
    shared?.settings.quranDailyTarget ?? 10,
    shared?.settings.timezone,
  );
  const progressRef = useRef(progress);
  const progressUpdateRef = useRef(onProgressUpdate);
  const updatePositionRef = useRef(updatePosition);
  progressRef.current = progress;
  progressUpdateRef.current = onProgressUpdate;
  updatePositionRef.current = updatePosition;
  const isPlaying = audioState === "playing";
  const isLoadingAudio = audioState === "loading";
  const currentAyah = ayahs[selectedAyahIndex] ?? null;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
      if (Array.isArray(stored)) setBookmarks(stored.filter((item) => typeof item === "string"));
    } catch {
      setBookmarks([]);
    }
  }, []);

  const selectAyah = useCallback((index: number, recordRead = true) => {
    const ayah = ayahs[index];
    if (!ayah || !selectedSurah) return;
    setSelectedAyahIndex(index);
    updatePosition(selectedSurah.id, ayah.number, undefined, undefined, recordRead);
    onProgressUpdate?.(selectedSurah.id, ayah.number);
  }, [ayahs, selectedSurah, updatePosition, onProgressUpdate]);

  const loadSurah = useCallback(async (surah: Surah, ayahNumber = 1, recordPosition = true) => {
    const requestId = ++loadRequest.current;
    setSelectedSurah(surah);
    setShowSurahList(false);
    setLoadingAyahs(true);
    setLoadError(null);
    setAyahs([]);
    try {
      const data = await getAyahs(surah.id);
      if (requestId !== loadRequest.current) return;
      if (data.length !== surah.ayahCount) throw new Error("لم يكتمل تحميل آيات السورة من المصدر الموثوق.");
      setAyahs(data);
      const index = Math.min(Math.max(ayahNumber - 1, 0), data.length - 1);
      setSelectedAyahIndex(index);
      if (!recordPosition && data[index].number !== ayahNumber) {
        updatePositionRef.current(surah.id, data[index].number, undefined, undefined, false);
      }
      if (recordPosition) {
        updatePositionRef.current(surah.id, index + 1, undefined, undefined, false);
        progressUpdateRef.current?.(surah.id, index + 1);
      }
    } catch (error) {
      if (requestId !== loadRequest.current) return;
      setAyahs([]);
      setLoadError(error instanceof Error ? error.message : "تعذر تحميل الآيات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      if (requestId === loadRequest.current) setLoadingAyahs(false);
    }
  }, []);

  // Restore the newest account position when available; otherwise use local storage.
  useEffect(() => {
    if (!progressLoaded || shared?.authStatus === "loading") return;
    let cancelled = false;
    void (async () => {
      const localProgress = progressRef.current;
      let resume = { surahId: localProgress.surahId, ayahId: localProgress.ayahId, updatedAt: localProgress.updatedAt ?? "" };
      if (shared?.user && !shared.user.is_anonymous) {
        try {
          const cloudPosition = await fetchCloudQuranPosition(shared.supabase, shared.user.id);
          if (cloudPosition && Date.parse(cloudPosition.updatedAt) > Date.parse(resume.updatedAt || "1970-01-01")) {
            resume = cloudPosition;
            updatePositionRef.current(resume.surahId, resume.ayahId, undefined, resume.updatedAt, false);
          }
        } catch {
          // Keep the local position if account sync is unavailable.
        }
      }
      if (cancelled) return;
      try {
        const data = await getAllSurahs();
        if (cancelled) return;
        setSurahs(data);
        const resumeSurah = resume.updatedAt ? resume.surahId : initialSurahId;
        const initial = data.find((surah) => surah.id === resumeSurah) ?? data[0];
        if (initial) {
          await loadSurah(initial, resume.updatedAt ? resume.ayahId : 1, false);
          if (!cancelled) setCloudPositionReadyFor(shared?.user && !shared.user.is_anonymous ? shared.user.id : "guest");
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "تعذر تحميل قائمة السور. تحقق من اتصال الإنترنت.");
      } finally {
        if (!cancelled) setLoadingSurahs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [progressLoaded, shared?.authStatus, shared?.user, shared?.supabase, initialSurahId, loadSurah]);

  // Debounced cloud persistence; local progress remains available if sync fails.
  useEffect(() => {
    const ownerId = shared?.user && !shared.user.is_anonymous ? shared.user.id : "guest";
    if (cloudPositionReadyFor !== ownerId || !selectedSurah || !currentAyah) return;
    const position = {
      surahId: selectedSurah.id,
      ayahId: currentAyah.number,
      updatedAt: progress.updatedAt ?? new Date().toISOString(),
    };
    const key = `${shared?.user?.id ?? "guest"}:${position.surahId}:${position.ayahId}:${position.updatedAt}`;
    if (lastSavedPosition.current === key) return;
    if (!shared?.user || shared.user.is_anonymous) {
      lastSavedPosition.current = key;
      return;
    }
    if (lastSavedPosition.current.startsWith("guest:")) lastSavedPosition.current = "";

    setPositionSync("saving");
    const timeout = window.setTimeout(() => {
      lastSavedPosition.current = key;
      void saveCloudQuranPosition(shared.supabase, shared.user!.id, position).then((saved) => {
        if (lastSavedPosition.current !== key) return;
        setPositionSync(saved ? "saved" : "error");
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [cloudPositionReadyFor, selectedSurah, currentAyah, progress.updatedAt, shared?.user, shared?.supabase]);

  const filteredSurahs = useMemo(() => surahs.filter((surah) =>
    surah.arabicName.includes(searchQuery) ||
    surah.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    surah.id.toString().includes(searchQuery)
  ), [surahs, searchQuery]);

  const moveAyah = (delta: number) => {
    const nextIndex = selectedAyahIndex + delta;
    if (nextIndex >= 0 && nextIndex < ayahs.length) {
      selectAyah(nextIndex);
      return;
    }
    const nextSurah = surahs.find((surah) => surah.id === (selectedSurah?.id ?? 0) + delta);
    if (nextSurah) void loadSurah(nextSurah, delta > 0 ? 1 : nextSurah.ayahCount);
  };

  const handlePlayPause = useCallback(async () => {
    if (!selectedSurah || !selectedReciter) return;
    if (isPlaying && currentSurahId === selectedSurah.id) pause();
    else await play(selectedReciter, selectedSurah.id);
  }, [selectedSurah, selectedReciter, isPlaying, currentSurahId, play, pause]);

  const toggleBookmark = () => {
    if (!selectedSurah || !currentAyah) return;
    const key = `${selectedSurah.id}:${currentAyah.number}`;
    const next = bookmarks.includes(key) ? bookmarks.filter((item) => item !== key) : [...bookmarks, key];
    setBookmarks(next);
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next)); } catch { /* local fallback unavailable */ }
  };

  const isBookmarked = !!selectedSurah && !!currentAyah && bookmarks.includes(`${selectedSurah.id}:${currentAyah.number}`);

  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <Reveal index={0}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button variant="ghost" icon={ChevronRight} iconPosition="start" onClick={() => setShowSurahList(true)} className="gap-1">
            السور
          </Button>
          {selectedSurah && (
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
              <BookOpen size={22} className="text-[#2DD4BF]" aria-hidden />
              <div className="min-w-0 text-center">
                <p className="text-xs text-[#9AA0C0]">سورة</p>
                <p className="truncate text-lg font-bold text-white">{selectedSurah.arabicName}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button variant="ghost" icon={Bookmark} aria-label={isBookmarked ? "إزالة العلامة المرجعية" : "حفظ علامة مرجعية"} onClick={toggleBookmark} disabled={!currentAyah}>
              <span className="sr-only">{isBookmarked ? "إزالة العلامة المرجعية" : "حفظ علامة مرجعية"}</span>
            </Button>
          </div>
        </div>
      </Reveal>

      {showSurahList ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="relative">
            <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA0C0]" aria-hidden />
            <input type="search" placeholder="ابحث عن سورة بالاسم أو الرقم..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-4 pr-12 text-white placeholder-[#9AA0C0] focus:border-[#7C5CFF]/50 focus:outline-none" dir="rtl" />
          </div>
          <GlassCard className="min-h-0 flex-1 overflow-hidden">
            {loadingSurahs ? (
              <div className="flex h-40 items-center justify-center text-[#9AA0C0]"><Loader2 size={24} className="ml-2 animate-spin" />جاري تحميل السور...</div>
            ) : loadError && surahs.length === 0 ? (
              <div className="p-6 text-center text-[#FB923C]" role="alert">{loadError}<button type="button" className="mt-3 block w-full text-[#B69CFF]" onClick={() => window.location.reload()}>إعادة المحاولة</button></div>
            ) : filteredSurahs.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-[#9AA0C0]">لا توجد سور مطابقة</div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredSurahs.map((surah) => (
                  <button key={surah.id} type="button" onClick={() => void loadSurah(surah)} className={cn("flex w-full items-center gap-4 border-b border-white/[0.04] p-4 text-right transition-colors hover:bg-white/[0.04]", selectedSurah?.id === surah.id && "bg-[#7C5CFF]/10")}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7C5CFF]/10 font-mono font-bold text-[#B69CFF]">{surah.id}</span>
                    <span className="min-w-0 flex-1"><span className="block font-bold text-white">{surah.arabicName}</span><span className="text-xs text-[#9AA0C0]">{surah.name} • {surah.ayahCount} آية • {surah.revelationType === "Meccan" ? "مكية" : "مدنية"}</span></span>
                    <ChevronLeft size={20} className="text-[#9AA0C0]" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </GlassCard>
          {!loadingSurahs && <ReciterSelector />}
        </div>
      ) : selectedSurah ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <GlassCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold text-white">{selectedSurah.arabicName}</h2><p className="text-sm text-[#9AA0C0]">{selectedSurah.ayahCount} آية • {selectedSurah.revelationType === "Meccan" ? "مكية" : "مدنية"}</p></div>
              <Button variant="ghost" icon={Menu} onClick={() => setShowSurahList(true)} aria-label="قائمة السور"><span className="sr-only">قائمة السور</span></Button>
            </div>
            {currentAyah && <p className="mt-3 text-sm text-[#9AA0C0]">موضع القراءة: الآية <bdi>{currentAyah.number}</bdi> من <bdi>{selectedSurah.ayahCount}</bdi></p>}
          </GlassCard>

          {loadError ? (
            <GlassCard className="p-6 text-center"><p role="alert" className="text-[#FB923C]">{loadError}</p><Button variant="primary" className="mt-4" onClick={() => void loadSurah(selectedSurah, currentAyah?.number ?? 1)}>إعادة تحميل الآيات</Button></GlassCard>
          ) : loadingAyahs ? (
            <GlassCard className="flex min-h-48 flex-1 items-center justify-center p-6 text-[#9AA0C0]"><Loader2 size={22} className="ml-2 animate-spin" />جاري تحميل الآيات الموثوقة...</GlassCard>
          ) : (
            <GlassCard className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7" aria-label={`آيات سورة ${selectedSurah.arabicName}`}>
              {ayahs.map((ayah, index) => (
                <button key={`${ayah.surahId}:${ayah.number}`} type="button" onClick={() => selectAyah(index)} aria-current={index === selectedAyahIndex ? "true" : undefined} className={cn("mb-3 w-full rounded-xl px-3 py-3 text-right leading-[2.4] transition-colors", index === selectedAyahIndex ? "bg-[#2DD4BF]/10 text-white ring-1 ring-[#2DD4BF]/25" : "text-[#E7E9F5] hover:bg-white/[0.04]")}>
                  <span className="text-xl sm:text-2xl" dir="rtl" style={{ fontFamily: "var(--font-body), Tahoma, sans-serif" }}>{ayah.text}</span>
                  <span className="mr-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#2DD4BF]/10 px-2 align-middle font-mono text-sm text-[#2DD4BF]">{ayah.number}</span>
                </button>
              ))}
              {ayahs.length > 0 && <p className="pt-4 text-center text-xs text-[#9AA0C0]">نص الآيات من مصدر القرآن المحدد • لا يُستخدم محتوى مولد</p>}
            </GlassCard>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" icon={ChevronRight} iconPosition="start" onClick={() => moveAyah(-1)} disabled={loadingAyahs || (selectedAyahIndex === 0 && selectedSurah.id === 1)}>الآية السابقة</Button>
            <span className="text-sm text-[#9AA0C0]">{currentAyah ? `الآية ${currentAyah.number} / ${ayahs.length}` : ""}</span>
            <Button variant="ghost" icon={ChevronLeft} iconPosition="end" onClick={() => moveAyah(1)} disabled={loadingAyahs || (!!currentAyah && selectedAyahIndex === ayahs.length - 1 && selectedSurah.id === 114)}>الآية التالية</Button>
          </div>

          <div className="flex flex-col items-center gap-2 py-2">
            <ReciterSelector />
            {!recitersLoading && selectedReciter && <Button variant={isPlaying && currentSurahId === selectedSurah.id ? "success" : "primary"} icon={isPlaying && currentSurahId === selectedSurah.id ? Pause : Play} iconPosition="start" onClick={handlePlayPause} disabled={!currentAyah || isLoadingAudio}>{isLoadingAudio ? "جاري التحميل..." : isPlaying && currentSurahId === selectedSurah.id ? "إيقاف التلاوة" : "استماع للسورة"}</Button>}
            {isLoadingAudio && <Loader2 size={18} className="animate-spin text-[#7C5CFF]" aria-label="جاري تحميل التلاوة" />}
            {shared?.user && !shared.user.is_anonymous && <p className="text-xs text-[#9AA0C0]" role="status">{positionSync === "saving" ? "جاري مزامنة موضع القراءة..." : positionSync === "saved" ? "تمت مزامنة موضع القراءة مع حسابك" : positionSync === "error" ? "تم الحفظ على هذا الجهاز؛ تعذرت المزامنة السحابية" : "يُحفظ موضع القراءة على هذا الجهاز"}</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
