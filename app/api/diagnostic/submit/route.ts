import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";
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

/**
 * The only shape the client is allowed to send.
 *
 * `bank_question_id` is the exam bank's id, the same value
 * /api/diagnostic/start returns as `id` and the same one
 * submit_diagnostic_answers reads. The legacy `question_id` is not accepted
 * as a fallback: a dual-key contract would keep the retired bank's ids
 * reachable, and the point of the switch is that they stop being usable.
 */
interface ClientAnswer {
  bank_question_id: string;
  selected_option_index: number;
}

/**
 * Reads ONLY `bank_question_id` and `selected_option_index`.
 *
 * A client that smuggles `is_correct: true` has it dropped here — and again
 * in the SQL function. Two independent layers, deliberately. So does a
 * `correct_option_index`, and a `question_id`, which is simply never read.
 */
function parseAnswers(raw: unknown): ClientAnswer[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ClientAnswer[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const rec = item as Record<string, unknown>;
    const bankQuestionId = rec.bank_question_id;
    const selected = rec.selected_option_index;
    if (typeof bankQuestionId !== "string" || !bankQuestionId) return null;
    if (typeof selected !== "number" || !Number.isInteger(selected)) return null;
    out.push({
      bank_question_id: bankQuestionId,
      selected_option_index: selected,
    });
  }
  return out;
}

interface AnswerRow {
  question_id: string;
  bank_question_id: string;
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
    // bank_question_id is what the scorer keys on and what the exam bank is
    // looked up by. question_id is still read so AnswerRow stays honest about
    // the row's shape, but nothing below uses it — the legacy id is not a
    // fallback path, and reading it here would invite someone to.
    .select("question_id, bank_question_id, selected_option_index, is_correct")
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

  // 5) Load the exam bank so the pure scorer can compare against the truth.
  //
  // Phase 4.4-H. This reads with the SERVICE-ROLE client, and that is not a
  // convenience — the live smoke test showed the user client returns nothing
  // here and the student gets a wrong answer rather than an error.
  //
  // What happened: the public read policy on past_exam_questions requires the
  // exam to be published, and that exam is deliberately unpublished while its
  // year and sitting are still contradicted. So the subject lookup returned an
  // empty list, `.in("exam_id", [])` matched no rows, and the scorer received
  // an empty bank. An empty bank is not an error to scoreDiagnosticSession —
  // an unmatched answer is counted WRONG, so ten correct answers produced
  // 0/10 and every topic collapsed into UNTAGGED_TOPIC. The database still
  // held is_correct = true for 7 of the 10; the route reported 0. A silent
  // wrong answer is worse than the 500 this replaced.
  //
  // Why the elevated read is sound: these are not rows chosen from the open
  // sea. `stored` is this session's own answers, already written by
  // submit_diagnostic_answers, which verified for every one of them that the
  // question is verified, carries a topic, and belongs to an exam in this
  // session's subject. This step re-reads rows the RPC has already
  // authenticated, so it inherits that check rather than replacing it. The
  // subject filter is still applied here — the RPC's guarantee is not
  // something to assume, and the query that decides what a student is told
  // they scored should not depend on another function having been written
  // correctly.
  //
  // What is NOT elevated: the session read, the ownership check, the answer
  // read and every write all still go through the caller's own client.
  //
  // ⚠️ topic:diagnostic_topics(name) is NOT optional. Without it the scorer
  //    receives topic_id (a UUID) and uses it AS the topic name, so weak_topics
  //    come back as GUIDs and the replan matches against them instead of the
  //    real names. The live smoke test caught this. unit_id is reached through
  //    the same relation because past_exam_questions has no such column.
  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "مش قادرين نقرأ بنك الأسئلة." },
      { status: 500 }
    );
  }

  const { data: bankRows, error: bankError } = await admin
    .from("past_exam_questions")
    .select("id, correct_option_index, question_type, topic_id")
    .in("id", stored.map((a) => a.bank_question_id))
    .in(
      "exam_id",
      (
        await admin
          .from("past_exams")
          .select("id")
          .eq("subject_id", session.subject_id)
      ).data?.map((e: { id: string }) => e.id) ?? []
    );

  if (bankError) {
    return NextResponse.json(
      { error: "مش قادرين نقرأ بنك الأسئلة." },
      { status: 500 }
    );
  }

  const rows = (bankRows ?? []) as Array<{
    id: string;
    correct_option_index: number;
    question_type: string;
    topic_id: string | null;
  }>;

  // Topics come from a second flat query rather than a PostgREST embed.
  //
  // The embed was tried first: `unit_id:diagnostic_topics(unit_id)` does not
  // produce a scalar. PostgREST returns the whole related row wrapped for a
  // to-one relation, and the type came back as { unit_id: any }[] — an
  // array — which the old `(bankRows as BankQuestion[])` cast silently
  // accepted. TypeScript caught it only after the service client was added;
  // a cast is exactly the thing that hides a wrong shape.
  //
  // Two flat queries with an explicit join in JS cannot be wrong in the same
  // way, and the topic name is the field that actually matters: the scorer
  // falls back to topic_id when the name is missing, and weak_topics would
  // come back as GUIDs for the replan to match against. The live smoke test
  // caught that once already; it should not be reachable again.
  const topicIds = [...new Set(rows.map((r) => r.topic_id).filter(Boolean))] as string[];
  const topics = new Map<string, { name: string; unit_id: string | null }>();
  if (topicIds.length > 0) {
    const { data: topicRows } = await admin
      .from("diagnostic_topics")
      .select("id, name, unit_id")
      .in("id", topicIds);
    for (const t of topicRows ?? []) {
      topics.set(t.id, { name: t.name, unit_id: t.unit_id ?? null });
    }
  }

  const questions: BankQuestion[] = rows.map((r) => ({
    id: r.id,
    unit_id: r.topic_id ? topics.get(r.topic_id)?.unit_id ?? null : null,
    topic_id: r.topic_id,
    topic_name: r.topic_id ? topics.get(r.topic_id)?.name ?? null : null,
    question_type: r.question_type as BankQuestion["question_type"],
    correct_option_index: r.correct_option_index,
  }));

  // 6) Pure scoring. `is_correct` on `stored` is ignored on purpose — we
  //    re-derive it from correct_option_index so the score cannot depend on
  //    any column being consistent, even a server-written one.
  const result = scoreDiagnosticSession(
    stored.map((a) => ({
      // BankQuestion.id is the exam bank's id, so the answer rows have to be
      // keyed the same way. Using question_id here would match nothing and
      // the scorer would mark every answer wrong without throwing.
      question_id: a.bank_question_id,
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

  // 9) Recommendation rows go through a SECURITY DEFINER function, not a
  //    direct table write. A recommendation is an OUTPUT of scoring: the
  //    client may read its own, but it must not author one. The RPC also
  //    makes the write idempotent -- ON CONFLICT (session_id, weak_topic)
  //    DO NOTHING -- so an internal replay cannot duplicate a row, which is
  //    what a PostgREST upsert would have needed UPDATE permission for.
  //
  //    NOTE: source_content_type is the real column. The 1.2E migration file
  //    declares content_refs jsonb, but the table in production has
  //    source_content_type / _id / _title instead -- PostgREST answered
  //    PGRST204 on the first live run. The live schema wins; we are not
  //    reshaping the table to match a stale migration.
  if (weakTopics.length > 0) {
    const { error: recError } = await supabase.rpc("write_diagnostic_recommendations", {
      p_session_id: sessionId,
      p_items: weakTopics.map((w) => ({
        weak_topic: w.topic,
        accuracy: w.accuracy,
        content_available: false,
        source_content_type: "none",
        recommendation_text:
          `مستواك في «${w.topic}» ${Math.round(w.accuracy * 100)}% \u2014 \u0631\u0627\u062c\u0639\u0647 \u0642\u0628\u0644 \u0627\u0644\u0627\u0645\u062a\u062d\u0627\u0646.`,
        priority: w.priority,
      })),
    });

    if (recError) {
      return NextResponse.json(
        {
          ...buildResult(result, weakTopics, sessionId),
          mastery_updated: true,
          plan_updated: false,
          warning: "\u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a \u0645\u062a\u0633\u062c\u0644\u062a\u0634. Repeat \u0627\u0644\u0637\u0644\u0628 \u0647\u064a\u0643\u0645\u0651\u0644\u0647\u0627.",
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
        // ⚠️ WHY A FUNCTION AND NOT AN UPSERT.
        // The planner RENUMBERS days, and UNIQUE(plan_id, day_number) is
        // enforced per row as each write lands. Moving day 2 onto day 1
        // collides with the row that still holds 1 at that instant, so a
        // PostgREST upsert fails with 23505 on every real reorder — the
        // replan silently did nothing. The live smoke test passed only
        // because its plan happened to need an insert, not a renumber.
        // apply_exam_plan_replan() parks the rows on negative slots first,
        // so the whole reorder is collision-free and atomic.
        //
        // Invented days arrive without an id so the function assigns a real
        // uuid; the planner's "synthetic-review-<topic>" placeholder never
        // reaches the database.
        const existingIds = new Set(days.map((d) => d.id));

        const { error: applyError } = await supabase.rpc("apply_exam_plan_replan", {
          p_plan_id: planId,
          p_days: replan.days.map((d) => {
            const isReal = existingIds.has(d.id);
            return {
              // null, not the placeholder: the function generates the uuid.
              id: isReal ? d.id : null,
              day_number: d.dayNumber,
              study_date: d.studyDate,
              kind: d.kind,
              title: d.title,
              description: d.description,
            };
          }),
        });

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
