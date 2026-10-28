import { recordDirectProviderAttempt, startProviderAttempt } from "@/lib/ai/direct-provider-usage";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { resolveActor } from "@/lib/policy";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { GROQ_MODELS } from "@/lib/ai-config";
import { checkSubscriptionQuotas } from "@/lib/ai/quota-check";

/* ==========================================================================
   طھظˆظ„ظٹط¯ ط¹ط±ط¶ طھظ‚ط¯ظٹظ…ظٹ

   ط¨ظٹط§ط®ط¯ ظ…ظˆط¶ظˆط¹ (ط£ظˆ ظ†طµ ظ…ط§ط¯ط© ظƒط§ظ…ظ„) ظˆط¨ظٹط±ط¬ظ‘ط¹ ط´ط±ط§ط¦ط­ ظƒظ€ JSON. ط§ظ„ط±ظ†ط¯ط± ظˆط§ظ„طھطµط¯ظٹط±
   ظƒظ„ظ‡ظ… ط¹ظ„ظ‰ ط§ظ„ظƒظ„ط§ظٹظ†طھ â€” ط§ظ„ط³ظٹط±ظپط± ط¨ظٹط±ط¬ظ‘ط¹ ط¯ط§طھط§ ط¨ط³طŒ ظ…ظپظٹط´ HTML ظˆظ„ط§ PDF ط¨ظٹطھط¨ظ†ظ‰ ظ‡ظ†ط§.

   ظ„ظٹظ‡ JSON ظ…ط´ HTMLطں ظ„ط£ظ† ط§ظ„ط´ط±ط§ط¦ط­ ظ„ط§ط²ظ… طھظ„ط¨ط³ طھطµظ…ظٹظ… ط§ظ„ظ…ظ„ط²ظ…ط© ظˆطھطھط¨ط¹ ظ„ظˆظ† ط§ظ„ظ‚ظ„ظ…
   ط§ظ„ظ„ظٹ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ…ط®طھط§ط±ظ‡. ظ„ظˆ ط§ظ„ظ…ظˆط¯ظٹظ„ ط±ط¬ظ‘ط¹ HTML ظƒط§ظ† ظ‡ظٹط±ط¬ظ‘ط¹ ط³طھط§ظٹظ„ط§طھ ظ…ظ† ط¯ظ…ظ‘ظ‡
   ظˆظ‡طھط¨ظ‚ظ‰ ظ…طھظ†ط§ظپط±ط©طŒ ظˆظƒظ…ط§ظ† HTML ط¬ط§ظٹ ظ…ظ† ظ…ظˆط¯ظٹظ„ = ط«ط؛ط±ط© XSS ظ„ط§ط²ظ… طھطھظ†ط¶ظ‘ظپ.
   ========================================================================== */

/** ط­ط¯ ط§ظ„ط¥ط¯ط®ط§ظ„: ط§ظ„ظ…ظˆط¶ظˆط¹ ط³ط·ط±طŒ ظˆط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ظ…ظ„ط²ظˆظ‚ ظ…ظ…ظƒظ† ظٹظƒظˆظ† ظ…ط§ط¯ط© ظƒط§ظ…ظ„ط©. */
const MAX_TOPIC_CHARS = 200;
const MAX_SOURCE_CHARS = 6000;

const MIN_SLIDES = 4;
const MAX_SLIDES = 14;

/** ط´ظƒظ„ ط§ظ„ط´ط±ظٹط­ط© ط§ظ„ظ„ظٹ ط¨ظ†ط¶ظ…ظ†ظ‡ ظ„ظ„ظƒظ„ط§ظٹظ†طھ. */
interface Slide {
  title: string;
  bullets: string[];
  note: string;
  code: string | null;
}

/**
 * طھظ†ط¶ظٹظپ ط´ط±ظٹط­ط© ظˆط§ط­ط¯ط© ط¬ط§ظٹظ‘ط© ظ…ظ† ط§ظ„ظ…ظˆط¯ظٹظ„.
 * ط§ظ„ظ…ظˆط¯ظٹظ„ ط¨ظٹظ‡ظ„ظˆط³ ظپظٹ ط§ظ„ط´ظƒظ„ ظƒطھظٹط±: bullets طھظٹط¬ظٹ string ظˆط§ط­ط¯ط©طŒ ط£ظˆ
 * code ظٹظٹط¬ظٹ objectطŒ ط£ظˆ ط­ظ‚ظˆظ„ ظ†ط§ظ‚طµط©. ط§ظ„ظƒظ„ط§ظٹظ†طھ ظ…ط´ ط§ظ„ظ…ظپط±ظˆط¶ ظٹط´ظˆظپ ط¯ظ‡.
 */
function coerceSlide(raw: unknown): Slide | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const title = typeof o.title === "string" ? o.title.trim().slice(0, 120) : "";
  if (!title) return null;

  // bullets: ظ…ظ…ظƒظ† طھظٹط¬ظٹ array ط£ظˆ ظ†طµ ظپظٹظ‡ ط£ط³ط·ط±
  let bullets: string[] = [];
  if (Array.isArray(o.bullets)) {
    bullets = o.bullets
      .filter((b): b is string => typeof b === "string")
      .map((b) => b.trim().replace(/^[-*â€¢]\s*/, ""))
      .filter(Boolean)
      .slice(0, 5)
      .map((b) => b.slice(0, 220));
  } else if (typeof o.bullets === "string") {
    bullets = o.bullets
      .split("\n")
      .map((b) => b.trim().replace(/^[-*â€¢]\s*/, ""))
      .filter(Boolean)
      .slice(0, 5);
  }

  const note = typeof o.note === "string" ? o.note.trim().slice(0, 400) : "";

  // ط§ظ„ظƒظˆط¯: ط¨ظ†ط´ظٹظ„ ط³ظٹط§ط¬ ط§ظ„ظ…ط§ط±ظƒط¯ط§ظˆظ† ظ„ظˆ ط§ظ„ظ…ظˆط¯ظٹظ„ ط­ط·ظ‘ظ‡ ط¬ظˆظ‡ ط§ظ„ظ‚ظٹظ…ط©
  let code: string | null = null;
  if (typeof o.code === "string" && o.code.trim()) {
    code = o.code
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/```\s*$/, "")
      .trimEnd()
      .slice(0, 900);
  }

  // ط´ط±ظٹط­ط© ط¨ط¹ظ†ظˆط§ظ† ط¨ط³ ظ…ظ† ط؛ظٹط± ط£ظٹ ظ…ط­طھظˆظ‰ ظ…ط§ظ„ظ‡ط§ط´ ظ„ط§ط²ظ…ط©
  if (bullets.length === 0 && !code && !note) return null;

  return { title, bullets, note, code };
}

export async function POST(req: Request) {
  let guard: any = null;
  let __hUser: any = null;
  let __hSupabase: any = null;
  try {
    const { user, supabase, response: authError } = await requireUser("success");
    __hUser = user; __hSupabase = supabase;
    if (authError) return authError;

    // ظ†ظپط³ ط­ط¯ طھظˆظ„ظٹط¯ ط§ظ„ط®ط·ط© â€” ط§ظ„ط·ظ„ط¨ ط¯ظ‡ ط¨ظٹط·ظ„ط¹ طھظˆظƒظ†ط² ظƒطھظٹط± ظپظٹ ظ†ط¯ط§ط، ظˆط§ط­ط¯
    const limited = checkRateLimit(`slides:${user.id}`, 8, 60_000, "success");
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
    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b", { cost: 5 });
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط¨ط¹ظˆطھط© ط؛ظٹط± طµط§ظ„ط­ط©." },
        { status: 400 }
      );
    }

    const topic = clampText((body as Record<string, unknown>).topic, MAX_TOPIC_CHARS).trim();
    const source = clampText((body as Record<string, unknown>).source, MAX_SOURCE_CHARS).trim();
    const rawCount = Number((body as Record<string, unknown>).slideCount);

    if (!topic) {
      return NextResponse.json(
        { success: false, error: "ط§ظƒطھط¨ ظ…ظˆط¶ظˆط¹ ط§ظ„ط¹ط±ط¶ ط§ظ„ط£ظˆظ„." },
        { status: 400 }
      );
    }

    const slideCount =
      Number.isInteger(rawCount) && rawCount >= MIN_SLIDES && rawCount <= MAX_SLIDES
        ? rawCount
        : 8;

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      console.error("generate-slides: GROQ_API_KEY ط؛ظٹط± ظ…ط¹ط±ظپ");
      await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ""), (guard as any)?.refId ?? "");
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط®ط¯ظ…ط© ط؛ظٹط± ظ…طھط§ط­ط© ط­ط§ظ„ظٹط§ظ‹." },
        { status: 503 }
      );
    }

    const groq = new Groq({ apiKey });

    const system = `ط£ظ†طھ ط¨طھط¬ظ‡ظ‘ط² ط¹ط±ط¶ طھظ‚ط¯ظٹظ…ظٹ طھط¹ظ„ظٹظ…ظٹ. ط£ط®ط±ط¬ JSON ظپظ‚ط·.

ط§ظ„ط´ظƒظ„ ط§ظ„ظ…ط·ظ„ظˆط¨ ط¨ط§ظ„ط­ط±ظپ:
{"slides":[{"title":"ط¹ظ†ظˆط§ظ† ظ‚طµظٹط±","bullets":["ظ†ظ‚ط·ط©","ظ†ظ‚ط·ط©"],"note":"ظƒظ„ط§ظ… ط§ظ„ظ…طھط­ط¯ط«","code":"ظƒظˆط¯ ط£ظˆ null"}]}

ظ‚ظˆط§ط¹ط¯ ظ„ط§ط²ظ… طھطھط¨ط¹ظ‡ط§:
- ط§ظƒطھط¨ ط¨ط§ظ„ط¹ط±ط¨ظٹط© ط§ظ„ظ…طµط±ظٹط© ط§ظ„ط¨ط³ظٹط·ط©طŒ ظˆط§ظ„ظ…طµط·ظ„ط­ط§طھ ط§ظ„طھظ‚ظ†ظٹط© ط³ظٹط¨ظ‡ط§ ط¨ط§ظ„ط¥ظ†ط¬ظ„ظٹط²ظٹط© ط²ظٹ ظ…ط§ ظ‡ظٹ.
- ظƒظ„ ط´ط±ظٹط­ط©: ظ…ظ† ظ†ظ‚ط·طھظٹظ† ظ„ط£ط±ط¨ط¹ ظ†ظ‚ط· ط¨ط§ظ„ظƒطھظٹط±. ظƒظ„ ظ†ظ‚ط·ط© ط³ط·ط± ظˆط§ط­ط¯ ظ‚طµظٹط± â€” ط¯ظٹ ط´ط±ظٹط­ط© ط¹ط±ط¶ ظ…ط´ طµظپط­ط© ظƒطھط§ط¨.
- "note" = ط§ظ„ظ„ظٹ ط§ظ„ظ…طھط­ط¯ط« ط¨ظٹظ‚ظˆظ„ظ‡ ط´ط±ط­ط§ظ‹ ظ„ظ„ط´ط±ظٹط­ط©طŒ ط³ط·ط±ظٹظ† ط¹ظ„ظ‰ ط§ظ„ط£ظƒط«ط±.
- "code" = ظ…ظ‚طھط·ظپ ط­ط±ظپظٹ طµط؛ظٹط± ظ„ظˆ ط§ظ„ط´ط±ظٹط­ط© ظ…ط­طھط§ط¬ط§ظ‡ (ظƒظˆط¯طŒ ظ…ط¹ط§ط¯ظ„ط©طŒ طھط¹ط±ظٹظپطŒ ط¬ظ…ظ„ط© ط¨ظ„ط؛ط© ط£ط¬ظ†ط¨ظٹط©)طŒ ظˆط¥ظ„ط§ null. ظ…ظ† ط؛ظٹط± ط³ظٹط§ط¬ \`\`\`. ط£ظ‚طµظ‰ ظ،ظ¢ ط³ط·ط±. ظ„ظ„ظ…ظˆط§ط¯ ط§ظ„ظ„ظٹ ظ…ط§ظ„ظ‡ط§ط´ ظ…ظ‚طھط·ظپط§طھ ط­ط±ظپظٹط© ط³ظٹط¨ظ‡ null ط¯ط§ظٹظ…ط§ظ‹.
- ط£ظˆظ„ ط´ط±ظٹط­ط© ظ…ظ‚ط¯ظ…ط© ظ„ظ„ظ…ظˆط¶ظˆط¹طŒ ظˆط¢ط®ط± ط´ط±ظٹط­ط© ط®ظ„ط§طµط© ط£ظˆ ط§ظ„ط®ط·ظˆط© ط§ظ„ظ„ظٹ ط¨ط¹ط¯ظ‡ط§.
- ظ…ظ…ظ†ظˆط¹ طھظƒط±ط§ط± ظ†ظپط³ ط§ظ„ظ†ظ‚ط·ط© ظپظٹ ط£ظƒطھط± ظ…ظ† ط´ط±ظٹط­ط©.`;

    const userPrompt = source
      ? `ط§ط¹ظ…ظ„ ط¹ط±ط¶ ظ…ظ† ${slideCount} ط´ط±ط§ظٹط­ ط¹ظ† "${topic}"طŒ ظ…ط¨ظ†ظٹ ط¹ظ„ظ‰ ط§ظ„ظ…ط­طھظˆظ‰ ط¯ظ‡:\n\n${source}`
      : `ط§ط¹ظ…ظ„ ط¹ط±ط¶ ظ…ظ† ${slideCount} ط´ط±ط§ظٹط­ ط¹ظ† "${topic}".`;

    const usage = resolveUsageRequestContext(req, __hUser?.id ?? null, { feature: "slides" });
    // C4 (shadow): one event per ACTUAL provider request (this route has no loop -> attemptNo 0).
    const doneMs = startProviderAttempt();
    const completion = await groq.chat.completions.create({
      model: GROQ_MODELS.advanced,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    })
      .catch(async (err) => {
        // C4.1: the provider request itself failed -> no response at all.
        // Rethrow so the route keeps its EXACT existing error behaviour.
        // âڑ ï¸ڈ `async` + `await`: land the write BEFORE the rethrow.
        await recordDirectProviderAttempt({
          usage, feature: "slides", attemptNo: 0, provider: "groq", model: GROQ_MODELS.advanced,
          status: "failed_no_response", latencyMs: doneMs(),
        });
        throw err;
      });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    await recordDirectProviderAttempt({ usage, feature: "slides", attemptNo: 0, provider: "groq", model: GROQ_MODELS.advanced, status: rawContent ? "completed" : "failed_after_response", promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, latencyMs: doneMs() });
    if (!rawContent) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      return NextResponse.json(
        { success: false, error: "ظ…ط±ط¬ط¹ط´ ط£ظٹ ظ…ط­طھظˆظ‰. ط­ط§ظˆظ„ طھط§ظ†ظٹ." },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("generate-slides: JSON ظ…ظƒط³ظˆط± ظ…ظ† ط§ظ„ظ…ظˆط¯ظٹظ„");
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط±ط¯ ط¬ظ‡ ط¨ط´ظƒظ„ ط؛ظٹط± ظ…ظپظ‡ظˆظ…. ط­ط§ظˆظ„ طھط§ظ†ظٹ." },
        { status: 502 }
      );
    }

    const rawSlides = (parsed as Record<string, unknown>)?.slides;
    if (!Array.isArray(rawSlides)) {
      console.error("generate-slides: ط±ط¯ ط¨ط¯ظˆظ† ظ…طµظپظˆظپط© slides");
      return NextResponse.json(
        { success: false, error: "ظ…ظ‚ط¯ط±طھط´ ط£ط¨ظ†ظٹ ط§ظ„ط¹ط±ط¶. ط­ط§ظˆظ„ طھط§ظ†ظٹ." },
        { status: 502 }
      );
    }

    const slides = rawSlides
      .map(coerceSlide)
      .filter((s): s is Slide => s !== null)
      .slice(0, MAX_SLIDES);

    if (slides.length === 0) {
      return NextResponse.json(
        { success: false, error: "ط§ظ„ط´ط±ط§ظٹط­ ط±ط¬ط¹طھ ظپط§ط¶ظٹط©. ط¬ط±ظ‘ط¨ طھظˆط¶ظ‘ط­ ط§ظ„ظ…ظˆط¶ظˆط¹ ط£ظƒطھط±." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: { topic, slides } });
  } catch (error: unknown) {
    try { if (guard && (guard as any)?.refId) await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ''), (guard as any).refId); } catch {}
    console.error("generate-slides error:", error);
    const status = (error as { status?: number })?.status;
    const isRate = status === 429 || status === 413;
    return NextResponse.json(
      {
        success: false,
        error: isRate
          ? "ط§ظ„ط®ط¯ظ…ط© ظ…ط´ط؛ظˆظ„ط© ط¯ظ„ظˆظ‚طھظٹ. ط­ط§ظˆظ„ طھط§ظ†ظٹ ط¨ط¹ط¯ ط¯ظ‚ظٹظ‚ط©."
          : "ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، طھظˆظ„ظٹط¯ ط§ظ„ط¹ط±ط¶. ط­ط§ظˆظ„ طھط§ظ†ظٹ.",
      },
      { status: isRate ? 429 : 500 }
    );
  }
}


