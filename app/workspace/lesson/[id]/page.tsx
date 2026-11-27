/* ======================================================================
   🏛️ مساحة الدرس الموحدة — /workspace/lesson/[id] (المرحلة 24أ)

   ⚠️ Server Component: الاستعلام على السيرفر بعميل الجلسة (createClient) —
   RLS شغّال + فلتر صريح بـ user_id + lecture id. مفيش مصدر ← notFound.

   البيانات بتتقاسّ هنا (extractSegments) قبل ما توصل للكلاينت — الـ jsonb
   الكامل (فيه words[]) مش بيتبعتش للـ payload.
   ====================================================================== */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/app/dashboard/components/PageShell";
import { LessonWorkspace } from "@/components/lesson/LessonWorkspace";
import { extractSegments, planParts, reconcileExplanation } from "@/lib/ai/lecture-intensive";
import { INTENSIVE_CHUNK_CHARS } from "@/lib/ai/lecture-intensive-prompts";
import type { Flashcard, Mcq } from "@/lib/ai/lecture-study";
import type { IntensiveExplanation } from "@/lib/ai/lecture-intensive";
import type { TimedSegment } from "@/lib/ai/lecture-intensive-prompts";

export const metadata: Metadata = {
  title: "مساحة الدرس — Magicly",
  description: "شرح ومصادر واختبارات وتسجيل صوتي — كل أدوات الدرس في مكان واحد.",
};

type LessonRecord = {
  id: string;
  title: string | null;
  original_filename: string | null;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  storage_path: string | null;
  transcript_text: string | null;
  review_status: string | null;
  transcript_reviewed_text: string | null;
  summary: string | null;
  explanation: string | null;
  flashcards: Flashcard[] | null;
  mcqs: Mcq[] | null;
  intensive_explanation: IntensiveExplanation | null;
  transcript_data: unknown;
};

export default async function LessonWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/workspace/lesson/${id}`);

  const { data } = await supabase
    .from("lectures")
    .select(
      "id, title, original_filename, status, created_at, duration_seconds, storage_path, transcript_text, review_status, transcript_reviewed_text, summary, explanation, flashcards, mcqs, intensive_explanation, transcript_data",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) notFound();
  const lecture = data as LessonRecord;

  const segments: TimedSegment[] = extractSegments(lecture.transcript_data);
  const intensiveState = reconcileExplanation(
    lecture.intensive_explanation,
    planParts(segments, INTENSIVE_CHUNK_CHARS),
  );

  return (
    <PageShell
      eyebrow="مساحة التعلم"
      title={lecture.title ?? lecture.original_filename ?? "درس"}
      lede="كل أدوات الدرس في مكان واحد: الشرح، Magic، المصادر، Notebook، والاختبارات."
    >
      <LessonWorkspace
        lectureId={lecture.id}
        status={lecture.status}
        durationSeconds={lecture.duration_seconds}
        hasAudio={Boolean(lecture.storage_path)}
        summary={lecture.summary}
        explanation={lecture.explanation}
        hasIntensive={Boolean(lecture.intensive_explanation)}
        intensive={intensiveState}
        flashcards={lecture.flashcards}
        mcqs={lecture.mcqs}
        segments={segments}
        transcriptText={lecture.transcript_text}
        reviewedText={lecture.transcript_reviewed_text}
        reviewStatus={lecture.review_status}
      />
    </PageShell>
  );
}
