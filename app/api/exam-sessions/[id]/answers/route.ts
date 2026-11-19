import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ExamQuestion, ExamQuestionType } from "@/lib/ai/exam-review";
import { summarizeByTopic, FALLBACK_TOPIC } from "@/lib/ai/exam-topics";

/* ==========================================================================
   POST /api/exam-sessions/[id]/answers — حفظ إجابات الطالب + التسليم
   ============================================================================

   • Autosave أثناء الحل: `{ final: false }` → upsert الصفوف فقط (وبكده
     الامتحان **قابل للاستئناف** بعد إغلاق الصفحة).
   • التسليم: `{ final: true }` → يشترط اكتمال كل الأسئلة (الآلية اتجاوبت
     + المقالي له نص وتقييم ذاتي) ثم يصحّح الآلي **على السيرفر** بمطابقة
     `result_json` (العميل مش موثوق فيه أبدًا)، ويحدّث الجلسة إلى
     `completed` + يخزّن ملخص الدرجة في `metadata.result`.

   المفاتيح: `"<ordinal>:<index>"` — يُشتق من البنود **على السيرفر**
   (الـ inventory هو مصدر الحقيقة؛ item_id اللي في الطلب مجرد تلميح).
   ========================================================================== */

export const dynamic = "force-dynamic";

const MAX_ANSWERS = 100;
const MAX_ESSAY_CHARS = 5000;

type IncomingAnswer = {
  question_key?: unknown;
  answer?: unknown;
  self_score?: unknown;
};

type InventoryEntry = {
  itemId: string;
  ordinal: number;
  index: number;
  question: ExamQuestion;
};

function fail(error: string, status: number, detail?: string) {
  const body = detail ? { error, detail } : { error };
  if (status >= 500) console.warn("[exam-sessions] answers", error, detail ?? "");
  else console.info("[exam-sessions] answers", error, detail ?? "");
  return NextResponse.json(body, { status });
}

/** مطابقة إجابة سؤال آلي — يرجّع is_correct أو null لو الإجابة مش صالحة. */
function gradeAuto(
  question: ExamQuestion,
  answer: Record<string, unknown>
): boolean | null {
  if (question.type === "mcq") {
    const option = answer.option;
    if (typeof option !== "number" || !Number.isInteger(option)) return null;
    if (option < 0 || option >= question.options.length) return null;
    return option === question.correctAnswer;
  }
  if (question.type === "true_false") {
    const value = answer.value;
    if (typeof value !== "boolean") return null;
    return value === question.correct;
  }
  return null; // essay — تصحيح ذاتي
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", 401);

  const { id: sessionId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    final?: unknown;
    answers?: unknown;
  } | null;
  if (!body || typeof body !== "object") return fail("VALIDATION", 400, "body required");
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return fail("VALIDATION", 400, "answers required");
  }
  if (body.answers.length > MAX_ANSWERS) return fail("VALIDATION", 400, "too many answers");
  const final = body.final === true;

  // ── الجلسة (ملكية صريحة) ──
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, status, user_id, metadata")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError) return fail("INTERNAL", 500, sessionError.message);
  if (!session) return fail("NOT_FOUND", 404);
  if (session.status === "completed") return fail("ALREADY_COMPLETED", 409);
  if (session.status !== "ready") {
    // الورقة بتتسجّل لما الجلسة تبقى ready (كل البنود اتولدت).
    return fail("NOT_READY", 409, `status=${session.status}`);
  }

  // ── البنود + مخزون الأسئلة (مصدر الحقيقة) ──
  const { data: items, error: itemsError } = await supabase
    .from("exam_session_items")
    .select("id, ordinal, result_json")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .order("ordinal", { ascending: true });
  if (itemsError) return fail("INTERNAL", 500, itemsError.message);

  const inventory = new Map<string, InventoryEntry>();
  for (const item of (items ?? []) as Array<{
    id: string;
    ordinal: number;
    result_json: unknown;
  }>) {
    const result = item.result_json as { questions?: unknown } | null;
    if (!result || !Array.isArray(result.questions)) continue;
    result.questions.forEach((question, index) => {
      if (!question || typeof question !== "object") return;
      inventory.set(`${item.ordinal}:${index}`, {
        itemId: item.id,
        ordinal: item.ordinal,
        index,
        question: question as ExamQuestion,
      });
    });
  }
  if (inventory.size === 0) return fail("NO_QUESTIONS", 409);

  // ── تحقق كل إجابة + تصحيح الآلي على السيرفر ──
  type PreparedRow = {
    session_id: string;
    item_id: string;
    user_id: string;
    question_key: string;
    question_type: ExamQuestionType;
    answer: Record<string, unknown>;
    is_correct: boolean | null;
    self_score: number | null;
    answered_at: string;
  };

  const rows: PreparedRow[] = [];
  const now = new Date().toISOString();

  for (const raw of body.answers as IncomingAnswer[]) {
    if (!raw || typeof raw !== "object") return fail("VALIDATION", 400, "bad answer entry");

    const key = typeof raw.question_key === "string" ? raw.question_key : "";
    const entry = inventory.get(key);
    if (!entry) return fail("VALIDATION", 400, `unknown question_key: ${key}`);

    const answer =
      raw.answer && typeof raw.answer === "object" && !Array.isArray(raw.answer)
        ? (raw.answer as Record<string, unknown>)
        : null;
    if (!answer) return fail("VALIDATION", 400, `missing answer: ${key}`);

    const question = entry.question;
    let isCorrect: boolean | null = null;
    let selfScore: number | null = null;

    if (question.type === "essay") {
      const text = typeof answer.text === "string" ? answer.text.slice(0, MAX_ESSAY_CHARS) : "";
      if (!text.trim()) return fail("VALIDATION", 400, `essay text required: ${key}`);
      const score = raw.self_score;
      if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
        return fail("VALIDATION", 400, `self_score0..5 required: ${key}`);
      }
      selfScore = score;
      rows.push({
        session_id: sessionId,
        item_id: entry.itemId,
        user_id: user.id,
        question_key: key,
        question_type: "essay",
        answer: { text },
        is_correct: null,
        self_score: selfScore,
        answered_at: now,
      });
      continue;
    }

    const graded = gradeAuto(question, answer);
    if (graded === null) return fail("VALIDATION", 400, `bad answer shape: ${key}`);
    isCorrect = graded;
    rows.push({
      session_id: sessionId,
      item_id: entry.itemId,
      user_id: user.id,
      question_key: key,
      question_type: question.type,
      answer,
      is_correct: isCorrect,
      self_score: null,
      answered_at: now,
    });
  }

  // ── الكتابة (service role — لا سياسة INSERT للعميل) ──
  let admin;
  try {
    admin = createServiceClient();
  } catch (error) {
    console.warn("[exam-sessions] answers service unavailable:", error);
    return fail("INTERNAL", 500);
  }

  const { error: upsertError } = await admin
    .from("exam_session_answers")
    .upsert(rows, { onConflict: "session_id,question_key" });
  if (upsertError) return fail("INTERNAL", 500, upsertError.message);

  if (!final) {
    return NextResponse.json({ ok: true, final: false, saved: rows.length });
  }

  // ── التسليم: اكتمال + ملخص الدرجة ──
  const { data: savedRows, error: readError } = await supabase
    .from("exam_session_answers")
    .select("question_key, question_type, is_correct, self_score, answer")
    .eq("session_id", sessionId)
    .eq("user_id", user.id);
  if (readError) return fail("INTERNAL", 500, readError.message);

  const savedTyped = (savedRows ?? []) as Array<{
    question_key: string;
    question_type: string;
    is_correct: boolean | null;
    self_score: number | null;
    answer: unknown;
  }>;
  const savedByKey = new Map(savedTyped.map((row) => [row.question_key, row]));

  const missing: string[] = [];
  let autoTotal = 0;
  let autoCorrect = 0;
  let essayCount = 0;
  let essayScore = 0;

  for (const [key, entry] of inventory) {
    const row = savedByKey.get(key);
    if (entry.question.type === "essay") {
      essayCount += 1;
      const text = (row?.answer as { text?: string } | null)?.text ?? "";
      if (!row || row.self_score == null || !text.trim()) {
        missing.push(key);
        continue;
      }
      essayScore += Number(row.self_score);
      continue;
    }
    autoTotal += 1;
    if (!row || row.is_correct == null) {
      missing.push(key);
      continue;
    }
    if (row.is_correct === true) autoCorrect += 1;
  }

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "INCOMPLETE", missing: missing.slice(0, 20), missing_count: missing.length },
      { status: 409 }
    );
  }

  const essayMax = essayCount * 5;
  const totalScore = autoCorrect + essayScore;
  const totalMax = autoTotal + essayMax;
  const percent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  /**
   * 🏷️ **تقييم الأجزاء**: نجمع الصحة على عنوان الجزء اللي كل سؤال
   *    بيقيسه ⇒ الطالب يشوف «ضعيف في …» بدل درجة واحدة مبهمة.
   *
   *    المصدر هو `inventory` (الأسئلة المحفوظة على السيرفر) مش إجابة
   *    العميل — زي باقي التصحيح.
   */
  const weaknesses = summarizeByTopic(
    [...inventory.entries()].map(([key, entry]) => {
      const row = savedByKey.get(key);
      return {
        topic: (entry.question as { topic?: string | null }).topic ?? null,
        type: entry.question.type,
        correct: row?.is_correct ?? null,
        selfScore: row?.self_score ?? null,
      };
    }),
  );

  const result = {
    auto: { correct: autoCorrect, total: autoTotal },
    essay: { score: essayScore, max: essayMax },
    total: { score: totalScore, max: totalMax, percent },
    weaknesses,
  };

  const metadata =
    session.metadata && typeof session.metadata === "object" && !Array.isArray(session.metadata)
      ? { ...(session.metadata as Record<string, unknown>), result }
      : { result };

  const { error: completeError } = await admin
    .from("exam_sessions")
    .update({ status: "completed", completed_at: now, metadata, updated_at: now })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (completeError) return fail("INTERNAL", 500, completeError.message);

  /**
   * 📈 **تراكم نقاط الضعف**: الكتابة في `user_weaknesses` بتخلّي المساعد
   *    يعرف «إنت ضعيف في…» من امتحانات سابقة — `lib/education/context.ts`
   *    بيقرا الجدول ده أصلاً (أعلى ٣ أخطاء وأقل إتقان).
   *
   * ⚠️ **مفيش unique constraint** على (user_id, topic_name) ⇒ مفيش upsert:
   *    بنقرا ثم نحدّث/ندرج. التزامن هنا ضعيف (جلسة واحدة للطالب)، وأسوأ
   *    حالة صف مكرر — مش تلفيق بيانات.
   * ⚠️ **best-effort**: فشل الكتابة مايوقّعش التسليم (النتيجة اتحفظت خلاص).
   */
  try {
    const rawSubjectId = (metadata as { subject_id?: unknown }).subject_id;
    const subjectId =
      typeof rawSubjectId === "string" && /^[0-9a-f-]{36}$/i.test(rawSubjectId)
        ? rawSubjectId
        : null;

    const nowIso = new Date().toISOString();
    for (const topic of weaknesses) {
      // «عام» مش جزء حقيقي ⇒ مالوش معنى كضعف يتعلم منه المساعد.
      if (topic.topic === FALLBACK_TOPIC || topic.topic === "مراجعة عامة") continue;

      const wrong = Math.max(0, Math.round(topic.max - topic.score));
      const mastery = Math.min(1, Math.max(0, topic.percent / 100));

      const { data: existing } = await admin
        .from("user_weaknesses")
        .select("id, error_count")
        .eq("user_id", user.id)
        .eq("topic_name", topic.topic)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error: updateWeaknessError } = await admin
          .from("user_weaknesses")
          .update({
            error_count: Number((existing as { error_count?: number }).error_count ?? 0) + wrong,
            mastery_level: mastery,
            updated_at: nowIso,
          })
          .eq("id", (existing as { id: string }).id);
        if (updateWeaknessError) {
          console.warn("[exam-sessions] weakness update skipped", {
            topic: topic.topic,
            detail: updateWeaknessError.message,
          });
        }
        continue;
      }

      // جزء اتجاوب كله صح ومفيش صف سابق ⇒ مفيش ضعف يتسجل.
      if (wrong === 0) continue;

      const { error: insertWeaknessError } = await admin.from("user_weaknesses").insert({
        user_id: user.id,
        subject_id: subjectId,
        topic_name: topic.topic,
        error_count: wrong,
        mastery_level: mastery,
      });
      if (insertWeaknessError) {
        console.warn("[exam-sessions] weakness insert skipped", {
          topic: topic.topic,
          detail: insertWeaknessError.message,
        });
      }
    }
  } catch (error) {
    console.warn("[exam-sessions] weaknesses not recorded", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ ok: true, final: true, result });
}
