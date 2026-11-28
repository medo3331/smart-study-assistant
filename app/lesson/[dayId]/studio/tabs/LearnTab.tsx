"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- نقل محايد من page.tsx (نفس إعدادات التايبينج) */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ReadAloud } from "@/components/ReadAloud";
import { setSlidesSeed } from "@/app/dashboard/components/nav-config";
import { LessonModeTabs } from "../../components/LessonModeTabs";
import { SpecializationTools } from "@/components/lesson/SpecializationTools";
import type { SpecializationContext } from "@/lib/education/specialization";
import { LectureLinkModal, type LinkLectureOption, type LinkSuggestion } from "@/components/lesson/LectureLinkModal";
import { LessonCitedExplanationView } from "@/components/lesson/LessonCitations";
import type { LessonCitedExplanation, TimedSegment } from "@/lib/lesson/citations";
import { LectureCitationProvider, useLectureCitation } from "@/components/lectures/lecture-citation-context";
import { LectureAudioPlayer } from "@/components/lectures/LectureAudioPlayer";
import OpenNotesBeside from "@/components/notes/OpenNotesBeside";
import NotesSplitToggle from "@/components/notes/NotesSplitPanel";
import AddToNotebookMenu from "../tools/AddToNotebookMenu";
import { extractOutline, outlineSectionId } from "@/lib/lesson/outline";
import { useLessonStudio } from "../LessonStudioProvider";

/**
 * الشرح المربوط بالتسجيل — جوّه LectureCitationProvider: زر «استمع من هنا»
 * في أي مرجع بيشغّل التسجيل من اللحظة المرتبطة (لو مفيش صوت يبقى الزر مش بيظهر).
 */
function LinkedCitedView({
  cited,
  lectureId,
  summary,
}: {
  cited: LessonCitedExplanation;
  lectureId: string;
  summary: string | null;
}) {
  const { seekTo } = useLectureCitation();
  return <LessonCitedExplanationView cited={cited} lectureId={lectureId} summary={summary} onSeek={seekTo} />;
}

// ✅ عارض Markdown بسيط - بيحوّل **نص عريض** وقوائم النقاط (- / *) والعناوين (##)
// لعناصر HTML حقيقية بدل ما تظهر كرموز خام (** و * ظاهرة كنص) زي ما كان بيحصل قبل كده
// ✳️ P1-4: عنوان `##` بياخد نفس الـ id اللي `extractOutline` بيحسبه — عشان
// الـ Navigator يعمل scroll للقسم والـ IntersectionObserver يتتبعه.
function renderMarkdownLite(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let headingIndex = 0;

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key} className="list-disc pr-5 space-y-1 my-1">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const renderInline = (line: string): React.ReactNode => {
    // يحوّل **bold** لـ <strong>، وباقي النص زي ما هو
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          // المصطلح المهم بيتعلّم بالحبر التقيل مش بلون تاني — الأصفر محجوز للضربة الواحدة في الصفحة
          <strong key={i} className="font-bold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`list-${idx}`);
      elements.push(<div key={`sp-${idx}`} className="h-2" />);
      return;
    }
    if (line.startsWith("## ")) {
      flushList(`list-${idx}`);
      const heading = line.replace(/^##\s*/, "");
      elements.push(
        <h4 key={idx} id={outlineSectionId(heading, headingIndex++)} className="h3 text-[13px] mt-3 mb-1.5 scroll-mt-4">
          {renderInline(heading)}
        </h4>
      );
      return;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.replace(/^[-*]\s*/, ""));
      return;
    }
    flushList(`list-${idx}`);
    elements.push(
      <p key={idx} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });
  flushList("list-end");

  return <div className="space-y-1">{elements}</div>;
}

function SmartContentViewer({ topic, subject, edu, dayId }: { topic: string; subject: string; edu?: { stage?: string; grade?: string; track?: string; faculty?: string }; dayId: string }) {
  const router = useRouter();
  const studio = useLessonStudio();
  const [activeMode, setActiveMode] = useState<SmartViewMode>(null);
  const [loading, setLoading] = useState(false);
  // كاش الزيارة الحالية — الحفظ الدائم في `lesson_content` على السيرفر
  // (نفس الوضع بيتعاد عرضه فورًا من غير أي نداء).
  const [modeContent, setModeContent] = useState<Partial<Record<NonNullable<SmartViewMode>, string>>>({});
  const [contentError, setContentError] = useState<string | null>(null);
  // حماية من تشغيل مزدوج (StrictMode في dev) — التوليد لازم يحصل مرة واحدة.
  const bootRef = useRef(false);

  // 🔗 ربط المحاضرة بالدرس (الخطوة 3) — الحالة بتيجي من GET مباشرة.
  const [link, setLink] = useState<{ lectureId: string; lectureTitle: string } | null>(null);
  const [lectureOptions, setLectureOptions] = useState<LinkLectureOption[]>([]);
  const [otherLectures, setOtherLectures] = useState<LinkLectureOption[]>([]);
  const [suggestion, setSuggestion] = useState<LinkSuggestion | null>(null);
  // مشغّل التسجيل المرتبط — بنجيب مقاطعه لما الربط يتحدد (24ب).
  const [linkedAudio, setLinkedAudio] = useState<{ lectureId: string; hasAudio: boolean; segments: TimedSegment[] } | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // الشرح المبني على التفريغ (citations) — جاهز من الكاش أو بييتولّد.
  const [cited, setCited] = useState<LessonCitedExplanation | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  /** تطبيق حالة الربط من رد الراوت (GET أو فعل الربط/الفصل). */
  const applyLinkState = (data: any) => {
    setLink(data?.link ?? null);
    setLectureOptions(Array.isArray(data?.lectures) ? data.lectures : []);
    setOtherLectures(Array.isArray(data?.otherLectures) ? data.otherLectures : []);
    setSuggestion(data?.suggestion ?? null);
  };

  // مقاطع التسجيل المرتبط — best-effort: لو فشل الدرس يشتغل من غير مشغّل.
  useEffect(() => {
    const lectureId = link?.lectureId;
    if (!lectureId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/lectures/${lectureId}/segments`);
        const data = await res.json().catch(() => null);
        if (cancelled || !res.ok || !data?.ok) return;
        setLinkedAudio({
          lectureId,
          hasAudio: Boolean(data.hasAudio),
          segments: Array.isArray(data.segments) ? data.segments : [],
        });
      } catch {
        // الاستماع ميزة إضافية — مش بنعطل الدرس لو فشلت.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [link?.lectureId]);

  /** جلب وضع واحد — السيرفر بيرجعه من الكاش أو بيولّده ويحفظه في lesson_content. */
  const fetchContent = async (mode: NonNullable<SmartViewMode>) => {
    setActiveMode(mode);
    setContentError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, mode, edu }),
      });
      const data = await response.json().catch(() => null);
      const text = typeof data?.content === "string" && data.content.trim() ? data.content : null;
      if (!response.ok || !text) {
        throw new Error(data?.error?.message || "لم نتمكن من توليد المحتوى، حاول تاني.");
      }
      setModeContent((prev) => ({ ...prev, [mode]: text }));
    } catch (error) {
      setContentError(error instanceof Error ? error.message : "حصل خطأ أثناء توليد المحتوى، حاول تاني.");
    } finally {
      setLoading(false);
    }
  };

  /** توليد الشرح المبني على التفريغ + الملخص (لما الدرس يكون مربوط). */
  const generateCited = async (force = false) => {
    setContentError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, force }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message || "لم نتمكن من توليد الشرح، حاول تاني.");
      }
      if (data.linked && data.cited) {
        setCited(data.cited);
        setSummary(typeof data.summary === "string" ? data.summary : null);
      } else if (data.noTranscript) {
        setContentError("المحاضرة المرتبطة مالهاش تفريغ — افصلها أو فرّغها الأول.");
      } else {
        throw new Error("الرد جه بدون شرح مرتبط بالتفريغ. حاول تاني.");
      }
    } catch (error) {
      setContentError(error instanceof Error ? error.message : "حصل خطأ أثناء توليد الشرح، حاول تاني.");
    } finally {
      setLoading(false);
    }
  };

  /** ربط المحاضرة بالدرس — الراوت بيحفظ التفريغ وينفي أي محتوى قديم. */
  const handleLink = async (lectureId: string) => {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const response = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, action: "link", lectureId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message || "مقدرنش نربط المحاضرة، حاول تاني.");
      }
      applyLinkState(data);
      setCited(null);
      setSummary(null);
      setLinkModalOpen(false);
      // توليد فوري للشرح الجديد من التفريغ المرتبط.
      void generateCited();
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "حصل خطأ أثناء الربط.");
    } finally {
      setLinkBusy(false);
    }
  };

  /** فصل المحاضرة — الدرس يرجع لمسار الأوضاع الأربعة القديم. */
  const handleUnlink = async () => {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const response = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, action: "link", lectureId: null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message || "مقدرنش نفصل المحاضرة، حاول تاني.");
      }
      applyLinkState(data);
      setCited(null);
      setSummary(null);
      setLinkModalOpen(false);
      // نرجع لمسار الأوضاع — لو مفيش محتوى محلي نجيب «الشرح» الأساسي.
      if (modeContent.simple) {
        setActiveMode("simple");
        setContentError(null);
      } else {
        void fetchContent("simple");
      }
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "حصل خطأ أثناء الفصل.");
    } finally {
      setLinkBusy(false);
    }
  };

  const handleModeClick = (mode: NonNullable<SmartViewMode>) => {
    // اتحمّل قبل كده في نفس الزيارة → عرض فوري من الكاش المحلي.
    if (modeContent[mode]) {
      setActiveMode(mode);
      setContentError(null);
      return;
    }
    void fetchContent(mode);
  };

  const retryFetch = () => {
    void fetchContent(activeMode ?? "simple");
  };

  // أول فتح للدرس: نجيب حالة الربط + المحتوى المحفوظ (مرة واحدة)، وبعدها
  // نقرر: مربوط ⇒ الشرح المبني على التفريغ، غير مربوط ⇒ «الشرح» الأساسي.
  useEffect(() => {
    if (!dayId || bootRef.current) return;
    bootRef.current = true;
    void (async () => {
      try {
        const response = await fetch(`/api/lesson-content?dayId=${encodeURIComponent(dayId)}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) throw new Error("READ_FAILED");
        applyLinkState(data);
        const stored = data.content ?? {};
        if (data.link) {
          if (stored.cited) {
            setCited(stored.cited);
            setSummary(typeof stored.summary === "string" ? stored.summary : null);
          } else {
            void generateCited();
          }
        } else if (typeof stored.modes?.simple === "string") {
          setModeContent({ simple: stored.modes.simple });
          setActiveMode("simple");
        } else {
          void fetchContent("simple");
        }
      } catch {
        // فشل قراءة الحالة — نرجع لسلوك المحتوى العادي (كاش محلي/توليد).
        void fetchContent("simple");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- كل الدوال بتتغير هوية كل رندر؛ التشغيل المقصود مرة واحدة عند فتح الدرس.
  }, [dayId]);

  const content = activeMode ? (modeContent[activeMode] ?? null) : null;

  // 🗺️ P1-4 — تغذية الـ Navigator: الأقسام من الشرح المخزّن (cited أو markdown).
  useEffect(() => {
    studio.setOutline(extractOutline({ cited, modes: modeContent }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- بنحدّث الـ outline لما المحتوى نفسه يتغير بس.
  }, [cited, modeContent]);

  // 🧭 تتبّع القسم الحالي — أعلى heading ظاهر في الشرح (للـ Navigator والـ Resume).
  const sectionTrackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = sectionTrackRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>("h4[id^='sec-']"));
    if (headings.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
          else visible.delete(entry.target.id);
        }
        if (visible.size > 0) {
          const top = Array.from(visible.entries()).sort((a, b) => b[1] - a[1])[0][0];
          studio.setCurrentSectionId(top);
        }
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: [0, 0.25, 0.5] }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- إعادة الربط لما المحتوى يتغير بس.
  }, [content, cited]);

  // 🎚️ مستوى الشرح — P1: mapping صادق من الأوضاع الأربعة الموجودة (P2 يضيف الباقي).
  useEffect(() => {
    const level = activeMode === "simple" ? "simplified" : activeMode === "practical" ? "practical" : "standard";
    studio.setExplanationLevel(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- التزامن مع الوضع النشط فقط.
  }, [activeMode]);

  // أربع طرق لشرح نفس الحاجة — مش تسلسل، فمفيش أرقام ولا أيقونات، الاسم لوحده كفاية
  const tabs: { id: NonNullable<SmartViewMode>; label: string }[] = [
    { id: "simple", label: "شرح" },
    { id: "practical", label: "عملي" },
    { id: "visual", label: "مرئي" },
    { id: "academic", label: "أكاديمي" },
  ];

  const panelVisible = link
    ? Boolean(cited || contentError || loading)
    : Boolean(activeMode);

  return (
    <div dir="rtl">
      <div className="flex justify-end mb-1 gap-1.5">
        <NotesSplitToggle
          className="btn btn-quiet text-xs px-2.5 py-1.5"
          label="🖥️ نوت جانبية — تقسيم الشاشة"
        />
        <OpenNotesBeside
          className="btn btn-quiet text-xs px-2.5 py-1.5"
          label="📝 نوت في نافذة"
        />
      </div>
      {link ? (
        /* 🔗 الدرس مربوط بمحاضرة — بديل التابات: مصدر واحد + إجراءاته */
        <div className="flex flex-wrap items-center gap-2 bg-paper border border-rule p-2 rounded-[var(--r-sm)]">
          <span className="tag tag-quiet inline-flex items-center gap-1.5 min-w-0">
            <span aria-hidden>🎙️</span>
            <span className="truncate max-w-[14rem]">مبني على: {link.lectureTitle}</span>
          </span>
          <div className="flex items-center gap-1.5 ms-auto">
            <button
              onClick={() => setLinkModalOpen(true)}
              disabled={loading || linkBusy}
              className="btn btn-quiet text-xs px-2.5 py-1.5"
            >
              غيّر المحاضرة
            </button>
            <button
              onClick={() => void generateCited(true)}
              disabled={loading || linkBusy}
              className="btn btn-quiet text-xs px-2.5 py-1.5"
            >
              أعد التوليد
            </button>
            <button
              onClick={() => void handleUnlink()}
              disabled={loading || linkBusy}
              className="btn btn-quiet text-xs px-2.5 py-1.5"
            >
              افصل
            </button>
          </div>
        </div>
      ) : (
        /* التاب المفتوح بيتعلّم بالحبر: bg-ink — الأصفر مش لون "المختار" */
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-paper border border-rule p-1 rounded-[var(--r-sm)] flex-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleModeClick(tab.id)}
                aria-pressed={activeMode === tab.id}
                className={`mono flex-1 px-2 py-2 rounded-[6px] transition ${
                  activeMode === tab.id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink hover:bg-paper-3"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setLinkModalOpen(true)}
            disabled={loading}
            className="btn btn-quiet text-xs px-3 py-2 shrink-0"
            title="اربط المحاضرة بالدرس"
          >
            🔗 اربط بمحاضرة
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {panelVisible && (
          <motion.div
            key={link ? "cited" : activeMode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-3 bg-paper border border-rule p-4 rounded-[var(--r-sm)]"
          >
            {loading ? (
              <div className="py-8 text-center flex flex-col items-center gap-2.5">
                <span className="w-4 h-4 border-2 border-rule border-t-redpen rounded-full animate-spin" />
                <p className="tag justify-center">{link ? "بيجهّز الشرح من التفريغ" : "بيجهّز الشرح"}</p>
              </div>
            ) : link ? (
              cited ? (
                linkedAudio?.lectureId === link.lectureId && linkedAudio.hasAudio ? (
                  <LectureCitationProvider>
                    <div className="space-y-3">
                      <LectureAudioPlayer
                        lectureId={link.lectureId}
                        durationSeconds={null}
                        segments={linkedAudio.segments}
                      />
                      <LinkedCitedView cited={cited} lectureId={link.lectureId} summary={summary} />
                    </div>
                  </LectureCitationProvider>
                ) : (
                  <LessonCitedExplanationView cited={cited} lectureId={link.lectureId} summary={summary} />
                )
              ) : contentError ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-[12.5px] text-ink-soft">{contentError}</p>
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => void generateCited()} className="btn btn-quiet text-xs px-3.5 py-2">
                      جرّب تاني
                    </button>
                    <button onClick={() => setLinkModalOpen(true)} className="btn btn-quiet text-xs px-3.5 py-2">
                      غيّر المحاضرة
                    </button>
                  </div>
                </div>
              ) : null
            ) : contentError && !content ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-[12.5px] text-ink-soft">{contentError}</p>
                <button onClick={retryFetch} className="btn btn-quiet text-xs px-3.5 py-2">
                  جرّب تاني
                </button>
              </div>
            ) : (
              <>
                <div ref={sectionTrackRef} className="text-[12.5px] text-ink-soft leading-relaxed">{content && renderMarkdownLite(content)}</div>
                {/* القراءة بصوت عالي: مفيدة وإنت بتكتب كود وعينك على الإيديتور.
                    resetKey = التاب، فلو بدّلت النمط القراءة القديمة تقف. */}
                {content && (
                  <div className="mt-4 pt-3.5 border-t border-rule space-y-2.5">
                    <ReadAloud text={content} resetKey={activeMode ?? ""} />
                    {/* الشرح ده يبقى عرض شرائح — الشرح نفسه بيتبعت كمصدر
                        عشان الشرائح تطلع من كلام الدرس مش من معرفة عامة. */}
                    <button
                      onClick={() => {
                        setSlidesSeed(`${topic}${subject ? ` — ${subject}` : ""}`, content);
                        router.push("/dashboard/slides");
                      }}
                      className="btn btn-quiet text-xs px-3.5 py-2"
                    >
                      <span aria-hidden>🖥️</span>
                      اعمل عرض من الشرح ده
                    </button>
                  </div>
                )}
                {/* 📝 أضف للنوتة (P1-6) — المعاينة قبل الإضافة جوه NotebookPanel */}
                <div className="mt-3">
                  <AddToNotebookMenu
                    buildDraft={() => {
                      const text = content ?? summary ?? "";
                      if (!text.trim()) return null;
                      return {
                        title: topic,
                        body: text,
                        source: "الشرح",
                      };
                    }}
                  />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <LectureLinkModal
        open={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false);
          setLinkError(null);
        }}
        subjectName={subject}
        lectures={lectureOptions}
        otherLectures={otherLectures}
        suggestion={suggestion}
        currentLectureId={link?.lectureId ?? null}
        onLink={(lectureId) => void handleLink(lectureId)}
        onUnlink={() => void handleUnlink()}
        busy={linkBusy}
        error={linkError}
      />
    </div>
  );
}

// --- Types المنقولة من page.tsx (تستخدمها المكوّنات هنا) ---
export type LearningStyle = "practical" | "visual" | "academic";
type SmartViewMode = "simple" | "academic" | "visual" | "practical" | null;

interface ResourceLink {
  title: string;
  url: string;
}

/** 📚 روابط مقترحة تلقائيًا حسب النمط (خارجية، للقراءة فقط) — من page.tsx كما هي. */
function getSuggestedResources(topic: string, subject: string, style: LearningStyle) {
  const query = encodeURIComponent(`${topic} ${subject}`);
  if (style === "visual") {
    return [
      { title: "خرائط ذهنية", icon: "🖼️", url: `https://www.google.com/search?tbm=isch&q=${query}+diagram` },
    ];
  } else if (style === "academic") {
    return [
      { title: "ملخصات PDF", icon: "📄", url: `https://www.google.com/search?q=${query}+filetype:pdf` },
      { title: "مراجع علمية", icon: "🏛️", url: `https://scholar.google.com/scholar?q=${query}` },
    ];
  }
  return [
    { title: "تمارين وتطبيقات", icon: "🖥️", url: `https://www.google.com/search?q=${query}+practical+exercises` },
  ];
}

/**
 * P1-2 — تاب Learn: الشرح (SmartContentViewer المنقول) + أدوات التخصص
 * + الموارد (resource_links + المقترحة + إضافة/حذف) — نفس ترتيب الصفحة القديمة.
 */
export default function LearnTab({
  dayId,
  topic,
  subject,
  edu,
  learningStyle,
  onLearningStyleChange,
  resourceLinks,
  onResourceLinksChange,
  specToolsCtx,
}: {
  dayId: string;
  topic: string;
  subject: string;
  edu: { stage?: string; grade?: string; track?: string; faculty?: string };
  learningStyle: LearningStyle;
  onLearningStyleChange: (style: LearningStyle) => void;
  resourceLinks: ResourceLink[];
  onResourceLinksChange: (links: ResourceLink[]) => void;
  specToolsCtx: SpecializationContext;
}) {
  const [supabase] = useState(() => createClient());
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [showAddResourceForm, setShowAddResourceForm] = useState(false);

  // 🗃️ إضافة رابط جديد للمستودع — نفس منطق page.tsx
  const handleAddLink = async () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;
    setSavingLink(true);
    let cleanUrl = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;

    const updatedLinks = [...resourceLinks, { title: newLinkTitle.trim(), url: cleanUrl }];
    const { error } = await supabase.from("study_days").update({ resource_links: updatedLinks }).eq("id", dayId);
    if (!error) {
      onResourceLinksChange(updatedLinks);
      setNewLinkTitle("");
      setNewLinkUrl("");
      setShowAddResourceForm(false);
    }
    setSavingLink(false);
  };

  // 🗃️ حذف رابط من المستودع
  const handleRemoveLink = async (index: number) => {
    const updatedLinks = resourceLinks.filter((_, i) => i !== index);
    onResourceLinksChange(updatedLinks);
    await supabase.from("study_days").update({ resource_links: updatedLinks }).eq("id", dayId);
  };

  const suggestedResources = getSuggestedResources(topic, subject, learningStyle);

  return (
    <div className="space-y-5">
      {/* Wave 1 — Lesson Specialization Tools Extension Slot */}
      <SpecializationTools ctx={specToolsCtx} />

      {/* ─── التبويبات الموحّدة: نفس learning_style الموجود ─── */}
      <div className="flex justify-center sm:justify-start">
        <LessonModeTabs
          modes={[
            { id: "academic", label: "أكاديمي" },
            { id: "visual", label: "بصري" },
            { id: "practical", label: "تطبيقي" },
          ]}
          active={learningStyle}
          onChange={(id) => onLearningStyleChange(id as LearningStyle)}
        />
      </div>

      {/* العارض الذكي */}
      <div className="sheet-card p-5 sm:p-6 space-y-4">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">الشرح</p>
          <h2 className="h3">اقرا الدرس بالطريقة اللي تعجبك</h2>
        </div>
        <SmartContentViewer topic={topic} subject={subject} edu={edu} dayId={dayId} />
      </div>

      {/* الموارد: ليستة روابط في ورقة، مش كروت أيقونات */}
      <div className="sheet-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow eyebrow-flush mb-1.5">مراجع</p>
            <h2 className="h3">موارد الدرس</h2>
          </div>
          <button
            onClick={() => setShowAddResourceForm((v) => !v)}
            aria-expanded={showAddResourceForm}
            className="btn btn-quiet text-xs px-3.5 py-2 shrink-0"
          >
            {showAddResourceForm ? "إلغاء" : "أضف رابط"}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {suggestedResources.map((res, i) => (
            <a
              key={`suggested-${i}`}
              href={res.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-paper border border-rule hover:border-rule-strong rounded-[var(--r-sm)] px-3.5 py-3 flex flex-col gap-1 transition"
            >
              <span className="tag">مقترح</span>
              <span className="text-[11.5px] font-bold text-ink truncate">{res.title}</span>
            </a>
          ))}

          {resourceLinks.map((link, i) => (
            <div
              key={`user-${i}`}
              className="relative bg-paper border border-rule hover:border-rule-strong rounded-[var(--r-sm)] px-3.5 py-3 transition"
            >
              <button
                onClick={() => void handleRemoveLink(i)}
                aria-label={`شيل ${link.title}`}
                className="mono absolute top-2 left-2 text-ink-soft hover:text-redpen w-5 h-5 flex items-center justify-center rounded-[6px] hover:bg-paper-3 transition"
              >
                ✕
              </button>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1">
                <span className="tag">بتاعك</span>
                <span className="text-[11.5px] font-bold text-ink truncate pe-6">{link.title}</span>
              </a>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {showAddResourceForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="text"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="اسم الرابط (مثال: GitHub Repo)"
                  className="field flex-1 py-2.5 text-xs"
                />
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="الرابط"
                  className="field flex-1 py-2.5 text-xs"
                />
                <button
                  onClick={() => void handleAddLink()}
                  disabled={savingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                  className="btn btn-marker text-xs px-4 py-2.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingLink ? "بيضيف" : "إضافة"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export type { ResourceLink };
