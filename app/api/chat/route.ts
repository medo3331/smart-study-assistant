import { NextResponse } from "next/server";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { suggestAgentFromText } from "@/lib/ai/agents";
import { buildMagiclySystemPrompt, getStudentContext, getStudyToolFacts, parseMode, rememberSessionContext, type MagiclyContextInput } from "@/lib/magicly-ai";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { checkSubscriptionQuota } from "@/lib/ai/quota-check";
import { resolveActor } from "@/lib/policy";
import { refreshModelStateCache } from "@/lib/ai/model-state";
import { routeCandidates } from "@/lib/ai/routing";
import { acquireAiSlot } from "@/lib/ai/concurrency";
import { withProviderRetry } from "@/lib/ai/provider-retry";
import { filterAccessibleModels, CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { recordRuntimeError, createTraceId, classifyError } from "@/lib/runtime-errors";

/**                                          ). */
const MAX_MESSAGES = 30;
/**                         . */
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

export async function POST(req: Request) {
  const traceId = createTraceId();
  try {
    // 1) Require user
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // 2)                                    Groq
    const limited = checkRateLimit(`chat:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    // 2.5)                       (Phase 1.5)   messages_per_2h               
    //                                   +                                    
    // fail-open                                    
    //        (owner)                                              .
    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "message", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: {
            message:
              quota.reasonAr ??
              "                                                30       .                  (                          )                            ",
            code: "MESSAGE_QUOTA_EXCEEDED",
          },
        },
        { status: 429 }
      );
    }

    // 2.6)                                   (Phase 2)                      // (enabled/priority/daily_limit    ai_models)                            .
    // TTL 30       + fail-open                  DB             
    await refreshModelStateCache();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: { message: "                           ." } },
        { status: 400 }
      );
    }

    const { messages, mode, context } = body as {
      messages?: unknown;
      mode?: unknown;
      context?: MagiclyContextInput;
      conversationId?: unknown;
    };
    const conversationId = typeof (body as { conversationId?: unknown }).conversationId === "string"
      ? clampText((body as { conversationId: string }).conversationId, 80)
      : "";

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: { message: "                 ." } },
        { status: 400 }
      );
    }

    // 3) const safeMessages = (messages as IncomingMessage[])
    const safeMessages = (messages as IncomingMessage[]).slice(-MAX_MESSAGES)
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: clampText(m.content, MAX_MESSAGE_CHARS),
      }));

    if (safeMessages.length === 0) {
      return NextResponse.json(
        { error: { message: "                        ." } },
        { status: 400 }
      );
    }

    //     prompt                                                       
    // Build student context
    const studentContext = await getStudentContext(supabase, user.id, context ?? {});
    const selectedMode = parseMode(mode, safeMessages.at(-1)?.content ?? "");
    const toolFacts = await getStudyToolFacts(supabase, user.id, context ?? {}, safeMessages.at(-1)?.content ?? "");
    const system = buildMagiclySystemPrompt(studentContext, selectedMode, toolFacts);

    let personaPrompt = "";
    // Persona Builder
    try {
      personaPrompt = await buildSystemPrompt(user.id);
    } catch (e) {
      console.warn("Persona prompt build failed, falling back to base system prompt:", e);
    }

    const combinedSystem = personaPrompt ? personaPrompt + "\n\n--- Magicly System ---\n" + system : system;
    void rememberSessionContext(supabase, user.id, studentContext, safeMessages.at(-1)?.content ?? "");

    // Phase H: entitlement filter + 1 credit gate (403 before reserve)
    const candidates = routeCandidates("chat");
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json({ error: { message: "                                           ", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? CURRENT_AI_MODEL);
    if (!guard.ok) return guard.response;

    let completion;
    const releaseSlot = await acquireAiSlot();
    try {
      completion = await withProviderRetry(() => aiRouter.completeChat("chat", {
        messages: [{ role: "system", content: combinedSystem }, ...safeMessages],
        temperature: 0.7,
      }));
    } catch (error) {
      void recordRuntimeError({
        route: "/api/chat",
        feature: "chat",
        category: classifyError(error, "provider"),
        errorType: error instanceof Error ? error.name : "Error",
        traceId,
        outcome: "failed",
        message: error instanceof Error ? error.message : String(error),
        userId: user?.id ?? null,
        metadata: { status: (error as { status?: number })?.status },
      });
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (!(error instanceof AiProviderError)) throw error;
      const isRate = error.status === 429;
      const isUnavailable = error.status === 503;
      return NextResponse.json(
        {
          error: {
            message: isRate
              ? "                                         "
              : "                              .           ",
            code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          },
        },
        { status: isUnavailable ? 503 : isRate ? 429 : 502 }
      );
    } finally {
      releaseSlot();
    }

    const data = completion.payload ?? {};
    const answer = completion.content;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

    //       best-effort:    migration                                     //                                                           
    let savedConversationId = conversationId;
    try {
      if (answer) {
        if (savedConversationId) {
          const { data: ownedConversation } = await supabase
            .from("chat_conversations")
            .select("id")
            .eq("id", savedConversationId)
            .eq("user_id", user.id)
            .maybeSingle();
          //                                                           
          //                                                      
          if (!ownedConversation) savedConversationId = "";
        }
        if (!savedConversationId) {
          const { data: conversation } = await supabase
            .from("chat_conversations")
            .insert({ user_id: user.id, title: safeMessages.at(-1)?.content.slice(0, 80) || "            " })
            .select("id")
            .single();
          savedConversationId = conversation?.id ?? "";
        }
        if (savedConversationId) {
          await supabase.from("chat_messages").insert([
            { conversation_id: savedConversationId, user_id: user.id, role: "user", content: safeMessages.at(-1)?.content ?? "" },
            { conversation_id: savedConversationId, user_id: user.id, role: "assistant", content: answer },
          ]);
          await supabase
            .from("chat_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", savedConversationId)
            .eq("user_id", user.id);
        }
      }
    } catch (saveError) {
      console.warn("chat: could not save conversation", saveError);
    }

    return NextResponse.json({
      ...data,
      content: answer,
      message: answer,
      conversationId: savedConversationId || undefined,
      suggestedAgent: suggestAgentFromText(safeMessages.at(-1)?.content ?? "") ?? undefined,
    });
  } catch (error) {
    void recordRuntimeError({
      route: "/api/chat",
      feature: "chat",
      category: classifyError(error, "internal"),
      errorType: error instanceof Error ? error.name : "Error",
      traceId,
      outcome: "failed",
      message: error instanceof Error ? error.message : String(error),
      userId: null,
    });
    console.error("chat route error:", error);
    return NextResponse.json(
      { error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
