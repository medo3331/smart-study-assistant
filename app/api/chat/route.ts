import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { suggestAgentFromText } from "@/lib/ai/agents";
import { type MagiclyContextInput } from "@/lib/magicly-ai";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { checkSubscriptionQuota } from "@/lib/ai/quota-check";
import { resolveActor } from "@/lib/policy";
import { refreshModelStateCache } from "@/lib/ai/model-state";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels, CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";

/** ط£ظ‚طµظ‰ ط¹ط¯ط¯ ط±ط³ط§ظٹظ„ ط¨ظ†ظ…ط±ط±ظ‡ط§ ظ„ظ„ظ…ظˆط¯ظٹظ„ (ط§ظ„ط£ط­ط¯ط« ط¨ط³). */
const MAX_MESSAGES = 30;
/** ط£ظ‚طµظ‰ ط·ظˆظ„ ظ„ط£ظٹ ط±ط³ط§ظ„ط© ظˆط§ط­ط¯ط©. */
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: unknown }).text ?? "") : ""))
      .join(" ");
  }
  return "";
}

export async function POST(req: Request) {
  try {
    // ظ،) ظ„ط§ط²ظ… ظٹظƒظˆظ† ظ…ط³ط¬ظ‘ظ„ ط¯ط®ظˆظ„ â€” ط§ظ„ط±ط§ظˆطھ ط¯ظ‡ ظƒط§ظ† ظ…ظپطھظˆط­ ظ„ظ„ط¹ط§ظ„ظ… ظƒظ„ظ‡
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // ظ¢) ط­ط¯ظ‘ ط§ط³طھط®ط¯ط§ظ… ظ„ظƒظ„ ظ…ط³طھط®ط¯ظ… ط¹ط´ط§ظ† ظپط§طھظˆط±ط© Groq
    const limited = checkRateLimit(`chat:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    // ظ¢.ظ¥) ظƒظˆطھط© ط§ظ„ط§ط´طھط±ط§ظƒ ظ„ظ„ط±ط³ط§ظٹظ„ (Phase 1.5) â€” messages_per_2h ظƒط§ظ†طھ ظ…ظˆط¬ظˆط¯ط© ظپظٹ
    // ط§ظ„ط¯ط§طھط§ط¨ظٹط² ظ…ظ† ط؛ظٹط± ط£ظٹ ظپط±ط¶ ظپط¹ظ„ظٹ. ظپط­طµ + ط§ط³طھظ‡ظ„ط§ظƒ ظ…ظ† ط§ظ„ط³ظٹط±ظپط± ظ‚ط¨ظ„ ط£ظٹ ط´ط؛ظ„ ط؛ط§ظ„ظٹ.
    // fail-open ظ…ظˆط«ظ‚ ظ„ظˆ ط¬ط¯ط§ظˆظ„ ط§ظ„ظƒظˆطھط§ ظ„ط³ظ‡ ظ…ط´ ظ…طھظ†ظپط°ط©.
    // ط§ظ„ظ…ط§ظ„ظƒ (owner) ظٹطھط®ط·ظ‰ ط§ظ„ط­ط¯ظˆط¯ ط§ظ„ط¯ط§ط®ظ„ظٹط© ظ„ظ„ظ…ظ†طµط© ط¯ظˆظ† ط§ط³طھظ‡ظ„ط§ظƒ ظƒظˆطھط©.
    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "message", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { message: quota.reasonAr ?? "طھظ… طھط¬ط§ظˆط² ط­ط¯ ط±ط³ط§ظٹظ„ ط§ظ„ط¨ط§ظ‚ط©.", code: "MESSAGE_QUOTA_EXCEEDED" } },
        { status: 429 }
      );
    }

    // ظ¢.ظ¦) طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ظ…ظˆط¯ظٹظ„ط§طھ ظ…ظ† ط§ظ„ط¯ط§طھط§ط¨ظٹط² (Phase 2) â€” طھط¨ط¯ظٹظ„ط§طھ ط§ظ„ط£ط¯ظ…ظ†
    // (enabled/priority/daily_limit ظپظٹ ai_models) ط¨ظ‚طھ ط¨طھط£ط«ط± ظپط¹ظ„ظٹظ‹ط§ ظپظٹ ط§ظ„ط±ط§ظˆطھط±.
    // TTL ظ£ظ  ط«ط§ظ†ظٹط© + fail-open ظ…ظˆط«ظ‚طŒ ظپظ…ظپظٹط´ ط¶ط±ط¨ط© DB ظ…ط¹ ظƒظ„ ط±ط³ط§ظ„ط©.
    await refreshModelStateCache();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: { message: "ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط¨ط¹ظˆطھط© ط؛ظٹط± طµط§ظ„ط­ط©." } },
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
        { error: { message: "ظ…ظپظٹط´ ط±ط³ط§ظٹظ„ ظ…ط¨ط¹ظˆطھط©." } },
        { status: 400 }
      );
    }

    // ظ£) طھظ†ط¶ظٹظپ ط§ظ„ط±ط³ط§ظٹظ„: ط§ظ„ط£ط¯ظˆط§ط± ط§ظ„ظ…ط³ظ…ظˆط­ط© ط¨ط³طŒ ظˆظ†طµ ظ…ظ‚طµظˆطµ
    let pdfFailed = false;
    let pdfTooLarge = false;
    let safeMessages: any;
    try {
      safeMessages = await Promise.all(
      (messages as IncomingMessage[])
        .slice(-MAX_MESSAGES)
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            ((typeof m.content === "string" && m.content.trim().length > 0) ||
              (Array.isArray(m.content) &&
                m.content.length > 0 &&
                m.content.every(
                  (p) =>
                    p &&
                    typeof p === "object" &&
                    (p.type === "text" || p.type === "image_url")
                )))
        )
        .map(async (m) => {
          if (typeof m.content === "string") {
            return { role: m.role as "user" | "assistant", content: clampText(m.content, MAX_MESSAGE_CHARS) };
          }
          // array content: clamp text parts; extract PDFs sent as data URLs
          const parts = await Promise.all(
            (m.content as Array<{ type: string; text?: string; image_url?: { url: string } }>).map(async (p) => {
              if (p.type === "text") {
                return { type: "text" as const, text: clampText(p.text ?? "", MAX_MESSAGE_CHARS) };
              }
              const url = p.image_url?.url ?? "";
              const pdfMatch = /^data:application\/pdf[^;]*;base64,(.*)$/i.exec(url);
              if (pdfMatch) {
                try {
                  const buffer = Buffer.from(pdfMatch[1], "base64");
                  if (buffer.length > 4 * 1024 * 1024) {
                    pdfTooLarge = true;
                    throw new Error("too large");
                  }
                  const parser = new PDFParse({ data: buffer });
                  const result = await parser.getText();
                  await parser.destroy();
                  const text = (result.text || "").trim();
                  if (text) {
                    return { type: "text" as const, text: clampText(`ظ‡ط°ط§ ظ…ط­طھظˆظ‰ ط§ظ„ظ…ظ„ظپ: ${text}`, MAX_MESSAGE_CHARS) };
                  }
                  pdfFailed = true;
                } catch (e) {
                  console.warn("chat route PDF parse failed", e);
                  if ((e as Error)?.message !== "too large") pdfFailed = true;
                }
                return { type: "text" as const, text: "طھط¹ط°ط± ظ‚ط±ط§ط،ط© ط§ظ„ظ†طµ ظ…ظ† ظ‡ط°ط§ ط§ظ„ظ€ PDF. ظٹط±ط¬ظ‰ ط±ظپط¹ طµظˆط±ط© ظ„ظ„طµظپط­ط© ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ." };
              }
              return { type: "image_url" as const, image_url: { url } };
            })
          );
          return { role: m.role as "user" | "assistant", content: parts };
        })
    );
    } catch (e) {
      console.warn("chat route message processing failed", e);
      return NextResponse.json(
        { error: { message: "طھط¹ط°ط± ظ‚ط±ط§ط،ط© ط§ظ„ظ†طµ ظ…ظ† ظ‡ط°ط§ ط§ظ„ظ€ PDF", code: "PDF_READ_FAILED" } },
        { status: 400 }
      );
    }

    if (pdfTooLarge) {
      return NextResponse.json(
        { error: { message: "ط§ظ„ظ…ظ„ظپ ظƒط¨ظٹط± ط¬ط¯ط§ظ‹طŒ ط§ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ 4 ظ…ظٹط¬ط§ط¨ط§ظٹطھ", code: "FILE_TOO_LARGE" } },
        { status: 413 }
      );
    }
    if (pdfFailed) {
      return NextResponse.json(
        { error: { message: "طھط¹ط°ط± ظ‚ط±ط§ط،ط© ط§ظ„ظ†طµ ظ…ظ† ظ‡ط°ط§ ط§ظ„ظ€ PDF. ظٹط±ط¬ظ‰ ط±ظپط¹ طµظˆط±ط© ظ„ظ„طµظپط­ط© ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.", code: "PDF_READ_FAILED" } },
        { status: 422 }
      );
    }

    if (safeMessages.length === 0) {
      return NextResponse.json(
        { error: { message: "ظ…ظپظٹط´ ط±ط³ط§ظٹظ„ طµط§ظ„ط­ط© ظ„ظ„ط¥ط±ط³ط§ظ„." } },
        { status: 400 }
      );
    }

    // ط§ظ„ظ€ prompt ط¨ظ‚ظ‰ ط¹ظ„ظ‰ ط§ظ„ط³ظٹط±ظپط±. ط§ظ„ظƒظ„ط§ظٹظ†طھ ظٹظ…ط±ط± ط³ظٹط§ظ‚ظ‹ط§ ظ…ط­ط¯ظˆط¯ظ‹ط§ ظپظ‚ط·طŒ ظ„ظƒظ†
    // ظ…طµط¯ط± ط§ظ„ط­ظ‚ظٹظ‚ط© (ط§ظ„طھظ‚ط¯ظ… ظˆط§ظ„ط¯ط±ط³) ظٹظڈظ‚ط±ط£ ظ…ظ† ط­ط³ط§ط¨ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ†ظپط³ظ‡.
    const displayName = (user as { user_metadata?: { full_name?: string; name?: string }; email?: string | null }).user_metadata?.full_name
      || (user as { user_metadata?: { name?: string } }).user_metadata?.name
      || user.email
      || "الطالب";
    const combinedSystem = `أنت «ماجيكلي»، مساعد مذاكرة. المستخدم: ${displayName}${user.email ? ` (${user.email})` : ""}. أجب بالعربية المفهومة والواضحة. لا تفترض بيانات من قاعدة البيانات.`;


    // Phase H: entitlement filter + 1 credit gate (403 before reserve)
    const candidates = routeCandidates("chat");
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json({ error: { message: "ظ‡ط°ظ‡ ط§ظ„ظ…ظ‡ظ…ط© طھطھط·ظ„ط¨ طµظ„ط§ط­ظٹط©. ط§ط´طھط±ظگظ‡ط§ ظ…ظ† ط§ظ„ظ…طھط¬ط±.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? CURRENT_AI_MODEL);
    if (!guard.ok) return guard.response;

    let completion;
    try {
      // ًں§¾ Phase 5-C3 (pilot) â€” طھظˆظ„ظٹط¯ ظ‡ظˆظٹط© ط§ظ„ط·ظ„ط¨ ط§ظ„ظ…ظ†ط·ظ‚ظٹ **ظ…ط±ط© ظˆط§ط­ط¯ط©**
      // ظ‡ظ†ط§طŒ ط¹ظ†ط¯ ط­ط¯ظ‘ ط§ظ„ط·ظ„ط¨. ظˆط¨ط¹ط¯ظٹظ† ط¨طھطھظ†ظ‚ظ‘ظ„ ط²ظٹ ظ…ط§ ظ‡ظٹ ظ„ظƒظ„ ظ…ط­ط§ظˆظ„ط© ظ…ط²ظˆظ‘ط¯
      // ط¬ظˆظ‡ `completeChatInner` â€” ظ…ظ† ط؛ظٹط± ظ…ط§ طھطھط؛ظٹظ‘ط± (ظ…ط§ظپظٹط´ ط£ظٹ ط­ط¯ ط¨ظٹظƒطھط¨
      // ظپظٹظ‡ط§). `attemptNo` ظ‡ظˆ ط§ظ„ظˆط­ظٹط¯ ط§ظ„ظ„ظٹ ط¨ظٹطھط؛ظٹظ‘ط± ط¨ظٹظ† ط§ظ„ظ…ط­ط§ظˆظ„ط§طھ.
      //
      // âڑ ï¸ڈ **ط³ظ„ظˆظƒ ظ…ط­ظپظˆط¸ 100%:** ط§ظ„ط³ط·ط± ط¯ظ‡ ط¨ظٹظ‚ط±ط§ header ظˆط¨ظٹظˆظ„ظ‘ط¯ UUID ظپظ‚ط·.
      //   ظ…ط§ظپظٹط´ طھط؛ظٹظٹط± ظپظٹ ط§ظ„ظ€ guard ظˆظ„ط§ ط§ظ„ظ€ limits ظˆظ„ط§ ط§ظ„ظ€ credit ظˆظ„ط§
      //   طھط±طھظٹط¨ ط§ظ„ظ…ط²ظˆظ‘ط¯ظٹظ† ظˆظ„ط§ ط§ظ„ظ€ fallback ظˆظ„ط§ ط´ظƒظ„ ط§ظ„ط±ط¯.
      const usage = resolveUsageRequestContext(req, user.id);

      // ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ System Prompt
    console.log("[api/chat] messages to provider:", JSON.stringify([{ role: "system", content: combinedSystem }, ...safeMessages]));
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
              ? "ط§ظ„ط®ط¯ظ…ط© ظ…ط´ط؛ظˆظ„ط© ط¯ظ„ظˆظ‚طھظٹ. ط­ط§ظˆظ„ طھط§ظ†ظٹ ط¨ط¹ط¯ ط´ظˆظٹط©."
              : "ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط§طھطµط§ظ„ ط¨ط§ظ„ظ…ط³ط§ط¹ط¯. ط­ط§ظˆظ„ طھط§ظ†ظٹ.",
            code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          },
        },
        { status: isUnavailable ? 503 : isRate ? 429 : 502 }
      );
    }

    const data = completion.payload;
    const answer = completion.content;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

    // ط§ظ„ط­ظپط¸ best-effort: ظ„ظˆ migration ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ ظ„ط³ظ‡ ظ…ط§ ط§طھط´ط؛ظ„طھط´طŒ ط§ظ„ط´ط§طھ
    // ظٹظپط¶ظ„ ط´ط؛ظ‘ط§ظ„ ظˆظ„ط§ ظ†ط­ط±ظ… ط§ظ„ط·ط§ظ„ط¨ ظ…ظ† ط§ظ„ط±ط¯ ط¨ط³ط¨ط¨ ظ…ظٹط²ط© طھط§ط±ظٹط® ط¥ط¶ط§ظپظٹط©.
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
          // ظ…ط¹ط±ظپ ظ…ط­ط§ط¯ط«ط© ظ…ظ† ط­ط³ط§ط¨ ط¢ط®ط± ظ„ط§ ظٹظڈط³طھط®ط¯ظ… ط£ط¨ط¯ظ‹ط§طŒ ط­طھظ‰ ظ„ظˆ ط¹ط±ظپظ‡ ط¹ظ…ظٹظ„
          // ط®ط¨ظٹط«ط› ظ†ظ†ط´ط¦ ط¬ظ„ط³ط© ط¬ط¯ظٹط¯ط© ط¨ط¯ظ„ طھظ„ظˆظٹط« طھط§ط±ظٹط® ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ط¢ط®ط±.
          if (!ownedConversation) savedConversationId = "";
        }
        if (!savedConversationId) {
          const titleText = messageText(safeMessages.at(-1)?.content ?? "");
          const { data: conversation } = await supabase
            .from("chat_conversations")
            .insert({ user_id: user.id, title: titleText.slice(0, 80) || "ظ…ط­ط§ط¯ط«ط© ط¬ط¯ظٹط¯ط©" })
            .select("id")
            .single();
          savedConversationId = conversation?.id ?? "";
        }
        if (savedConversationId) {
          const userContentText = messageText(safeMessages.at(-1)?.content ?? "");
          await supabase.from("chat_messages").insert([
            { conversation_id: savedConversationId, user_id: user.id, role: "user", content: userContentText },
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
      suggestedAgent: suggestAgentFromText(messageText(safeMessages.at(-1)?.content ?? "")) ?? undefined,
    });
  } catch (error) {
    console.error("chat route error:", error);
    return NextResponse.json(
      { error: { message: "ط­طµظ„ ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، ط§ظ„ط§طھطµط§ظ„.", code: "INTERNAL_ERROR" } },
      { status: 400 }
    );
  }
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

