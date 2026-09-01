/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { GROQ_MODELS } from "@/lib/ai-config";

/* ==========================================================================
   توليد عرض تقديمي

   بياخد موضوع (أو نص مادة كامل) وبيرجّع شرائح كـ JSON. الرندر والتصدير
   كلهم على الكلاينت — السيرفر بيرجّع داتا بس، مفيش HTML ولا PDF بيتبنى هنا.

   ليه JSON مش HTML؟ لأن الشرائح لازم تلبس تصميم الملزمة وتتبع لون القلم
   اللي المستخدم مختاره. لو الموديل رجّع HTML كان هيرجّع ستايلات من دمّه
   وهتبقى متنافرة، وكمان HTML جاي من موديل = ثغرة XSS لازم تتنضّف.
   ========================================================================== */

/** حد الإدخال: الموضوع سطر، والمحتوى الملزوق ممكن يكون مادة كاملة. */
const MAX_TOPIC_CHARS = 200;
const MAX_SOURCE_CHARS = 6000;

const MIN_SLIDES = 4;
const MAX_SLIDES = 14;

/** شكل الشريحة اللي بنضمنه للكلاينت. */
interface Slide {
  title: string;
  bullets: string[];
  note: string;
  code: string | null;
}

/**
 * تنضيف شريحة واحدة جايّة من الموديل.
 * الموديل بيهلوس في الشكل كتير: bullets تيجي string واحدة، أو
 * code ييجي object، أو حقول ناقصة. الكلاينت مش المفروض يشوف ده.
 */
function coerceSlide(raw: unknown): Slide | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const title = typeof o.title === "string" ? o.title.trim().slice(0, 120) : "";
  if (!title) return null;

  // bullets: ممكن تيجي array أو نص فيه أسطر
  let bullets: string[] = [];
  if (Array.isArray(o.bullets)) {
    bullets = o.bullets
      .filter((b): b is string => typeof b === "string")
      .map((b) => b.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean)
      .slice(0, 5)
      .map((b) => b.slice(0, 220));
  } else if (typeof o.bullets === "string") {
    bullets = o.bullets
      .split("\n")
      .map((b) => b.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean)
      .slice(0, 5);
  }

  const note = typeof o.note === "string" ? o.note.trim().slice(0, 400) : "";

  // الكود: بنشيل سياج الماركداون لو الموديل حطّه جوه القيمة
  let code: string | null = null;
  if (typeof o.code === "string" && o.code.trim()) {
    code = o.code
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/```\s*$/, "")
      .trimEnd()
      .slice(0, 900);
  }

  // شريحة بعنوان بس من غير أي محتوى مالهاش لازمة
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

    // نفس حد توليد الخطة — الطلب ده بيطلع توكنز كتير في نداء واحد
    const limited = checkRateLimit(`slides:${user.id}`, 8, 60_000, "success");
    if (limited) return limited;
    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "البيانات المبعوتة غير صالحة." },
        { status: 400 }
      );
    }

    const topic = clampText((body as Record<string, unknown>).topic, MAX_TOPIC_CHARS).trim();
    const source = clampText((body as Record<string, unknown>).source, MAX_SOURCE_CHARS).trim();
    const rawCount = Number((body as Record<string, unknown>).slideCount);

    if (!topic) {
      return NextResponse.json(
        { success: false, error: "اكتب موضوع العرض الأول." },
        { status: 400 }
      );
    }

    const slideCount =
      Number.isInteger(rawCount) && rawCount >= MIN_SLIDES && rawCount <= MAX_SLIDES
        ? rawCount
        : 8;

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      console.error("generate-slides: GROQ_API_KEY غير معرف");
      await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ""), (guard as any)?.refId ?? "");
      return NextResponse.json(
        { success: false, error: "الخدمة غير متاحة حالياً." },
        { status: 503 }
      );
    }

    const groq = new Groq({ apiKey });

    const system = `أنت بتجهّز عرض تقديمي تعليمي. أخرج JSON فقط.

الشكل المطلوب بالحرف:
{"slides":[{"title":"عنوان قصير","bullets":["نقطة","نقطة"],"note":"كلام المتحدث","code":"كود أو null"}]}

قواعد لازم تتبعها:
- اكتب بالعربية المصرية البسيطة، والمصطلحات التقنية سيبها بالإنجليزية زي ما هي.
- كل شريحة: من نقطتين لأربع نقط بالكتير. كل نقطة سطر واحد قصير — دي شريحة عرض مش صفحة كتاب.
- "note" = اللي المتحدث بيقوله شرحاً للشريحة، سطرين على الأكثر.
- "code" = مقتطف حرفي صغير لو الشريحة محتاجاه (كود، معادلة، تعريف، جملة بلغة أجنبية)، وإلا null. من غير سياج \`\`\`. أقصى ١٢ سطر. للمواد اللي مالهاش مقتطفات حرفية سيبه null دايماً.
- أول شريحة مقدمة للموضوع، وآخر شريحة خلاصة أو الخطوة اللي بعدها.
- ممنوع تكرار نفس النقطة في أكتر من شريحة.`;

    const userPrompt = source
      ? `اعمل عرض من ${slideCount} شرايح عن "${topic}"، مبني على المحتوى ده:\n\n${source}`
      : `اعمل عرض من ${slideCount} شرايح عن "${topic}".`;

    const completion = await groq.chat.completions.create({
      model: GROQ_MODELS.advanced,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    if (!rawContent) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      return NextResponse.json(
        { success: false, error: "مرجعش أي محتوى. حاول تاني." },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("generate-slides: JSON مكسور من الموديل");
      return NextResponse.json(
        { success: false, error: "الرد جه بشكل غير مفهوم. حاول تاني." },
        { status: 502 }
      );
    }

    const rawSlides = (parsed as Record<string, unknown>)?.slides;
    if (!Array.isArray(rawSlides)) {
      console.error("generate-slides: رد بدون مصفوفة slides");
      return NextResponse.json(
        { success: false, error: "مقدرتش أبني العرض. حاول تاني." },
        { status: 502 }
      );
    }

    const slides = rawSlides
      .map(coerceSlide)
      .filter((s): s is Slide => s !== null)
      .slice(0, MAX_SLIDES);

    if (slides.length === 0) {
      return NextResponse.json(
        { success: false, error: "الشرايح رجعت فاضية. جرّب توضّح الموضوع أكتر." },
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
          ? "الخدمة مشغولة دلوقتي. حاول تاني بعد دقيقة."
          : "حصل خطأ أثناء توليد العرض. حاول تاني.",
      },
      { status: isRate ? 429 : 500 }
    );
  }
}
