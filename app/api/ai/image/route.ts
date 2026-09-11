/**
 * /api/ai/image — توليد الصور التعليمية (خدمة الاستوديو)
 *
 * المزوّدون المدفوعون مع Fallback: DALL-E 3 → Flux Pro → SDXL.
 * الباقة بتحدد الموديلات المتاحة (الجدول في service-registry).
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import {
  generateEducationalImage,
  type ImageModel,
  type ImageSize,
  type ImageStyle,
} from "@/lib/ai/image-generator";
import { consumeServiceQuota, IMAGE_MODELS_BY_TIER } from "@/lib/ai/service-registry";

const MAX_PROMPT_CHARS = 1000;
const VALID_SIZES: ImageSize[] = ["1024x1024", "1024x1792", "1792x1024"];
const VALID_STYLES: ImageStyle[] = ["educational", "realistic", "cartoon", "infographic"];
const VALID_MODELS: ImageModel[] = ["dall-e-3", "flux-pro", "stable-diffusion-xl"];

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // الباقة بتحدد هل الخدمة متاحة أصلًا + الحد اليومي
    const quota = await consumeServiceQuota(supabase, user.id, "image");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { message: quota.reasonAr, code: "QUOTA_EXCEEDED", tier: quota.tier, resetAtUtc: quota.resetAtUtc } },
        { status: 402 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const prompt = String(body?.prompt ?? "").trim().slice(0, MAX_PROMPT_CHARS);
    if (prompt.length < 3) {
      return NextResponse.json(
        { error: { message: "اكتب وصفًا واضحًا للصورة (٣ أحرف على الأقل)." } },
        { status: 400 }
      );
    }

    const size = VALID_SIZES.includes(body?.size as ImageSize)
      ? (body?.size as ImageSize)
      : "1024x1024";
    const style = VALID_STYLES.includes(body?.style as ImageStyle)
      ? (body?.style as ImageStyle)
      : "educational";

    // موديل الصور حسب الباقة — لو المطلوب مش متاح نزل لأفضل مسموح
    const allowedModels = IMAGE_MODELS_BY_TIER[quota.tier];
    const requested = VALID_MODELS.includes(body?.model as ImageModel)
      ? (body?.model as ImageModel)
      : undefined;
    const model: ImageModel =
      requested && allowedModels.includes(requested)
        ? requested
        : allowedModels[0];

    const result = await generateEducationalImage({
      prompt,
      subject: typeof body?.subject === "string" ? body.subject.slice(0, 120) : undefined,
      stage: typeof body?.stage === "string" ? body.stage.slice(0, 40) : undefined,
      model,
      size,
      style,
      language: "ar",
    });

    return NextResponse.json({
      url: result.url,
      revisedPrompt: result.revisedPrompt,
      model: result.model,
      cost: result.cost,
      quota: { remaining: quota.remaining, limit: quota.limit },
    });
  } catch (err) {
    console.error("[Image API]", err);
    return NextResponse.json(
      { error: { message: (err as Error).message || "تعذّر توليد الصورة." } },
      { status: 500 }
    );
  }
}
