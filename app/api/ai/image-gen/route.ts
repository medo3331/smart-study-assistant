import { NextResponse } from "next/server";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import {
  generateEducationalImage,
  imageProviderFor,
} from "@/lib/ai/image-generator";
import { OPENROUTER_IMAGE_MODELS } from "@/lib/ai/openrouter-image";

/**
 * /api/ai/image-gen — توليد صورة من prompt (زرار صفحة الإنشاء).
 *
 * ⚠️ **التغيير (2026-11-12)**: كان المسار ده معتمد على
 *    `aiRouter.generateImage` ⇒ `AI_PROVIDER_BY_TASK.image_generation`
 *    = **"gemini"** ⇒ موديل `gemini-3.1-flash-image` ⇒ مع شيل مفتاح
 *    Gemini (كان باطل من الأصل) المسار بقى **ميتّ 100%** (502 على كل
 *    ضغطة) — و`mediaOnly` في الراوتر بيوديّد المسار في فرع المزوّد
 *    الواحد، فمافيش fallback خالص.
 *
 *    ⇒ دلوقتي بيمشي على **الطبقة المشتركة** (`generateEducationalImage`)
 *    زي استوديو الصور التعليمية بالظبط:
 *      OpenRouter (`black-forest-labs/flux.2-pro`) → Pollinations (مجاني)
 *      → DALL-E 3 → Flux Pro → SDXL.
 *
 *    ⇒ **منطق واحد للتوليد في المشروع كله** + شبكة أمان مجانية.
 */

const MAX_PROMPT_CHARS = 1000;

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;
    const limited = await checkRateLimit(`image-gen:${user.id}`, 3, 60_000, "message");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const prompt = clampText(body?.prompt, MAX_PROMPT_CHARS).trim();
    if (prompt.length < 3) {
      return NextResponse.json({ error: { message: "اكتب وصفًا واضحًا للصورة (٣ أحرف على الأقل)." } }, { status: 400 });
    }

    // Phase H: 1 credit gate for image generation (free model — no entitlement, but credit required)
    const guard = await guardAiAccessAndReserve(
      supabase,
      user.id,
      OPENROUTER_IMAGE_MODELS["flux-2-pro"],
    );
    if (!guard.ok) return guard.response;
    try {
      const image = await generateEducationalImage({
        prompt,
        model: "openrouter-flux",
        size: "1024x1024",
        style: "educational",
        language: "ar",
      });
      const provider = imageProviderFor(image.model);
      void recordAiOperation(supabase, { userId: user.id, provider, model: image.model, taskType: "image_generation", status: "completed" });
      return NextResponse.json({
        image: image.url,
        provider,
        model: image.model,
        cost: image.cost,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      void recordAiOperation(supabase, { userId: user.id, provider: "openrouter", model: "flux.2-pro", taskType: "image_generation", status: "failed" });
      const status = (error as { status?: number })?.status;
      const message =
        status === 429 ? "توليد الصور مشغول حاليًا. حاول تاني بعد شوية."
        : status === 402 ? "رصيد مزوّد توليد الصور خلص. جرّب تاني بعد ما يتجدّد."
        : "تعذّر توليد الصورة. جرّب وصفًا مختلفًا أو حاول تاني.";
      return NextResponse.json({ error: { message } }, { status: status === 400 ? 400 : status === 429 || status === 402 ? status : 502 });
    }
  } catch (error) {
    console.error("image generation error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء توليد الصورة." } }, { status: 500 });
  }
}
