import { NextResponse } from "next/server";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { suggestAgentFromText } from "@/lib/ai/agents";
import { buildMagiclySystemPrompt, getStudentContext, getStudyToolFacts, parseMode, rememberSessionContext, type MagiclyContextInput } from "@/lib/magicly-ai";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";

/** أقصى عدد رسايل بنمررها للموديل (الأحدث بس). */
const MAX_MESSAGES = 30;
/** أقصى طول لأي رسالة واحدة. */
const MAX_MESSAGE_CHARS = 8000;

type IncomingMessage = { role?: unknown; content?: unknown };

export async function POST(req: Request) {
  try {
    // ١) لازم يكون مسجّل دخول — الراوت ده كان مفتوح للعالم كله
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // ٢) حدّ استخدام لكل مستخدم عشان فاتورة Groq
    const limited = checkRateLimit(`chat:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: { message: "البيانات المبعوتة غير صالحة." } },
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
        { error: { message: "مفيش رسايل مبعوتة." } },
        { status: 400 }
      );
    }

    // ٣) تنضيف الرسايل: الأدوار المسموحة بس، ونص مقصوص
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
        { error: { message: "مفيش رسايل صالحة للإرسال." } },
        { status: 400 }
      );
    }

    // الـ prompt بقى على السيرفر. الكلاينت يمرر سياقًا محدودًا فقط، لكن
    // مصدر الحقيقة (التقدم والدرس) يُقرأ من حساب المستخدم نفسه.
    const studentContext = await getStudentContext(supabase, user.id, context ?? {});
    const selectedMode = parseMode(mode, safeMessages.at(-1)?.content ?? "");
    const toolFacts = await getStudyToolFacts(supabase, user.id, context ?? {}, safeMessages.at(-1)?.content ?? "");
    const system = buildMagiclySystemPrompt(studentContext, selectedMode, toolFacts);
    void rememberSessionContext(supabase, user.id, studentContext, safeMessages.at(-1)?.content ?? "");

    // Phase H: entitlement filter + 1 credit gate (403 before reserve)
    const candidates = routeCandidates("chat");
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json({ error: { message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    let completion;
    try {
      completion = await aiRouter.completeChat("chat", {
        messages: [{ role: "system", content: system }, ...safeMessages],
        temperature: 0.7,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (!(error instanceof AiProviderError)) throw error;
      const isRate = error.status === 429;
      return NextResponse.json(
        {
          error: {
            message: isRate
              ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية."
              : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.",
          },
        },
        { status: error.status === 503 ? 503 : isRate ? 429 : 502 }
      );
    }

    const data = completion.payload;
    const answer = completion.content;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

    // الحفظ best-effort: لو migration المحادثات لسه ما اتشغلتش، الشات
    // يفضل شغّال ولا نحرم الطالب من الرد بسبب ميزة تاريخ إضافية.
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
          // معرف محادثة من حساب آخر لا يُستخدم أبدًا، حتى لو عرفه عميل
          // خبيث؛ ننشئ جلسة جديدة بدل تلويث تاريخ المستخدم الآخر.
          if (!ownedConversation) savedConversationId = "";
        }
        if (!savedConversationId) {
          const { data: conversation } = await supabase
            .from("chat_conversations")
            .insert({ user_id: user.id, title: safeMessages.at(-1)?.content.slice(0, 80) || "محادثة جديدة" })
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
      { error: { message: "حصل خطأ غير متوقع أثناء الاتصال." } },
      { status: 500 }
    );
  }
}
