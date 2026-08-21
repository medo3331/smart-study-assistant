import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError, type AiTaskType } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";

const PLAN_TYPES = ["marketing_plan", "business_plan", "planning", "roadmap"] as const;

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;
    const limited = checkRateLimit(`plans:${user.id}`, 6, 60_000, "message");
    if (limited) return limited;
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const taskType = body?.type;
    const goal = clampText(body?.goal, 5000).trim();
    const context = clampText(body?.context, 5000).trim();
    if (!PLAN_TYPES.includes(taskType as (typeof PLAN_TYPES)[number]) || goal.length < 4) {
      return NextResponse.json({ error: { message: "اختَر نوع خطة واكتب هدفًا واضحًا." } }, { status: 400 });
    }
    const completion = await aiRouter.completeChat(taskType as AiTaskType, {
      messages: [
        { role: "system", content: "أنت مخطط عملي. أنشئ خطة قابلة للتنفيذ بالعربية: الهدف، الافتراضات، المراحل، خطوات واضحة، جدول زمني، مؤشرات نجاح، ومخاطر أو معلومات ناقصة. لا تخترع أرقامًا أو حقائق خارج السياق." },
        { role: "user", content: `نوع الخطة: ${taskType}\nالهدف: ${goal}${context ? `\nالسياق: ${context}` : ""}` },
      ],
      temperature: 0.3,
    }).catch((error) => { throw error; });
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: taskType as AiTaskType, status: "completed", usage: completion.usage, contentLength: completion.content.length });
    return NextResponse.json({ result: completion.content, provider: completion.provider, taskType });
  } catch (error) {
    if (error instanceof AiProviderError) return NextResponse.json({ error: { message: error.status === 429 ? "Gemini مشغول حاليًا. حاول تاني بعد شوية." : "تعذّر إنشاء الخطة حاليًا." } }, { status: error.status === 429 ? 429 : 502 });
    console.error("plan error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء إنشاء الخطة." } }, { status: 500 });
  }
}
