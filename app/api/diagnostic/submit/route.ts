import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import {
  scoreDiagnosticSession,
  detectWeakTopics,
  type BankQuestion,
} from "@/lib/diagnostic-mastery";
import { replanExamPlan } from "@/lib/exam-plan-replanner";
import { diffDaysISO, todayISO, type ExamPlanDay } from "@/lib/exam-plans";

/* ============================================================================
   POST /api/diagnostic/submit — يسجّل الإجابات ويحسب النتيجة
   ----------------------------------------------------------------------------
  Flow, in this order:

    1. requireUser()                     ← authenticated
    2. validate the body shape           ← only q_id + selected_index
    3. load the session                  ← ownership scoped by RLS
    4. RPC submit_diagnostic_answers()   ← is_correct computed in SQL
    5. read the stored answers back     ← server truth, not client payload
    6. load the bank rows                ← correct_option_index, server-side
    7. scoreDiagnosticSession()          ← pure, in lib/
    8. write the aggregate session score
    9. RPC refresh_topic_mastery()       ← rebuild the cache
   10. upsert diagnostic_recommendations
   11. replanExamPlan() + persist days  ← LAST

  ⚠️ WHY THE ORDER MATTERS
  Steps 4-10 are the diagnostic record: answers, score, mastery,
  recommendations. Step 11 is the *consequence* for the schedule. If
  anything upstream fails we return an error and the plan is untouched —
  we never leave a session marked complete with a half-written aggregate.

  ⚠️ ATOMICITY, HONESTLY
  Supabase/PostgREST has no multi-statement transaction across tables.
  What each step guarantees instead:
    • step 4  — atomic (one plpgsql function; is_correct is computed and
               stored together, and UNIQUE(session_id, question_id) makes
               a retry a no-op)
    • step 9  — atomic and idempotent (rebuilds from the answers instead
               of incrementing, so running it twice is harmless)
    • step 10 — idempotent via UNIQUE(session_id, weak_topic)
  So the retry-safe unit is "re-run the whole route". Step 11 is the only
  non-idempotent step, which is exactly why it goes last.
   ========================================================================== */

/** The only shape the client is allowed to send. */
interface ClientAnswer {
  question_id: string;
  selected_option_index: number;
}

/**
 * Reads ONLY `question_id` and `selected_option_index`.
 *
 * A client that smuggles `is_correct: true` has it dropped here — and
 * again in the SQL function. Two independent layers, deliberately.
 */
function parseAnswers(raw: unknown): ClientAnswer[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ClientAnswer[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const rec = item as Record<string, unknown>;
    const questionId = rec.question_id;
    const selected = rec.selected_option_index;
    if (typeof questionId !== "string" || !questionId) return null;
    if (typeof selected !== "number" || !Number.isInteger(selected)) return null;
    out.push({ question_id: questionId, selected_option_index: selected });
  }
  return out;
}

interface AnswerRow {
  question_id: string;
  selected_option_index: number;
  is_correct: boolean;
}

/**
 * The student-facing result.
 *
 * ⚠️ Built explicitly for the same reason the start route is: nothing
 * enters this object by accident. `per_question` carries
 * correct_option_index and is therefore NOT included — the student gets
 * their score and the per-topic breakdown, not the answer key.
 */
function buildResult(
  result: ReturnType<typeof scoreDiagnosticSession>,
  weakTopics: ReturnType<typeof detectWeakTopics>,
  sessionId: string
) {
  return {
    session_id: sessionId,
    score: result.score,
    total: result.total,
    percentage: Math.round(result.percentage * 100) / 100,
    correct_count: result.correct_count,
    wrong_count: result.wrong_count,
    topic_performance: result.topic_performance,
    weak_topics: weakTopics,
    strong_topics: result.strong_topics,
    insufficient_data_topics: result.insufficient_data_topics,
  };
}

export async function POST(req: Request) {
  const { user, supabase, response: authError } = await requireUser("message");
  if (authError) return authError;

  // 1) Shape validation — before any DB work.
  let body: { session_id?: unknown; answers?: unknown; plan_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "الطلب مش صحيح." }, { status: 400 });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) {
    return NextResponse.json({ error: "لازم تحدد الجلسة." }, { status: 400 });
  }

  const answers = parseAnswers(body.answers);
  if (!answers) {
    return NextResponse.json(
      { error: "الإجابات لازم تكون مصفوفة فيها question_id و selected_option_index." },
      { status: 400 }
    );
  }

  // 2) The session must exist and belong to the caller. The RLS select
  //    policy already scopes this, so a foreign session returns null.
  const { data: session, error: sessionError } = await supabase
    .from("diagnostic_sessions")
    .select("id, subject_id, status, question_count")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: "مش قادرين نقرأ الجلسة." }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "الجلسة دي مش موجودة." }, { status: 404 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: "الجلسة دي اتسلّمت قبل كده." },
      { status: 409 }
    );
  }

  // 3) Store the answers. The RPC computes is_correct from the bank and
  //    ignores anything else the client sent.
  const { error: submitError } = await supabase.rpc("submit_diagnostic_answers", {
    p_session_id: sessionId,
    p_answers: answers,
  });

  if (submitError) {
    // The RPC raises a generic message on purpose, so we do not leak whether
    // a given session or question exists to someone probing the endpoint.
    const denied = /not_found_or_not_yours/i.test(submitError.message ?? "");
    return NextResponse.json(
      {
        error: denied
          ? "الجلسة دي مش موجودة."
          : "مش قادرين نحفظ الإجابات.",
      },
      { status: denied ? 404 : 400 }
    );
  }

  // 4) Read the stored answers back — the server's own record, not the
  //    client's payload. Scoring works from here on.
  const { data: answerRows, error: answerError } = await supabase
    .from("diagnostic_answers")
    .select("question_id, selected_option_index, is_correct")
    .eq("session_id", sessionId);

  if (answerError) {
    return NextResponse.json(
      { error: "مش قادرين نقرأ الإجابات المحفوظة." },
      { status: 500 }
    );
  }

  const stored = (answerRows ?? []) as AnswerRow[];
  if (stored.length === 0) {
    return NextResponse.json(
      { error: "مفيش إجابات صالحة للجلسة دي." },
      { status: 400 }
    );
  }

  // 5) Load the bank so the pure scorer can compare against the truth.
  const { data: bankRows, error: bankError } = await supabase
    .from("diagnostic_question_bank")
    .select("id, subject_id, unit_id, topic_id, question_type, correct_option_index")
    .in("id", stored.map((a) => a.question_id))
    .eq("subject_id", session.subject_id);

  if (bankError) {
    return NextResponse.json(
      { error: "مش قادرين نقرأ بنك الأسئلة." },
      { status: 500 }
    );
  }

  const questions = (bankRows ?? []) as BankQuestion[];

  // 6) Pure scoring. `is_correct` on `stored` is ignored on purpose — we
  //    re-derive it from correct_option_index so the score cannot depend on
  //    any column being consistent, even a server-written one.
  const result = scoreDiagnosticSession(
    stored.map((a) => ({
      question_id: a.question_id,
      selected_option_index: a.selected_option_index,
    })),
    questions
  );

  const weakTopics = detectWeakTopics(result.topic_performance);

  // 7) Persist the aggregate session score.
  const { error: completeError } = await supabase
    .from("diagnostic_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      score: result.score,
      score_percentage: result.percentage,
      correct_count: result.correct_count,
      wrong_count: result.wrong_count,
    })
    .eq("id", sessionId);

  if (completeError) {
    return NextResponse.json({ error: "مش قادرين نقفل الجلسة." }, { status: 500 });
  }

  // 8) Rebuild the user_weaknesses cache from the audit trail. Idempotent.
  const { data: masteryResult, error: masteryError } = await supabase.rpc(
    "refresh_topic_mastery",
    { p_session_id: sessionId }
  );

  if (masteryError) {
    // The answers and the session score are already committed. We do NOT
    // pretend the whole thing failed — the student earned this score.
    return NextResponse.json(
      {
        ...buildResult(result, weakTopics, sessionId),
        mastery_updated: false,
        plan_updated: false,
        warning: "الإجابات اتسجلت بس تحديث مستوى الإتقان اتأخر. هيصحح لوحده.",
      },
      { status: 202 }
    );
  }

  // 9) Per-session recommendation rows. UNIQUE(session_id, weak_topic) makes
  //    this an upsert, so a replay cannot create duplicates.
  if (weakTopics.length > 0) {
    const { error: recError } = await supabase
      .from("diagnostic_recommendations")
      .upsert(
        weakTopics.map((w) => ({
          session_id: sessionId,
          weak_topic: w.topic,
          accuracy: w.accuracy,
          content_available: false,
          content_refs: [],
          recommendation_text:
            `مستواك في «${w.topic}» ${Math.round(w.accuracy * 100)}% — راجعه قبل الامتحان.`,
          priority: w.priority,
        })),
        { onConflict: "session_id,weak_topic" }
      );

    if (recError) {
      return NextResponse.json(
        {
          ...buildResult(result, weakTopics, sessionId),
          mastery_updated: true,
          plan_updated: false,
          warning: "التوصيات متسجلتش. Repeat الطلب هيكمّلها.",
        },
        { status: 202 }
      );
    }
  }

  // 10) Planner update — the consequence, and the only non-idempotent step.
  const planId = typeof body.plan_id === "string" ? body.plan_id : "";
  let planUpdated = false;
  let planReasons: unknown[] = [];
  let planWarning: string | null = null;

  if (planId && weakTopics.length > 0) {
    const { data: plan, error: planError } = await supabase
      .from("exam_plans")
      .select(
        "id, exam_date, exam_plan_days(id, day_number, study_date, kind, title, description, is_done)"
      )
      .eq("id", planId)
      .maybeSingle();

    if (planError || !plan) {
      planWarning = "مش قادرين نلاقي خطة الامتحان.";
    } else {
      // The planner speaks camelCase (ExamPlanDay from lib/exam-plans);
      // the DB rows are snake_case. Map once, explicitly.
      const days = ((plan.exam_plan_days ?? []) as Array<{
        id: string;
        day_number: number;
        study_date: string;
        kind: string;
        title: string;
        description: string | null;
        is_done: boolean;
      }>).map((d) => ({
        id: d.id,
        dayNumber: d.day_number,
        studyDate: d.study_date,
        // The DB CHECK allows content|review|quiz only. Anything else is
        // treated as content, mirroring lib/exam-plans.ts mapDay().
        kind: d.kind === "review" || d.kind === "quiz" ? d.kind : "content",
        title: d.title,
        description: d.description ?? "",
        isDone: d.is_done,
      } satisfies ExamPlanDay));

      const today = todayISO();
      const daysLeft = diffDaysISO(today, plan.exam_date);
      const replan = replanExamPlan({ days }, weakTopics, daysLeft, today);

      if (replan.changed) {
        const { error: applyError } = await supabase
          .from("exam_plan_days")
          .upsert(
            replan.days.map((d) => ({
              id: d.id,
              plan_id: planId,
              user_id: user.id,
              day_number: d.dayNumber,
              study_date: d.studyDate,
              kind: d.kind,
              title: d.title,
              description: d.description,
            })),
            { onConflict: "id" }
          );

        planUpdated = !applyError;
        if (applyError) {
          planWarning = "نتيجة الاختبار اتسجلت بس الخطة ماتحدّثتش. جرب تاني.";
        }
      }
      planReasons = replan.reasons;
    }
  }

  const payload = {
    ...buildResult(result, weakTopics, sessionId),
    mastery_updated: true,
    topics_refreshed:
      (masteryResult as { topics_refreshed?: number } | null)?.topics_refreshed ?? 0,
    plan_updated: planUpdated,
    plan_reasons: planReasons,
  };

  return NextResponse.json(
    planWarning ? { ...payload, warning: planWarning } : payload,
    planWarning ? { status: 202 } : { status: 200 }
  );
}
