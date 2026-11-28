import { recordDirectProviderAttempt, startProviderAttempt } from "@/lib/ai/direct-provider-usage";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, after } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  QUIZ_MODEL_GROQ,
  QUIZ_TOTAL_QUESTIONS,
  QUIZ_BANK_MIN_ROWS,
  buildQuizPrompt,
  isStoredQuestionArray,
  parseQuestions,
  pickBankRow,
  toClientQuestions,
  type BankCandidateRow,
  type StoredQuestion,
} from "@/lib/worship-quiz-bank";

/* ==========================================================================
   /api/worship/quiz — الأسئلة الدينية (مركز العبادات)
   POST واحد by action: generate | submit — نمط generate-game-questions.

   generate: ① بنك الأسئلة الجاهزة (db/123) أولاً — صف من الأقل استخداماً
                (ومش من آخر ٣ جلسات للمستخدم) → جلسة فوراً بدون أي حجز
                كريديت ولا نداء AI (ده اللي بيحلّ البطء/الـ timeout).
             ② لو البنك فاضي/مش متاح → المسار المباشر زي ما هو: AI يولّد
                ١٠ أسئلة اختيار من متعدد (مصادر موثوقة فقط) → الجلسة
                تُخزَّن في worship_quiz_sessions **بالإجابات الصحيحة** (سيرفر
                فقط) → الكلاينت يستلم الأسئلة بدون correct.
   submit:   الكلاينت يرجّع اختياراته بس → تصحيح سيرفري من الجلسة المحفوظة
             (إثبات D-M-04 نفسه) → award_coins(worship_quiz, 'quiz:<id>').
             وبعد الرد: لو صفوف البنك ناقصة → إعادة تعبئة خلفية عبر after().

   ⚠️ فرع worship_quiz في award_coins (db/121) بيتحقق من صف جلسة مكتملة
      (completed_at not null) مملوكة للمستخدم بالمرجع 'quiz:<uuid>' —
      الجدول وعقد الإثبات في db/120-worship-quiz.sql.
   ⚠️ worship_quiz_bank مفيش عليه أي RLS policy — الوصول له عبر
      service-role client حصراً (lib/supabase/admin.ts).
   ========================================================================== */

const QUIZ_CREDIT_MODEL = "openai/gpt-oss-120b";
const TOTAL_QUESTIONS = QUIZ_TOTAL_QUESTIONS;

/** إعادة التعبئة الخلفية: صفتين من Groq في النداء الواحد. */
const BANK_REFILL_BATCHES = 2;

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

/** مفتاح Groq من البيئة (نفس ترتيب المفاتيح في باقي الـ routes). */
function groqApiKey(): string {
  return (process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || "").trim();
}

/* ==========================================================================
   ① مسار البنك — قراءة مجموعة جاهزة وفتح الجلسة فوراً
   ==========================================================================
   بيرجّع Response جاهز لو لقى صف صالح، أو null لو البنك فاضي/مش متاح
   (فيسقط النداء للمسار المباشر). أي فشل هنا صامت — البنك تحسين مش عقد. */
async function tryServeFromBank(
  supabase: any,
  userId: string,
): Promise<Response | null> {
  let service: ReturnType<typeof createServiceClient> | null = null;
  try {
    service = createServiceClient();
  } catch {
    // مفتاح الـ service مش متظبط — البنك مش متاح، نمشي على المسار المباشر.
    return null;
  }

  try {
    // آخر ٣ جلسات للمستخدم — بنفضّل مجموعة مش من بينها (تنويع الأسئلة).
    const { data: recent } = await supabase
      .from("worship_quiz_sessions")
      .select("bank_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    const recentBankIds = ((recent ?? []) as { bank_id: string | null }[])
      .map((r) => r.bank_id)
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id));

    // مرشّحو البنك — عبر service client (مفيش RLS policies على الجدول).
    const { data: rows, error } = await service
      .from("worship_quiz_bank")
      .select("id, questions, used_count, last_used_at")
      .order("last_used_at", { ascending: true, nullsFirst: true })
      .order("used_count", { ascending: true })
      .limit(50);
    if (error || !rows || rows.length === 0) return null;

    const chosen = pickBankRow(rows as BankCandidateRow[], recentBankIds);
    if (!chosen) return null;

    const bankRow = (rows as Array<{ id: string; questions: unknown }>).find(
      (r) => r.id === chosen.id,
    );
    // محتوى الـ jsonb ممكن يكون أي حاجة — نتحقق قبل ما نقدّمه للمستخدم.
    if (!bankRow || !isStoredQuestionArray(bankRow.questions)) return null;
    const questions: StoredQuestion[] = bankRow.questions;

    // الجلسة للمستخدم — نفس عقد db/120 (الإجابات الصحيحة سيرفر فقط)
    // + bank_id كإثبات المصدر (db/123). الإدراج عبر عميل المستخدم
    // (سياسة RLS owner insert بتغطيه).
    const { data: session, error: insertError } = await supabase
      .from("worship_quiz_sessions")
      .insert({
        user_id: userId,
        questions,
        answers: null,
        score: 0,
        total: TOTAL_QUESTIONS,
        bank_id: chosen.id,
      })
      .select("id")
      .single();
    if (insertError || !session) {
      console.error("worship-quiz bank session insert failed:", insertError?.message);
      return null;
    }

    // إحصاءات الاستهلاك — فشلها مش مهم (المصدر متسجّل أصلاً في الجلسة).
    try {
      await service
        .from("worship_quiz_bank")
        .update({
          used_count: (chosen.used_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", chosen.id);
    } catch {
      // صامت — عدّاد فقط.
    }

    return NextResponse.json({
      sessionId: session.id as string,
      questions: toClientQuestions(questions),
    });
  } catch (e) {
    // أي خطأ في مسار البنك مامايعطّلش المستخدم — fallback للمسار المباشر.
    console.warn("worship-quiz bank path failed (fallback to direct):", e);
    return null;
  }
}

/* ==========================================================================
   إعادة التعبئة الخلفية — بتتنده عبر after() بعد رد submit
   ==========================================================================
   لو صفوف البنك أقل من الحد، بنولّد صفتين جداد بنفس البرومبت والتحقق
   ونكتبهم بالـ service client. كل حاجة هنا تفشل بصمت — دي صيانة
   خلفية مش طلب المستخدم. */
async function refillQuizBankIfLow(): Promise<void> {
  try {
    const service = createServiceClient();
    const { count } = await service
      .from("worship_quiz_bank")
      .select("id", { count: "exact", head: true });
    if (typeof count === "number" && count >= QUIZ_BANK_MIN_ROWS) return;

    const apiKey = groqApiKey();
    if (!apiKey) return;
    const groq = new Groq({ apiKey });

    for (let i = 0; i < BANK_REFILL_BATCHES; i++) {
      try {
        const completion = await groq.chat.completions.create({
          model: QUIZ_MODEL_GROQ,
          messages: [
            {
              role: "system",
              content:
                "أنت مساعد تعليمي ديني يُخرج رده بصيغة JSON صالحة فقط، والتزم بالمصادر الموثوقة دون أحاديث ضعيفة أو خلافات فقهية.",
            },
            { role: "user", content: buildQuizPrompt() },
          ],
          temperature: 0.7,
        });
        const questions = parseQuestions(
          completion.choices[0]?.message?.content || "",
        );
        if (!questions) continue; // مخرجات مش مطابقة — نتجاهل الدفعة دي بصمت.
        await service.from("worship_quiz_bank").insert({
          questions,
          model: QUIZ_MODEL_GROQ,
        });
      } catch {
        // صامت — دفعة فاشلة مش مشكلة، الجاي هيعبّي.
      }
    }
  } catch {
    // صامت بالكامل.
  }
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
      // ① البنك أولاً — استجابة فورية، بدون حجز كريديت ولا نداء AI.
      //    (بيرجّع رد جاهز أو null — أي فشل فيه بينزل للمسار المباشر تحت.)
      const bankResponse = await tryServeFromBank(supabase, user.id);
      if (bankResponse) return bankResponse;

      // ② المسار المباشر (Groq) — زي ما هو: حجز كريديت ثم توليد.
      // Phase H: 1 credit gate (free model, but still costs credit — no anonymous bypass)
      const g = await guardAiAccessAndReserve(supabase, user.id, QUIZ_CREDIT_MODEL);
      if (!g.ok) return g.response;
      guard = g;

      const apiKey = groqApiKey();
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
          { role: "user", content: buildQuizPrompt() },
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
      // مولّدة مباشرة → مفيش bank_id (null).
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

      // إعادة تعبئة خلفية — لو البنك ناقص، نعبّيه بعد ما يوصل الرد للمستخدم
      // (after من next/server — Next 16). كل فشل جواها صامت.
      after(() => {
        void refillQuizBankIfLow();
      });

      return NextResponse.json({ score, total: TOTAL_QUESTIONS, awarded, balance, details });
    }

    return NextResponse.json({ error: "action غير معروف." }, { status: 400 });
  } catch (error) {
    if (guard && supabase && userId) await refundAiCreditIfNeeded(supabase, userId, guard.refId);
    console.error("Error in worship quiz route:", error);
    return NextResponse.json({ error: "حصل خطأ غير متوقع — جرّب تاني." }, { status: 500 });
  }
}
