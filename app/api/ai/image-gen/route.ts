import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";

const MAX_PROMPT_CHARS = 1000;

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;
    const limited = checkRateLimit(`image-gen:${user.id}`, 3, 60_000, "message");
    if (limited) return limited;

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const prompt = clampText(body?.prompt, MAX_PROMPT_CHARS).trim();
    if (prompt.length < 3) {
      return NextResponse.json({ error: { message: "اكتب وصفًا واضحًا للصورة (٣ أحرف على الأقل)." } }, { status: 400 });
    }

    // Phase H: 1 credit gate for image generation (free model — no entitlement, but credit required)
    const guard = await guardAiAccessAndReserve(supabase, user.id, "gemini-3.1-flash-image");
    if (!guard.ok) return guard.response;
    try {
      const image = await aiRouter.generateImage({ prompt });
      void recordAiOperation(supabase, { userId: user.id, provider: image.provider, model: image.model, taskType: "image_generation", status: "completed" });
      return NextResponse.json({ image: `data:${image.mimeType};base64,${image.data}`, provider: image.provider, model: image.model });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (!(error instanceof AiProviderError)) throw error;
      void recordAiOperation(supabase, { userId: user.id, provider: "gemini", model: "gemini-image", taskType: "image_generation", status: "failed" });
      const message =
        error.status === 429 ? "توليد الصور مشغول حاليًا. حاول تاني بعد شوية."
        : error.status === 503 ? "توليد الصور غير مهيّأ على السيرفر."
        : "تعذّر توليد الصورة. جرّب وصفًا مختلفًا أو حاول تاني.";
      return NextResponse.json({ error: { message } }, { status: error.status === 400 ? 400 : error.status === 429 || error.status === 503 ? error.status : 502 });
    }
  } catch (error) {
    console.error("image generation error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء توليد الصورة." } }, { status: 500 });
  }
}
