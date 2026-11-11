import { NextResponse } from "next/server";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { recordRuntimeError, createTraceId, classifyError } from "@/lib/runtime-errors";

import { createClient } from "@/lib/supabase/server";
import {
  generateIntensiveExplanation,
  extractSegments,
  saveIntensiveExplanation,
  IntensiveError,
} from "@/lib/ai/lecture-intensive";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { runAiTask } from "@/lib/ai/tasks/runner";
import { INTENSIVE_CHUNK_CHARS } from "@/lib/ai/lecture-intensive-prompts";

/* ==========================================================================
   🧠 /api/lectures/[id]/intensive — الشرح المكثف مع المراجع الزمنية (Phase 5)
   ============================================================================

   POST (من غير body — التوليد بياخد كل قراراته من المحاضرة نفسها)

   ═══ ليه مسار منفصل عن `/process` ═══
   `/api/lectures/[id]/process` بيبعت `transcript_text` — نص **مسطّح** مالوش
   توقيتات. المسار ده بياخد `transcript_data` — المقاطع وكل واحد بتوقيته —
   فبيقدر يرجّع مراجع زمنية حقيقية.

   ═══ ترتيب الحمايات (مقصود، مش اعتباطي) ═══
     1. جلسة؟ لو لأ → 401.
     2. جلب المحاضرة **بفلتر المستخدم** → لو مش موجودة → 404.
     3. تفريغ فاضي؟ → 422.
     4. **مفيش مقاطع/توقيتات؟ → 422** — ⚠️ دي حماية جوهرية: من غير
        توقيتات مفيش citations، فالرجوع بشرح من غير مصادر هيكسر الوعد
        الأساسي للميزة («كل جملة ليها مصدر»).
     5. **حارس الكروت والـ rate limit → 429/403/402** (قبل أي نداء).
     6. نداء الموديل.
     7. حفظ النتيجة (patch على `intensive_explanation` بس).

   ⚠️ **الترتيب ٥ قبل ٦ هو الحماية كلها**: لو اتنادى الموديل الأول، الرفض
   بيحصل بعد ما الكروت اتصرفت.

   ═══ مافيش في الرد ═══
   ولا مفتاح، ولا اسم مزوّد، ولا stack، ولا نص التفريغ. الرد فيه
   المحتوى المولّد بس.
   ========================================================================== */

/**
 * أقصى مدة تنفيذ.
 *
 * ⚠️ القطع بتشتغل **بالتوازي** (`Promise.allSettled` جوه
 *    `generateIntensiveExplanation`)، فالزمن = أبطأ قطعة مش مجموعها.
 *    300 ثانية سخية لحد ١٢ قطعة.
 */
export const maxDuration = 300;

/** الموديل اللي بيتحجّم عليه. مجاني ونصّي — زي `/api/lectures/[id]/process`. */
const GUARD_MODEL_ID = "openai/gpt-oss-120b";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const traceId = createTraceId();
  try {
    // ── ١) المصادقة: من الجلسة، لا من الـ body ──
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "لازم تسجّل دخول الأول." } },
        { status: 401 },
      );
    }

    const { id } = await ctx.params;

    // ── ٢) جلب المحاضرة بفلتر صريح على المستخدم ──
    // ⚠️ الفلتر ده **مكمّل** لـ RLS مش بديل. RLS بيمنع القراءة أصلاً،
    //    والفلتر بيخلّي الاستعلام نفسه مابيلغيش لحد غير المالك.
    const { data: lecture, error: fetchError } = await supabase
      .from("lectures")
      .select("id, transcript_text, transcript_data, duration_seconds")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        `lectures/intensive: فشل جلب المحاضرة [${fetchError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DB_READ_FAILED",
            message: "مقدرناش نقرأ المحاضرة. جرّب تاني كمان شوية.",
          },
        },
        { status: 500 },
      );
    }
    if (!lecture) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "LECTURE_NOT_FOUND", message: "مفيش محاضرة بالـ id ده في حسابك." },
        },
        { status: 404 },
      );
    }

    // ── ٣) التفريغ ──
    const transcriptText =
      typeof lecture.transcript_text === "string" ? lecture.transcript_text : "";
    if (transcriptText.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_TRANSCRIPT",
            message: "مفيش تفريغ محفوظ للمحاضرة دي. ارفع المحاضرة من جديد الأول.",
          },
        },
        { status: 422 },
      );
    }

    // ── ٤) ⚡ لازم يكون فيه توقيتات ──
    // ⚠️ الحماية الجوهرية للميزة: من غير `transcript_data.segments`
    //    مفيش أي مصدر زمني نرجّعه. الرجوع بشرح من غير مصادر هيكسر
    //    الوعد الأساسي («كل جملة ليها مصدر»)، فبنرفض بوضوح بدل ما
    //    نولّد حاجة شكلها زي Citations وميخالفيهاش.
    const segments = extractSegments(lecture.transcript_data);
    if (segments.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_TIMINGS",
            message:
              "المحاضرة دي مفيهاش توقيتات، فمقدرناش نضيف مصادر لكل معلومة. ارفعها من جديد أو استخدم «شرح المحاضرة» العادي.",
          },
        },
        { status: 422 },
      );
    }

    // ── ٥) حارس الكروت — **قبل أي نداء للموديل** ──
    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);
    if (!guard.ok) {
      // ⚠️ ممنوع نكتب في المحاضرة ولا ننداء الموديل في الحالة دي.
      const guardBody = await guard.response.json().catch(() => ({
        ok: false,
        error: "خدمة الذكاء الاصطناعي مش متاحة دلوقتي. جرّب تاني بعد شوية.",
      }));
      const retryAfter = guard.response.headers.get("Retry-After");
      return NextResponse.json(guardBody, {
        status: guard.response.status,
        ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
      });
    }

    // ── ٦) التوليد ثم الحفظ ──
    // ⚠️ كل حاجة جاية من هنا ممكن تكون **فشل مكلّف**، فأي خطأ بيرجّع
    //    الـ credit (refundAiCreditIfNeeded) عشان الطالب مايتحمّلش
    //    كروت نتيجة خطأ مش من فعله.
    const usage = resolveUsageRequestContext(request, user.id, {
      feature: "lecture_intensive",
    });

    let explanation;
    try {
      const generated = await generateIntensiveExplanation({
        segments,
        durationSeconds:
          typeof lecture.duration_seconds === "number" ? lecture.duration_seconds : null,
        deps: {
          runTask: runAiTask,
          chunkChars: INTENSIVE_CHUNK_CHARS,
        },
        usage,
      });
      explanation = generated.explanation;

      await saveIntensiveExplanation({
        supabase,
        lectureId: lecture.id,
        userId: user.id,
        explanation,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw error;
    }

    // لوج تشخيصي: عدد القطع والقطع اللي فشلت — مفيد لو لاحظنا
    // استهلاكاً أعلى من المتوقّع ونحتاج نعرف هل السبب تقطيع ولا رفض.
    console.log(
      `lectures/intensive: ok chunks=${explanation.chunks.ok}/${explanation.chunks.ok + explanation.chunks.failed} sections=${explanation.sections.length} refId=${guard.refId}`,
    );

    // ⚠️ الرد بيرجّع النتيجة **فقط** — مافيش `transcript` في الرد.
    //    `chunks.failed` بيقول للواجهة إن فيه أجزاء فاتت.
    return NextResponse.json({
      success: true,
      lectureId: lecture.id,
      intensive: explanation,
    });
  } catch (error) {
    if (error instanceof IntensiveError) {
      void recordRuntimeError({
        route: "/api/lectures/[id]/intensive",
        feature: "lecture",
        category: classifyError(error, "internal"),
        errorType: error.code,
        traceId,
        outcome: "failed",
        message: error instanceof Error ? error.message : String(error),
        userId: null,
      });
      console.error(`lectures/intensive: [${error.code}] ${error.message}`);
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    console.error("lectures/intensive: خطأ غير متوقع", error);
    void recordRuntimeError({
      route: "/api/lectures/[id]/intensive",
      feature: "lecture",
      category: classifyError(error, "internal"),
      errorType: error instanceof Error ? error.name : "Error",
      traceId,
      outcome: "failed",
      message: error instanceof Error ? error.message : String(error),
      userId: null,
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTENSIVE_FAILED",
          message: "مقدرناش نجهّز الشرح المكثف دلوقتي. جرّب تاني كمان شوية.",
        },
      },
      { status: 502 },
    );
  }
}
