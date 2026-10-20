import { NextResponse } from "next/server";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { buildMagiclySystemPrompt, getStudentContext, getStudyToolFacts, parseMode, rememberSessionContext, type MagiclyContextInput } from "@/lib/magicly-ai";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { resolveActor } from "@/lib/policy";
import { refreshModelStateCache } from "@/lib/ai/model-state";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels, CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";

/** أقصى عدد رسايل بنمررها للموديل (الأحدث بس). */
const MAX_MESSAGES = 30;
/** أقصى طول لأي رسالة واحدة. */
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

/**
 * /api/ai/generate — مسار للميزات الأساسية (الشرح، الملخص، الخطط، الأسئلة، الاختبارات)
 * بدون checkSubscriptionQuota — الميزات الأساسية مفتوحة للجميع دون خصم من كوتة الشات bot.
 * الشات bot فقط هو الذي يبقى على /api/chat مع الكوتة.
 */
export async function POST(req: Request) {
  try {
    // ١) لازم يكون مسجّل دخول
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // ٢) حدّ استخدام خفيف لكل مستخدم عشان فاتورة Groq (بدون كوتة shoutbot)
    const limited = checkRateLimit(`ai:generate:${user.id}`, 30, 60_000, "message");
    if (limited) return limited;

    // ٢.٥) تحديث حالة الموديلات من الداتابيز (fail-open)
    await refreshModelStateCache();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: { message: "البيانات المبعوتة غير صالحة." } },
        { status: 400 }
      );
    }

    const { messages, mode, context, systemInstruction } = body as {
      messages?: unknown;
      mode?: unknown;
      context?: MagiclyContextInput;
      systemInstruction?: string;
      conversationId?: unknown;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: { message: "مفيش رسايل مبعوتة." } },
        { status: 400 }
      );
    }

    const safeMessages = (messages as IncomingMessage[])
      .slice(-MAX_MESSAGES)
      .filter(
        (m) => m && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string"
      )
      .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: clampText(m.content, MAX_MESSAGE_CHARS) }));

    if (safeMessages.length === 0) {
      return NextResponse.json(
        { error: { message: "الرسايل غير صالحة." } },
        { status: 400 }
      );
    }

    // بناء system prompt باستخدام نفس المنطق في /api/chat
    let combinedSystem = systemInstruction || "";
    if (!combinedSystem) {
      try {
        const studentContext = await getStudentContext(supabase, user.id, context ?? {});
        const studyFacts = await getStudyToolFacts(supabase, user.id, context ?? {}, safeMessages.at(-1)?.content ?? "");
        const selectedMode = parseMode(mode, safeMessages.at(-1)?.content ?? "");
        combinedSystem = buildMagiclySystemPrompt({ ...context, ...studentContext, ...studyFacts }, selectedMode, studyFacts);
      } catch {
        combinedSystem = "أنت مساعد تعليمي يكتب شرحاً واضحاً للمادة بالعربية الفصحى المبسطة.";
      }
    }

    const usage = resolveUsageRequestContext(req, user.id);

    let completion: any;
    try {
      completion = await aiRouter.completeChat("chat", {
        messages: [{ role: "system", content: combinedSystem }, ...safeMessages],
        temperature: 0.7,
        usage,
      });
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      const isRate = error.status === 429;
      const isUnavailable = error.status === 503;
      return NextResponse.json(
        {
          error: {
            message: isRate
              ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية."
              : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.",
            code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          },
        },
        { status: isUnavailable ? 503 : isRate ? 429 : 502 }
      );
    }

    const answer = completion.content;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "ai_generate", status: "completed", usage: completion.usage, contentLength: answer.length });

    return NextResponse.json({
      choices: [{ message: { role: "assistant", content: answer } }],
      ...(completion.provider ? { provider: completion.provider } : {}),
      ...(completion.model ? { model: completion.model } : {}),
    });
  } catch (error) {
    console.error("ai/generate route error:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع أثناء الاتصال.", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}