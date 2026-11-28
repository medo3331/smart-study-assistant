"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { VideoCandidate, SavedLessonVideo } from "@/lib/lesson/video-server";
import type { OutlineSection } from "@/lib/lesson/outline";
import { EXPLANATION_MODE_LABELS, type ExplanationMode } from "@/lib/lesson/explanations";

/* ==========================================================================
   LessonStudioProvider — Context الوحيد للـ Studio (§2.2 من التصميم).
   حالة الـ Studio كلها here: التابات + الفيديو (مخفي افتراضيًا) + النوتة +
   مستوى الشرح + القسم الحالي + Smart Resume (localStorage — مفيش migration).
   أي تاب أو أداة بتقرا/تكتب عبر الـ hooks تحت — مفيش props drilling.
   ========================================================================== */

export type StudioTab = "learn" | "video" | "notes" | "practice" | "tutor";

export type NotebookDraft = {
  title: string;
  body: string;
  source: string;
};

/** P1: mapping صادق من الأوضاع الأربعة الموجودة — deep_dive/exam_focus في P2. */
export type ExplanationLevel = "simplified" | "standard" | "deep_dive" | "practical" | "exam_focus";

export type TutorContextPayload = {
  lesson: { title: string; subject: string; content: string; description: string };
  extraContext: string;
};

export type LessonStudioLesson = {
  dayId: string;
  topic: string;
  title: string;
  description: string;
  subject: string;
  category: string;
  learningStyle: "practical" | "visual" | "academic";
  xpReward: number;
  isCompleted: boolean;
  dayNumber: number;
};

export type ResumeState = {
  lastTab: StudioTab | null;
  lastSectionId: string | null;
  lastVideoId: string | null;
  updatedAt: string | null;
};

const RESUME_DEBOUNCE_MS = 3000;
/** حد أقصى لنص النوتة المُحقنة — نفس فلسفة حدود الـ payload في القرار المقفول. */
export const MAX_NOTE_DRAFT_CHARS = 20_000;

type LessonStudioContextValue = {
  // ── الدرس (static خلال الزيارة — من page.tsx) ──
  lesson: LessonStudioLesson;
  // ── التنقل ──
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;
  navigatorOpen: boolean;
  toggleNavigator: () => void;
  // ── أقسام الدرس (outline — يتغذى من LearnTab) ──
  outline: OutlineSection[];
  setOutline: (sections: OutlineSection[]) => void;
  // ── القسم الحالي (داخل الشرح) ──
  currentSectionId: string | null;
  setCurrentSectionId: (id: string | null) => void;
  // ── الفيديو (مخفي افتراضيًا — البحث lazy) ──
  video: {
    open: boolean;
    active: VideoCandidate | null;
    candidates: VideoCandidate[];
    loading: boolean;
    miniPlayerOn: boolean;
    lastTimestamp: number | null;
  };
  openVideo: (candidate?: VideoCandidate) => void;
  closeVideo: () => void;
  /** أول فتح لتاب الفيديو بس — الصفحة ما بتعملش بحث عند التحميل. */
  ensureVideoLoaded: () => void;
  /** «مش مناسب» — إخفاء ترشيح في الجلسة الحالية بس (P2 مطلب 3). */
  dismissVideoCandidate: (id: string) => void;
  /** الفيديو المختار المحفوظ في الداتابيز (P3) — لو موجود، البحث بيتوفر. */
  savedVideo: SavedLessonVideo | null;
  setSavedVideo: (video: SavedLessonVideo | null) => void;
  // ── النوتة ──
  notebook: {
    open: boolean;
    pendingDraft: NotebookDraft | null;
    /** آخر إضافة اتأكدت — لزر الـ Undo (حتى إغلاق الـ panel). */
    lastAppended: NotebookDraft | null;
  };
  openNotebook: (draft?: NotebookDraft) => void;
  closeNotebook: () => void;
  queueNotebookDraft: (draft: NotebookDraft) => void;
  /** موافقة الـ Preview — بيرجّع الـ draft المعتمد عشان الـ Panel يبعت postMessage بيه. */
  approvePendingDraft: () => NotebookDraft | null;
  dismissPendingDraft: () => void;
  undoLastAppend: () => void;
  // ── مستوى الشرح ──
  explanationLevel: ExplanationLevel;
  setExplanationLevel: (level: ExplanationLevel) => void;
  // ── طريقة الشرح (P2): general / summary / detailed — مصدر واحد للمحرك ──
  explanationMode: ExplanationMode;
  setExplanationMode: (mode: ExplanationMode) => void;
  /** نص الشرح المخزّن الحالي (لأوضاع الثلاثة) — الـ Tutor بيبقى واعي بيه. */
  explanationSnapshot: string | null;
  setExplanationSnapshot: (text: string | null) => void;
  // ── التقدم والـ Resume ──
  progress: ResumeState;
  saveResume: () => void;
  // ── سياق الـ Tutor (يُقرأ لحظة الإرسال) ──
  tutorContext: () => TutorContextPayload;
};

const LessonStudioContext = createContext<LessonStudioContextValue | null>(null);

export function LessonStudioProvider({
  lesson,
  edu,
  children,
}: {
  lesson: LessonStudioLesson;
  /** سياق التعليم (stage/grade/track/faculty) — لبحث الفيديو lazy. */
  edu: { stage?: string; grade?: string; track?: string; faculty?: string };
  children: React.ReactNode;
}) {
  const { dayId } = lesson;

  // ── التنقل ──
  const [activeTab, setActiveTabState] = useState<StudioTab>("learn");
  const [navigatorOpen, setNavigatorOpen] = useState(false);

  // ── الأقسام + القسم الحالي ──
  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);

  // ── الفيديو: مقفول افتراضيًا — صفر نداء بحث عند تحميل الصفحة ──
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoActive, setVideoActive] = useState<VideoCandidate | null>(null);
  const [videoCandidates, setVideoCandidates] = useState<VideoCandidate[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [miniPlayerOn, setMiniPlayerOn] = useState(false);
  const [lastTimestamp, setLastTimestamp] = useState<number | null>(null);
  // «مش مناسب» — آيديهات مترشّحات متشالة من العرض في الجلسة الحالية بس.
  const [dismissedVideoIds, setDismissedVideoIds] = useState<Set<string>>(new Set());
  const videoFetchRef = useRef<{ started: boolean; cancelled: boolean }>({ started: false, cancelled: false });

  const dismissVideoCandidate = useCallback((id: string) => {
    setDismissedVideoIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // ── الفيديو المحفوظ (P3): «ولّد مرة وخزّن» — البحث بيتوفر لو الفيديو متخزّن ──
  const [savedVideo, setSavedVideo] = useState<SavedLessonVideo | null>(null);
  // Ref مزامن — ensureVideoLoaded بيقرا آخر قيمة بدون ما يتغير معرف الدالة.
  const savedVideoRef = useRef<SavedLessonVideo | null>(null);
  useEffect(() => {
    savedVideoRef.current = savedVideo;
  }, [savedVideo]);

  /** حفظ الفيديو المختار عند أول تشغيل — fire-and-forget (الفشل ما يكسرش التشغيل). */
  const persistVideo = useCallback(
    (candidate: VideoCandidate) => {
      const payload: SavedLessonVideo = {
        videoId: candidate.id,
        title: candidate.title || "فيديو الدرس",
        channel: candidate.channel ?? null,
        embedUrl: candidate.embedUrl,
        watchUrl: candidate.watchUrl,
        thumbnail: candidate.thumbnail ?? null,
        pickedAt: new Date().toISOString(),
      };
      setSavedVideo(payload);
      void fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, action: "set_video", video: payload }),
      }).catch(() => {
        /* الحفظ best-effort — التشغيل أهم */
      });
    },
    [dayId]
  );

  /** بحث الفيديو lazy — نفس payload الصفحة القديمة، بس أول طلب للفيديو بس.
   *  P3: لو فيه فيديو محفوظ للدرس — نعرضه فورًا من غير أي بحث (وفّر النداء). */
  const ensureVideoLoaded = useCallback(() => {
    if (videoFetchRef.current.started) return;
    videoFetchRef.current.started = true;
    // الفيديو المحفوظ موجود ⇒ skip البحث تمامًا (محفوظ من جلسة سابقة).
    if (savedVideoRef.current) {
      const saved: VideoCandidate = {
        id: savedVideoRef.current.videoId,
        title: savedVideoRef.current.title,
        channel: savedVideoRef.current.channel ?? undefined,
        reason: "محفوظ من جلسة سابقة",
        embedUrl: savedVideoRef.current.embedUrl,
        watchUrl: savedVideoRef.current.watchUrl,
        thumbnail: savedVideoRef.current.thumbnail ?? undefined,
        relevanceScore: 1,
      };
      setVideoCandidates([saved]);
      setVideoActive(saved);
      return;
    }
    setVideoLoading(true);
    const payload = {
      subject: lesson.subject || lesson.topic || "",
      lesson: lesson.topic || lesson.title || "",
      topic: lesson.topic || "",
      stage: edu.stage || "",
      grade: edu.grade || "",
      track: edu.track || "",
      faculty: edu.faculty || "",
      curriculum: lesson.category || "",
      unit: lesson.topic || "",
      country: "Egypt",
      language: "arabic",
    };
    fetch("/api/lesson/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((d) => {
        if (videoFetchRef.current.cancelled) return;
        if (d.ok && Array.isArray(d.candidates)) {
          setVideoCandidates(d.candidates);
          // لو الطالب فتح الفيديو قبل ما النتايج توصل — اختار الأفضل فورًا.
          setVideoActive((prev) => prev ?? (d.candidates[0] as VideoCandidate | undefined) ?? null);
        }
      })
      .catch(() => {
        // Video failure must not break page (rule 12 / 15)
      })
      .finally(() => {
        if (!videoFetchRef.current.cancelled) setVideoLoading(false);
      });
  }, [lesson.subject, lesson.topic, lesson.title, lesson.category, edu.stage, edu.grade, edu.track, edu.faculty]);

  useEffect(() => {
    const ref = videoFetchRef.current;
    return () => {
      ref.cancelled = true;
    };
  }, []);

  const openVideo = useCallback(
    (candidate?: VideoCandidate) => {
      ensureVideoLoaded();
      if (candidate) {
        setVideoActive(candidate);
        // P3: أول تشغيل بيتخزّن — الجلسات الجاية من غير بحث.
        persistVideo(candidate);
      }
      setVideoOpen(true);
      setLastTimestamp(null); // بدون enablejsapi — التوقيت عبر &t= فقط (قرار مقفول)
    },
    [ensureVideoLoaded, persistVideo]
  );

  const closeVideo = useCallback(() => {
    setVideoOpen(false);
    setMiniPlayerOn(false);
  }, []);

  // ── النوتة ──
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<NotebookDraft | null>(null);
  const [lastAppended, setLastAppended] = useState<NotebookDraft | null>(null);

  const openNotebook = useCallback((draft?: NotebookDraft) => {
    if (draft) setPendingDraft(draft);
    setNotebookOpen(true);
  }, []);

  const closeNotebook = useCallback(() => {
    setNotebookOpen(false);
    setPendingDraft(null);
    setLastAppended(null);
  }, []);

  const queueNotebookDraft = useCallback((draft: NotebookDraft) => {
    setPendingDraft(draft);
    setNotebookOpen(true);
  }, []);

  const dismissPendingDraft = useCallback(() => setPendingDraft(null), []);

  /** موافقة الـ Preview — الـ NotebookPanel هو اللي يبعت الـ postMessage للـ iframe. */
  const approvePendingDraft = useCallback((): NotebookDraft | null => {
    const approved = pendingDraft;
    if (approved) setLastAppended(approved);
    setPendingDraft(null);
    return approved;
  }, [pendingDraft]);

  const undoLastAppend = useCallback(() => setLastAppended(null), []);

  // آخر نوتة للدرس — localStorage `lesson-notes:<dayId>` (الربط الدائم P4).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`lesson-notes:${dayId}`);
      // مزامنة مع نظام خارجي (localStorage) — نفس نمط LessonProgressPanel المعتمد.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLastAppended(JSON.parse(raw) as NotebookDraft);
    } catch {
      /* تجاهل — localStorage مش متاح أو المحتوى تالف */
    }
  }, [dayId]);

  useEffect(() => {
    try {
      if (lastAppended) localStorage.setItem(`lesson-notes:${dayId}`, JSON.stringify(lastAppended));
      else localStorage.removeItem(`lesson-notes:${dayId}`);
    } catch {
      /* تجاهل */
    }
  }, [lastAppended, dayId]);

  // ── مستوى الشرح ──
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>("standard");

  // ── طريقة الشرح (P2): الوضع الافتراضي = شرح عام ──
  const [explanationMode, setExplanationMode] = useState<ExplanationMode>("general");
  const [explanationSnapshot, setExplanationSnapshot] = useState<string | null>(null);

  // ── Smart Resume — localStorage `lesson-resume:<dayId>` (عمود resume = P2) ──
  const [progress, setProgress] = useState<ResumeState>({ lastTab: null, lastSectionId: null, lastVideoId: null, updatedAt: null });
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      try {
        setProgress((prev) => ({
          lastTab: prev.lastTab ?? activeTab,
          lastSectionId: prev.lastSectionId,
          lastVideoId: prev.lastVideoId,
          updatedAt: new Date().toISOString(),
        }));
      } catch {
        /* تجاهل */
      }
    }, RESUME_DEBOUNCE_MS);
  }, [activeTab]);

  // أول تحميل: قراءة آخر موضع — من غير أي استعلام شبكة أو AI.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`lesson-resume:${dayId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ResumeState>;
        // مزامنة مع نظام خارجي (localStorage) — نفس نمط LessonProgressPanel المعتمد.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProgress({
          lastTab: (parsed.lastTab as StudioTab | null) ?? null,
          lastSectionId: parsed.lastSectionId ?? null,
          lastVideoId: parsed.lastVideoId ?? null,
          updatedAt: parsed.updatedAt ?? null,
        });
      }
    } catch {
      /* تجاهل */
    }
  }, [dayId]);

  // الكتابة: أي تغيير تاب/قسم/فيديو ⇒ حفظ debounced (3 ثواني) — صفر نداء شبكة.
  useEffect(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      try {
        const next: ResumeState = {
          lastTab: activeTab,
          lastSectionId: currentSectionId,
          lastVideoId: videoActive?.id ?? null,
          updatedAt: new Date().toISOString(),
        };
        setProgress(next);
        localStorage.setItem(`lesson-resume:${dayId}`, JSON.stringify(next));
      } catch {
        /* تجاهل */
      }
    }, RESUME_DEBOUNCE_MS);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [activeTab, currentSectionId, videoActive?.id, dayId]);

  /** تبديل التاب — مع منطق الـ Mini Player: ساب تاب الفيديو والفيديو شغّال ⇒ Mini Player. */
  const setActiveTab = useCallback(
    (tab: StudioTab) => {
      setActiveTabState((prev) => {
        if (prev === "video" && tab !== "video" && videoOpen) setMiniPlayerOn(true);
        if (tab === "video") setMiniPlayerOn(false);
        return tab;
      });
    },
    [videoOpen]
  );

  const toggleNavigator = useCallback(() => setNavigatorOpen((v) => !v), []);

  /** سياق الـ Tutor — دالة مش قيمة: بتتقري لحظة الإرسال (§2.4).
   *  P2: واعي بطريقة الشرح المختارة (عام/تلخيصي/تفصيلي) والشرح المخزّن —
   *  الطالب لما يسأل سؤال شرح، الرد بيكون على نفس الوضع وبناءً على الشرح المخزّن. */
  const tutorContext = useCallback((): TutorContextPayload => {
    const snapshotExcerpt = explanationSnapshot?.trim().slice(0, 1500) ?? "";
    const lines = [
      currentSectionId ? `القسم الحالي في الشرح: ${currentSectionId.replace(/^sec-\d+-/, "")}` : null,
      `مستوى الشرح المختار: ${explanationLevel}`,
      `طريقة الشرح المختارة: ${EXPLANATION_MODE_LABELS[explanationMode]} — لو الطالب طلب شرح، التزم بنفس الطريقة دي.`,
      snapshotExcerpt
        ? `مقتطف من الشرح المخزّن للدرس (ارجع له وخلي إجابتك متسقة معه):\n${snapshotExcerpt}`
        : null,
      videoOpen && videoActive ? `الفيديو المفتوح: ${videoActive.title}${lastTimestamp ? ` عند التوقيت ${lastTimestamp} ثانية` : ""}` : null,
    ].filter(Boolean);
    return {
      lesson: {
        title: lesson.topic || lesson.title,
        subject: lesson.subject,
        content: snapshotExcerpt || lesson.description,
        description: lesson.description,
      },
      extraContext: lines.join("\n"),
    };
  }, [currentSectionId, explanationLevel, explanationMode, explanationSnapshot, videoOpen, videoActive, lastTimestamp, lesson]);

  const value = useMemo<LessonStudioContextValue>(
    () => ({
      lesson,
      activeTab,
      setActiveTab,
      navigatorOpen,
      toggleNavigator,
      outline,
      setOutline,
      currentSectionId,
      setCurrentSectionId,
      video: {
        open: videoOpen,
        active: videoActive,
        // المرشّحات المرفوضة («مش مناسب») متشالة من العرض في الجلسة الحالية.
        candidates: videoCandidates.filter((c) => !dismissedVideoIds.has(c.id)),
        loading: videoLoading,
        miniPlayerOn,
        lastTimestamp,
      },
      openVideo,
      closeVideo,
      ensureVideoLoaded,
      dismissVideoCandidate,
      savedVideo,
      setSavedVideo,
      notebook: { open: notebookOpen, pendingDraft, lastAppended },
      openNotebook,
      closeNotebook,
      queueNotebookDraft,
      approvePendingDraft,
      dismissPendingDraft,
      undoLastAppend,
      explanationLevel,
      setExplanationLevel,
      explanationMode,
      setExplanationMode,
      explanationSnapshot,
      setExplanationSnapshot,
      progress,
      saveResume,
      tutorContext,
    }),
    [
      lesson, activeTab, setActiveTab, navigatorOpen, toggleNavigator, outline, currentSectionId,
      videoOpen, videoActive, videoCandidates, videoLoading, miniPlayerOn, lastTimestamp, dismissedVideoIds,
      openVideo, closeVideo, ensureVideoLoaded, dismissVideoCandidate, savedVideo, notebookOpen, pendingDraft, lastAppended,
      openNotebook, closeNotebook, queueNotebookDraft, approvePendingDraft, dismissPendingDraft,
      undoLastAppend, explanationLevel, explanationMode, explanationSnapshot, progress, saveResume, tutorContext,
    ]
  );

  return <LessonStudioContext.Provider value={value}>{children}</LessonStudioContext.Provider>;
}

// ── الـ hooks العامة (§2.3) ──

export function useLessonStudio(): LessonStudioContextValue {
  const ctx = useContext(LessonStudioContext);
  if (!ctx) throw new Error("useLessonStudio لازم يتستخدم جوه LessonStudioProvider");
  return ctx;
}

export function useStudioTab(tab: StudioTab) {
  const { activeTab, setActiveTab } = useLessonStudio();
  return {
    isActive: activeTab === tab,
    open: () => setActiveTab(tab),
    close: () => setActiveTab("learn"),
  };
}

export function useTutorContext() {
  const { tutorContext } = useLessonStudio();
  return tutorContext;
}

export function useNotebook() {
  const { notebook, openNotebook, closeNotebook, queueNotebookDraft, approvePendingDraft, dismissPendingDraft, undoLastAppend } = useLessonStudio();
  return { notebook, openNotebook, closeNotebook, queueNotebookDraft, approvePendingDraft, dismissPendingDraft, undoLastAppend };
}

export function useStudioVideo() {
  const { video, openVideo, closeVideo, ensureVideoLoaded, dismissVideoCandidate } = useLessonStudio();
  return { video, openVideo, closeVideo, ensureVideoLoaded, dismissVideoCandidate };
}

/** طريقة الشرح (P2): الوضع المختار + الشرح المخزّن — مصدر واحد لـ Learn والـ Tutor. */
export function useStudioExplanation() {
  const { explanationMode, setExplanationMode, explanationSnapshot, setExplanationSnapshot, explanationLevel, setExplanationLevel } = useLessonStudio();
  return { explanationMode, setExplanationMode, explanationSnapshot, setExplanationSnapshot, explanationLevel, setExplanationLevel };
}

export function useStudioResume() {
  const { progress, saveResume } = useLessonStudio();
  return { progress, saveResume };
}
