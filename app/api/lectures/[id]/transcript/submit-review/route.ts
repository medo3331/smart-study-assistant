import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type {
  ReviewDecision,
  SubmitReviewResponse,
} from "@/lib/ai/transcript-review";
import { buildReviewedText, termIdFromSuspected } from "@/lib/ai/transcript-review";

/* ============================================================================
   📝 /api/lectures/[id]/transcript/submit-review — إرسال قرارات المراجعة (Phase 3)
   ═════════════════════════════════════════════════════════════════════════════

   POST { "decisions": ReviewDecision[] }

   1. جلسة؟ لو لأ → 401.
   2. جلب المحاضرة بفلتر المستخدم → لو مش موجودة → 404.
   3. التحقق من شكل الطلب والإجراءات المسموحة.
   4. بناء النص المصحح من transcript_data + القرارات (بدون تعديل الأصل).
   5. حفظ review_decisions + transcript_reviewed_text + review_status + reviewed_at.
   6. الرد بالنص المصحح والحالة الجديدة.

   ⚠️ lectureId يُؤخذ من مسار الطلب فقط — لا يُثقَّف به من الـ body.
   ⚠️ transcript_text و transcript_data يفضلان دون تعديل.
   ════════════════════════════════════════════════════════════════════════════ */

export const maxDuration = 300;

const ALLOWED_ACTIONS = new Set(["accept", "reject", "manual_edit"]);

function isValidDecision(d: unknown): d is ReviewDecision {
  if (typeof d !== "object" || d === null) return false;
  const dec = d as Record<string, unknown>;
  if (typeof dec.termId !== "string" || dec.termId.trim() === "") return false;
  if (typeof dec.action !== "string" || !ALLOWED_ACTIONS.has(dec.action)) return false;
  if (dec.finalValue !== undefined && dec.finalValue !== null && typeof dec.finalValue !== "string") return false;
  if (typeof dec.decidedAt !== "string" || dec.decidedAt.trim() === "") return false;
  if (dec.action === "manual_edit" && (typeof dec.finalValue !== "string" || dec.finalValue.trim() === "")) return false;
  return true;
}

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

    // ٢) جلب المحاضرة بفلتر المستخدم (الملكية).
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id, user_id, transcript_data, suspected_terms, review_status")
      .eq("id", lectureId)
      .eq("user_id", user.id)
      .single();

    if (lectureError || !lecture) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "المحاضرة غير موجودة أو ليست لك." } },
        { status: 404 }
      );
    }

    // ٣) قراءة وفحص جسم الطلب.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", message: "طلب غير صالح — يرجى إرسال JSON صحيح." } },
        { status: 400 }
      );
    }

    const rawDecisions = (body as Record<string, unknown> | null)?.decisions;
    if (!Array.isArray(rawDecisions)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "يجب إرسال مصفوفة القرارات (decisions).",
          },
        },
        { status: 400 }
      );
    }

    const decisions: ReviewDecision[] = [];
    for (const raw of rawDecisions) {
      if (!isValidDecision(raw)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "قرار غير صالح — تأكد من termId والإجراء ووقت القرار.",
            },
          },
          { status: 400 }
        );
      }
      decisions.push(raw);
    }

    // C2: verify each decision.termId maps to a saved suspected term in this lecture.
    const lectureSuspected = Array.isArray(lecture.suspected_terms)
      ? lecture.suspected_terms
      : [];
    const validTermIds = new Set(
      (lectureSuspected as Array<{ segment_index: number; word_index: number; start: number }>).map(
        (t) => termIdFromSuspected(t)
      )
    );
    const seenInRequest = new Set<string>();
    for (const d of decisions) {
      if (!validTermIds.has(d.termId)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "termId غير موجود في قائمة المصطلحات المشكوك فيها لهذه المحاضرة.",
            },
          },
          { status: 400 }
        );
      }
      if (seenInRequest.has(d.termId)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "termId مكرر في الطلب.",
            },
          },
          { status: 400 }
        );
      }
      seenInRequest.add(d.termId);
    }

    // ٤) بناء النص المصحح من transcript_data + القرارات.
    const transcriptData = lecture.transcript_data as
      | { text?: string; segments?: Array<{ text?: string; words?: Array<{ text?: string; start?: number; end?: number }> }> }
      | undefined;
    const suspectedTerms = Array.isArray(lecture.suspected_terms)
      ? lecture.suspected_terms
      : [];
    // (enrichment removed; buildReviewedText now tolerates invalid start)

const transcriptForBuild = transcriptData
      ? { text: transcriptData.text ?? "", segments: transcriptData.segments }
      : { text: "", segments: [] };
    const reviewedText = buildReviewedText(
      transcriptForBuild,
      suspectedTerms,
      decisions
    );

    if (reviewedText === null) {
      return NextResponse.json(
        {
          error: {
            code: "CANNOT_BUILD_REVIEWED_TEXT",
            message: "لا يمكن بناء النص المصحح تلقائيًا — يوجد تعارض في المواضع أو بيانات ناقصة. يرجى المراجعة يدوية.",
          },
        },
        { status: 422 }
      );
    }

    // ٥) تحديد حالة المراجعة النهائية.
    const totalSuspects = suspectedTerms.length;
    const decidedTermIds = new Set(decisions.map((d) => d.termId));
    const allDecided =
      totalSuspects > 0 &&
      suspectedTerms.every((t: any) => decidedTermIds.has(termIdFromSuspected(t)));

    const reviewStatus: "completed" | "needs_attention" = allDecided
      ? "completed"
      : "needs_attention";
    const reviewedAt = new Date().toISOString();

    // ⑥) الحفظ — تحديثdde الأعمدة الخاصة بالمراجعة فقط.
    const { error: updateError } = await supabase
      .from("lectures")
      .update({
        review_decisions: decisions,
        transcript_reviewed_text: reviewedText,
        review_status: reviewStatus,
        reviewed_at: reviewedAt,
      })
      .eq("id", lectureId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("submit-review: فشل حفظ قرارات المراجعة", updateError);
      return NextResponse.json(
        {
          error: {
            code: "DB_WRITE_FAILED",
            message: "فشل حفظ قرارات المراجعة. جرّب تاني.",
          },
        },
        { status: 500 }
      );
    }

    // ⑦) الرد.
    const response: SubmitReviewResponse = {
      success: true,
      lectureId,
      reviewedText,
      reviewStatus: reviewStatus,
      reviewedAt,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("submit-review: خطأ غير متوقع", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "حصلت مشكلة أثناء إرسال قرارات المراجعة. حاول مرة أخرى.",
        },
      },
      { status: 500 }
    );
  }
}