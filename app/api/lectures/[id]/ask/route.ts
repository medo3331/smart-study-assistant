import { NextResponse } from "next/server";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { recordRuntimeError, createTraceId, classifyError } from "@/lib/runtime-errors";

import { createClient } from "@/lib/supabase/server";
import {
  extractSegments,
  isProviderRateLimit,
  planParts,
  reconcileExplanation,
  type TimedSegment,
} from "@/lib/ai/lecture-intensive";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { runAiTask } from "@/lib/ai/tasks/runner";
import { INTENSIVE_CHUNK_CHARS } from "@/lib/ai/lecture-intensive-prompts";
import { GROUNDING_RULES } from "@/lib/ai/lecture-prompts";
import type { AiChatMessage } from "@/lib/ai/types";

/* ==========================================================================
   💬 /api/lectures/[id]/ask — سؤال على جزء محدّد من المحاضرة
   ============================================================================

   POST { "partIndex": number, "question": string }

   ═══ ليه partIndex ضروري ═══
   المساعد العام بيبعت أول ٨٠٠٠ حرف من النص المسطّح (شوف
   `lib/ai/workspace-source-context.ts:111`) — نص **مسطّح** من غير
   توقيتات، ومقطوع في النص. فالإجابة مش مربوطة بالجزء اللي الطالب
   بيقراه، وممكن تقتبس من مكان تاني في المحاضرة.

   هنا: السياق = **مقاطع الجزء ده بس** (٥..١٠ دقايق) وبتوقيتها.
   فالإجابة مرتبطة بالجزء بالظبط، والـ citations بتشير لمقاطع الجزء ده.

   ═══ الميزانية ═══
   نداء **واحد** بالمقطع ≈ ٢٥٠٠ توكن مدخل + ≈ ٦٠٠ توكن مخرج
   ⇒ ~٣١٠٠ توكن. داخل حدّ الـ ٨٠٠٠/دقيقة بتاع المزوّد.

   ═══ نفس قواعد الحماية بتاعت `/intensive` ═══
   جلسة → جلب بفلتر المستخدم → تفريغ → توقيتات → حارس الكروت **قبل**
   أي نداء → نداء → رد. ومافيش نص التفريغ في الرد.
   ========================================================================== */

/** أقصى مدة تنفيذ — نداء واحد. */
export const maxDuration = 60;

/** الموديل اللي بيتحجّم عليه. */
const GUARD_MODEL_ID = "openai/gpt-oss-120b";

/** أقصى طول للسؤال. */
const MAX_QUESTION_CHARS = 500;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const traceId = createTraceId();
  try {
    // ── ١) المصادقة ──
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

    // ── ٢) الـ body ──
    const body = (await request.json().catch(() => null)) as
      | { partIndex?: unknown; question?: unknown }
      | null;
    const question =
      typeof body?.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
    if (question === "") {
      return NextResponse.json(
        { success: false, error: { code: "NO_QUESTION", message: "اكتب سؤال الأول." } },
        { status: 400 },
      );
    }
    if (
      typeof body?.partIndex !== "number" ||
      !Number.isInteger(body.partIndex) ||
      body.partIndex < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_PART_INDEX", message: "لازم تحدّد رقم الجزء." },
        },
        { status: 400 },
      );
    }
    const partIndex = body.partIndex;

    // ── ٣) جلب المحاضرة بفلتر المستخدم ──
    const { data: lecture, error: fetchError } = await supabase
      .from("lectures")
      .select("id, transcript_text, transcript_data, duration_seconds, intensive_explanation")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error(`lectures/ask: فشل جلب المحاضرة [${fetchError.code ?? "no-code"}]`);
      return NextResponse.json(
        {
          success: false,
          error: { code: "DB_READ_FAILED", message: "مقدرناش نقرأ المحاضرة. جرّب تاني." },
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

    // ── ٤) المقاطع + خطة الأجزاء ──
    const segments = extractSegments(lecture.transcript_data);
    if (segments.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NO_TIMINGS", message: "المحاضرة دي مفيهاش توقيتات." },
        },
        { status: 422 },
      );
    }
    const plan = planParts(segments, INTENSIVE_CHUNK_CHARS);
    if (partIndex >= plan.length) {
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
    const part = plan[partIndex];

    // ── ٥) حارس الكروت — **قبل** أي نداء ──
    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);
    if (!guard.ok) {
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

    // ── ٦) نداء واحد ──
    const usage = resolveUsageRequestContext(request, user.id, {
      feature: "lecture_ask",
    });

    let answer: string;
    try {
      const result = await runAiTask("chat", {
        usage,
        messages: buildAskMessages(question, part.segments, partIndex, plan.length),
        // ⚠️ السقف لازم — موديل gpt-oss استدلال، ومن غيره المزوّد بيحط
        //    سقف افتراضي صغير فالموديل بيصرفه على التفكير ويطلع فاضي.
        //    ٢٠٤٨: السؤال إجابته قصيرة، فالسقف ده كفاية ويوفّر توكنز.
        options: { temperature: 0.3, maxTokens: 2_048 },
      });
      answer = result.content.trim() || "مقدرنش أجب على السؤال ده.";
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw error;
    }

    // ── ٧) الرد ──
    // ⚠️ `sources` = مقاطع الجزء ده بس — عشان الواجهة تقدر تربط
    //    إجابة السؤال بمصدرها في التفريغ.
    const state = reconcileExplanation(lecture.intensive_explanation, plan);
    const partState = state.parts[partIndex];

    return NextResponse.json({
      success: true,
      lectureId: lecture.id,
      part_index: partIndex,
      answer,
      // المصادر: مراجع الجزء المتولّد (لو اتولّد) + كل مقاطع الجزء.
      sources: partState?.sections
        .flatMap((section) =>
          section.claims
            .filter((claim) => claim.seg !== null)
            .map((claim) => ({ seg: claim.seg as number, start: claim.start as number })),
        )
        .slice(0, 12),
    });
  } catch (error) {
    if (isProviderRateLimit(error)) {
      void recordRuntimeError({
        route: "/api/lectures/[id]/ask",
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

    console.error("lectures/ask: خطأ", error);
    void recordRuntimeError({
      route: "/api/lectures/[id]/ask",
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
          code: "ASK_FAILED",
          message: "مقدرنش أجيب على السؤال دلوقتي. جرّب تاني كمان شوية.",
        },
      },
      { status: 502 },
    );
  }
}

/**
 * يبني رسائل سؤال على جزء محدّد.
 *
 * ⚠️ **ليه بنمرّر التوقيتات للموديل هنا** (خلافاً للشرح المكثف): السؤال
 *    جملة حرة، والموديل بيرجع نص. هنا بنحتاجه يلاقي **من أين** جاوب،
 *    فبنطلب منه يذكر أرقام المقاطع اللي استند إليها. والـ validation
 *    بعد ذلك (في الواجهة/الراوت) يتأكد إن الأرقام دي من الجزء ده.
 */
function buildAskMessages(
  question: string,
  partSegments: TimedSegment[],
  partIndex: number,
  totalParts: number,
): AiChatMessage[] {
  const context = partSegments.map((s) => `[S${s.index}] ${s.text}`).join("\n");

  const system = [
    "أنت «ماجيكلي»، مساعد مذاكرة. بتجيب على سؤال الطالب **من الجزء ده من المحاضرة بس**.",
    "",
    "المطلوب:",
    "• أجب بالعربية بوضوح، وركّز على اللي في الجزء المحدد.",
    "• لو الإجابة مش موجودة في الجزء ده، قول «مش مذكور في الجزء ده» — متخمّنش من بتاعك.",
    "• في آخر ردّك، اذكر أرقام المقاطع اللي اعتمدت عليها في سطر زي:",
    "  المصادر: S12، S15",
    "",
    GROUNDING_RULES,
  ].join("\n");

  const user = [
    `ده الجزء ${partIndex + 1} من ${totalParts} في المحاضرة.`,
    "",
    context,
    "",
    `سؤال الطالب: ${question}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
