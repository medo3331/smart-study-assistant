import { recordDirectProviderAttempt, startProviderAttempt } from "@/lib/ai/direct-provider-usage";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, after } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  QUIZ_MODEL_GROQ,
  QUIZ_TOTAL_QUESTIONS,
  QUIZ_BANK_MIN_ROWS,
  buildQuizPrompt,
  parseQuestions,
  type StoredQuestion,
} from "@/lib/worship-quiz-bank";
import {
  buildReligiousChatSystemPrompt,
  gradeQuizAnswer,
  isValidStoredQuestion,
  sliceChatContext,
  validateChatMessages,
} from "@/lib/religious-chat";

/* ==========================================================================
   /api/worship/quiz — الشات الديني التفاعلي (مركز العبادات)
   POST واحد by action: ask | quiz-start | quiz-answer — نمط generate-game-questions.

   ask:          شات ديني — رسائل المستخدم + آخر سياق المحادثة → رد بمصادر
                 موثوقة فقط (برومبت النظام في lib/religious-chat.ts). نداء AI
                 فعلي → حجز كريديت + refund عند الفشل + C4/C4.1 محاسبة.
   quiz-start:   وضع «اختبرني» — سؤال **واحد** من بنك الأسئلة الجاهز
                 (worship_quiz_bank — db/123، service-role فقط، بدون حجز
                 كريديت ولا نداء AI) + فتح جلسة worship_quiz_sessions
                 (db/120) نبدأ بملئها سؤالاً بسؤال.
   quiz-answer:  المستخدم جاوب نصاً → التصحيح **سيرفري** من السؤال المخزَّن
                 في الجلسة (الكلاينت مابيشوفش correct قبل التصحيح) → شرح
                 بالمصدر → سؤال الدور اللي بعده من البنك. بعد السؤال العاشر:
                 الجلسة تُقفل (completed_at) → award_coins(worship_quiz,
                 'quiz:<uuid>') — نفس عقد db/121 بالحرف.

   ⚠️⚠️ عقد المكافأة (db/121 — ماتلمسوش): فرع worship_quiz في award_coins
      بيتحقق من صف جلسة **مكتملة** (completed_at not null) **مملوكة
      للمستخدم** بالمرجع 'quiz:<uuid>' في worship_quiz_sessions. أسئلة/
      إجابات/نتيجة الجلسة كلها على السيرفر — الكلاينت بيرجّع نص إجابته بس.
   ⚠️ worship_quiz_bank مفيش عليه أي RLS policy — الوصول له عبر
      service-role client حصراً (lib/supabase/admin.ts).
   ⚠️ إعادة التعبئة الخلفية للبنك (refillQuizBankIfLow) بتفضل شغالة —
      الشات بيستهلك من البنك، فلازم يفضل متعبّى (بتتنده عبر after()).
   ========================================================================== */

const QUIZ_CREDIT_MODEL = "openai/gpt-oss-120b";
const CHAT_CREDIT_MODEL = QUIZ_CREDIT_MODEL;

/** أقصى طول لإجابة «اختبرني» الواحدة. */
const QUIZ_ANSWER_MAX_LENGTH = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** مفتاح Groq من البيئة (نفس ترتيب المفاتيح في باقي الـ routes). */
function groqApiKey(): string {
  return (process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || "").trim();
}

/** شكل السؤال المُرسَل للكلاينت — بدون correct ولا explanation. */
function toChatQuestion(q: StoredQuestion): {
  question: string;
  options: string[];
  source: string;
} {
  return { question: q.question, options: q.options, source: q.source };
}

/* ==========================================================================
   سحب سؤال «اختبرني» التالي من البنك — service-role حصراً
   ==========================================================================
   بنلف على صفوف البنك بترتيب الأقل استخداماً (نفس ترتيب SQL القديم) وبنشيل
   الأسئلة اللي استُخدمت في نفس الجلسة (بنص السؤال) — سؤال واحد في النداء
   عشان سرعة الرد والتنويع. أي فشل بيرجّع null (البُنك تحسين مش عقد). */
async function pickNextBankQuestion(
  service: any,
  usedTexts: ReadonlySet<string>,
): Promise<{ rowId: string; usedCount: number; question: StoredQuestion } | null> {
  try {
    const { data: rows, error } = await service
      .from("worship_quiz_bank")
      .select("id, questions, used_count, last_used_at")
      .order("last_used_at", { ascending: true, nullsFirst: true })
      .order("used_count", { ascending: true })
      .limit(50);
    if (error || !rows || rows.length === 0) return null;

    for (const row of rows as Array<{
      id: string;
      questions: unknown;
      used_count: number;
    }>) {
      if (!Array.isArray(row.questions)) continue;
      for (const q of row.questions) {
        if (!isValidStoredQuestion(q)) continue;
        if (usedTexts.has(q.question)) continue; // مش متكرر في الجلسة دي
        return { rowId: row.id, usedCount: row.used_count ?? 0, question: q };
      }
    }
    return null;
  } catch (e) {
    console.warn("worship-quiz pickNextBankQuestion failed:", e);
    return null;
  }
}

/** إحصاءات استهلاك صف البنك — فشلها صامت (عدّاد فقط). */
async function bumpBankRowUsage(
  service: any,
  rowId: string,
  usedCount: number,
): Promise<void> {
  try {
    await service
      .from("worship_quiz_bank")
      .update({ used_count: usedCount + 1, last_used_at: new Date().toISOString() })
      .eq("id", rowId);
  } catch {
    // صامت — عدّاد فقط.
  }
}

/* ==========================================================================
   إعادة التعبئة الخلفية — بتتنده عبر after() — زي ما هي (بنك الشات مصدرها)
   ========================================================================== */
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
      if (!questions) return; // مخرجات مش مطابقة — نتجاهل الدفعة دي بصمت.
      await service.from("worship_quiz_bank").insert({
        questions,
        model: QUIZ_MODEL_GROQ,
      });
    } catch {
      // صامت — دفعة فاشلة مش مشكلة، الجاي هيعبّي.
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
    const limited = await checkRateLimit(`worship-quiz:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";

    /* ── action=ask — الشات الديني (نداء AI فعلي بحجز كريديت) ── */
    if (action === "ask") {
      const messages = validateChatMessages(body?.messages);
      if (!messages) {
        return NextResponse.json(
          { error: "سياق المحادثة غير صالح — جرّب تاني." },
          { status: 400 },
        );
      }

      const g = await guardAiAccessAndReserve(supabase, user.id, CHAT_CREDIT_MODEL);
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
      const usage = resolveUsageRequestContext(request, userId ?? null, { feature: "worship-quiz-chat" });
      const completion = await groq.chat.completions.create({
        model: QUIZ_MODEL_GROQ,
        messages: [
          { role: "system", content: buildReligiousChatSystemPrompt() },
          ...sliceChatContext(messages),
        ],
        temperature: 0.6,
      }).catch(async (err) => {
        // C4.1: the provider request itself failed -> no response at all.
        // ⚠️ `async` + `await`: the write must land BEFORE the rethrow.
        await recordDirectProviderAttempt({
          usage, feature: "worship-quiz-chat", attemptNo: 0, provider: "groq", model: QUIZ_MODEL_GROQ,
          status: "failed_no_response", latencyMs: doneMs(),
        });
        throw err;
      });

      const textResult = (completion.choices[0]?.message?.content || "").trim();
      await recordDirectProviderAttempt({
        usage, feature: "worship-quiz-chat", attemptNo: 0, provider: "groq", model: QUIZ_MODEL_GROQ,
        status: textResult ? "completed" : "failed_after_response",
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        latencyMs: doneMs(),
      });

      if (!textResult) {
        await refundAiCreditIfNeeded(supabase, userId, guard.refId);
        return NextResponse.json(
          { error: "المساعد مجابش دلوقتي — جرّب تاني." },
          { status: 502 },
        );
      }

      return NextResponse.json({ reply: textResult });
    }

    /* ── action=quiz-start — فتح جولة «اختبرني» + أول سؤال من البنك ──
       بدون حجز كريديت ولا نداء AI — البنك مخزون جاهز (db/123). */
    if (action === "quiz-start") {
      let service: ReturnType<typeof createServiceClient> | null = null;
      try {
        service = createServiceClient();
      } catch {
        service = null;
      }
      if (!service) {
        return NextResponse.json(
          { error: "بنك الأسئلة مش متاح حالياً — جرّب تاني بعد شوية." },
          { status: 503 },
        );
      }

      // أول سؤال الأول — لو البنك فاضي بنقفل من غير ما نفتح جلسة هباء.
      const picked = await pickNextBankQuestion(service, new Set<string>());
      if (!picked) {
        after(() => {
          void refillQuizBankIfLow();
        });
        return NextResponse.json(
          { error: "بنك الأسئلة بيتعبى دلوقتي — جرّب تاني بعد دقيقة." },
          { status: 503 },
        );
      }

      // الجلسة للمستخدم — نفس عقد db/120: الأسئلة **بالإجابات الصحيحة**
      // سيرفر فقط، وبتتملأ سؤالاً بسؤال مع كل إجابة.
      const { data: session, error: insertError } = await supabase
        .from("worship_quiz_sessions")
        .insert({
          user_id: userId,
          questions: [picked.question],
          answers: [],
          score: 0,
          total: QUIZ_TOTAL_QUESTIONS,
          bank_id: picked.rowId,
        })
        .select("id")
        .single();
      if (insertError || !session) {
        console.error("worship-quiz chat session insert failed:", insertError?.message);
        return NextResponse.json({ error: "تعذّر بدء جولة الاختبار — جرّب تاني." }, { status: 500 });
      }

      void bumpBankRowUsage(service, picked.rowId, picked.usedCount);

      return NextResponse.json({
        sessionId: session.id as string,
        total: QUIZ_TOTAL_QUESTIONS,
        question: toChatQuestion(picked.question),
      });
    }

    /* ── action=quiz-answer — تصحيح سيرفري + السؤال اللي بعده + الصرف ── */
    if (action === "quiz-answer") {
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      const answer = clampText(body?.answer, QUIZ_ANSWER_MAX_LENGTH);
      if (!UUID_RE.test(sessionId)) {
        return NextResponse.json({ error: "معرّف الجولة غير صالح." }, { status: 400 });
      }
      if (!answer.trim()) {
        return NextResponse.json({ error: "اكتب إجابتك الأول." }, { status: 400 });
      }

      let service: ReturnType<typeof createServiceClient> | null = null;
      try {
        service = createServiceClient();
      } catch {
        service = null;
      }
      if (!service) {
        return NextResponse.json(
          { error: "الخدمة مش متاحة حالياً — جرّب تاني بعد شوية." },
          { status: 503 },
        );
      }

      // الجولة لازم تكون مملوكة للمستخدم ومش مكتملة — غير كده 400.
      const { data: session, error: loadError } = await supabase
        .from("worship_quiz_sessions")
        .select("id, user_id, questions, answers, score, completed_at")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (loadError || !session) {
        return NextResponse.json(
          { error: "جولة الاختبار دي مش موجودة أو مش على حسابك — ابدأ جولة جديدة." },
          { status: 400 },
        );
      }
      if (session.completed_at) {
        return NextResponse.json(
          { error: "جولة الاختبار دي خلصت بالفعل — ابدأ جولة جديدة." },
          { status: 400 },
        );
      }

      const stored = (Array.isArray(session.questions) ? session.questions : []) as unknown[];
      const answered = (Array.isArray(session.answers) ? session.answers : []) as unknown[];
      if (stored.length !== answered.length + 1 || answered.length >= QUIZ_TOTAL_QUESTIONS) {
        return NextResponse.json(
          { error: "بيانات الجولة مش متسقة — ابدأ جولة جديدة." },
          { status: 400 },
        );
      }
      const current = stored[answered.length];
      if (!isValidStoredQuestion(current)) {
        return NextResponse.json(
          { error: "بيانات الجولة مش متسقة — ابدأ جولة جديدة." },
          { status: 400 },
        );
      }

      // التصحيح على السيرفر — الإجابة الصحيحة من الجلسة المحفوظة مش من الكلاينت.
      const pickedIndex = gradeQuizAnswer(answer, current);
      const correct = pickedIndex === current.correct;
      const newAnswers = [...answered, pickedIndex ?? -1];
      const newScore = (typeof session.score === "number" ? session.score : 0) + (correct ? 1 : 0);
      const finished = newAnswers.length === QUIZ_TOTAL_QUESTIONS;

      // سؤال الدور اللي بعده من البنك — قبل الكتابة (مش متكرر في الجولة).
      const usedTexts = new Set(
        stored.filter(isValidStoredQuestion).map((q) => q.question),
      );
      const next = finished ? null : await pickNextBankQuestion(service, usedTexts);
      // البنك خلص نص الجولة (نادر جداً) → نقفل الجولة بالإجابات الحالية
      // بدل ما نضيعها — عقد المكافأة (جلسة مكتملة + المرجع) زي ما هو.
      const closeNow = finished || !next;
      const totalNow = closeNow ? newAnswers.length : QUIZ_TOTAL_QUESTIONS;

      const { error: updateError } = await supabase
        .from("worship_quiz_sessions")
        .update({
          questions: next && !finished ? [...stored, next.question] : stored,
          answers: newAnswers,
          score: newScore,
          total: totalNow,
          ...(closeNow ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .is("completed_at", null);
      if (updateError) {
        console.error("worship-quiz chat answer update failed:", updateError.message);
        return NextResponse.json({ error: "تعذّر تسجيل إجابتك — جرّب تاني." }, { status: 500 });
      }

      if (next && !finished) {
        void bumpBankRowUsage(service, next.rowId, next.usedCount);
      }

      // المكافأة — award_coins مش refund: فشلها صامت، الجولة شغّالة من غير كوينز.
      // فرع worship_quiz في db/121 بيتحقق من صف الجولة المكتملة بالمرجع ده.
      let awarded = 0;
      let balance: number | null = null;
      if (closeNow) {
        try {
          const { data: reward, error: awardError } = await supabase.rpc("award_coins", {
            p_source: "worship_quiz",
            p_ref_id: `quiz:${sessionId}`,
            p_metadata: { score: newScore, total: totalNow, activity: "worship-quiz" },
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

        // إعادة تعبئة خلفية — الشات بيستهلك من البنك، نعبّيه بعد الرد.
        after(() => {
          void refillQuizBankIfLow();
        });
      }

      return NextResponse.json({
        finished: closeNow,
        correct,
        correctIndex: current.correct,
        correctText: current.options[current.correct],
        explanation: current.explanation,
        source: current.source,
        score: newScore,
        total: totalNow,
        awarded,
        balance,
        ...(next && !finished ? { next: toChatQuestion(next.question) } : {}),
      });
    }

    return NextResponse.json({ error: "action غير معروف." }, { status: 400 });
  } catch (error) {
    if (guard && supabase && userId) await refundAiCreditIfNeeded(supabase, userId, guard.refId);
    console.error("Error in worship quiz route:", error);
    return NextResponse.json({ error: "حصل خطأ غير متوقع — جرّب تاني." }, { status: 500 });
  }
}
