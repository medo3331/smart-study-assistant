import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";

const ACTIONS = ["summarize", "extract", "analyze", "question"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;
    const limited = checkRateLimit(`file-analysis:${user.id}`, 6, 60_000, "message");
    if (limited) return limited;

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const materialId = clampText(body?.materialId, 100);
    const action = body?.action;
    const question = clampText(body?.question, 2000);
    if (!materialId || !ACTIONS.includes(action as Action)) {
      return NextResponse.json({ error: { message: "اختَر ملفًا ونوع تحليل صالحًا." } }, { status: 400 });
    }
    if (action === "question" && question.length < 3) {
      return NextResponse.json({ error: { message: "اكتب السؤال عن الملف أولًا." } }, { status: 400 });
    }

    const { data: material, error: materialError } = await supabase
      .from("materials")
      .select("title, content")
      .eq("id", materialId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (materialError || !material?.content?.trim()) {
      return NextResponse.json({ error: { message: "الملف غير موجود أو لا يحتوي نصًا قابلًا للتحليل." } }, { status: 404 });
    }

    const instruction: Record<Action, string> = {
      summarize: "لخّص الملف في نقاط مرتبة، ثم اذكر أهم 3 أفكار.",
      extract: "استخرج الحقائق والمصطلحات والأرقام والخطوات المهمة بدقة، من دون إضافة معلومات خارج الملف.",
      analyze: "حلّل المحتوى: الأفكار الرئيسية، العلاقات، نقاط القوة أو الغموض، والاستنتاجات المدعومة بالنص فقط.",
      question: `أجب عن هذا السؤال من الملف فقط: ${question}`,
    };
    const taskType = "file_analysis" as const;
    let completion;
    try {
      completion = await aiRouter.completeChat(taskType, {
        messages: [
          { role: "system", content: "أنت محلل ملفات دقيق. لا تدّعِ رؤية الملف الأصلي؛ أمامك النص المستخرج منه فقط. إن لم تجد الإجابة في النص، قل ذلك بوضوح." },
          { role: "user", content: `اسم الملف: ${material.title}\n\nالمطلوب: ${instruction[action as Action]}\n\n--- النص المستخرج ---\n${material.content.slice(0, 50_000)}\n--- نهاية النص ---` },
        ],
        temperature: 0.2,
      });
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      return NextResponse.json({ error: { message: error.status === 429 ? "Gemini مشغول حاليًا. حاول تاني بعد شوية." : "تعذّر تحليل الملف حاليًا." } }, { status: error.status === 429 ? 429 : 502 });
    }
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType, status: "completed", usage: completion.usage, contentLength: completion.content.length });
    return NextResponse.json({ result: completion.content, provider: completion.provider, model: completion.model });
  } catch (error) {
    console.error("file analysis error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء تحليل الملف." } }, { status: 500 });
  }
}
