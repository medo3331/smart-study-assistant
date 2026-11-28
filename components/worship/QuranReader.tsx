"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { Surah, Ayah } from "@/lib/islamic/types";
import { getAllSurahs, getAyahs, getAyahLocation } from "@/lib/islamic/quran";
import {
  computeQuranWordProgress,
  isQuranWordUnit,
  type QuranWordUnit,
} from "@/lib/islamic/worship-progress";
import { useQuranAudio } from "@/hooks/useQuranAudio";
import { ReciterSelector } from "@/components/worship/ReciterSelector";
import { useReciters } from "@/hooks/useReciters";
import { useQuranProgress } from "@/hooks/useQuranProgress";
import { useSharedWorshipData } from "@/components/worship/WorshipChrome";
import {
  fetchCloudQuranPosition,
  saveCloudQuranPosition,
  fetchCloudQuranBookmarks,
  addCloudQuranBookmark,
  removeCloudQuranBookmark,
  type QuranBookmark,
} from "@/lib/worship-data";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  Play,
  Pause,
  Bookmark,
  BookmarkCheck,
  Loader2,
  RotateCcw,
  ScrollText,
  X,
} from "lucide-react";

interface QuranReaderProps {
  initialSurahId?: number;
  onProgressUpdate?: (surahId: number, ayahId: number) => void;
}

const BOOKMARKS_KEY = "magicly-quran-bookmarks";

/** تفسير واحد من الـ API الداخلي — نص مُنظَّف بدون HTML. */
interface TafsirEntry {
  id: number;
  name: string;
  text: string;
}

type TafsirStatus = "idle" | "loading" | "ready" | "error";

/** موقع موضع القراءة في المصحف — لشريط «متابعة القراءة». */
interface ResumeLocation {
  surahId: number;
  ayahId: number;
  surahName: string;
  pageNumber: number | null;
}

/**
 * Quran Reader Component
 * - Surah list with search
 * - FULL mushaf-style reading: all ayahs grouped into pages (Quran page numbers
 *   from the API) with page navigation
 * - Reading progress + daily ayah counter update as the user pages forward
 * - Real audio playback via QuranAudioContext + reciter selector
 * - علامات مرجعية محلية + مزامنة موضع القرآن السحابية مع الحساب (مرحلة العبادات ١)
 */
export function QuranReader({ initialSurahId = 1, onProgressUpdate }: QuranReaderProps) {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSurahList, setShowSurahList] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [currentAnchorAyah, setCurrentAnchorAyah] = useState<Ayah | null>(null);
  const [cloudPositionReadyFor, setCloudPositionReadyFor] = useState<string | null>(null);
  const [positionSync, setPositionSync] = useState<"local" | "saving" | "saved" | "error">("local");
  const [selectedAyah, setSelectedAyah] = useState<Ayah | null>(null);
  const [tafsirStatus, setTafsirStatus] = useState<TafsirStatus>("idle");
  const [tafsirEntries, setTafsirEntries] = useState<TafsirEntry[]>([]);
  const [tafsirAttempt, setTafsirAttempt] = useState(0);
  const [resumeLocation, setResumeLocation] = useState<ResumeLocation | null>(null);
  const lastSavedPosition = useRef("");

  // Real audio integration
  const { state: audioState, currentSurahId, play, pause } = useQuranAudio();
  const { selectedReciter, isLoading: recitersLoading } = useReciters();
  const shared = useSharedWorshipData();
  const { progress: readProgress, updatePosition, isLoaded: progressLoaded } = useQuranProgress(
    shared?.settings.quranDailyTarget ?? 10,
    shared?.settings.timezone,
  );
  const progressRef = useRef(readProgress);
  const updatePositionRef = useRef(updatePosition);
  progressRef.current = readProgress;
  updatePositionRef.current = updatePosition;

  const isPlaying = audioState === "playing";
  const isLoadingAudio = audioState === "loading";

  // علامات مرجعية محلية — تُقرأ مرة واحدة عند التركيب.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
      if (Array.isArray(stored)) setBookmarks(stored.filter((item) => typeof item === "string"));
    } catch {
      setBookmarks([]);
    }
  }, []);

  // مزامنة العلامات المرجعية مع الحساب (db/122) — الدمج اتحاد: المحلي ∪ السحابي.
  useEffect(() => {
    if (!shared?.user || shared.user.is_anonymous) return;
    if (cloudPositionReadyFor !== shared.user.id) return; // نفس بوابة جاهزية الحساب للموضع
    let cancelled = false;
    void (async () => {
      const cloud = await fetchCloudQuranBookmarks(shared.supabase, shared.user!.id);
      if (cancelled || !cloud) return;
      setBookmarks((prev) => {
        const merged = Array.from(new Set([...prev, ...cloud.map((b) => `${b.surahId}:${b.ayahId}`)]));
        // نكتب الدمج محليًا كنسخة احتياطية لو فشلت كتابات السحابة لاحقاً.
        try {
          localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(merged));
        } catch {
          /* local fallback unavailable */
        }
        return merged;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudPositionReadyFor, shared?.user, shared?.supabase]);

  // ورد اليوم بالوحدة المختارة — طبقة عرض فوق عدّاد الآيات (المكافأة على العدّاد).
  const wordUnit: QuranWordUnit = isQuranWordUnit(shared?.settings.quranWordUnit)
    ? (shared!.settings.quranWordUnit as QuranWordUnit)
    : "ayat";
  const wordTarget =
    wordUnit === "ayat"
      ? shared?.settings.quranDailyTarget ?? 10
      : typeof shared?.settings.quranWordAmount === "number" && shared.settings.quranWordAmount >= 1
        ? shared.settings.quranWordAmount
        : 1;
  const wordProgress = useMemo(
    () => computeQuranWordProgress(readProgress.dailyCount, wordUnit, wordTarget),
    [readProgress.dailyCount, wordUnit, wordTarget],
  );

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
      setCurrentAnchorAyah(data[startIdx >= 0 ? startIdx : 0] ?? null);
    } catch (error) {
      console.error("Failed to load ayahs:", error);
      setAyahs([]);
      setPageIndex(0);
    }
  };

  // Restore the newest account position when available; otherwise use local storage.
  useEffect(() => {
    if (!progressLoaded || shared?.authStatus === "loading") return;
    let cancelled = false;
    void (async () => {
      const localProgress = progressRef.current;
      let resume = {
        surahId: localProgress.surahId,
        ayahId: localProgress.ayahId,
        updatedAt: localProgress.updatedAt ?? "",
      };
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
        const initial =
          data.find((s) => s.id === resumeSurah) ||
          data.find((s) => s.id === initialSurahId) ||
          data[0];

        if (initial) {
          setSelectedSurah(initial);
          setShowSurahList(false);
          await loadAyahs(initial.id, resume.updatedAt ? resume.ayahId : undefined);
          if (!cancelled) {
            setCloudPositionReadyFor(shared?.user && !shared.user.is_anonymous ? shared.user.id : "guest");
          }
        }
      } catch (error) {
        console.error("Failed to load surahs:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progressLoaded, shared?.authStatus, shared?.user, shared?.supabase, initialSurahId]);

  // مزامنة سحابية مؤجَّلة لموضع القراءة؛ الحفظ المحلي يبقى متاحاً إذا فشلت المزامنة.
  useEffect(() => {
    const ownerId = shared?.user && !shared.user.is_anonymous ? shared.user.id : "guest";
    if (cloudPositionReadyFor !== ownerId || !selectedSurah || !currentAnchorAyah) return;
    const position = {
      surahId: selectedSurah.id,
      ayahId: currentAnchorAyah.number,
      updatedAt: readProgress.updatedAt ?? new Date().toISOString(),
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
  }, [cloudPositionReadyFor, selectedSurah, currentAnchorAyah, readProgress.updatedAt, shared?.user, shared?.supabase]);

  /* ── شريط «متابعة القراءة»: أظهر الموضع المحفوظ + رقم صفحته في المصحف ── */
  useEffect(() => {
    if (surahs.length === 0) return;
    let cancelled = false;
    void (async () => {
      const pos = { surahId: readProgress.surahId, ayahId: readProgress.ayahId };
      if (!pos.surahId || pos.surahId < 1 || pos.ayahId < 1) {
        if (!cancelled) setResumeLocation(null);
        return;
      }
      // المستخدم واقف فعلاً في الموضع المحفوظ — مفيش داعي لشريط «كمل من هنا».
      if (selectedSurah?.id === pos.surahId && currentAnchorAyah?.number === pos.ayahId) {
        if (!cancelled) setResumeLocation(null);
        return;
      }
      const surah = surahs.find((s) => s.id === pos.surahId);
      if (!surah) {
        if (!cancelled) setResumeLocation(null);
        return;
      }
      // نداء خفيف بآية واحدة لمعرفة رقم الصفحة بدون تحميل السورة كاملة.
      const location = await getAyahLocation(pos.surahId, pos.ayahId);
      if (cancelled) return;
      setResumeLocation({
        surahId: pos.surahId,
        ayahId: pos.ayahId,
        surahName: surah.arabicName,
        pageNumber: location?.pageNumber ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [surahs, readProgress.surahId, readProgress.ayahId, readProgress.updatedAt, selectedSurah?.id, currentAnchorAyah?.number]);

  /** القفز للموضع المحفوظ — loadAyahs بتحسب صفحة الآية بنفسها. */
  const handleResumeReading = async () => {
    if (!resumeLocation) return;
    const surah = surahs.find((s) => s.id === resumeLocation.surahId);
    if (!surah) return;
    setSelectedSurah(surah);
    setShowSurahList(false);
    setSelectedAyah(null);
    await loadAyahs(surah.id, resumeLocation.ayahId);
  };

  /* ── تفسير الآية — عبر الـ API الداخلي (بروكسي سيرفر-سايد للمصدر) ── */
  const loadTafsir = useCallback(async (surahId: number, ayahId: number) => {
    setTafsirStatus("loading");
    setTafsirEntries([]);
    try {
      const response = await fetch(`/api/worship/quran/tafsir?surah=${surahId}&ayah=${ayahId}`);
      const data = (await response.json()) as { tafsirs?: TafsirEntry[] };
      if (!response.ok || !Array.isArray(data.tafsirs) || data.tafsirs.length === 0) {
        setTafsirStatus("error");
        return;
      }
      setTafsirEntries(data.tafsirs);
      setTafsirStatus("ready");
    } catch {
      setTafsirStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!selectedAyah) return;
    // نداء الشبكة يبدأ بعد الإطار الحالي — التفسير الخارجي مش حالة مزامنة فورية.
    const timeout = window.setTimeout(() => {
      void loadTafsir(selectedAyah.surahId, selectedAyah.number);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [selectedAyah, tafsirAttempt, loadTafsir]);

  /** تحديد آية: تمييز بصري + تفسير + تثبيت موضع القراءة عليها (بدون عدّ آيات). */
  const handleAyahSelect = (ayah: Ayah) => {
    setSelectedAyah(ayah);
    if (selectedSurah) {
      updatePosition(selectedSurah.id, ayah.number, readProgress.dailyCount, undefined, false);
    }
  };

  const closeTafsir = () => {
    setSelectedAyah(null);
    setTafsirStatus("idle");
    setTafsirEntries([]);
    setTafsirAttempt(0);
  };

  const handleSurahSelect = async (surah: Surah) => {
    setSelectedSurah(surah);
    setShowSurahList(false);
    setSelectedAyah(null);
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
      setSelectedAyah(null);

      const targetPage = pages[nextIndex];
      const anchorAyah = movingForward
        ? targetPage.ayahs[targetPage.ayahs.length - 1]
        : targetPage.ayahs[0];
      setCurrentAnchorAyah(anchorAyah);
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

  const toggleBookmark = () => {
    if (!selectedSurah || !currentAnchorAyah) return;
    const key = `${selectedSurah.id}:${currentAnchorAyah.number}`;
    const bookmark: QuranBookmark = { surahId: selectedSurah.id, ayahId: currentAnchorAyah.number };
    const adding = !bookmarks.includes(key);
    const next = adding ? [...bookmarks, key] : bookmarks.filter((item) => item !== key);
    setBookmarks(next);
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
    } catch {
      /* local fallback unavailable */
    }
    // رفع/حذف سحابي fire-and-forget — الفشل مسموح والمحلي هو الاحتياط.
    if (shared?.user && !shared.user.is_anonymous) {
      void (adding
        ? addCloudQuranBookmark(shared.supabase, shared.user.id, bookmark)
        : removeCloudQuranBookmark(shared.supabase, shared.user.id, bookmark));
    }
  };

  const isBookmarked =
    !!selectedSurah && !!currentAnchorAyah && bookmarks.includes(`${selectedSurah.id}:${currentAnchorAyah.number}`);

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

          <div className="w-[72px] flex-shrink-0 flex items-center justify-end">
            <Button
              variant="ghost"
              icon={isBookmarked ? BookmarkCheck : Bookmark}
              aria-label={isBookmarked ? "إزالة العلامة المرجعية" : "حفظ علامة مرجعية"}
              onClick={toggleBookmark}
              disabled={!currentPage}
            >
              <span className="sr-only">{isBookmarked ? "إزالة العلامة المرجعية" : "حفظ علامة مرجعية"}</span>
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
          {/* Resume banner — «أنا واقف فين»: الموضع المحفوظ + زرار كمل من هنا */}
          {resumeLocation && (
            <Reveal index={0}>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#10B981]/25 bg-[#10B981]/[0.06] px-4 py-3 mb-4">
                <p className="text-sm text-[#C7CBE6]">
                  متابعة القراءة: <span className="font-bold text-white">{resumeLocation.surahName}</span>
                  {resumeLocation.pageNumber ? (
                    <>
                      {" "}— صفحة <bdi>{resumeLocation.pageNumber}</bdi> من المصحف{" "}
                      <span className="text-[#9AA0C0]">
                        (<bdi>{resumeLocation.pageNumber}</bdi>/<bdi>604</bdi>)
                      </span>
                    </>
                  ) : (
                    <> — آية <bdi>{resumeLocation.ayahId}</bdi></>
                  )}
                </p>
                <Button
                  variant="ghost"
                  icon={ChevronLeft}
                  iconPosition="end"
                  onClick={handleResumeReading}
                  className="text-[#6EE7B7]"
                >
                  كمل من هنا
                </Button>
              </div>
            </Reveal>
          )}

          {/* ورد اليوم بالوحدة المختارة — عرض فوق عدّاد الآيات (المكافأة على العدّاد) */}
          <Reveal index={0}>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 mb-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[#9AA0C0]">
                  ورد اليوم:{" "}
                  <bdi className="font-bold text-white">
                    {wordProgress.completedLabel}
                  </bdi>{" "}
                  من <bdi>{wordProgress.targetLabel}</bdi>
                  {wordUnit !== "ayat" && (
                    <span className="text-[#9AA0C0]/70"> (≈ {wordProgress.ayahsEquivalent} آية)</span>
                  )}
                </span>
                <span className="font-mono font-bold text-[#6EE7B7]">{Math.round(wordProgress.percent)}%</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#34D399] to-[#10B981] rounded-full transition-all duration-300"
                  style={{ width: `${wordProgress.percent}%` }}
                />
              </div>
            </div>
          </Reveal>

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

                  {/* All ayahs of this mushaf page — الضغط على آية يحدّدها (تمييز + تفسير) */}
                  <div className="space-y-2" dir="rtl">
                    {currentPage.ayahs.map((ayah) => {
                      const isSelected =
                        !!selectedAyah && selectedAyah.surahId === ayah.surahId && selectedAyah.number === ayah.number;
                      return (
                        <button
                          key={`${ayah.surahId}-${ayah.number}`}
                          type="button"
                          onClick={() => handleAyahSelect(ayah)}
                          aria-pressed={isSelected}
                          aria-label={`تفسير الآية ${ayah.number}`}
                          className={cn(
                            "w-full flex items-start gap-3 rounded-xl text-right transition-colors cursor-pointer",
                            isSelected
                              ? "bg-[#10B981]/10 ring-1 ring-[#10B981]/50 px-3 py-2"
                              : "px-3 py-2 hover:bg-white/[0.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#10B981]/40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex-shrink-0 mt-1 flex h-8 min-w-8 px-1 items-center justify-center rounded-lg font-mono text-sm font-bold",
                              isSelected ? "bg-[#10B981] text-white" : "bg-[#10B981]/10 text-[#34D399]",
                            )}
                          >
                            {ayah.number}
                          </span>
                          <p
                            className="flex-1 text-right text-2xl leading-loose text-white font-medium whitespace-pre-wrap"
                            style={{ fontFamily: "var(--font-plex-arabic)" }}
                          >
                            {ayah.text}
                          </p>
                        </button>
                      );
                    })}
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
                    {shared?.user && !shared.user.is_anonymous && (
                      <p className="text-xs text-[#9AA0C0]" role="status">
                        {positionSync === "saving"
                          ? "جاري مزامنة موضع القراءة..."
                          : positionSync === "saved"
                            ? "تمت مزامنة موضع القراءة مع حسابك"
                            : positionSync === "error"
                              ? "تم الحفظ على هذا الجهاز؛ تعذرت المزامنة السحابية"
                              : "يُحفظ موضع القراءة على هذا الجهاز"}
                      </p>
                    )}
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="p-6 text-center text-[#9AA0C0]">
                  لا توجد آيات متاحة لهذه السورة
                </GlassCard>
              )}

              {/* Tafsir Panel — تفسير الآية المحددة (درج أسفل صفحة المصحف) */}
              {selectedAyah && currentPage && currentPage.ayahs.some((a) => a.number === selectedAyah.number) && (
                <GlassCard className="p-5 mb-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconBadge icon={ScrollText} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" size={34} />
                      <div className="min-w-0">
                        <p className="font-bold text-white">تفسير الآية</p>
                        <p className="text-xs text-[#9AA0C0]">
                          {selectedSurah?.arabicName} • آية <bdi>{selectedAyah.number}</bdi>
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      icon={X}
                      onClick={closeTafsir}
                      aria-label="إغلاق التفسير"
                      className="flex-shrink-0"
                    >
                      <span className="sr-only">إغلاق التفسير</span>
                    </Button>
                  </div>

                  {tafsirStatus === "loading" && (
                    <div className="flex items-center justify-center gap-2 py-6 text-[#9AA0C0]">
                      <Loader2 size={18} className="animate-spin" />
                      جاري جلب التفسير...
                    </div>
                  )}

                  {tafsirStatus === "error" && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                      <p className="text-sm text-[#9AA0C0]">
                        تعذّر جلب التفسير حاليًا — اتأكد من اتصالك وجرّب تاني.
                      </p>
                      <Button
                        variant="ghost"
                        icon={RotateCcw}
                        iconPosition="start"
                        onClick={() => setTafsirAttempt((n) => n + 1)}
                        className="mt-3"
                      >
                        إعادة المحاولة
                      </Button>
                    </div>
                  )}

                  {tafsirStatus === "ready" && (
                    <div className="space-y-4" dir="rtl">
                      {tafsirEntries.map((entry, index) => (
                        <details
                          key={entry.id}
                          open={index === 0}
                          className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                        >
                          <summary className="cursor-pointer list-none marker:content-none flex items-center justify-between text-sm font-semibold text-[#6EE7B7] hover:text-[#10B981] transition-colors">
                            {entry.name}
                            <ChevronLeft size={16} aria-hidden className="shrink-0" />
                          </summary>
                          <p
                            className="mt-2 text-right text-lg leading-loose text-[#E7E9F5] whitespace-pre-line"
                            style={{ fontFamily: "var(--font-plex-arabic)" }}
                          >
                            {entry.text}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}
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
