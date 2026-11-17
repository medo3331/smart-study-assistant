import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { suggestAgentFromText } from "@/lib/ai/agents";
import { buildMagiclySystemPrompt, getStudentContext, getStudyToolFacts, parseMode, rememberSessionContext, type MagiclyContextInput } from "@/lib/magicly-ai";
import { buildWorkspaceSourceContext } from "@/lib/ai/workspace-source-context";
import { getWorkspaceDigest } from "@/lib/workspace/digest";
import { classifyChatIntent } from "@/lib/ai/chat-intent";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { checkSubscriptionQuota, refundSubscriptionQuota } from "@/lib/ai/quota-check";
import { resolveActor } from "@/lib/policy";
import { refreshModelStateCache } from "@/lib/ai/model-state";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels, CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import {
  buildExamAnswer,
  buildExamHref,
  detectExamRequestFromHistory,
  EXAM_REQUEST_PROMPT_RULES,
} from "@/lib/exam-request";

export const maxDuration = 60;

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
    const limited = await checkRateLimit(`chat:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    // ٢.٥) كوتة الاشتراك للرسايل (Phase 1.5) — messages_per_2h كانت موجودة في
    // الداتابيز من غير أي فرض فعلي. فحص + استهلاك من السيرفر قبل أي شغل غالي.
    // fail-open موثق لو جداول الكوتا لسه مش متنفذة.
    // المالك (owner) يتخطى الحدود الداخلية للمنصة دون استهلاك كوتة.
    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "message", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { message: quota.reasonAr ?? "تم تجاوز حد رسايل الباقة.", code: "MESSAGE_QUOTA_EXCEEDED" } },
        { status: 429 }
      );
    }

    // ٢.٦) تحديث حالة الموديلات من الداتابيز (Phase 2) — تبديلات الأدمن
    // (enabled/priority/daily_limit في ai_models) بقت بتأثر فعليًا في الراوتر.
    // TTL ٣٠ ثانية + fail-open موثق، فمفيش ضربة DB مع كل رسالة.
    await refreshModelStateCache();

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
      systemInstruction?: unknown;
    };
    const conversationId = typeof (body as { conversationId?: unknown }).conversationId === "string"
      ? clampText((body as { conversationId: string }).conversationId, 80)
      : "";

    // systemInstruction اختياري (الكويزات: BossFight/CommunityQuiz بيبعتوه) —
    // مهمّة خاصة تُلحق بعد برومبت الشخصية والسياق، **مش بديل** ليهم.
    // سقف2000 حرف + تنظيف أحرف التحكم (بيتبعت من كودنا لكن نحمّي الحدود).
    const systemInstruction =
      typeof (body as { systemInstruction?: unknown }).systemInstruction === "string"
        ? clampText((body as { systemInstruction: string }).systemInstruction, 2000)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .trim()
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
    const latestMessage = safeMessages.at(-1)?.content ?? "";

    // ── طلب امتحان ⇒ تنفيذ فوري (من غير سؤال توضيحي ومن غير نداء موديل)
    //
    // ⚠️ **التاريخ مش الرسالة الأخيرة**: المساعد كان بيدخل في حلقة مفرغة
    //    («كام سؤال؟» → «5» → «المادة إيه؟» → «عربي» → «كام سؤال؟» تاني)
    //    لأن كل نداء كان بيقرا آخر رسالة بس. بنجمع البيانات من كل
    //    المحادثة: «عايز امتحان» + «5» + «عربي» ⇒ امتحان عربي من 5.
    //
    // ⚠️ **الشات مش form**: أول ما الطالب يطلب امتحان (حتى لو ناقصه عدد
    //    أو مادة) بنبعتله زر المولّد فورًا وهو بيكمّل الباقي في الشاشة.
    const examRequest = detectExamRequestFromHistory(safeMessages);
    if (examRequest?.active) {
      const answer = buildExamAnswer(examRequest, new URL(req.url).origin);
      const savedId = await saveTurn(supabase, user.id, conversationId, latestMessage, answer);
      return NextResponse.json({
        choices: [{ message: { content: answer } }],
        actions: [{ label: "افتح مولّد الامتحان", href: buildExamHref(examRequest) }],
        ...(savedId ? { conversationId: savedId } : {}),
      });
    }
    const intentResult = classifyChatIntent(latestMessage, {});
    console.log("[CHAT DEBUG]", { intent: intentResult.intent, latestMessage: latestMessage.slice(0, 80) });
    const selectedMode = parseMode(mode, latestMessage, intentResult.intent);
    // ⚠️ **البحث في الملفات** شغّال في نوايتين:
    //    `WORKSPACE_SEARCH` (طلب محتوى من مصدر) و`RECORDED_LECTURES_SEARCH`
    //    (طلب عن تسجيل/تفريغ) — التانية كانت **بتتشال** (مفيش بحث).
    const allowFileSearch =
      intentResult.intent === "WORKSPACE_SEARCH" ||
      intentResult.intent === "RECORDED_LECTURES_SEARCH";
    const toolFacts = await getStudyToolFacts(supabase, user.id, context ?? {}, latestMessage, {
      allowFileSearch,
    });
    let workspaceDigest: string | null = null;
    try {
      workspaceDigest = await getWorkspaceDigest(supabase, user.id);
    } catch (e) {
      console.error("[CHAT DEBUG] digest failed:", e);
    }
    console.log("[CHAT DEBUG]", { hasDigest: !!workspaceDigest, digestLen: workspaceDigest?.length ?? 0 });

    // ⚠️⚠️ **محتوى المصدر المملوك** (2026-11-12) — ده الجزء الناقص:
    //    الـ digest فيه **أسماء** بس (عنوان + تاريخ)، والبحث بيحطّ
    //    ٥٠٠ حرف. ⇒ سؤال عام عن محاضرة («اشرحلي اللي اتقال عن الـ white
    //    lesion») كان بيجاوب من **معلومة**.
    //    ⇒ بنحقن نص المصدر بالكامل (٨٠٠٠ حرف) لما الـ resolver يلاقي
    //    مصدر مملوك للطالب.
    let sourceContext = "";
    if (allowFileSearch) {
      try {
        const built = await buildWorkspaceSourceContext({
          supabase,
          userId: user.id,
          message: latestMessage,
        });
        if (built.ok && built.context) {
          sourceContext = built.context;
          console.log("[CHAT DEBUG]", {
            source: built.source.family,
            sourceLen: sourceContext.length,
          });
        } else {
          console.log("[CHAT DEBUG]", {
            source: "none",
            reason: built.ok ? "empty context" : built.resolution?.status ?? built.message,
          });
        }
      } catch (e) {
        console.error("[CHAT DEBUG] source context failed:", e);
      }
    }

    const system = buildMagiclySystemPrompt(studentContext, selectedMode, toolFacts, workspaceDigest);

    // دمج شخصية الطالب (Persona Builder) مع البرومبت الأساسي
    let personaPrompt = "";
    try {
      personaPrompt = await buildSystemPrompt(user.id);
    } catch (e) {
      console.warn("Persona prompt build failed, falling back to base system prompt:", e);
    }
    const combinedSystem = personaPrompt ? `${personaPrompt}\n\n--- السياق التعليمي الإضافي ---\n${system}` : system;
    // 📝 قواعد طلب الامتحان — بتكمّل الكاشف: الطلب الناقص (ناقصه العدد مثلاً)
    //    بيعدّي للموديل، والقواعد بتقولله اسأل سؤالًا واحدًا محددًا مش سلسلة.
    const systemWithExamRules = `${combinedSystem}\n\n--- قواعد طلب الامتحان ---\n${EXAM_REQUEST_PROMPT_RULES}`;
    // systemInstruction (اختياري) — يُلحق هنا قبل محتوى المصدر عشان المصدر
    // يفضل آخر حاجة يقرأها الموديل (قرار محفوظ في السطر اللي بعده).
    const systemWithInstruction = systemInstruction
      ? `${systemWithExamRules}\n\n--- مهمة خاصة ---\n${systemInstruction}`
      : systemWithExamRules;
    // ⚠️ **محتوى المصدر** — بيتحقن **بعد** البرومبت الأساسي عشان يبقى
    //    آخر حاجة يقرأها الموديل (أقرب للرد) ⇒ بيلغي «المعلومة دي مش
    //    موجودة عندي» حتى لو موجودة في المصدر.
    const systemWithSource = sourceContext
      ? `${systemWithInstruction}\n\n---\n\nمحتوى المصدر المطلوب (من حساب الطالب — استخدمه في إجابتك):\n${sourceContext}`
      : systemWithInstruction;
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
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? CURRENT_AI_MODEL);
    if (!guard.ok) return guard.response;

    let completion;
    try {
      // 🧾 Phase 5-C3 (pilot) — توليد هوية الطلب المنطقي **مرة واحدة**
      // هنا، عند حدّ الطلب. وبعدين بتتنقّل زي ما هي لكل محاولة مزوّد
      // جوه `completeChatInner` — من غير ما تتغيّر (مافيش أي حد بيكتب
      // فيها). `attemptNo` هو الوحيد اللي بيتغيّر بين المحاولات.
      //
      // ⚠️ **سلوك محفوظ 100%:** السطر ده بيقرا header وبيولّد UUID فقط.
      //   مافيش تغيير في الـ guard ولا الـ limits ولا الـ credit ولا
      //   ترتيب المزوّدين ولا الـ fallback ولا شكل الرد.
      const usage = resolveUsageRequestContext(req, user.id);

      completion = await aiRouter.completeChat("chat", {
        messages: [{ role: "system", content: systemWithSource }, ...safeMessages],
        temperature: 0.7,
        usage,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      await refundSubscriptionQuota(user.id, "message", quota?.idempotencyKey);
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

    const data = completion.payload;
    const answer = completion.content;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

    // الحفظ best-effort: لو migration المحادثات لسه ما اتشغلتش، الشات
    // يفضل شغّال ولا نحرم الطالب من الرد بسبب ميزة تاريخ إضافية.
    const savedConversationId = await saveTurn(
      supabase,
      user.id,
      conversationId,
      safeMessages.at(-1)?.content ?? "",
      answer
    );

    return NextResponse.json({
      ...data,
      conversationId: savedConversationId || undefined,
      suggestedAgent: suggestAgentFromText(safeMessages.at(-1)?.content ?? "") ?? undefined,
    });
  } catch (error) {
    console.error("chat route error:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع أثناء الاتصال.", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

/**
 * حفظ دور المحادثة — best-effort (فشلها ما بيحرمش الطالب من الرد).
 *
 * ⚠️ **ليها دالة مستقلة**: المسار السريع (طلب امتحان مكتمل) بيرجّع من غير
 *    نداء موديل، فلازم يحفظ الدور بنفس منطق المسار العادي.
 *
 * @returns معرف المحادثة بعد الحفظ، أو نص فاضي لو الحفظ فشل.
 */
async function saveTurn(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  userMessage: string,
  answer: string
) {
  if (!answer) return "";
  try {
    let savedId = conversationId;
    if (savedId) {
      const { data: ownedConversation } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("id", savedId)
        .eq("user_id", userId)
        .maybeSingle();
      // معرف محادثة من حساب آخر لا يُستخدم أبدًا، حتى لو عرفه عميل
      // خبيث؛ ننشئ جلسة جديدة بدل تلويث تاريخ المستخدم الآخر.
      if (!ownedConversation) savedId = "";
    }
    if (!savedId) {
      const { data: conversation } = await supabase
        .from("chat_conversations")
        .insert({ user_id: userId, title: userMessage.slice(0, 80) || "محادثة جديدة" })
        .select("id")
        .single();
      savedId = conversation?.id ?? "";
    }
    if (savedId) {
      await supabase.from("chat_messages").insert([
        { conversation_id: savedId, user_id: userId, role: "user", content: userMessage },
        { conversation_id: savedId, user_id: userId, role: "assistant", content: answer },
      ]);
      await supabase
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", savedId)
        .eq("user_id", userId);
    }
    return savedId;
  } catch (saveError) {
    console.warn("chat: could not save conversation", saveError);
    return "";
  }
}
