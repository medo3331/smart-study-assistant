"use client";
/**
 * Phase 1.4 — LessonVideoPlayer
 * Embedded YouTube player inside Magiclly Lesson Page.
 * - youtube-nocookie embed (privacy)
 * - Responsive 16:9 with aspect-ratio preserving container
 * - RTL-safe, design-system matched (rounded, glass, paper theme)
 * - No redirect to YouTube on Play (primary experience inside page)
 * - Secondary watch link only (explicit, not primary action)
 * - Skeleton loading + graceful empty / error states
 */

import React, { useState, useMemo } from "react";
import { VideoCandidate } from "@/lib/lesson/video-server";

interface LessonVideoPlayerProps {
  candidates?: VideoCandidate[];
  recommended?: VideoCandidate;
  context?: { subject?: string; lesson?: string; grade?: string };
  loading?: boolean;
  className?: string;
}

export default function LessonVideoPlayer({
  candidates = [],
  recommended,
  context,
  loading = false,
  className = "",
}: LessonVideoPlayerProps) {
  const [error, setError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Pick best: recommended explicit > first from candidates > none
  const best = recommended || (candidates.length > 0 ? candidates[0] : null);
  const alternatives = useMemo(() => {
    if (!best) return candidates || [];
    return (candidates || []).filter((c) => c.id !== best.id).slice(0, 2);
  }, [best, candidates]);

  // Error state: missing video id or invalid
  const hasError = error || !best || !best.id || best.id.length < 5;

  if (loading) {
    return <VideoSkeleton />;
  }

  if (hasError || !best) {
    return (
      <section
        dir="rtl"
        aria-label="فيديو الدرس"
        className={`rounded-2xl border border-stone-200/60 bg-stone-50 dark:bg-[#181428]/70 backdrop-blur-md shadow-sm p-6 text-center ${className}`}
      >
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-stone-200 dark:bg-white/5 flex items-center justify-center text-xl shadow-inner">
          🎥
        </div>
        <h3 className="font-bold text-base text-ink mb-1">لا يوجد فيديو مناسب لهذا الدرس حاليًا</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          سنضيف فيديو تعليمي مناسب قريبًا. يمكنك الرجوع للمراجع المكتوبة في الصفحة.
        </p>
        {/* Secondary fallback — only shown when no embedded video; not primary action */}
        <div className="mt-4 text-xs text-muted-foreground/70">
          {context?.subject ? `المادة: ${context.subject}` : ""}
          {context?.lesson ? ` · الدرس: ${context.lesson}` : ""}
        </div>
      </section>
    );
  }

  return (
    <section dir="rtl" aria-label="فيديو الدرس" className={`space-y-4 ${className}`}>
      {/* Header — clean, paper design, no heavy decoration */}
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0 rounded-xl bg-gradient-to-br from-violet-600/20 to-teal-500/20 dark:from-violet-400/10 dark:to-teal-300/10 px-2.5 py-2 shadow-sm border border-violet-200/40 dark:border-violet-300/10">
          <span className="text-lg" aria-hidden="true">🎬</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-[17px] leading-snug text-ink tracking-tight">
            {best.title || "فيديو شرح الدرس"}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-white/60 dark:bg-white/5 px-2 py-0.5 border border-stone-200/50 dark:border-white/10 shadow-sm">
              {best.channel || "المحتوى التعليمي"}
            </span>
            {best.duration && (
              <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 border border-amber-200/40 dark:border-amber-700/30">
                ⏱ {best.duration}
              </span>
            )}
            {best.reason && (
              <span className="text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                {best.reason}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Player container — responsive 16:9, no layout shift */}
      <div className="relative w-full overflow-hidden rounded-2xl shadow-lg shadow-violet-900/10 dark:shadow-black/20 border border-stone-200/60 dark:border-white/10 bg-black">
        {/* Skeleton shown until iframe signals load */}
        {!iframeLoaded && !error && (
          <div className="absolute inset-0 z-10 bg-gradient-to-br from-stone-900/80 to-[#181428]/90 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="mx-auto h-10 w-10 rounded-full bg-white/10 animate-pulse ring-2 ring-white/10" />
              <p className="text-sm text-white/70 font-medium">جارٍ تحميل الفيديو...</p>
            </div>
          </div>
        )}
        <div className="aspect-video w-full relative">
          <iframe
            title={best.title || "فيديو الدرس"}
            src={best.embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={`w-full h-full border-0 block transition-opacity duration-500 ${iframeLoaded && !error ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setIframeLoaded(true)}
            onError={() => { setError(true); setIframeLoaded(true); }}
          />
        </div>
      </div>

      {/* Metadata + secondary links — minimal, not overwhelming */}
      <div className="rounded-2xl border border-stone-200/60 dark:border-white/10 bg-white/60 dark:bg-[#181428]/60 backdrop-blur-md p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm leading-relaxed text-ink">
            <strong className="font-bold">المصدر:</strong>{" "}
            <span className="text-muted-foreground">{best.channel || "المحتوى التعليمي"}</span>
            {best.duration && (
              <>
                {" · "}
                <strong className="font-bold">المدة:</strong>{" "}
                <span className="text-muted-foreground">{best.duration}</span>
              </>
            )}
          </div>
          <a
            href={best.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="فتح الفيديو على YouTube (روابط خارجية ثانوية)"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 shadow-md shadow-violet-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-500"
          >
            <span>فتح على YouTube</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17l9.2-9.2M17 8h-11"/></svg>
          </a>
        </div>
        {alternatives.length > 0 && (
          <div className="mt-3 pt-3 border-t border-stone-200/40 dark:border-white/10">
            <p className="text-xs text-muted-foreground mb-2">بدائل مناسبة للدرس:</p>
            <div className="flex flex-wrap gap-2">
              {alternatives.map((alt) => (
                <button
                  key={alt.id}
                  onClick={() => {
                    // In a real interaction this would swap the player; for Phase 1.4, keep UI simple
                    // The component will re-render if parent passes new recommended.
                    window.open(alt.watchUrl, "_blank", "noopener,noreferrer");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 dark:bg-white/5 hover:bg-violet-50 dark:hover:bg-violet-400/10 border border-stone-200/60 dark:border-white/10 px-2.5 py-1.5 text-xs font-medium text-ink transition-colors"
                  aria-label={`بديل: ${alt.title}`}
                >
                  <span className="text-[10px] opacity-60">▶</span>
                  <span className="truncate max-w-[14rem]">{alt.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function VideoSkeleton() {
  return (
    <section dir="rtl" aria-label="فيديو الدرس جاري التحميل" className="rounded-2xl border border-stone-200/60 dark:border-white/10 bg-stone-50 dark:bg-[#181428]/70 backdrop-blur-md shadow-sm overflow-hidden">
      <div className="aspect-video w-full bg-gradient-to-br from-stone-200 dark:from-[#251e3a] to-stone-300 dark:to-[#2e1f4d] relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-white/30 dark:bg-white/10 animate-pulse ring-4 ring-white/20 dark:ring-white/5" />
            <p className="text-sm font-medium text-stone-500 dark:text-stone-300">جارٍ تحميل الفيديو...</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-2.5">
        <div className="h-5 w-2/3 rounded-md bg-stone-200 dark:bg-white/10" />
        <div className="h-4 w-1/2 rounded-md bg-stone-200 dark:bg-white/10" />
      </div>
    </section>
  );
}
