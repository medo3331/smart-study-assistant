import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";

export type LessonQuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
};

const SYSTEM_PROMPT = `أنت مولّد اختبارات تعليمية. مهمتك: إنتاج أسئلة اختيار من متعدد (MCQ) باللغة العربية بناءً على الدرس المحدد.

قواعد صارمة:
- أرجع JSON فقط، بدون أي نص خارج JSON، بدون علامات markdown.
- الشكل بالضبط: [{"question":"...","options":["...","...","...","..."],"correctIndex":0}]
- كل سؤال يجب أن يحتوي 4 خيارات (options) بالضبط.
- correctIndex رقم من 0 إلى 3.
- لا تختلق معلومات غير موجودة في سياق الدرس.
- لا تضف أي شرح أو تعليق خارج JSON.`;

function extractJsonArray(raw: string): unknown {
  if (!raw) return null;
  const text = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateQuestions(parsed: unknown): LessonQuizQuestion[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out: LessonQuizQuestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const q = item as Record<string, unknown>;
    if (typeof q.question !== "string" || !q.question.trim()) return null;
    if (!Array.isArray(q.options) || q.options.length !== 4) return null;
    if (!q.options.every((o) => typeof o === "string" && o.trim().length > 0)) return null;
    const ci = q.correctIndex;
    if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci > 3) return null;
    out.push({
      question: q.question.trim(),
      options: q.options.map((o) => String(o).trim()),
      correctIndex: ci,
    });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = checkRateLimit("lesson-quiz:" + user.id, 6, 60_000, "message");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: { message: "بيانات الطلب غير صالحة." } }, { status: 400 });
    }

    const topic = typeof (body as { topic?: unknown }).topic === "string" ? (body as { topic: string }).topic.trim() : "";
    const subject = typeof (body as { subject?: unknown }).subject === "string" ? (body as { subject: string }).subject.trim() : "";
    const description = typeof (body as { description?: unknown }).description === "string" ? (body as { description: string }).description.trim() : "";
    const count = Math.min(Math.max(Number((body as { count?: unknown }).count ?? 4) || 4, 1), 10);

    if (!topic) {
      return NextResponse.json({ error: { message: "الموضوع مطلوب." } }, { status: 400 });
    }

    const userPrompt = "موضوع الدرس: \"" + topic + "\"" + (subject ? " (مادة: " + subject + ")" : "") + (description ? " — وصف: " + description : "") + ".\nأنتج " + count + " أسئلة اختيار من متعدد (4 خيارات لكل سؤال) لاختبار فهم الطالب. أرجع JSON فقط.";

    const candidates = routeCandidates("chat");
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json({ error: { message: "هذه المهمة تتطلب صلاحية.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    let completion;
    try {
      completion = await aiRouter.completeChat("chat", {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (!(error instanceof AiProviderError)) throw error;
      const status = error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return NextResponse.json(
        { error: { message: status === 429 ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء توليد الاختبار. حاول تاني.", code: status === 429 ? "PROVIDER_RATE_LIMIT" : status === 503 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR" } },
        { status }
      );
    }

    const parsed = extractJsonArray(completion.content);
    const questions = validateQuestions(parsed);
    if (!questions) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      return NextResponse.json(
        { error: { message: "تعذّر تحليل أسئلة الاختبار. حاول تاني.", code: "INVALID_OUTPUT" } },
        { status: 502 }
      );
    }

    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("lesson-quiz error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء توليد الاختبار." } }, { status: 500 });
  }
}
