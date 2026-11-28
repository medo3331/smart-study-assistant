"use client";

import { LessonProgressPanel } from "../../components/LessonProgressPanel";
import { useLessonStudio, type StudioTab } from "../LessonStudioProvider";

/* ==========================================================================
   StudyNavigator (P1-4) — أداة التنقل الدائمة:
   أقسام الدرس (extractOutline) + حالتها + Smart Resume (localStorage)
   + نقاط الدرس (بيانات LessonProgressPanel الموجودة).
   صفر نداء شبكة — كل حاجة من الحالة المحلية.
   ========================================================================== */

const TAB_LABELS: Record<StudioTab, string> = {
  learn: "الشرح",
  video: "الفيديو",
  notes: "النوتة",
  practice: "التطبيق",
  tutor: "مساعد الدرس",
};

export default function StudyNavigator({
  planProgress,
}: {
  planProgress: { completed: number; total: number } | null;
}) {
  const { lesson, outline, currentSectionId, setCurrentSectionId, setActiveTab, progress, savedVideo } = useLessonStudio();

  const overallPercent =
    planProgress && planProgress.total > 0
      ? Math.round((planProgress.completed / planProgress.total) * 100)
      : 0;

  /** «كمّل من حيث وقفت»: رجوع لآخر تاب + آخر قسم (scroll بعد التبديل). */
  const handleResume = () => {
    const tab = progress.lastTab ?? "learn";
    setActiveTab(tab);
    if (progress.lastSectionId) {
      const sectionId = progress.lastSectionId;
      // مهلة قصيرة — العنصر بيبقى موجود في تاب Learn (keep-mounted) فالscroll بيلاقيه.
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    }
  };

  const jumpToSection = (sectionId: string) => {
    setCurrentSectionId(sectionId);
    setActiveTab("learn");
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  };

  /** ⏱️ من القسم للفيديو (P3): فتح الفيديو عند توقيت القسم — رابط &t= بدون enablejsapi. */
  const watchSectionInVideo = (videoT: number) => {
    if (!savedVideo) return;
    window.open(`${savedVideo.watchUrl}&t=${videoT}s`, "_blank", "noopener,noreferrer");
  };

  const hasResume = Boolean(progress.updatedAt && (progress.lastTab || progress.lastSectionId));

  return (
    <div className="space-y-3" dir="rtl">
      {/* ─── Smart Resume: كمّل من حيث وقفت ─── */}
      {hasResume && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3.5 space-y-2">
          <p className="eyebrow eyebrow-flush mb-0">كمّل من حيث وقفت</p>
          {progress.lastTab && (
            <p className="text-[12px] text-ink leading-relaxed">
              آخر موضع: تاب «{TAB_LABELS[progress.lastTab]}»
              {progress.lastSectionId ? ` — قسم ${progress.lastSectionId.replace(/^sec-\d+-/, "")}` : ""}
            </p>
          )}
          <button onClick={handleResume} className="btn btn-marker text-xs px-3.5 py-2 w-full">
            كمّل من نفس الموضع
          </button>
        </div>
      )}

      {/* ─── نقاط الدرس — لوحة التقدّم الموجودة (الـ Navigator ورثتها) ─── */}
      <LessonProgressPanel
        percent={overallPercent}
        xpReward={lesson.xpReward}
        sections={[
          { label: "الشرح", state: currentSectionId ? "done" : "current" },
          { label: "محادثة الدرس", state: "todo" },
          { label: "موارد الدرس", state: "todo" },
          {
            label: lesson.isCompleted ? "الاختبار — مكتمل ✓" : "الاختبار القصير",
            state: lesson.isCompleted ? "done" : "todo",
          },
        ]}
      />

      {/* ─── أقسام الدرس ─── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-primary)]/70 p-3.5">
        <p className="eyebrow eyebrow-flush mb-2">أقسام الدرس</p>
        {outline.length === 0 ? (
          <p className="text-[11.5px] text-ink-soft leading-relaxed">
            الأقسام بتظهر هنا بعد ما الشرح يتجهّز في تاب «الشرح».
          </p>
        ) : (
          <ul className="space-y-0.5">
            {outline.map((section) => {
              const current = currentSectionId === section.id;
              return (
                <li key={section.id}>
                  <button
                    onClick={() => jumpToSection(section.id)}
                    aria-current={current ? "true" : undefined}
                    className={`w-full text-right rounded-lg px-2.5 py-1.5 text-[12px] transition flex items-center gap-2 ${
                      current
                        ? "font-bold text-ink bg-[var(--card-secondary)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        : "text-ink-soft hover:text-ink hover:bg-[var(--card-secondary)]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${current ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                    />
                    <span className="truncate">{section.heading}</span>
                    {/* ⏱️ من القسم للفيديو (P3) — لو القسم متحاذى مع توقيت في الفيديو المحفوظ */}
                    {savedVideo && typeof section.videoT === "number" && section.videoT != null && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          watchSectionInVideo(section.videoT as number);
                        }}
                        title="افتح الفيديو عند بداية القسم ده"
                        className="ms-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-[5px] border border-[var(--border)] text-ink-soft hover:text-ink transition tnum"
                      >
                        ⏱ {Math.floor(section.videoT / 60)}:{String(section.videoT % 60).padStart(2, "0")}
                      </button>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
