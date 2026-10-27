import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { buildSuspectsPrompt, type SuspectedTerm } from "@/lib/ai/transcript-review";
import { runAiTask } from "@/lib/ai/tasks/runner";

/* ==========================================================================
   🔍 /api/lectures/[id]/transcript/detect-suspects — كشف المصطلحات المشكوك فيها (Phase 2)
   ═════════════════════════════════════════════════════════════════════════

   POST { "subject"?: string }
   1. جلسة؟ لو لأ → 401.
   2. جلب المحاضرة بفلتر المستخدم → لو مش موجودة → 404.
   3. جلب قاموس المادة من subject_dictionaries (إن وجد).
   4. نداء الموديل للكشف عن المصطلحات المشكوك فيها.
   5. حفظ suspected_terms + review_status = 'pending' في المحاضرة.
   6. الرد بقائمة المصطلحات المشكوك فيها.

   الرد لا يحتوي على transcript_text أصلاً — الواجهة عندها النص من الصفحة.
   ═════════════════════════════════════════════════════════════════════════ */

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lectureId } = await params;

  try {
    // ١) جلسة.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "AUTH_REQUIRED", message: "سجّل دخول أولاً." } },
        { status: 401 }
      );
    }

    // ٢) جلب المحاضرة بفلتر المستخدم.
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id, user_id, transcript_data, subject, review_status")
      .eq("id", lectureId)
      .eq("user_id", user.id)
      .single();

    if (lectureError || !lecture) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "المحاضرة غير موجودة أو ليست لك." } },
        { status: 404 }
      );
    }

    // ٣) جلب قاموس المادة إن وجد.
    let dictionaryTerms: string[] = [];
    if (lecture.subject) {
      const { data: dict } = await supabase
        .from("subject_dictionaries")
        .select("terms")
        .eq("user_id", user.id)
        .eq("subject_name", lecture.subject)
        .maybeSingle();
      if (dict?.terms && Array.isArray(dict.terms)) {
dictionaryTerms = dict.terms.filter(
          (t: unknown): t is string => typeof t === "string"
        );
      }
    }

    // ④) استخراج النص من transcript_data.
    const transcriptData = lecture.transcript_data as
      | { text?: string; segments?: Array<{ text?: string; words?: Array<{ text?: string; start?: number; end?: number }> }> }
      | undefined;
    const transcriptText = transcriptData?.text || "";
    if (!transcriptText.trim()) {
      return NextResponse.json(
        { error: { code: "EMPTY_TRANSCRIPT", message: "نص المحاضرة فاضي." } },
        { status: 422 }
      );
    }

    // ⑤) نداء الموديل.
    const system = buildSuspectsPrompt({
      transcriptText,
      subject: lecture.subject || undefined,
      dictionaryTerms: dictionaryTerms.length > 0 ? dictionaryTerms : undefined,
    });

    const response = await runAiTask("chat", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: transcriptText },
      ],
      options: { temperature: 0.3 },
    });

    // ⑥) تحليل رد الموديل.
    let suspectedTerms: SuspectedTerm[] = [];
    try {
      const parsed = JSON.parse(response.content);
      if (parsed && Array.isArray(parsed.suspected_terms)) {
        suspectedTerms = parsed.suspected_terms
          .filter(
            (t: unknown): t is SuspectedTerm =>
              typeof t === "object" &&
              t !== null &&
              typeof (t as SuspectedTerm).term === "string" &&
              typeof (t as SuspectedTerm).suggested_correction === "string"
          )
          .map((t: SuspectedTerm) => ({
            term: t.term.trim(),
            suggested_correction: t.suggested_correction.trim(),
            reason: typeof t.reason === "string" ? t.reason.trim() : "مشكوك في صحته",
            start: typeof t.start === "number" ? t.start : 0,
            end: typeof t.end === "number" ? t.end : 0,
            segment_index: typeof t.segment_index === "number" ? t.segment_index : 0,
            word_index: typeof t.word_index === "number" ? t.word_index : 0,
          }));
      }
    } catch {
      // لو رد الموديل مش JSON صالح — نرجع مصفوفة فاضية ومانكملش الحفظ.
      console.error("detect-suspects: رد الموديل ليس JSON صالح", response.content);
    }

    // ⑦) حفظ النتائج في المحاضرة.
    const { error: updateError } = await supabase
      .from("lectures")
      .update({
        suspected_terms: suspectedTerms,
        review_status: "pending",
      })
      .eq("id", lectureId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("detect-suspects: فشل حفظ المصطلحات المشبوهة", updateError);
      return NextResponse.json(
        {
          error: {
            code: "DB_WRITE_FAILED",
            message: "الكشف نجح لكن فشل الحفظ. جرّب تاني.",
          },
        },
        { status: 500 }
      );
    }

    // ⑧) الرد.
    return NextResponse.json({
      success: true,
      lectureId,
      suspectedTerms,
      count: suspectedTerms.length,
      reviewStatus: "pending",
    });
  } catch (error) {
    console.error("detect-suspects: خطأ غير متوقع", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "حصلت مشكلة أثناء كشف المصطلحات المشبوهة. حاول مرة أخرى.",
        },
      },
      { status: 500 }
    );
  }
}