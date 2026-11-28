"use client";

import { useEffect, useState } from "react";
import LessonVideoPlayer from "@/components/lesson/LessonVideoPlayer";
import { useLessonStudio } from "../LessonStudioProvider";
import VideoRecommendations from "./VideoRecommendations";

/* ==========================================================================
   VideoCenter (§4.2) — يستضيف LessonVideoPlayer الموجود + طبقة التوصيات.
   P2 (مطلب 3):
   - 🔍 بحث يدوي: الطالب يكتب اسم الفيديو/كلمات البحث بنفسه — الاستعلام
     بيتبعت كما هو لـ /api/lesson/video (field `query` — نفس الراوت).
   - 🎯 اقتراحات AI واعية: الـ candidates بتيجي مفلترة من بوابة الصلة على
     السيرفر (موضوع الدرس + المادة بعد التطبيع العربي) — مفيش ترشيح ملوش علاقة.
   - كل ترشيح عليه «ليه اتيرشح» (reason) + زر «مش مناسب» بيشيله في الجلسة.
   البحث lazy: بيتندّى أول ما المركز يتفتح (تاب الفيديو) — مش تحميل الصفحة.
   الفيديو نفسه iframe واحد ظاهر في المرة: بيترندر بس لما تاب الفيديو
   هو النشط — لو الطالب بانى التاب، الـ Mini Player بياخد مكانه.
   ========================================================================== */

export default function VideoCenter({
  subject,
  lesson,
  learningStyle,
}: {
  subject: string;
  lesson: string;
  learningStyle: string;
}) {
  const { video, openVideo, ensureVideoLoaded, dismissVideoCandidate, activeTab, outline, setActiveTab, setCurrentSectionId } = useLessonStudio();

  /** ⏱️ من الفيديو للشرح (P3): قفز للقسم المرتبط في تاب الشرح. */
  const jumpToSection = (sectionId: string) => {
    setCurrentSectionId(sectionId);
    setActiveTab("learn");
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  };

  // أول فتح لتاب الفيديو ⇒ ابدأ البحث (مرة واحدة — guard جوه الـ provider).
  useEffect(() => {
    if (activeTab === "video") ensureVideoLoaded();
  }, [activeTab, ensureVideoLoaded]);

  // 🔍 البحث اليدوي — حالة محلية (جلسة)، الاستعلام بيروح لنفس الراوت.
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manualResults, setManualResults] = useState<
    { id: string; title: string; channel?: string; duration?: string; reason: string; embedUrl: string; watchUrl: string; thumbnail?: string; relevanceScore: number }[]
  >([]);

  const handleManualSearch = async () => {
    const query = searchInput.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/lesson/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, lesson, topic: lesson, query, language: "arabic" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error("البحث فشل — جرّب تاني.");
      }
      setManualResults(Array.isArray(data.candidates) ? data.candidates : []);
      if (!data.candidates?.length) setSearchError("مفيش نتايج للبحث ده — جرّب كلمات تانية.");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "البحث فشل — جرّب تاني.");
    } finally {
      setSearching(false);
    }
  };

  const isTabActive = activeTab === "video";

  return (
    <div className="space-y-5" dir="rtl">
      <div className="sheet-card p-5 sm:p-6 space-y-4">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">مركز الفيديو</p>
          <h2 className="h3">فيديوهات مقترحة لشرح الدرس</h2>
          <p className="mt-1 text-[11.5px] text-ink-soft leading-relaxed">
            الترشيحات مبنية على موضوع الدرس ومادة «{subject}» — ومفلترة عشان مفيش فيديو ملوش علاقة. تقدر كمان تدوّر بنفسك.
          </p>
        </div>

        {/* ─── 🔍 بحث يدوي — كلمات الطالب بتتبعت كما هي ─── */}
        <div className="rounded-xl border border-rule bg-paper-2 p-3 space-y-2">
          <label htmlFor="video-manual-search" className="text-[11.5px] font-bold text-ink block">
            دوّر بنفسك — اكتب اسم الفيديو أو كلمات البحث
          </label>
          <div className="flex gap-2">
            <input
              id="video-manual-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleManualSearch();
                }
              }}
              placeholder="مثال: شرح تكامل بالأجزاء ثانوية عامة"
              className="field flex-1 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleManualSearch()}
              disabled={searching || !searchInput.trim()}
              className="btn btn-marker text-xs px-4 py-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? "بيبحث" : "🔍 بحث"}
            </button>
          </div>
          {searchError && <p className="text-[11px] text-ink-soft">{searchError}</p>}
          {manualResults.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-bold text-ink-soft">نتايج بحثك ({manualResults.length})</p>
              {manualResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openVideo(c)}
                  aria-pressed={video.active?.id === c.id}
                  className={`w-full text-right rounded-xl border p-2.5 transition ${
                    video.active?.id === c.id
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                      : "border-[var(--border)] bg-[var(--card-primary)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="block text-[11.5px] font-bold text-ink line-clamp-2 leading-snug">{c.title || "فيديو"}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-soft">
                    {c.duration && <span className="ltr-num tnum">⏱ {c.duration}</span>}
                    {c.channel && <span className="truncate max-w-[10rem]">{c.channel}</span>}
                    <span className="truncate">{c.reason}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── 🎯 ترشيحات الـ AI — مفلترة بالبوابة، وكل واحدة «ليه اتيرشح» ─── */}
        <VideoRecommendations
          candidates={video.candidates}
          activeId={video.active?.id ?? null}
          onSelect={(c) => openVideo(c)}
          onDismiss={(id) => dismissVideoCandidate(id)}
        />

        {/* ─── ⏱️ من الفيديو للشرح (P3): أقسام الدرس — قفز للقسم في تاب الشرح ─── */}
        {outline.length > 0 && (
          <div className="rounded-xl border border-rule bg-paper-2 p-3 space-y-2">
            <p className="text-[11px] font-bold text-ink-soft">أقسام الدرس — من الفيديو للشرح</p>
            <div className="flex flex-wrap gap-1.5">
              {outline.map((section) => (
                <button
                  key={section.id}
                  onClick={() => jumpToSection(section.id)}
                  className="btn btn-quiet text-[10.5px] px-2 py-1"
                  title="افتح القسم ده في تاب الشرح"
                >
                  {section.heading}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* iframe واحد ظاهر في المرة — بيتقفل لما التاب يبانى (الميني بلاير بياخد الدور) */}
        {isTabActive ? (
          <LessonVideoPlayer
            candidates={video.candidates}
            recommended={video.active ?? undefined}
            loading={video.loading}
            context={{ subject, lesson, grade: learningStyle }}
          />
        ) : (
          <p className="text-xs text-ink-soft">
            الفيديو شغّال في المشغّل المصغّر تحت — رجّع التاب ده أو اقفل المشغّل المصغّر.
          </p>
        )}
      </div>
    </div>
  );
}
