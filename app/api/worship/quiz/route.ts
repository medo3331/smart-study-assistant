import { recordDirectProviderAttempt, startProviderAttempt } from "@/lib/ai/direct-provider-usage";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";

/* ==========================================================================
   /api/worship/quiz — الأسئلة الدينية (مركز العبادات)
   POST واحد by action: generate | submit — نمط generate-game-questions.

   generate: AI يولّد ١٠ أسئلة اختيار من متعدد (مصادر موثوقة فقط) → الجلسة
             تُخزَّن في worship_quiz_sessions **بالإجابات الصحيحة** (سيرفر
             فقط) → الكلاينت يستلم الأسئلة بدون correct.
   submit:   الكلاينت يرجّع اختياراته بس → تصحيح سيرفري من الجلسة المحفوظة
             (إثبات D-M-04 نفسه) → award_coins(worship_quiz, 'quiz:<id>').

   ⚠️ فرع worship_quiz في award_coins (db/121) بيتحقق من صف جلسة مكتملة
      (completed_at not null) مملوكة للمستخدم بالمرجع 'quiz:<uuid>' —
      الجدول وعقد الإثبات في db/120-worship-quiz.sql.
   ========================================================================== */

const QUIZ_MODEL_GROQ = "llama-3.3-70b-versatile";
const QUIZ_CREDIT_MODEL = "openai/gpt-oss-120b";
const TOTAL_QUESTIONS = 10;

/** شكل السؤال الكامل كما يُخزَّن سيرفرًا (يشمل الإجابة الصحيحة). */
type StoredQuestion = {
  question: string;
  options: string[];
  correct: number;
  source: string;
  explanation: string;
};

/** شكل السؤال المُرسَل للكلاينت — بدون correct ولا explanation. */
type ClientQuestion = {
  question: string;
  options: string[];
  source: string;
};

/** شكل تفصيل النتيجة لكل سؤال. */
type ResultDetail = {
  question: string;
  correctIndex: number;
  yourIndex: number;
  source: string;
  explanation: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * برومبت الجيل — عربي صارم: JSON فقط، ١٠ أسئلة، مصادر موثوقة حصراً.
 * المنع صريح: الأحاديث الضعيفة/الموضوعة، خلافات الفقه بين المذاهب،
 * أسئلة الرأي والاجتهاد.
 */
function buildPrompt(): string {
  return `أنت مختص في الأسئلة الدينية للطلاب المسلمين. أنشئ ١٠ أسئلة اختيار من متعدد في العلوم الدينية (قرآن كريم، حديث شريف، عقيدة، سيرة، عبادات).

قواعد صارمة ومطلقة:
١) الرد بصيغة JSON صالحة فقط — مصفوفة من ١٠ عناصر، بدون أي نصوص إضافية أو علامات Markdown (مثل \`\`\`json)، بالهيكل التالي تماماً:
[
  { "question": "نص السؤال", "options": ["الخيار ١", "الخيار ٢", "الخيار ٣", "الخيار ٤"], "correct": 0, "source": "المصدر", "explanation": "شرح موجز للإجابة الصحيحة" }
]
٢) correct رقم من ٠ إلى ٣ يشير إلى فهرس الإجابة الصحيحة في options.
٣) المصادر موثوقة فقط:
   - القرآن الكريم: اذكر اسم السورة ورقم الآية في source (مثال: "سورة البقرة، الآية ٢٨٦").
   - الحديث الشريف: من الصحيحين (البخاري ومسلم) أو الكتب الستة مع رقم الحديث أو رقم الكتاب/الباب في source (مثال: "صحيح البخاري، حديث ١").
   - العقيدة والسيرة والمعلومات المتفق عليها بين الجميع.
٤) ممنوع منعاً باتاً: الأحاديث الضعيفة أو الموضوعة أو المروية بلا إسناد معروف، الخلافات الفقهية بين المذاهب، أسئلة الرأي والاجتهاد والتقدير الشخصي.
٥) سؤال لكل عنصر، و٤ خيارات لكل سؤال، وخيار واحد صحيح فقط، وبدون تكرار للسؤال.`;
}

/** تحقق صارم من مخرجات الموديل — أي عنصر ناقص يُرفض. */
function parseQuestions(raw: string): StoredQuestion[] | null {
  const jsonStart = raw.indexOf("[");
  const jsonEnd = raw.lastIndexOf("]") + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.substring(jsonStart, jsonEnd));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const out: StoredQuestion[] = [];
  for (const item of parsed) {
    const q = item as Record<string, unknown>;
    const question = typeof q.question === "string" ? q.question.trim() : "";
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      : [];
    const correct = q.correct;
    const source = typeof q.source === "string" ? q.source.trim() : "";
    const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
    if (
      !question ||
      options.length !== 4 ||
      typeof correct !== "number" ||
      !Number.isInteger(correct) ||
      correct < 0 ||
      correct > 3 ||
      !source
    ) {
      return null;
    }
    out.push({ question, options, correct, source, explanation });
  }
  return out.length === TOTAL_QUESTIONS ? out : null;
}

function toClientQuestions(stored: StoredQuestion[]): ClientQuestion[] {
  return stored.map((q) => ({
    question: q.question,
    options: q.options,
    source: q.source,
  }));
}

export async function POST(request: Request) {
  let guard: { refId: string } | null = null;
  let supabase: any = null;
  let userId: string | null = null;
  try {
    const { user, supabase: sb, response: authError } = await requireUser("message");
    if (authError) return authError;
    supabase = sb;
    userId = user.id;
    const limited = await checkRateLimit(`worship-quiz:${user.id}`, 10, 60_000, "message");
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";

    /* ── action=generate — توليد ١٠ أسئلة وفتح جلسة جديدة ── */
    if (action === "generate") {
      // Phase H: 1 credit gate (free model, but still costs credit — no anonymous bypass)
      const g = await guardAiAccessAndReserve(supabase, user.id, QUIZ_CREDIT_MODEL);
      if (!g.ok) return g.response;
      guard = g;

      const apiKey = (process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || "").trim();
      if (!apiKey) {
        await refundAiCreditIfNeeded(supabase, userId, guard.refId);
        return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
      }
      const groq = new Groq({ apiKey });
      const doneMs = startProviderAttempt();
      // 🧾 C4: identity created ONCE for this logical request.
      const usage = resolveUsageRequestContext(request, userId ?? null, { feature: "worship-quiz" });
      const completion = await groq.chat.completions.create({
        model: QUIZ_MODEL_GROQ,
        messages: [
          { role: "system", content: "أنت مساعد تعليمي ديني يُخرج رده بصيغة JSON صالحة فقط، والتزم بالمصادر الموثوقة دون أحاديث ضعيفة أو خلافات فقهية." },
          { role: "user", content: buildPrompt() },
        ],
        temperature: 0.7,
      }).catch(async (err) => {
        // C4.1: the provider request itself failed -> no response at all.
        // ⚠️ `async` + `await`: the write must land BEFORE the rethrow.
        await recordDirectProviderAttempt({
          usage, feature: "worship-quiz", attemptNo: 0, provider: "groq", model: QUIZ_MODEL_GROQ,
          status: "failed_no_response", latencyMs: doneMs(),
        });
        throw err;
      });

      const textResult = completion.choices[0]?.message?.content || "";
      await recordDirectProviderAttempt({
        usage, feature: "worship-quiz", attemptNo: 0, provider: "groq", model: QUIZ_MODEL_GROQ,
        status: textResult ? "completed" : "failed_after_response",
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        latencyMs: doneMs(),
      });

      const questions = parseQuestions(textResult);
      if (!questions) {
        // مخرجات غير مطابقة للعقد — نرجّع الكريديت ونفشل بوضوح.
        await refundAiCreditIfNeeded(supabase, userId, guard.refId);
        return NextResponse.json({ error: "تعذّر توليد أسئلة صالحة — جرّب تاني." }, { status: 502 });
      }

      // الجلسة تُخزَّن بالإجابات الصحيحة (سيرفر فقط) — الكلاينت يستلم بدونها.
      const { data: session, error: insertError } = await supabase
        .from("worship_quiz_sessions")
        .insert({
          user_id: userId,
          questions,
          answers: null,
          score: 0,
          total: TOTAL_QUESTIONS,
        })
        .select("id")
        .single();

      if (insertError || !session) {
        console.error("worship-quiz session insert failed:", insertError?.message);
        return NextResponse.json({ error: "تعذّر بدء جلسة الأسئلة." }, { status: 500 });
      }

      return NextResponse.json({
        sessionId: session.id as string,
        questions: toClientQuestions(questions),
      });
    }

    /* ── action=submit — تصحيح سيرفري + صرف المكافأة ── */
    if (action === "submit") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      const answers = Array.isArray(body?.answers)
        ? (body.answers as unknown[])
        : null;

      if (!UUID_RE.test(sessionId)) {
        return NextResponse.json({ error: "معرّف الجلسة غير صالح." }, { status: 400 });
      }
      if (
        !answers ||
        answers.length !== TOTAL_QUESTIONS ||
        answers.some((a) => !Number.isInteger(a) || (a as number) < 0 || (a as number) > 3)
      ) {
        return NextResponse.json(
          { error: `لازم تبعت ١٠ إجابات أرقام من ٠ إلى ٣.` },
          { status: 400 },
        );
      }

      // الجلسة لازم تكون مملوكة للمستخدم ومش مكتملة — غير كده 400.
      const { data: session, error: loadError } = await supabase
        .from("worship_quiz_sessions")
        .select("id, user_id, questions, completed_at")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (loadError || !session) {
        return NextResponse.json(
          { error: "الجلسة دي مش موجودة أو مش على حسابك — ابدأ جلسة جديدة." },
          { status: 400 },
        );
      }
      if (session.completed_at) {
        return NextResponse.json(
          { error: "الجلسة دي خلصت بالفعل — ابدأ جلسة جديدة." },
          { status: 400 },
        );
      }

      const stored = (session.questions as StoredQuestion[] | null) ?? [];
      if (stored.length !== TOTAL_QUESTIONS) {
        return NextResponse.json(
          { error: "بيانات الجلسة ناقصة — ابدأ جلسة جديدة." },
          { status: 400 },
        );
      }

      // التصحيح على السيرفر — الإجابة الصحيحة من الجلسة المحفوظة مش من الكلاينت.
      let score = 0;
      const details: ResultDetail[] = [];
      for (let i = 0; i < TOTAL_QUESTIONS; i++) {
        const yourIndex = answers[i] as number;
        const correctIndex = stored[i].correct;
        if (yourIndex === correctIndex) score++;
        details.push({
          question: stored[i].question,
          correctIndex,
          yourIndex,
          source: stored[i].source,
          explanation: stored[i].explanation,
        });
      }

      const { error: updateError } = await supabase
        .from("worship_quiz_sessions")
        .update({ answers, score, total: TOTAL_QUESTIONS, completed_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .is("completed_at", null);

      if (updateError) {
        console.error("worship-quiz submit update failed:", updateError.message);
        return NextResponse.json({ error: "تعذّر تسجيل النتيجة — جرّب تاني." }, { status: 500 });
      }

      // المكافأة — award_coins مش refund: فشلها صامت، الاختبار شغّال من غير كوينز.
      // فرع worship_quiz في db/121 بيتحقق من صف الجلسة المكتملة بالمرجع ده.
      let awarded = 0;
      let balance: number | null = null;
      try {
        const { data: reward, error: awardError } = await supabase.rpc("award_coins", {
          p_source: "worship_quiz",
          p_ref_id: `quiz:${sessionId}`,
          p_metadata: { score, total: TOTAL_QUESTIONS, activity: "worship-quiz" },
        });
        if (awardError) {
          console.warn("worship_quiz award failed (متجاهَل):", awardError.message);
        } else if (reward) {
          const row = (Array.isArray(reward) ? reward[0] : reward) as { awarded?: number; balance?: number } | null;
          awarded = row?.awarded ?? 0;
          balance = row?.balance ?? null;
        }
      } catch (e) {
        console.warn("worship_quiz award failed (متجاهَل):", e);
      }

      return NextResponse.json({ score, total: TOTAL_QUESTIONS, awarded, balance, details });
    }

    return NextResponse.json({ error: "action غير معروف." }, { status: 400 });
  } catch (error) {
    if (guard && supabase && userId) await refundAiCreditIfNeeded(supabase, userId, guard.refId);
    console.error("Error in worship quiz route:", error);
    return NextResponse.json({ error: "حصل خطأ غير متوقع — جرّب تاني." }, { status: 500 });
  }
}
