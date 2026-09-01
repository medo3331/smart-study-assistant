import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";

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
    // Phase H: credit gate
    const candidates = routeCandidates(taskType);
    const hasEnt = async (k: string, v: string) => { const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v }); return Boolean(data); };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) return NextResponse.json({ error: { message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b", { isVisionOrFile: true });
    if (!guard.ok) return guard.response;
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
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
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
