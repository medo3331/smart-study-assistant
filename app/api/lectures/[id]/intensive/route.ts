import { NextResponse } from "next/server";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { recordRuntimeError, createTraceId, classifyError } from "@/lib/runtime-errors";

import { createClient } from "@/lib/supabase/server";
import {
  generateIntensivePart,
  extractSegments,
  isProviderRateLimit,
  planParts,
  reconcileExplanation,
  saveIntensiveExplanation,
  IntensiveError,
  type IntensiveExplanation,
} from "@/lib/ai/lecture-intensive";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { runAiTask } from "@/lib/ai/tasks/runner";
import { INTENSIVE_CHUNK_CHARS, MAX_INTENSIVE_CHUNKS } from "@/lib/ai/lecture-intensive-prompts";

/* ==========================================================================
   🧠 /api/lectures/[id]/intensive — الشرح المكثف مع المراجع الزمنية (Phase 5)
   ============================================================================

   POST { "partIndex"?: number }

   ═══ ⚠️ ليه جزء واحد في كل طلب ═══
   مزوّد Groq عليه **حدّ ٨٠٠٠ توكن/دقيقة** (TPM) للموديل
   `openai/gpt-oss-120b`. والقطعة الواحدة ≈ ٦٠٠٠ حرف (≈ ٢٥٠٠ توكن
   مدخل) + مخرج JSON (≈ ١٠٠٠ توكن) ⇒ **≈ ٣٥٠٠ توكن للنداء الواحد**.

   النسخة الأولى كانت بتولّد كل القطع **بالتوازي** ⇒ ٧ قطع × ٣٥٠٠ =
   ~٢٤٥٠٠ توكن/دقيقة ≫ ٨٠٠٠ ⇒ **كل** النداءات الباقية رجعت 429
   ونتج عنها `All AI candidates failed` و `malformed JSON`.

   ⇒ الطلب ده بيمثّل **جزء واحد** بس. ساعتها:
     - استهلاك داخل حدّ الـ TPM (نداء ≈ ٣٥٠٠ توكن)
     - الطلب سريع (مش timeout — رجع ٤٥ ثانية بـ ٧ قطع بالتوازي)
     - الطالب يتحكم في السرعة ⇒ الـ credits بتتصرف على اللي بيقراه
     - كل جزء بيتحفظ لحظه ⇒ refresh مبيضيّعشش تقدم

   ═══ ترتيب الحمايات (مقصود، مش اعتباطي) ═══
     1. جلسة؟ لو لأ → 401.
     2. جلب المحاضرة **بفلتر المستخدم** → لو مش موجودة → 404.
     3. تفريغ فاضي؟ → 422.
     4. **مفيش مقاطع/توقيتات؟ → 422** — ⚠️ دي حماية جوهرية: من غير
        توقيتات مفيش citations، فالرجوع بشرح من غير مصادر هيكسر
        الوعد الأساسي للميزة («كل جملة ليها مصدر»).
     5. **حارس الكروت والـ rate limit → 429/403/402** (قبل أي نداء).
     6. نداء الموديل (**واحد**).
     7. حفظ الجزء (patch على `intensive_explanation` بس).

   ═══ مافيش في الرد ═══
   ولا مفتاح، ولا اسم مزوّد، ولا stack، ولا نص التفريغ. الرد فيه
   المحتوى المولّد بس.
   ========================================================================== */

/**
 * أقصى مدة تنفيذ.
 *
 * ⚠️ الطلب ده **نداء واحد** ⇒ ~١٥ ثانية في العادي. الـ ٣٠٠留下 حد
 *    مريح لو المزوّد اتأخر.
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
    // ⚠️ الفلتر ده **مكمّل** لـ RLS مش بديل.
    const { data: lecture, error: fetchError } = await supabase
      .from("lectures")
      .select("id, transcript_text, transcript_data, duration_seconds, intensive_explanation")
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
    //    الوعد الأساسي («كل جملة ليها مصدر»)، فبنرفض بوضوح.
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

    // ── خطة الأجزاء (من المقاطع) ──
    const plan = planParts(segments, INTENSIVE_CHUNK_CHARS);
    if (plan.length > MAX_INTENSIVE_CHUNKS) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CHUNK_LIMIT_EXCEEDED",
            message: "المحاضرة دي طويلة أوي على الشرح المكثف. جرّب محاضرة أقصر.",
          },
        },
        { status: 422 },
      );
    }

    // ── ٥) أي جزء نولّده؟ ──
    // ⚠️ `partIndex` من الـ body — **مش** من الـ URL. والرقم بيتحقق
    //    هنا (مش بيتسأل على قاعدة البيانات).
    const body = (await request.json().catch(() => null)) as
      | { partIndex?: unknown }
      | null;
    const requested = body?.partIndex;
    let partIndex =
      typeof requested === "number" && Number.isInteger(requested) ? requested : null;
    if (partIndex !== null && (partIndex < 0 || partIndex >= plan.length)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BAD_PART_INDEX",
            message: `الجزء ده مش موجود. المحاضرة فيها ${plan.length} أجزاء.`,
          },
        },
        { status: 400 },
      );
    }

    // الحالة المحفوظة (مطابَقة مع خطة الأجزاء الحالية)
    const state = reconcileExplanation(lecture.intensive_explanation, plan);

    // ⚠️ من غير `partIndex` ⇒ أول جزء لسه مش متولّد (أو أول جزء فاشل).
    if (partIndex === null) {
      const next = state.parts.find((p) => p.status !== "ready");
      partIndex = next ? next.index : 0;
    }

    const part = plan[partIndex];

    // ── ٦) حارس الكروت — **قبل أي نداء للموديل** ──
    // ⚠️ **كل جزء = credit واحد.** ده مقصود: التوليد on-demand معناه إن
    //    الطالب بيدفع على الأجزاء اللي بيقراها فعلاً. والـ credit
    //    محجوز **قبل** النداء، فلو النداء فشل بيرجع (refund).
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

    // ── ٧) التوليد ثم الحفظ ──
    const usage = resolveUsageRequestContext(request, user.id, {
      feature: "lecture_intensive",
    });

    let nextState: IntensiveExplanation;
    try {
      const generated = await generateIntensivePart({
        part,
        segments,
        durationSeconds:
          typeof lecture.duration_seconds === "number" ? lecture.duration_seconds : null,
        deps: {
          runTask: runAiTask,
          chunkChars: INTENSIVE_CHUNK_CHARS,
        },
        totalParts: plan.length,
        // ⚠️ السياق لازم يعدّي — من غيره الاستهلاك مش هيتسجّل على
        //    العملية (operation_id / idempotency_key).
        usage,
      });

      nextState = {
        ...state,
        model: generated.model || state.model,
        parts: state.parts.map((p) =>
          p.index === partIndex
            ? {
                ...p,
                status: "ready" as const,
                generated_at: new Date().toISOString(),
                error: null,
                sections: generated.sections,
              }
            : p,
        ),
      };

      await saveIntensiveExplanation({
        supabase,
        lectureId: lecture.id,
        userId: user.id,
        explanation: nextState,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);

      // ⚠️ **الجزء ده فشل بس** — الباقي سليم. فبنحفظ الحالة بتاعته
      //    كـ "failed" (مع الرسالة) عشان الواجهة تقدر تعرض زرار
      //    «أعد المحاولة» للجزء ده ** بس**، من غير ما نضيّع باقي الأجزاء.
      if (error instanceof IntensiveError) {
        await saveIntensiveExplanation({
          supabase,
          lectureId: lecture.id,
          userId: user.id,
          explanation: {
            ...state,
            parts: state.parts.map((p) =>
              p.index === partIndex
                ? { ...p, status: "failed" as const, error: error.message }
                : p,
            ),
          },
        }).catch(() => undefined);
      }

      throw error;
    }

    const readyCount = nextState.parts.filter((p) => p.status === "ready").length;
    const nextPending = nextState.parts.find((p) => p.status !== "ready");

    console.log(
      `lectures/intensive: part ${partIndex + 1}/${plan.length} ok sections=${nextState.parts[partIndex].sections.length} ready=${readyCount} refId=${guard.refId}`,
    );

    return NextResponse.json({
      success: true,
      lectureId: lecture.id,
      part: nextState.parts[partIndex],
      // ⚠️ الحالة الكاملة — عشان الكلاينت يبقى عنده مصدر الحقيقة
      //    (الأجزاء اللي اتولّدت + الباقي لسه pending) من غير ما
      //    يعمل re-fetch.
      explanation: nextState,
      total_parts: plan.length,
      ready_parts: readyCount,
      // ⚠️ `next_pending` = الجزء اللي المفروض الطالب يضغط «التالي» بعده.
      next_pending: nextPending ? nextPending.index : null,
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
        {
          status: error.status,
          ...(error.retryAfter ? { headers: { "Retry-After": String(error.retryAfter) } } : {}),
        },
      );
    }

    // ⚠️ **الـ 429 من المزوّد**: المزوّد خلص حدّه بالتوكن/الدقيقة.
    //    ده مش خطأ في الكود — الطالب لازم يستنى شوية. بنرجّع رسالة
    //    واضحة مع `Retry-After` بدل «حصل خطأ».
    if (isProviderRateLimit(error)) {
      void recordRuntimeError({
        route: "/api/lectures/[id]/intensive",
        feature: "lecture",
        category: "rate_limit",
        errorType: "PROVIDER_RATE_LIMIT",
        traceId,
        outcome: "failed",
        message: "provider rate limit",
        userId: null,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PROVIDER_RATE_LIMIT",
            message:
              "الخدمة مشغولة دلوقتي (حدّ الطلبات على الموديل). استنى ٣٠ ثانية وجرّب تاني.",
          },
        },
        { status: 429, headers: { "Retry-After": "30" } },
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
          message: "مقدرناش نجهّز الجزء ده دلوقتي. جرّب تاني كمان شوية.",
        },
      },
      { status: 502 },
    );
  }
}
