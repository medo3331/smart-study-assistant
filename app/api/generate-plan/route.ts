import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { recordDirectProviderAttempt, startProviderAttempt } from "@/lib/ai/direct-provider-usage";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { resolveActor } from "@/lib/policy";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { GROQ_MODELS } from "@/lib/ai-config";
import { checkSubscriptionQuotas } from "@/lib/ai/quota-check";

/** ط£ظ‚طµظ‰ ط·ظˆظ„ ظ„ط£ظٹ ط­ظ‚ظ„ ظ†طµظٹ ط¬ط§ظٹ ظ…ظ† ط§ظ„ظƒظ„ط§ظٹظ†طھ. */
const MAX_FIELD_CHARS = 200;
/** ط­ط¯ظˆط¯ ط¹ط¯ط¯ ط§ظ„ط£ظٹط§ظ… ط§ظ„ظ…ط³ظ…ظˆط­ ط¨ظ‡ط§. */
const MIN_DAYS = 1;
const MAX_DAYS = 60;

function errorDetails(error: unknown) {
  if (typeof error !== "object" || error === null) return { message: "", status: undefined };
  const candidate = error as { message?: unknown; status?: unknown };
  return {
    message: typeof candidate.message === "string" ? candidate.message : "",
    status: typeof candidate.status === "number" ? candidate.status : undefined,
  };
}

export async function POST(req: Request) {
  let guard: any = null;
  let __hUser: any = null;
  let __hSupabase: any = null;
  try {
    // ظ،) ظ„ط§ط²ظ… ظ…ط³طھط®ط¯ظ… ظ…ط³ط¬ظ‘ظ„ â€” ط§ظ„ط±ط§ظˆطھ ط¯ظ‡ ظƒط§ظ† ظ…ظپطھظˆط­ ظˆط¨ظٹط³طھظ‡ظ„ظƒ طھظˆظƒظ†ط² ظ„ط£ظٹ ط­ط¯
    const { user, supabase, response: authError } = await requireUser("success");
    __hUser = user; __hSupabase = supabase;
    if (authError) return authError;

    // ظ¢) ط­ط¯ظ‘ ط§ط³طھط®ط¯ط§ظ…: طھظˆظ„ظٹط¯ ط§ظ„ط®ط·ط© ط£ط؛ظ„ظ‰ ط·ظ„ط¨ ط¹ظ†ط¯ظ†ط§
    const limited = checkRateLimit(`plan:${user.id}`, 8, 60_000, "success");
    if (limited) return limited;

    // ط§ظ„ظƒظˆطھط© ط§ظ„ظ…ط±ظƒط²ظٹط© + ط§ظ„ظ…ظپطھط§ط­ ط§ظ„ط°ظƒظٹ ط§ظ„ظپط±ظٹط¯ (idempotency + fail-open/fail-closed)
    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuotas(user.id, "message", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        { success: false, error: quota.reasonAr ?? "طھظ… طھط¬ط§ظˆط² ط­ط¯ ط±ط³ط§ظٹظ„ ط§ظ„ط¨ط§ظ‚ط©." },
        { status: 429 }
      );
    }
    // Phase H: 1 credit gate (free model, but still costs 1 credit)
    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { cost: 5 });
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط¨ط¹ظˆطھط© ط؛ظٹط± طµط§ظ„ط­ط©." },
        { status: 400 }
      );
    }

    const subject = clampText(body.subject, MAX_FIELD_CHARS).trim();
    const stage = clampText(body.stage, MAX_FIELD_CHARS).trim();
    const level = clampText(body.level, MAX_FIELD_CHARS).trim();
    const daysCount = Number(body.daysCount);

    if (!subject || !stage || !level) {
      return NextResponse.json(
        { success: false, error: "ط¬ظ…ظٹط¹ ط§ظ„ط­ظ‚ظˆظ„ ظ…ط·ظ„ظˆط¨ط© ظ„طھظˆظ„ظٹط¯ ط§ظ„ط®ط·ط© ط§ظ„ط¯ط±ط§ط³ظٹط©." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(daysCount) || daysCount < MIN_DAYS || daysCount > MAX_DAYS) {
      return NextResponse.json(
        {
          success: false,
          error: `ط¹ط¯ط¯ ط§ظ„ط£ظٹط§ظ… ظ„ط§ط²ظ… ظٹظƒظˆظ† ط±ظ‚ظ… طµط­ظٹط­ ط¨ظٹظ† ${MIN_DAYS} ظˆ ${MAX_DAYS}.`,
        },
        { status: 400 }
      );
    }

    // طھط¬ظ…ظٹط¹ ظˆظ‚ط±ط§ط،ط© ط§ظ„ظ…ظپط§طھظٹط­ ظ…ظ† ظ…طھط؛ظٹط±ط§طھ ط§ظ„ط¨ظٹط¦ط©
    const rawKeys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY,
    ];

    // ط¥ط²ط§ظ„ط© ط§ظ„ظ…ط³ط§ظپط§طھ ط§ظ„ط²ط§ط¦ط¯ط© ظˆط§ظ„طھط£ظƒط¯ ظ…ظ† طµط­ط© ط§ظ„ظ†طµ
    const validKeys = rawKeys
      .map((k) => k?.trim())
      .filter((k): k is string => typeof k === "string" && k.length > 0);

    const apiKeys = Array.from(new Set(validKeys));

    if (apiKeys.length === 0) {
      console.error("generate-plan: ظ…ظپظٹط´ ط£ظٹ GROQ_API_KEY ظ…ط¹ط±ظپ");
      await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ""), (guard as any)?.refId ?? "");
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط®ط¯ظ…ط© ط؛ظٹط± ظ…طھط§ط­ط© ط­ط§ظ„ظٹط§ظ‹." },
        { status: 503 }
      );
    }

    // طھط¹ظ„ظٹظ…ط§طھ ط®ظپظٹظپط© ظˆظ…ظˆط²ظˆظ†ط© ط¬ط¯ط§ظ‹ ظ„ظ…ظ†ط¹ ط§ط³طھظ‡ظ„ط§ظƒ ط§ظ„طھظˆظƒظ†ط² ظˆطھط¬ط§ظˆط² TPM
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `ط£ظ†طھ ظ…ط¹ظ„ظ… ط®ط¨ظٹط±. ط£ظ†ط´ط¦ ظ‡ظٹظƒظ„ ط®ط·ط© ط¯ط±ط§ط³ظٹط© ط®ظپظٹظپ ط¬ط¯ط§ظ‹ ط¨ط¯ظˆظ† ط´ط±ظˆط­ط§طھ ظ…ط·ظˆظ„ط© ط£ظˆ ظƒظˆظٹط²ط§طھ. ط£ط®ط±ط¬ JSON ظپظ‚ط· ط¨ط¯ظˆظ† Markdown.
ط¥ط°ط§ ظƒط§ظ† ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± طµط­ظٹط­ ط£ظˆ ط؛ظٹط± ظ…ظپظ‡ظˆظ…:
{"isValid": false, "reason": "ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± ظˆط§ط¶ط­."}

ط¥ط°ط§ ظƒط§ظ† طµط­ظٹط­ط§ظ‹طŒ ط£ط±ط¬ط¹ ط§ظ„ط®ط·ط© ط¨ط§ظ„ظ‡ظٹظƒظ„ ط§ظ„طھط§ظ„ظٹ:
{
  "isValid": true,
  "days": [
    {
      "day": 1,
      "title": "ط¹ظ†ظˆط§ظ† ط§ظ„ط¯ط±ط³ ط§ظ„ط±ط¦ظٹط³ظٹ",
      "description": "ظ…ظ„ط®طµ ظ…ظƒط«ظپ ظ…ظ† ط³ط·ط± ظˆط§ط­ط¯ ظپظ‚ط· ط¹ظ† ط§ظ„ط¯ط±ط³."
    }
  ]
}`,
      },
      {
        role: "user",
        content: `ط£ظ†ط´ط¦ ط®ط·ط© ط¯ط±ط§ط³ظٹط© ظ„ظ…ط§ط¯ط© "${subject}"طŒ ط§ظ„ظ…ط±ط­ظ„ط©: "${stage}"طŒ ط§ظ„ظ…ط³طھظˆظ‰: "${level}"طŒ ط§ظ„ظ…ط¯ط©: ${daysCount} ظٹظˆظ….`,
      },
    ];

    let rawContent = "";
    let lastError: unknown = null;

    // ط§ظ„طھظ†ظ‚ظ„ ط¨ظٹظ† ط§ظ„ظ…ظپط§طھظٹط­ ظˆطھط¬ط§ظ‡ظ„ ط£ظٹ ظ…ظپطھط§ط­ ط¨ظ‡ ط®ط·ط£ ط£ظˆ ظ…ظ†طھظ‡ظٹ
    // Phase 5-C4 (shadow): one event per ACTUAL provider request in this loop.
    const usage = resolveUsageRequestContext(req, __hUser?.id ?? null, { feature: "study_plan" });
    let attemptNo = 0;
    for (const apiKey of apiKeys) {
      try {
      const doneMs = startProviderAttempt();
        const groq = new Groq({ apiKey });
        const completion = await groq.chat.completions.create({
          model: GROQ_MODELS.fast,
          messages,
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: "json_object" },
        });

        rawContent = completion.choices[0]?.message?.content || "";
        await recordDirectProviderAttempt({ usage, feature: "study_plan", attemptNo: attemptNo++, provider: "groq", model: GROQ_MODELS.fast, status: rawContent ? "completed" : "failed_after_response", promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, latencyMs: doneMs() });
        if (rawContent) break; // ط¹ظ†ط¯ ظ†ط¬ط§ط­ ط£ظٹ ظ…ظپطھط§ط­ ظ†ط®ط±ط¬ ظپظˆط±ط§ظ‹
        await recordDirectProviderAttempt({ usage, feature: "study_plan", attemptNo: attemptNo++, provider: "groq", model: GROQ_MODELS.fast, status: "failed_no_response", latencyMs: doneMs() });
      } catch (err) {
        console.warn(`ظپط´ظ„ ط§ظ„ظ…ظپطھط§ط­ ط§ظ„ط­ط§ظ„ظٹ (${errorDetails(err).message})طŒ ط¬ط§ط±ظٹ طھط¬ط±ط¨ط© ط§ظ„ظ…ظپطھط§ط­ ط§ظ„طھط§ظ„ظٹ...`);
        lastError = err;
      }
    }

    if (!rawContent) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw lastError || new Error("ظپط´ظ„طھ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظپط§طھظٹط­ ط§ظ„ظ…طھط§ط­ط© ظپظٹ ط§ظ„ط§طھطµط§ظ„ ط¨ط§ظ„ط®ط¯ظ…ط©.");
    }

    // ظ£) ط§ظ„ظ…ظˆط¯ظٹظ„ ظ…ظ…ظƒظ† ظٹط±ط¬ظ‘ط¹ JSON ظ…ظƒط³ظˆط± â€” ط¯ظ‡ ط®ط·ط£ ظ…طھظˆظ‚ظ‘ط¹ ظ…ط´ ظƒط±ط§ط´
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(rawContent);
    } catch {
      console.error("generate-plan: ط±ط¯ ط؛ظٹط± طµط§ظ„ط­ ظ…ظ† ط§ظ„ظ…ظˆط¯ظٹظ„");
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط±ط¯ ط¬ظ‡ ط¨ط´ظƒظ„ ط؛ظٹط± ظ…ظپظ‡ظˆظ…. ط­ط§ظˆظ„ طھط§ظ†ظٹ." },
        { status: 502 }
      );
    }

    const parsedPlan =
      typeof parsedData === "object" && parsedData !== null
        ? (parsedData as { isValid?: unknown; reason?: unknown; days?: unknown })
        : null;

    if (parsedPlan?.isValid === false) {
      return NextResponse.json({
        success: false,
        error:
          typeof parsedPlan.reason === "string"
            ? parsedPlan.reason
            : "ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± ظˆط§ط¶ط­طŒ ظٹط±ط¬ظ‰ ظƒطھط§ط¨ط© ط§ط³ظ… ظ…ط§ط¯ط© طµط±ظٹط­ط©.",
      });
    }

    // ظ¤) ظ†طھط£ظƒط¯ ط¥ظ† ط§ظ„ط´ظƒظ„ ط§ظ„ظ„ظٹ ط±ط¬ط¹ ظپط¹ظ„ط§ظ‹ ظپظٹظ‡ ط£ظٹط§ظ… ظ‚ط¨ظ„ ظ…ط§ ظ†ط±ط¬ظ‘ط¹ظ‡ ظ„ظ„ظƒظ„ط§ظٹظ†طھ
    if (!Array.isArray(parsedPlan?.days) || parsedPlan.days.length === 0) {
      console.error("generate-plan: ط±ط¯ ط¨ط¯ظˆظ† ط£ظٹط§ظ…");
      return NextResponse.json(
        { success: false, error: "ظ…ظ‚ط¯ط±طھط´ ط£ط¨ظ†ظٹ ط§ظ„ط®ط·ط©. ط­ط§ظˆظ„ طھط§ظ†ظٹ ط¨ط¹ط¯ ط´ظˆظٹط©." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
    });

  } catch (error) {
    try { if (guard && (guard as any)?.refId) await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ''), (guard as any).refId); } catch {}
    console.error("Groq API Error:", error);

    // ظ¥) ط±ط³ط§ظٹظ„ ط¹ط§ظ…ط© ظ„ظ„ظƒظ„ط§ظٹظ†طھ â€” طھظپط§طµظٹظ„ ط§ظ„ط®ط·ط£ ط¨طھظپط¶ظ„ ظپظٹ ط§ظ„ظ„ظˆط¬ ط¨ط³
    const { message, status } = errorDetails(error);
    const isRateLimit = message.includes("TPM") || status === 413 || status === 429;
    const errorMsg = isRateLimit
      ? "ط§ظ„ط®ط¯ظ…ط© ظ…ط´ط؛ظˆظ„ط© ط¯ظ„ظˆظ‚طھظٹ. ط­ط§ظˆظ„ طھط§ظ†ظٹ ط¨ط¹ط¯ ط¯ظ‚ظٹظ‚ط©."
      : "ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، طھظˆظ„ظٹط¯ ط§ظ„ط®ط·ط©. ط­ط§ظˆظ„ طھط§ظ†ظٹ.";

    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}


