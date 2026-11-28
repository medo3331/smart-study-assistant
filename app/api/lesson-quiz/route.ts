import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
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

/** G7 — إصدار الـ prompt: أي تغيير في صياغة التوليد ⇒ مفتاح كاش جديد. */
const PROMPT_VERSION = "v1";
const QUIZ_LANGUAGE = "ar";

/**
 * G7 (P1-8) — بصمة المحتوى: sha256(topic|subject|description|count|prompt_version).
 * نفس المعاملات ⇒ نفس الأسئلة ⇒ الرد من `lesson_quiz_cache` من غير حجز
 * كريدت ولا صف جديد في `ai_operations`.
 */
function buildContentHash(topic: string, subject: string, description: string, count: number): string {
  return createHash("sha256").update(`${topic}|${subject}|${description}|${count}|${PROMPT_VERSION}`).digest("hex");
}

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

/** إثبات سيرفري (D-M-04): attempt جديد **دايمًا** لما الطالب يبدأ اختبار —
 *  الكاش بيوفر التوليد بس، مش التسجيل. فشل التسجيل ما يكسرش الاختبار. */
async function createAttempt(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  questions: LessonQuizQuestion[]
): Promise<string | null> {
  try {
    // المحاولة بتنتهي بعد ساعتين (partial index على status='pending')
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: attempt, error: attemptError } = await supabase
      .from("lesson_quiz_attempts")
      .insert({ user_id: userId, questions, total: questions.length, status: "pending", expires_at: expiresAt })
      .select("id")
      .single();
    if (!attemptError && attempt) return (attempt as { id: string }).id;
  } catch (e) {
    console.warn("lesson-quiz attempt insert failed (متجاهَل):", e);
  }
  return null;
}

/** مسار التوليد الأصلي (miss / كلاينت بدون dayId) — زي ما كان بالضبط. */
async function generateAndRespond(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  userPrompt: string
): Promise<Response> {
  const candidates = routeCandidates("chat");
  const hasEnt = async (k: string, v: string) => {
    const { data } = await supabase.rpc("has_entitlement", { p_user_id: userId, p_kind: k, p_value: v });
    return Boolean(data);
  };
  const accessible = await filterAccessibleModels(candidates, hasEnt);
  if (accessible.length === 0 && candidates.length > 0) {
    return NextResponse.json({ error: { message: "هذه المهمة تتطلب صلاحية.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
  }
  const guard = await guardAiAccessAndReserve(supabase, userId, accessible[0]?.model ?? "openai/gpt-oss-120b");
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
    await refundAiCreditIfNeeded(supabase, userId, guard.refId);
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
    await refundAiCreditIfNeeded(supabase, userId, guard.refId);
    return NextResponse.json(
      { error: { message: "تعذّر تحليل أسئلة الاختبار. حاول تاني.", code: "INVALID_OUTPUT" } },
      { status: 502 }
    );
  }

  void recordAiOperation(supabase, { userId, provider: completion.provider, model: completion.model, taskType: "chat", status: "completed", usage: completion.usage, contentLength: completion.content.length });

  const attemptId = await createAttempt(supabase, userId, questions);
  return NextResponse.json({ questions, attemptId });
}

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit("lesson-quiz:" + user.id, 6, 60_000, "message");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: { message: "بيانات الطلب غير صالحة." } }, { status: 400 });
    }

    const topic = typeof (body as { topic?: unknown }).topic === "string" ? (body as { topic: string }).topic.trim() : "";
    const subject = typeof (body as { subject?: unknown }).subject === "string" ? (body as { subject: string }).subject.trim() : "";
    const description = typeof (body as { description?: unknown }).description === "string" ? (body as { description: string }).description.trim() : "";
    const dayId = typeof (body as { dayId?: unknown }).dayId === "string" ? (body as { dayId: string }).dayId.trim() : "";
    const count = Math.min(Math.max(Number((body as { count?: unknown }).count ?? 4) || 4, 1), 10);

    if (!topic) {
      return NextResponse.json({ error: { message: "الموضوع مطلوب." } }, { status: 400 });
    }

    const userPrompt = "موضوع الدرس: \"" + topic + "\"" + (subject ? " (مادة: " + subject + ")" : "") + (description ? " — وصف: " + description : "") + ".\nأنتج " + count + " أسئلة اختيار من متعدد (4 خيارات لكل سؤال) لاختبار فهم الطالب. أرجع JSON فقط.";

    // ── G7: قراية الكاش الأول (لو فينا day_id — مفتاح الكاش الفريد بيحتاجه) ──
    if (dayId) {
      const contentHash = buildContentHash(topic, subject, description, count);
      try {
        const { data: cached } = await supabase
          .from("lesson_quiz_cache")
          .select("questions")
          .match({
            user_id: user.id,
            day_id: dayId,
            content_hash: contentHash,
            prompt_version: PROMPT_VERSION,
            language: QUIZ_LANGUAGE,
            question_count: count,
          })
          .maybeSingle();
        const cachedQuestions = validateQuestions((cached as { questions?: unknown } | null)?.questions);
        if (cachedQuestions) {
          // hit: الرد من الكاش — من غير حجز كريدت ولا نداء AI ولا صف في ai_operations.
          const attemptId = await createAttempt(supabase, user.id, cachedQuestions);
          return NextResponse.json({ questions: cachedQuestions, attemptId, cached: true });
        }
      } catch (e) {
        // فشل قراية الكاش ⇒ تكملة التوليد العادي زي ما هي.
        console.warn("lesson-quiz cache read failed (متجاهَل):", e);
      }

      const response = await generateAndRespond(supabase, user.id, userPrompt);

      // كتابة الكاش best-effort بعد توليد ناجح — فشلها ما يكسر الرد.
      if (response.status === 200) {
        const payload = (await response.clone().json().catch(() => null)) as { questions?: LessonQuizQuestion[] } | null;
        if (payload?.questions) {
          try {
            await supabase.from("lesson_quiz_cache").upsert(
              {
                user_id: user.id,
                day_id: dayId,
                content_hash: contentHash,
                prompt_version: PROMPT_VERSION,
                language: QUIZ_LANGUAGE,
                question_count: count,
                questions: payload.questions,
              },
              { onConflict: "user_id, day_id, content_hash, prompt_version, language, question_count" }
            );
          } catch (e) {
            console.warn("lesson-quiz cache write failed (متجاهَل):", e);
          }
        }
      }

      return response;
    }

    // ── بدون dayId: المسار القديم زي ما هو (كلاينت قديم) ──
    return generateAndRespond(supabase, user.id, userPrompt);
  } catch (error) {
    console.error("lesson-quiz error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء توليد الاختبار." } }, { status: 500 });
  }
}
