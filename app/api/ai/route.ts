import { NextResponse } from "next/server";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { resolveActor } from "@/lib/policy";
import {
  isImplementedAiTask,
  runAiTask,
  toAiPublicError,
  generateImageWithFallback,
  generateVideoWithFallback,
  type AiTaskResult,
  type AiUserContext,
} from "@/lib/ai/router";
import { recordAiOperation } from "@/lib/ai/operations";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";
import { streamWithFallback } from "@/lib/ai/streaming-fallback";
import { checkSubscriptionQuotas } from "@/lib/ai/quota-check";

/**
 * /api/ai â€” ط§ظ„ظ…ط¯ط®ظ„ ط§ظ„ظ…ط±ظƒط²ظٹ ظ„ظƒظ„ ظ…ظ‡ط§ظ… ط§ظ„ط°ظƒط§ط، ط§ظ„ط§طµط·ظ†ط§ط¹ظٹ.
 *
 * ط§ظ„ط·ظ„ط¨:   { task, messages, options?, stream? }
 * ط§ظ„ط±ط¯:    JSON ظ…ظˆط­ظ‘ط¯ { success, data } ط£ظˆ SSE ط¨ظ†ظپط³ chunk ط§ظ„ظ…ظˆط­ظ‘ط¯ ظ…ظ† lib/ai/streaming.
 * ط§ظ„ط£ط®ط·ط§ط،: { success:false, error:{ code, message, retryable } } â€” ط¨ط¯ظˆظ† ط£ظٹ طھظپط§طµظٹظ„ ظ…ط²ظˆظ‘ط¯ظٹظ†.
 */

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

/** ط£ظƒظˆط§ط¯ ط§ظ„ط®ط·ط£ ط§ظ„ط¹ط§ظ…ط© â†’ ط­ط§ظ„ط© HTTP ظ„ظ„ظ…طھطµظپط­. */
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
  // ط§ظ„ط³ظٹط§ظ‚ ط§ظ„ظ‚ط§ط¯ظ… ظ…ظ† ط§ظ„ظƒظ„ط§ظٹظ†طھ ظ„ظ„ظ‚ط±ط§ط،ط© ظپظ‚ط·ط› ط§ظ„ظ‡ظˆظٹط© ط§ظ„ط­ظ‚ظٹظ‚ظٹط© ط¨طھطھط­ط¯ط¯ ظ…ظ† ط§ظ„ط¬ظ„ط³ط© طھط­طھ.
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
  // ظپط­طµ ط¬ط§ظ‡ط²ظٹط© ط¨ط¯ظˆظ† ط£ظٹ ظ‚ظٹظ… ط­ط³ط§ط³ط© â€” ط£ط³ظ…ط§ط، ط§ظ„ظ…ظ‡ط§ظ… ظˆط­ط§ظ„ط© ط§ظ„طھظ‡ظٹط¦ط© ظپظ‚ط· (boolean).
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

    // ط§ظ„ظپط­طµ ط§ظ„ظ…ط±ظƒط²ظٹ ظ„ظ„ظƒظˆطھط© + ط§ظ„ظ…ظپطھط§ط­ ط§ظ„ط°ظƒظٹ ط§ظ„ظپط±ظٹط¯ (idempotency + fail-open/fail-closed)
    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuotas(user.id, "message", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "MESSAGE_QUOTA_EXCEEDED", message: quota.reasonAr ?? "طھظ… طھط¬ط§ظˆط² ط­ط¯ ط±ط³ط§ظٹظ„ ط§ظ„ط¨ط§ظ‚ط©.", retryable: false } },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط¨ط¹ظˆطھط© ط؛ظٹط± طµط§ظ„ط­ط©.", retryable: false } },
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
        { success: false, error: { code: "INVALID_REQUEST", message: "ظ…ظ‡ظ…ط© ط؛ظٹط± ظ…ط¹ط±ظˆظپط© ط£ظˆ ظ…ط´ ظ…طھط§ط­ط© ط¨ط¹ط¯.", retryable: false } },
        { status: 400 }
      );
    }

    /* ---------------- ظ…ظ‡ط§ظ… ط§ظ„ظˆط³ط§ط¦ط· (Media Router) ---------------- */
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
          { success: false, error: { code: "INVALID_REQUEST", message: "ط§ظƒطھط¨ ظˆطµظپ ظˆط§ط¶ط­ ظ„ظ„طµظˆط±ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.", retryable: false } },
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
     * ظ…ظ‡ط§ظ… ط§ظ„ظ†طµظˆطµ: ط¨ط¹ط¯ ط§ط³طھط¨ط¹ط§ط¯ ط§ظ„ظˆط³ط§ط¦ط· ظپظˆظ‚طŒ ط§ظ„ظپط­طµ ط¯ظ‡ ط¨ظٹط¶ظٹظ‘ظ‚ ط§ظ„ظ†ظˆط¹
     * ظ„ظ„ظ…ظ‡ط§ظ… ط§ظ„ظ…ظ†ظپط°ط© ظپط¹ظ„ظٹظ‹ط§ (chat/explain/tutor) ظ‚ط¨ظ„ ط£ظٹ ط§ط³طھط®ط¯ط§ظ….
     */
    if (!isImplementedAiTask(task)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "ظ…ظ‡ظ…ط© ط؛ظٹط± ظ…ط¹ط±ظˆظپط© ط£ظˆ ظ…ط´ ظ…طھط§ط­ط© ط¨ط¹ط¯.", retryable: false } },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "ظ…ظپظٹط´ ط±ط³ط§ظٹظ„ ظ…ط¨ط¹ظˆطھط©.", retryable: false } },
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
        { success: false, error: { code: "INVALID_REQUEST", message: "ظ…ظپظٹط´ ط±ط³ط§ظٹظ„ طµط§ظ„ط­ط© ظ„ظ„ط¥ط±ط³ط§ظ„.", retryable: false } },
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

    /* ---------------- ظˆط¶ط¹ ط§ظ„ط¨ط« (SSE) ---------------- */
    if (stream === true) {
      // Phase H: credit/entitlement gate even for streaming (same cost)
      const candidates = routeCandidates(task);
      const hasEnt = async (k: string, v: string) => {
        try {
          const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
          return Boolean(data);
        } catch (e) {
          console.error("[api/ai] has_entitlement failed:", e);
          return false;
        }
      };
      let accessible = candidates;
      try {
        accessible = await filterAccessibleModels(candidates, hasEnt);
      } catch (e) {
        console.error("[api/ai] filterAccessibleModels failed:", e);
        accessible = candidates;
      }
      if (accessible.length === 0 && candidates.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: "MODEL_ACCESS_REQUIRED", message: "ظ‡ط°ظ‡ ط§ظ„ظ…ظ‡ظ…ط© طھطھط·ظ„ط¨ طµظ„ط§ط­ظٹط©. ط§ط´طھط±ظگظ‡ط§ ظ…ظ† ط§ظ„ظ…طھط¬ط±.", retryable: false } },
          { status: 403 }
        );
      }
      // \ud83e\udde1 C4-FINAL: \u0647\u0648\u064a\u0629 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0645\u0646\u0637\u0642\u064a \u2014 \u062a\u062a\u0643\u0631\u0631 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0648\u0628\u062a\u0646\u0642\u0644 \u0644\u0643\u0644 \u0627\u0644\u0641\u0631\u0639\u064a\u0646.
    const usageContext = resolveUsageRequestContext(req, user.id, { feature: task });
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
      if (!guard.ok) return guard.response;
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          let streamFailed = false;
          try {
            const streamTask = (["chat", "explain", "tutor"].includes(task as string)
              ? (task as "chat" | "explain" | "tutor")
              : "chat");
            for await (const chunk of streamWithFallback(streamTask, input, usageContext)) {
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

    /* ---------------- ظˆط¶ط¹ JSON ط§ظ„ظ…ظˆط­ظ‘ط¯ ---------------- */
    // Phase H: entitlement filter + credit reserve before execution
    const candidates = routeCandidates(task);
    const hasEnt = async (k: string, v: string) => {
      try {
        const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
        return Boolean(data);
      } catch (e) {
        console.error("[api/ai] has_entitlement failed:", e);
        return false;
      }
    };
    let accessible = candidates;
    try {
      accessible = await filterAccessibleModels(candidates, hasEnt);
    } catch (e) {
      console.error("[api/ai] filterAccessibleModels failed:", e);
      accessible = candidates;
    }
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "MODEL_ACCESS_REQUIRED", message: "ظ‡ط°ظ‡ ط§ظ„ظ…ظ‡ظ…ط© طھطھط·ظ„ط¨ طµظ„ط§ط­ظٹط©. ط§ط´طھط±ظگظ‡ط§ ظ…ظ† ط§ظ„ظ…طھط¬ط±.", retryable: false } },
        { status: 403 }
      );
    }
    // \ud83e\udde1 C4-FINAL: \u0647\u0648\u064a\u0629 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0645\u0646\u0637\u0642\u064a \u2014 \u062a\u062a\u0643\u0631\u0631 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0648\u0628\u062a\u0646\u0642\u0644 \u0644\u0643\u0644 \u0627\u0644\u0641\u0631\u0639\u064a\u0646.
    const usageContext = resolveUsageRequestContext(req, user.id, { feature: task });
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    const startedAt = Date.now();
    try {
      const result: AiTaskResult = await runAiTask(task, { ...input, usage: usageContext });
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
      // ط³ط¬ظ„ ظ…ط±ط§ظ‚ط¨ط© ط¢ظ…ظ† â€” ط¨ط¯ظˆظ† ط£ظٹ ظ…ط­طھظˆظ‰ ط·ظ„ط¨/ط§ط³طھط¬ط§ط¨ط© ط£ظˆ ظ…ظپط§طھظٹط­.
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
  } catch (error: any) {
    console.error("=== FATAL API ERROR ===");
    console.error(error);
    console.error("Message:", error?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNKNOWN", message: "ط­طµظ„ ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، ط§ظ„ط§طھطµط§ظ„.", retryable: false },
      },
      { status: 500 }
    );
  }
}

