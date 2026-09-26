"use client";
/**
 * Wave 2A — MedicalTools (the first implemented lesson specialization).
 *
 * SCOPE (deliberately narrow, decided with the user before any code):
 *   Three options the student picks from:
 *     1. Video     → reuses the EXISTING /api/lesson/video + LessonVideoPlayer
 *                    pipeline. No new YouTube IDs, no invented content. When the
 *                    search yields nothing, the player's own "no video" state shows.
 *     2. Upload    → VISIBLE PLACEHOLDER ONLY. `uploadFile()` in app/api/upload
 *                    is NOT called: its storage_path is a placeholder and no bytes
 *                    are stored, so calling it would promise a save that never happens.
 *     3. General AI → a link to /chat carrying the lesson context. We do NOT
 *                    render a second UnifiedChat instance: the lesson page already
 *                    renders one above, and a duplicate would double-count against
 *                    the AI quota.
 *
 * NO medical content is authored here. No anatomy/physiology/pathology text, no
 * hand-written "explainer" copy. Everything shown is either a real API response
 * or a neutral label describing the student's own lesson.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LessonVideoPlayer from "@/components/lesson/LessonVideoPlayer";
import type { VideoCandidate } from "@/lib/lesson/video-server";
import type { SpecializationContext, LessonSpecialization } from "@/lib/education/specialization";

type ToolId = "video" | "upload" | "chat";

const TABS: { id: ToolId; label: string }[] = [
  { id: "video", label: "فيديو" },
  { id: "upload", label: "رفع مصدر" },
  { id: "chat", label: "AI عام" },
];

export function MedicalTools({ ctx }: { ctx: SpecializationContext }) {
  const [active, setActive] = useState<ToolId>("video");
  const { lesson } = ctx;

  // The video pipeline is keyed off the SAME subject the lesson page already
  // sends, so a medical lesson here behaves exactly like the shell's player.
  const videoPayload = useMemo(
    () => ({
      subject: lesson.subject,
      lesson: lesson.topic,
      topic: lesson.topic,
      stage: ctx.profile.stage || "",
      grade: ctx.profile.grade || "",
      track: ctx.profile.track || "",
      faculty: ctx.profile.faculty || "",
      language: "arabic",
    }),
    [lesson.subject, lesson.topic, ctx.profile.stage, ctx.profile.grade, ctx.profile.track, ctx.profile.faculty]
  );

  return (
    <section aria-label="أدوات التخصص الطبي" className="sheet-card p-5 sm:p-6 space-y-4">
      <div>
        <p className="eyebrow eyebrow-flush mb-1.5">أدوات المادة</p>
        <h2 className="h3">أدوات خاصة بمادة {lesson.subject}</h2>
      </div>

      <div role="tablist" aria-label="أدوات التخصص" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`rounded-[var(--r-sm)] border px-3 py-1.5 text-xs font-medium transition ${
              active === tab.id
                ? "bg-paper-3 border-rule-strong text-ink"
                : "bg-paper border-rule text-ink-soft hover:bg-paper-2"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "video" && <MedicalVideo payload={videoPayload} subject={lesson.subject} lessonTopic={lesson.topic} />}
      {active === "upload" && <UploadPlaceholder />}
      {active === "chat" && <GeneralAiLink subject={lesson.subject} topic={lesson.topic} description={lesson.description} />}
    </section>
  );
}

/** Option 1 — real video search through the existing server-only endpoint. */
function MedicalVideo({
  payload,
  subject,
  lessonTopic,
}: {
  payload: Record<string, string>;
  subject: string;
  lessonTopic: string;
}) {
  const [candidates, setCandidates] = useState<VideoCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/lesson/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok && Array.isArray(d.candidates)) setCandidates(d.candidates);
      })
      .catch(() => {
        /* video failure must not break the panel */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <LessonVideoPlayer candidates={candidates} loading={loading} context={{ subject, lesson: lessonTopic }} />
  );
}



/**
 * Option 2 — intentionally non-functional.
 * Stated plainly so the student is not told a file was saved when nothing is.
 */
function UploadPlaceholder() {
  return (
    <div className="rounded-[var(--r-sm)] border border-dashed border-rule-strong bg-paper-2 p-6 text-center space-y-2">
      <p className="text-sm font-bold text-ink">رفع مصدر — تحت التطوير</p>
      <p className="text-xs leading-relaxed text-ink-soft max-w-md mx-auto">
        رفع ملف (PDF أو صورة) لسه غير متاح النسخة دي، وأي ملف مرفوع مش بيتخزّن فعليًا.
        استخدم «AI عام» في الوقت ده لو عندك مصدر عايز تسأل عنه.
      </p>
    </div>
  );
}

/**
 * Option 3 — hand off to the single existing UnifiedChat on /chat.
 * A link, not a second embedded chat: the lesson page already renders one, and
 * a duplicate instance would consume the same AI quota twice.
 */
function GeneralAiLink({
  subject,
  topic,
  description,
}: {
  subject: string;
  topic: string;
  description: string;
}) {
  const href = useMemo(() => {
    const p = new URLSearchParams();
    if (subject) p.set("subject", subject);
    if (topic) p.set("lesson", topic);
    if (topic) p.set("title", topic);
    if (description) p.set("content", description);
    return `/chat?${p.toString()}`;
  }, [subject, topic, description]);

  return (
    <div className="rounded-[var(--r-sm)] border border-rule bg-paper-2 p-5 space-y-3">
      <p className="text-sm leading-relaxed text-ink">
        اسأل المساعد العام أي حاجة عن درس «{topic}».
      </p>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] text-[var(--on-marker)] px-4 py-2.5 text-sm font-semibold transition hover:brightness-110"
      >
        افتح المساعد العام
      </Link>
    </div>
  );
}

/** The LessonSpecialization contract instance registered in Wave 2A. */
export const medicalSpecialization: LessonSpecialization = {
  id: "medical",
  name: "Medical Tools",
  priority: 10,
  renderTools: (ctx) => <MedicalTools ctx={ctx} />,
};
