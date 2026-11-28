"use client";

/* ======================================================================
   🏛️ Magicly Learning Workspace — مساحة الدرس الموحدة (المرحلة 24أ)

   تاب علوية: أساسية (الشرح · Magic · المصادر) + مساعدة (Notebook · الاختبارات).
   - المشغّل مخفي افتراضيًا مع زر «مشاهدة المحاضرة»، ويتذكّر آخر اختيار (localStorage).
   - عند الإخفاء: لوحة مخفية بصريًا فقط (بدون unmount) — التشغيل وموضعه يفضلوا محفوظين.
   - تحميل الأقسام الثقيلة عند الحاجة: محتوى التاب غير النشط مش بيتصيّر أصلًا.
   ====================================================================== */

import { Fragment, useCallback, useEffect, useState } from "react";
/* eslint-disable react-hooks/set-state-in-effect -- قراءة تفضيل الطالب من localStorage بعد الماونت مزامنة مقصودة مع نظام خارجي (التخزين المحلي) */
import { Headphones, MessageCircle, NotebookPen } from "lucide-react";
import { LectureAudioPlayer } from "@/components/lectures/LectureAudioPlayer";
import { LectureNote } from "@/components/lectures/LectureNote";
import { LectureProcessActions } from "@/components/lectures/LectureProcessActions";
import {
  LectureSection,
  LectureToolbar,
  LectureWorkspace,
  useWorkspace,
} from "@/components/lectures/LectureWorkspace";
import LectureChat from "@/components/lectures/LectureChat";
import { LectureTranscriptEditor } from "@/components/lectures/LectureTranscriptEditor";
import { LectureTranscriptViewer } from "@/components/lectures/LectureTranscriptViewer";
import { LectureIntensive } from "@/components/lectures/LectureIntensive";
import { FlashcardsPanel } from "@/components/lectures/FlashcardsPanel";
import { McqQuiz } from "@/components/lectures/McqQuiz";
import { LectureCitationProvider } from "@/components/lectures/lecture-citation-context";
import NotesSplitToggle from "@/components/notes/NotesSplitPanel";
import { DataNotice } from "@/app/dashboard/components/PageShell";
import type { IntensiveExplanation } from "@/lib/ai/lecture-intensive";
import type { TimedSegment } from "@/lib/ai/lecture-intensive-prompts";
import type { Flashcard, Mcq } from "@/lib/ai/lecture-study";

type LessonTab = "explain" | "magic" | "sources" | "notebook" | "quiz";

const TABS: { id: LessonTab; label: string; emoji: string; primary: boolean }[] = [
  { id: "explain", label: "الشرح", emoji: "🧠", primary: true },
  { id: "magic", label: "Magic", emoji: "✨", primary: true },
  { id: "sources", label: "المصادر", emoji: "📜", primary: true },
  { id: "notebook", label: "Notebook", emoji: "🗒️", primary: false },
  { id: "quiz", label: "الاختبارات", emoji: "❓", primary: false },
];

const MEDIA_PREF_KEY = "magicly:lesson:media-open";

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export interface LessonWorkspaceProps {
  lectureId: string;
  status: string;
  durationSeconds: number | null;
  hasAudio: boolean;
  summary: string | null;
  explanation: string | null;
  hasIntensive: boolean;
  intensive: IntensiveExplanation;
  flashcards: Flashcard[] | null;
  mcqs: Mcq[] | null;
  segments: TimedSegment[];
  transcriptText: string | null;
  reviewedText: string | null;
  reviewStatus: string | null;
}

export function LessonWorkspace(props: LessonWorkspaceProps) {
  const { summary, intensive } = props;
  const defaultOpen: Array<"summary" | "explanation" | "intensive" | "flashcards"> = [];
  if (summary?.trim()) defaultOpen.push("summary");
  else if (intensive.parts.length > 0) defaultOpen.push("intensive");

  return (
    <LectureCitationProvider>
      <LectureWorkspace defaultOpen={defaultOpen}>
        <LessonShell {...props} />
      </LectureWorkspace>
    </LectureCitationProvider>
  );
}

function LessonShell({
  lectureId,
  status,
  durationSeconds,
  hasAudio,
  summary,
  explanation,
  hasIntensive,
  intensive,
  flashcards,
  mcqs,
  segments,
  transcriptText,
  reviewedText,
  reviewStatus,
}: LessonWorkspaceProps) {
  const { open } = useWorkspace();
  const [tab, setTab] = useState<LessonTab>("explain");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaMounted, setMediaMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasAudio && localStorage.getItem(MEDIA_PREF_KEY) === "1") {
      setMediaMounted(true);
      setMediaOpen(true);
    }
  }, [hasAudio]);

  const toggleMedia = useCallback(() => {
    setMediaOpen((prev) => {
      const next = !prev;
      if (next) setMediaMounted(true);
      try {
        localStorage.setItem(MEDIA_PREF_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const goToTab = useCallback(
    (next: LessonTab) => {
      setTab(next);
      if (next === "sources") open("transcript");
    },
    [open],
  );

  const jumpToSources = useCallback(() => setTab("sources"), []);

  const contextText =
    reviewStatus === "completed" && reviewedText ? reviewedText : (transcriptText ?? "");
  const hasQuiz = Boolean((flashcards && flashcards.length > 0) || (mcqs && mcqs.length > 0));

  return (
    <div>
      <SourcesTabBridge onOpenSources={jumpToSources} />

      {/* زر المشاهدة — الفيديو/التسجيل مخفي افتراضيًا */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {hasAudio ? (
          <button
            type="button"
            onClick={toggleMedia}
            aria-expanded={mediaOpen}
            className="btn btn-quiet inline-flex items-center gap-2 px-3 py-2 text-xs"
          >
            <Headphones size={15} aria-hidden />
            {mediaOpen
              ? "إخفاء المشغّل"
              : `🎧 مشاهدة المحاضرة${durationSeconds ? ` (${formatDuration(durationSeconds)})` : ""}`}
          </button>
        ) : (
          <span className="text-xs text-ink-soft">
            المحاضرة دي مالهاش تسجيل صوتي — الشرح والمصادر كفاية.
          </span>
        )}
      </div>

      <div className={mediaOpen ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}>
        <div className={`min-w-0 space-y-4 ${mediaOpen ? "order-2 lg:order-1" : ""}`}>
          {/* التاب العلوية — أساسية ثم مساعدة */}
          <nav aria-label="أقسام الدرس">
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-1.5">
              {TABS.map((t, i) => (
                <Fragment key={t.id}>
                  {i === 3 && (
                    <span
                      aria-hidden
                      className="my-1 w-px shrink-0 bg-[var(--rule)]"
                    />
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => goToTab(t.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                      tab === t.id
                        ? "bg-[var(--accent)] text-white"
                        : t.primary
                          ? "text-ink hover:bg-black/5 dark:hover:bg-white/10"
                          : "text-ink-soft hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
                    }`}
                  >
                    <span aria-hidden>{t.emoji}</span>
                    {t.label}
                  </button>
                </Fragment>
              ))}
            </div>
          </nav>

          {/* 🧠 الشرح */}
          {tab === "explain" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <LectureProcessActions
                  lectureId={lectureId}
                  hasSummary={Boolean(summary?.trim())}
                  hasExplanation={Boolean(explanation?.trim())}
                  hasIntensive={hasIntensive}
                  hasTimings={segments.length > 0}
                />
              </div>

              {status === "processing" && (
                <DataNotice message="المحاضرة لسه بتتفريغ — الشرح هيظهر أول ما تجهز." />
              )}
              {status === "failed" && (
                <DataNotice message="تفريغ المحاضرة فشل — جرّب ترفعها تاني." />
              )}

              {summary && (
                <LectureSection
                  id="summary"
                  icon="📝"
                  title="ملخص المحاضرة"
                  lede="مراجعة سريعة لأهم ما ورد في المحاضرة."
                >
                  <LectureNote kind="summary" content={summary} />
                </LectureSection>
              )}

              {explanation && (
                <LectureSection
                  id="explanation"
                  icon="🧠"
                  title="شرح المحاضرة"
                  lede="شرح مبسّط ومنظّم يسهّل الفهم."
                  toolbar={<LectureToolbar lectureId={lectureId} />}
                >
                  <LectureNote kind="explanation" content={explanation} />
                </LectureSection>
              )}

              {intensive.parts.length > 0 && (
                <LectureSection
                  id="intensive"
                  icon="🎯"
                  title="شرح مكثف مع المصادر"
                  lede="شرح مفصّل، وكل معلومة لها توقيتها في المحاضرة."
                >
                  <LectureIntensive
                    lectureId={lectureId}
                    explanation={intensive}
                    sessionId={`lecture-${lectureId}`}
                    segments={segments}
                  />
                </LectureSection>
              )}

              {status === "completed" && !summary && !explanation && intensive.parts.length === 0 && (
                <DataNotice message="مفيش شرح متولّد لسه — ابدأ من أزرار التوليد فوق، أو اسأل Magic من تبويبه." />
              )}
            </div>
          )}

          {/* ✨ Magic — الشات مربوط بنص الدرس */}
          {tab === "magic" && (
            <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-4 shadow-sm">
              {contextText ? (
                <LectureChat lectureId={lectureId} contextText={contextText} />
              ) : (
                <DataNotice message="مفيش نص محفوظ للدرس ده بعد — ولّد التفريغ الأول من تبويب الشرح." />
              )}
            </div>
          )}

          {/* 📜 المصادر */}
          {tab === "sources" && (
            <div className="space-y-3">
              <LectureSection
                id="transcript"
                icon="📜"
                title="التفريغ النصي"
                lede="نص كلام الدكتور كامل — دوس على أي جملة يتشغّل الصوت من دقيقتها."
              >
                <LectureTranscriptViewer segments={segments} reviewedText={reviewedText} />
                {transcriptText && (
                  <div className="mt-3">
                    <LectureTranscriptEditor lectureId={lectureId} initialText={transcriptText} />
                  </div>
                )}
              </LectureSection>
            </div>
          )}

          {/* 🗒️ Notebook */}
          {tab === "notebook" && (
            <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-ink">🗒️ النوتة</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                افتح النوت الجانبية وذاكر جنب الشرح — ملاحظاتك بتتحفظ لوحدها.
              </p>
              <div className="mt-3">
                <NotesSplitToggle className="btn btn-quiet px-3 py-2 text-xs" />
              </div>
            </div>
          )}

          {/* ❓ الاختبارات */}
          {tab === "quiz" && (
            <div className="space-y-3">
              {flashcards && flashcards.length > 0 && (
                <LectureSection
                  id="flashcards"
                  icon="🎴"
                  title="بطاقات المذاكرة"
                  lede="اقلب البطاقة عشان تشوف الإجابة."
                >
                  <FlashcardsPanel cards={flashcards} />
                </LectureSection>
              )}
              {mcqs && mcqs.length > 0 && (
                <LectureSection
                  id="mcq"
                  icon="❓"
                  title="اختبار الدرس"
                  lede="جاوب على الأسئلة وشوف شرح كل إجابة."
                >
                  <McqQuiz mcqs={mcqs} />
                </LectureSection>
              )}
              {!hasQuiz && (
                <DataNotice message="مفيش بطاقات أو أسئلة لسه — ولّدها من أزرار التوليد في تبويب الشرح." />
              )}
            </div>
          )}
        </div>

        {/* 🎧 لوحة المشغّل — بعد أول فتح بتفضل mounted حتى مع الإخفاء (بدون unmount) */}
        {mediaMounted && hasAudio && (
          <aside
            className={`${mediaOpen ? "order-1 lg:order-2 lg:sticky lg:top-20" : "hidden"}`}
            aria-hidden={!mediaOpen}
          >
            <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-4 shadow-sm">
              <LectureAudioPlayer
                lectureId={lectureId}
                durationSeconds={durationSeconds}
                segments={segments}
              />
            </div>
          </aside>
        )}
      </div>

      {/* 📱 شريط الإجراءات السفلي — الموبايل فقط */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rule)] bg-[var(--card-primary)]/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-1 px-2 py-2">
          <button
            type="button"
            onClick={() => goToTab("magic")}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-bold text-ink transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <MessageCircle size={17} aria-hidden />
            اسأل Magic
          </button>
          <button
            type="button"
            onClick={() => goToTab("notebook")}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-bold text-ink transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <NotebookPen size={17} aria-hidden />
            ملاحظة
          </button>
          {hasAudio && (
            <button
              type="button"
              onClick={toggleMedia}
              aria-expanded={mediaOpen}
              className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-bold text-ink transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Headphones size={17} aria-hidden />
              {mediaOpen ? "إخفاء" : "التسجيل"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 🔁 جسر المصادر — لما مرجع في الشرح المكثف يفتح قسم التفريغ (open("transcript"))،
 * بننتقل تلقائيًا لتاب «المصادر» عشان الطالب يشوف البروز فعلًا.
 */
function SourcesTabBridge({ onOpenSources }: { onOpenSources: () => void }) {
  const { isOpen } = useWorkspace();
  const transcriptOpen = isOpen("transcript");

  useEffect(() => {
    if (transcriptOpen) onOpenSources();
  }, [transcriptOpen, onOpenSources]);

  return null;
}
