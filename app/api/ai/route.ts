import { NextResponse } from "next/server";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import {
  aiRouter,
  isImplementedAiTask,
  runAiTask,
  toAiPublicError,
  streamingAdapterFor,
  generateImageWithFallback,
  generateVideoWithFallback,
  type AiTaskResult,
  type AiUserContext,
} from "@/lib/ai/router";
import { recordAiOperation } from "@/lib/ai/operations";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";

/**
 * /api/ai — المدخل المركزي لكل مهام الذكاء الاصطناعي.
 *
 * الطلب:   { task, messages, options?, stream? }
 * الرد:    JSON موحّد { success, data } أو SSE بنفس chunk الموحّد من lib/ai/streaming.
 * الأخطاء: { success:false, error:{ code, message, retryable } } — بدون أي تفاصيل مزوّدين.
 */

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

/** أكواد الخطأ العامة → حالة HTTP للمتصفح. */
function httpStatusForCode(code: string): number {
  switch (code) {
    case "RATE_LIMIT": return 429;
    case "AUTH_ERROR":
    case "CONFIGURATION_ERROR": return 503;
    case "TIMEOUT": return 504;
    case "NETWORK_ERROR":
    case "MODEL_UNAVAILABLE":
    case "CONTENT_ERROR": return 502;
    case "INVALID_REQUEST": return 400;
    case "MEDIA_MODEL_UNAVAILABLE": return 503;
    default: return 500;
  }
}

function safeUserContext(raw: unknown): AiUserContext | undefined {
  // السياق القادم من الكلاينت للقراءة فقط؛ الهوية الحقيقية بتتحدد من الجلسة تحت.
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as Record<string, unknown>;
  const preferences =
    typeof data.preferences === "object" && data.preferences !== null
      ? Object.fromEntries(
          Object.entries(data.preferences as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k.slice(0, 40), (v as string).slice(0, 200)])
        )
      : undefined;
  const pick = (value: unknown, max = 80) => (typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined);
  const context: AiUserContext = {
    role: pick(data.role),
    language: pick(data.language),
    educationLevel: pick(data.educationLevel),
    ...(preferences ? { preferences } : {}),
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}

export async function GET() {
  // فحص جاهزية بدون أي قيم حساسة — أسماء المهام وحالة التهيئة فقط (boolean).
  const providers = Object.fromEntries(
    (["groq", "nvidia", "openrouter", "gemini"] as const).map((name) => [
      name,
      Boolean(
        name === "groq"
          ? process.env.GROQ_API_KEY?.trim() ||
              process.env.GROQ_API_KEY_1?.trim() ||
              process.env.GROQ_API_KEY_2?.trim() ||
              process.env.GROQ_API_KEY_3?.trim()
          : name === "nvidia"
            ? process.env.NVIDIA_API_KEY?.trim()
            : name === "openrouter"
              ? process.env.OPENROUTER_API_KEY?.trim()
              : process.env.GEMINI_API_KEY?.trim()
      ),
    ])
  );
  return NextResponse.json({
    success: true,
    data: {
      service: "magicly-ai-core",
      freeOnly: process.env.AI_ALLOW_PAID_MODELS?.trim().toLowerCase() !== "true",
      providers,
      tasks: ["chat", "explain", "tutor"],
      plannedTasks: ["summarize", "quiz", "flashcards", "study_plan", "lesson_analysis", "mind_map"],
      mediaTasks: ["image_generation", "image_edit", "video_generation"],
    },
  });
}

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = checkRateLimit(`ai-core:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "البيانات المبعوتة غير صالحة.", retryable: false } },
        { status: 400 }
      );
    }

    const { task, messages, options, user: clientUser, stream } = body as {
      task?: unknown;
      messages?: unknown;
      options?: unknown;
      user?: unknown;
      stream?: unknown;
    };

    if (!isImplementedAiTask(task) && !["image_generation", "image_edit", "video_generation"].includes(task as string)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "مهمة غير معروفة أو مش متاحة بعد.", retryable: false } },
        { status: 400 }
      );
    }

    /* ---------------- مهام الوسائط (Media Router) ---------------- */
    const MEDIA_TASKS = ["image_generation", "image_edit", "video_generation"] as const;
    type MediaTaskId = (typeof MEDIA_TASKS)[number];
    const mediaTask: MediaTaskId | undefined =
      typeof task === "string" && (MEDIA_TASKS as readonly string[]).includes(task)
        ? (task as MediaTaskId)
        : undefined;

    if (mediaTask) {
      const mediaBody = body as { prompt?: unknown; imageInput?: unknown; aspectRatio?: unknown };
      const prompt = typeof mediaBody.prompt === "string" ? mediaBody.prompt.trim().slice(0, 4000) : "";
      const imageInput = typeof mediaBody.imageInput === "string" && mediaBody.imageInput.length > 32
        ? (mediaBody.imageInput.startsWith("data:") ? mediaBody.imageInput.split(",")[1] ?? "" : mediaBody.imageInput).slice(0, 12_000_000)
        : undefined;
      if (prompt.length < 3) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_REQUEST", message: "اكتب وصف واضح للصورة المطلوبة.", retryable: false } },
          { status: 400 }
        );
      }
      const startedAt = Date.now();
      try {
        const outcome =
          mediaTask === "video_generation"
            ? await generateVideoWithFallback({ prompt, imageInput })
            : await generateImageWithFallback(
                mediaTask,
                { prompt, imageInput, ...(typeof mediaBody.aspectRatio === "string" ? { aspectRatio: mediaBody.aspectRatio.slice(0, 20) } : {}) }
              );
        void recordAiOperation(supabase, {
          userId: user.id,
          provider: outcome.result.provider,
          model: outcome.result.model,
          taskType: mediaTask,
          status: "completed",
          contentLength: 0,
          latencyMs: Date.now() - startedAt,
        });
        console.info(`ai-telemetry task=${mediaTask} provider=${outcome.result.provider} model=${outcome.result.model} status=success latency=${Date.now() - startedAt}ms`);
        return NextResponse.json({
          success: true,
          data: { task: mediaTask, ...outcome.result, fallbackAttempts: outcome.attempts.filter((a) => !a.ok).length || undefined },
        });
      } catch (error) {
        const publicError = toAiPublicError(error);
        void recordAiOperation(supabase, {
          userId: user.id,
          provider: "groq",
          model: "media-unavailable",
          taskType: mediaTask,
          status: "failed",
          latencyMs: Date.now() - startedAt,
        }).catch(() => {});
        console.error(`api/ai ${mediaTask}:`, error instanceof Error ? `${error.name}: ${error.message}` : error);
        return NextResponse.json({ success: false, error: publicError }, { status: httpStatusForCode(publicError.code) });
      }
    }

    /*
     * مهام النصوص: بعد استبعاد الوسائط فوق، الفحص ده بيضيّق النوع
     * للمهام المنفذة فعليًا (chat/explain/tutor) قبل أي استخدام.
     */
    if (!isImplementedAiTask(task)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "مهمة غير معروفة أو مش متاحة بعد.", retryable: false } },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "مفيش رسايل مبعوتة.", retryable: false } },
        { status: 400 }
      );
    }

    const safeMessages = (messages as IncomingMessage[])
      .slice(-MAX_MESSAGES)
      .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
      .map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: clampText(m.content, MAX_MESSAGE_CHARS),
      }));

    if (safeMessages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "مفيش رسايل صالحة للإرسال.", retryable: false } },
        { status: 400 }
      );
    }

    const safeOptions: Record<string, unknown> =
      typeof options === "object" && options !== null && !Array.isArray(options)
        ? (options as Record<string, unknown>)
        : {};

    const input = {
      messages: safeMessages,
      options: safeOptions,
      user: { userId: user.id, ...safeUserContext(clientUser) },
    };

    /* ---------------- وضع البث (SSE) ---------------- */
    if (stream === true) {
      // Phase H: credit/entitlement gate even for streaming (same cost)
      const candidates = routeCandidates(task);
      const hasEnt = async (k: string, v: string) => {
        const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
        return Boolean(data);
      };
      const accessible = await filterAccessibleModels(candidates, hasEnt);
      if (accessible.length === 0 && candidates.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: "MODEL_ACCESS_REQUIRED", message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", retryable: false } },
          { status: 403 }
        );
      }
      const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
      if (!guard.ok) return guard.response;
      const providerName = aiRouter.getProviderName(task);
      const adapter = streamingAdapterFor(providerName);
      if (!adapter) {
        await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
        return NextResponse.json(
          { success: false, error: { code: "MODEL_UNAVAILABLE", message: "البث غير متاح لهذه المهمة حاليًا.", retryable: false } },
          { status: 502 }
        );
      }

      const encoder = new TextEncoder();
      const sseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          let streamFailed = false;
          try {
            for await (const chunk of adapter.streamChat(input)) {
              send(chunk);
            }
          } catch (error) {
            streamFailed = true;
            const publicError = toAiPublicError(error);
            console.error("api/ai stream:", error);
            send({ type: "error", error: publicError });
          } finally {
            if (streamFailed) await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    /* ---------------- وضع JSON الموحّد ---------------- */
    // Phase H: entitlement filter + credit reserve before execution
    const candidates = routeCandidates(task);
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "MODEL_ACCESS_REQUIRED", message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", retryable: false } },
        { status: 403 }
      );
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    const startedAt = Date.now();
    try {
      const result: AiTaskResult = await runAiTask(task, input);
      void recordAiOperation(supabase, {
        userId: user.id,
        provider: result.provider,
        model: result.model,
        taskType: task,
        status: "completed",
        usage: result.usage,
        contentLength: result.content.length,
        latencyMs: Date.now() - startedAt,
        fallbackAttempts: result.fallback?.attempts,
      });
      // سجل مراقبة آمن — بدون أي محتوى طلب/استجابة أو مفاتيح.
      console.info(
        [
          "ai-telemetry",
          `task=${task}`,
          `provider=${result.provider}`,
          `model=${result.model}`,
          "status=success",
          `latency=${Date.now() - startedAt}ms`,
          `fallbackDepth=${result.fallback ? Math.max(0, result.fallback.attempts.filter((attempt) => !attempt.ok).length) : 0}`,
        ].join(" ")
      );
      return NextResponse.json({
        success: true,
        data: {
          task: result.task,
          content: result.content,
          provider: result.provider,
          model: result.model,
          usage: result.usage
            ? {
                inputTokens: result.usage.promptTokens,
                outputTokens: result.usage.completionTokens,
                totalTokens:
                  result.usage.promptTokens !== undefined || result.usage.completionTokens !== undefined
                    ? (result.usage.promptTokens ?? 0) + (result.usage.completionTokens ?? 0)
                    : undefined,
              }
            : undefined,
        },
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      const publicError = toAiPublicError(error);
      void recordAiOperation(supabase, {
        userId: user.id,
        provider: "groq",
        model: "unknown",
        taskType: task,
        status: "failed",
        latencyMs: Date.now() - startedAt,
      }).catch(() => {});
      console.error(`api/ai ${task}:`, error instanceof Error ? `${error.name}: ${error.message}` : error);
      return NextResponse.json(
        { success: false, error: publicError },
        { status: httpStatusForCode(publicError.code) }
      );
    }
  } catch (error) {
    console.error("api/ai route error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع أثناء الاتصال.", retryable: false },
      },
      { status: 500 }
    );
  }
}
