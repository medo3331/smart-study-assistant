"use client";

import { useLessonStudio } from "../LessonStudioProvider";

/* ==========================================================================
   MiniVideoPlayer — المشغّل العائم (§4.2): يظهر لما الطالب يسيب تاب الفيديو
   والفيديو مفتوح. iframe واحد ظاهر في المرة — الـ VideoCenter بيقفل الـ iframe
   بتاعه وقتها. بدون enablejsapi — نفس embedUrl زي ما هو (قرار مقفول §7.1-1).
   ========================================================================== */

export default function MiniVideoPlayer() {
  const { video, closeVideo, setActiveTab, activeTab } = useLessonStudio();
  const show = video.open && video.miniPlayerOn && activeTab !== "video";
  const candidate = video.active ?? video.candidates[0] ?? null;

  if (!show || !candidate) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-20 lg:bottom-6 left-4 z-[60] w-[280px] sm:w-[340px] rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--card-primary)] shadow-[0_12px_40px_var(--shadow)]"
      role="complementary"
      aria-label="مشغّل الفيديو المصغّر"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--card-secondary)] border-b border-[var(--border)]">
        <span className="text-[11.5px] font-bold text-ink truncate">{candidate.title || "فيديو الدرس"}</span>
        <span className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveTab("video")}
            className="text-[11px] px-2 py-1 rounded-lg border border-[var(--border)] text-ink-soft hover:text-ink transition"
            title="رجوع لمركز الفيديو"
          >
            التاب
          </button>
          <button
            onClick={closeVideo}
            className="text-[11px] px-2 py-1 rounded-lg border border-[var(--border)] text-ink-soft hover:text-ink transition"
            title="قفل الفيديو"
            aria-label="قفل الفيديو"
          >
            ✕
          </button>
        </span>
      </div>
      <div className="aspect-video w-full bg-black">
        <iframe
          title={candidate.title || "فيديو الدرس — مصغّر"}
          src={candidate.embedUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0 block"
        />
      </div>
    </div>
  );
}
