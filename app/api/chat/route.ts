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
import { filterAccessibleModels, CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";

/** ÃŞÕì ÚÏÏ ÑÓÇíá ÈäãÑÑåÇ ááãæÏíá (ÇáÃÍÏË ÈÓ). */
const MAX_MESSAGES = 30;
/** ÃŞÕì Øæá áÃí ÑÓÇáÉ æÇÍÏÉ. */
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

export async function POST(req: Request) {
  try {
    // 1) áÇÒã íßæä ãÓÌøá ÏÎæá — ÇáÑÇæÊ Ïå ßÇä ãİÊæÍ ááÚÇáã ßáå
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // 2) ÍÏø ÇÓÊÎÏÇã áßá ãÓÊÎÏã ÚÔÇä İÇÊæÑÉ Groq
    const limited = checkRateLimit(`chat:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    // 2.5) ßæÊÉ ÇáÇÔÊÑÇß ááÑÓÇíá (Phase 1.5) — messages_per_2h ßÇäÊ ãæÌæÏÉ İí
    // ÇáÏÇÊÇÈíÒ ãä ÛíÑ Ãí İÑÖ İÚáí. İÍÕ + ÇÓÊåáÇß ãä ÇáÓíÑİÑ ŞÈá Ãí ÔÛá ÛÇáí.
    // fail-open ãæËŞ áæ ÌÏÇæá ÇáßæÊÇ áÓå ãÔ ãÊäİĞÉ.
    // ÇáãÇáß (owner) íÊÎØì ÇáÍÏæÏ ÇáÏÇÎáíÉ ááãäÕÉ Ïæä ÇÓÊåáÇß ßæÊÉ.
    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "message", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: {
            message:
              quota.reasonAr ??
              "áŞÏ æÕáÊ ááÍÏ ÇáÃŞÕì ááãÍÇÏËÉ ãÚ ÇáãÓÇÚÏ ÇáĞßí (30 ÑÓÇáÉ). ÇáãíÒÇÊ ÇáÃÓÇÓíÉ (ÇáÔÑÍ æÇáÃÓÆáÉ æÇáÇÎÊÈÇÑÇÊ) ãÇ ÒÇáÊ ãÊÇÍÉ áß ÈÏæä ÍÏæÏ.",
            code: "MESSAGE_QUOTA_EXCEEDED",
          },
        },
        { status: 429 }
      );
    }

    // 2.6) ÊÍÏíË ÍÇáÉ ÇáãæÏíáÇÊ ãä ÇáÏÇÊÇÈíÒ (Phase 2) — ÊÈÏíáÇÊ ÇáÃÏãä
    // (enabled/priority/daily_limit İí ai_models) ÈŞÊ ÈÊÃËÑ İÚáíğÇ İí ÇáÑÇæÊÑ.
    // TTL 30 ËÇäíÉ + fail-open ãæËŞ¡ İãİíÔ ÖÑÈÉ DB ãÚ ßá ÑÓÇáÉ.
    await refreshModelStateCache();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: { message: "ÇáÈíÇäÇÊ ÇáãÈÚæÊÉ ÛíÑ ÕÇáÍÉ." } },
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
        { error: { message: "ãİíÔ ÑÓÇíá ãÈÚæÊÉ." } },
        { status: 400 }
      );
    }

    // 3) ÊäÖíİ ÇáÑÓÇíá: ÇáÃÏæÇÑ ÇáãÓãæÍÉ ÈÓ¡ æäÕ ãŞÕæÕ
    const safeMessages = (messages as IncomingMessage[])
      .slice(-MAX_MESSAGES)
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
        { error: { message: "ãİíÔ ÑÓÇíá ÕÇáÍÉ ááÅÑÓÇá." } },
        { status: 400 }
      );
    }

    // ÇáÜ prompt ÈŞì Úáì ÇáÓíÑİÑ. ÇáßáÇíäÊ íãÑÑ ÓíÇŞğÇ ãÍÏæÏğÇ İŞØ¡ áßä
    // ãÕÏÑ ÇáÍŞíŞÉ (ÇáÊŞÏã æÇáÏÑÓ) íõŞÑÃ ãä ÍÓÇÈ ÇáãÓÊÎÏã äİÓå.
    const studentContext = await getStudentContext(supabase, user.id, context ?? {});
    const selectedMode = parseMode(mode, safeMessages.at(-1)?.content ?? "");
    const toolFacts = await getStudyToolFacts(supabase, user.id, context ?? {}, safeMessages.at(-1)?.content ?? "");
    const system = buildMagiclySystemPrompt(studentContext, selectedMode, toolFacts);

    // ÏãÌ ÔÎÕíÉ ÇáØÇáÈ (Persona Builder) ãÚ ÇáÈÑæãÈÊ ÇáÃÓÇÓí
    let personaPrompt = "";
    try {
      personaPrompt = await buildSystemPrompt(user.id);
    } catch (e) {
      console.warn("Persona prompt build failed, falling back to base system prompt:", e);
    }
    const combinedSystem = personaPrompt ? `${personaPrompt}\n\n--- ÇáÓíÇŞ ÇáÊÚáíãí ÇáÅÖÇİí ---\n${system}` : system;
    void rememberSessionContext(supabase, user.id, studentContext, safeMessages.at(-1)?.content ?? "");

    // Phase H: entitlement filter + 1 credit gate (403 before reserve)
    const candidates = routeCandidates("chat");
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json({ error: { message: "åĞå ÇáãåãÉ ÊÊØáÈ ÕáÇÍíÉ. ÇÔÊÑöåÇ ãä ÇáãÊÌÑ.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? CURRENT_AI_MODEL);
    if (!guard.ok) return guard.response;

    let completion;
    try {
      // ?? Phase 5-C3 (pilot) — ÊæáíÏ åæíÉ ÇáØáÈ ÇáãäØŞí **ãÑÉ æÇÍÏÉ**
      // åäÇ¡ ÚäÏ ÍÏø ÇáØáÈ. æÈÚÏíä ÈÊÊäŞøá Òí ãÇ åí áßá ãÍÇæáÉ ãÒæøÏ
      // Ìæå `completeChatInner` — ãä ÛíÑ ãÇ ÊÊÛíøÑ (ãÇİíÔ Ãí ÍÏ ÈíßÊÈ
      // İíåÇ). `attemptNo` åæ ÇáæÍíÏ Çááí ÈíÊÛíøÑ Èíä ÇáãÍÇæáÇÊ.
      //
      // ?? **Óáæß ãÍİæÙ 100%:** ÇáÓØÑ Ïå ÈíŞÑÇ header æÈíæáøÏ UUID İŞØ.
      //   ãÇİíÔ ÊÛííÑ İí ÇáÜ guard æáÇ ÇáÜ limits æáÇ ÇáÜ credit æáÇ
      //   ÊÑÊíÈ ÇáãÒæøÏíä æáÇ ÇáÜ fallback æáÇ Ôßá ÇáÑÏ.
      const usage = resolveUsageRequestContext(req, user.id);

      completion = await aiRouter.completeChat("chat", {
        messages: [{ role: "system", content: combinedSystem }, ...safeMessages],
        temperature: 0.7,
        usage,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (!(error instanceof AiProviderError)) throw error;
      const isRate = error.status === 429;
      const isUnavailable = error.status === 503;
      return NextResponse.json(
        {
          error: {
            message: isRate
              ? "ÇáÎÏãÉ ãÔÛæáÉ ÏáæŞÊí. ÍÇæá ÊÇäí ÈÚÏ ÔæíÉ."
              : "ÍÕá ÎØÃ ÃËäÇÁ ÇáÇÊÕÇá ÈÇáãÓÇÚÏ. ÍÇæá ÊÇäí.",
            code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          },
        },
        { status: isUnavailable ? 503 : isRate ? 429 : 502 }
      );
    }

    const data = completion.payload;
    const answer = completion.content;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

    // ÇáÍİÙ best-effort: áæ migration ÇáãÍÇÏËÇÊ áÓå ãÇ ÇÊÔÛáÊÔ¡ ÇáÔÇÊ
    // íİÖá ÔÛøÇá æáÇ äÍÑã ÇáØÇáÈ ãä ÇáÑÏ ÈÓÈÈ ãíÒÉ ÊÇÑíÎ ÅÖÇİíÉ.
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
          // ãÚÑİ ãÍÇÏËÉ ãä ÍÓÇÈ ÂÎÑ áÇ íõÓÊÎÏã ÃÈÏğÇ¡ ÍÊì áæ ÚÑİå Úãíá
          // ÎÈíËº ääÔÆ ÌáÓÉ ÌÏíÏÉ ÈÏá ÊáæíË ÊÇÑíÎ ÇáãÓÊÎÏã ÇáÂÎÑ.
          if (!ownedConversation) savedConversationId = "";
        }
        if (!savedConversationId) {
          const { data: conversation } = await supabase
            .from("chat_conversations")
            .insert({ user_id: user.id, title: safeMessages.at(-1)?.content.slice(0, 80) || "ãÍÇÏËÉ ÌÏíÏÉ" })
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
      conversationId: savedConversationId || undefined,
      suggestedAgent: suggestAgentFromText(safeMessages.at(-1)?.content ?? "") ?? undefined,
    });
  } catch (error) {
    console.error("chat route error:", error);
    return NextResponse.json(
      { error: { message: "ÍÕá ÎØÃ ÛíÑ ãÊæŞÚ ÃËäÇÁ ÇáÇÊÕÇá.", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
