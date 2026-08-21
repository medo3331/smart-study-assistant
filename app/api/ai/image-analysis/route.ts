import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;
    const limited = checkRateLimit(`image-analysis:${user.id}`, 4, 60_000, "message");
    if (limited) return limited;
    const form = await req.formData();
    const file = form.get("file");
    const question = clampText(form.get("question"), 2000) || "حلّل هذه الصورة بدقة، واذكر ما يظهر فيها والنتائج المهمة.";
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: { message: "ارفع صورة صالحة حتى 5 ميجا." } }, { status: 400 });
    }
    const completion = await aiRouter.analyzeMedia("image_analysis", { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mimeType: file.type, prompt: question });
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "image_analysis", status: "completed", usage: completion.usage, contentLength: completion.content.length });
    return NextResponse.json({ result: completion.content, provider: completion.provider });
  } catch (error) {
    if (error instanceof AiProviderError) return NextResponse.json({ error: { message: "تعذّر تحليل الصورة حاليًا." } }, { status: error.status === 429 ? 429 : 502 });
    console.error("image analysis error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء تحليل الصورة." } }, { status: 500 });
  }
}
