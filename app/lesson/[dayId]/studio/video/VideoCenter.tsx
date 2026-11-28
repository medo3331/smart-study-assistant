"use client";

import { useEffect } from "react";
import LessonVideoPlayer from "@/components/lesson/LessonVideoPlayer";
import { useLessonStudio } from "../LessonStudioProvider";
import VideoRecommendations from "./VideoRecommendations";

/* ==========================================================================
   VideoCenter (§4.2) — يستضيف LessonVideoPlayer الموجود + طبقة التوصيات.
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
  const { video, openVideo, ensureVideoLoaded, activeTab } = useLessonStudio();

  // أول فتح لتاب الفيديو ⇒ ابدأ البحث (مرة واحدة — guard جوه الـ provider).
  useEffect(() => {
    if (activeTab === "video") ensureVideoLoaded();
  }, [activeTab, ensureVideoLoaded]);

  const isTabActive = activeTab === "video";

  return (
    <div className="space-y-5" dir="rtl">
      <div className="sheet-card p-5 sm:p-6 space-y-4">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">مركز الفيديو</p>
          <h2 className="h3">فيديوهات مقترحة لشرح الدرس</h2>
        </div>

        <VideoRecommendations
          candidates={video.candidates}
          activeId={video.active?.id ?? null}
          onSelect={(c) => openVideo(c)}
        />

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
