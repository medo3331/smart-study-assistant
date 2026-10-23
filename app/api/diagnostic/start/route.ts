import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";

/* ============================================================================
   POST /api/diagnostic/start - يفتح جلسة تشخيص جديدة
   ----------------------------------------------------------------------------
   Phase 4.4-E. Questions now come from the exam bank
   (past_exam_questions) instead of diagnostic_question_bank, and the ids in
   the response are the exam bank's ids, which is what
   submit_diagnostic_answers reads as bank_question_id.

   WHY A SERVER-SIDE ADMIN READ INSTEAD OF RLS
   The public read policy on past_exam_questions requires
   past_exams.is_published = true, and that exam is deliberately unpublished:
   its year and sitting are still contradicted across our own records, and
   publishing it would be a claim we cannot support. The diagnostic does not
   need that claim. It needs verified questions for a subject, and those are
   not the same fact: "published on /exams" and "eligible for a diagnostic"
   are different questions with different consequences.

   So this route reads with the service-role client, which bypasses RLS, and
   states the eligibility rule explicitly instead of inheriting it from a
   policy written for a different purpose.

   This does NOT mean trusting anything the client sends. The admin client is
   a read tool here, not an identity. requireUser() still authenticates the
   caller and the subject is still read from the request body only after
   that, exactly as before. Bypassing RLS on the read is deliberate;
   bypassing the session check would not be.

   correct_option_index NEVER leaves the server from this file. It is not even
   read here: scoring happens entirely in the database, so this route has no
   reason to fetch it. The SELECT names the fields it needs and the payload is
   built explicitly, field by field, so a column added to the table later
   cannot leak by accident. A select("*") here would ship the answer key to
   the browser.

   unit_id is gone from the payload. The old bank had it; the exam bank has no
   such column and can derive one through topic_id -> diagnostic_topics.unit_id
   if it is ever needed. Nothing in the diagnostic used it.
   ========================================================================== */

const MIN_QUESTIONS = 10;
const MAX_QUESTIONS = 15;
const DEFAULT_QUESTIONS = 10;

interface BankRow {
  id: string;
  topic_id: string | null;
  question_text: string;
  question_type: string;
  options_json: unknown;
  difficulty: string | null;
}

/** Narrows an unknown jsonb value to a string array. */
function toOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export async function POST(req: Request) {
  const { user, supabase, response: authError } = await requireUser("message");
  if (authError) return authError;

  let body: { subject_id?: string; question_count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "الطلب مش صحيح." }, { status: 400 });
  }

  const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
  if (!subjectId) {
    return NextResponse.json({ error: "لازم تحدد المادة." }, { status: 400 });
  }

  const requested = Number(body.question_count);
  const questionCount = Number.isFinite(requested)
    ? Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.trunc(requested)))
    : DEFAULT_QUESTIONS;

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "مش قادرين نجهّز الأسئلة دلوقتي." },
      { status: 500 }
    );
  }

  // Eligibility, stated once, here rather than inherited from a policy.
  //
  //   verification_status = 'verified'  the question and its answer key were
  //                                    checked before it was served
  //   topic_id is not null              mastery and the study plan are both
  //                                    built from the topic, so a question
  //                                    without one can produce neither
  //   correct_option_index is not null  the scorer has nothing to compare
  //                                    against without it
  //   question_type = 'mcq'             the diagnostic renders one shape.
  //                                    true_false, essay, short and fill are
  //                                    allowed by the schema and are
  //                                    deliberately not served yet: a clear
  //                                    404 beats a UI meeting a type it does
  //                                    not handle
  const examIds = (
    await admin.from("past_exams").select("id").eq("subject_id", subjectId)
  ).data?.map((e) => e.id) ?? [];

  // Subject is resolved question -> exam -> subject, the same path
  // submit_diagnostic_answers validates on the way back, so the two can
  // never disagree about what belongs to a session.
  const { data: rows, error: bankError } = await admin
    .from("past_exam_questions")
    .select("id, topic_id, question_text, question_type, options_json, difficulty")
    .eq("question_type", "mcq")
    .eq("verification_status", "verified")
    .not("topic_id", "is", null)
    .not("correct_option_index", "is", null)
    .in("exam_id", examIds)
    .order("id", { ascending: true })
    .limit(questionCount * 4);

  if (bankError) {
    return NextResponse.json(
      { error: "مش قادرين نجهّز الأسئلة دلوقتي." },
      { status: 500 }
    );
  }

  const bank = (rows ?? []) as BankRow[];
  if (bank.length === 0) {
    // A known state, not a fault. The subject simply has no verified
    // exam-bank questions yet, which is true of every subject except
    // mathematics today. Saying so plainly stops a student reading this as
    // a broken page.
    return NextResponse.json(
      { error: "مفيش أسئلة مُتحقَّق منها متاحة للمادة دي لسه." },
      { status: 404 }
    );
  }

  // Deterministic pick: refreshing must not hand the caller a different
  // question set. Ordered by id, so a given subject always yields the same
  // session.
  const picked = bank.slice(0, questionCount);

  // The session row still goes through the caller's own client, so RLS
  // applies to the write and the session is owned by the authenticated user.
  const { data: session, error: sessionError } = await supabase
    .from("diagnostic_sessions")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      question_count: picked.length,
      status: "in_progress",
    })
    .select("id, subject_id, question_count, status, started_at")
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "مش قادرين نفتح جلسة التشخيص." },
      { status: 500 }
    );
  }

  // The payload is built explicitly, and `id` here is the exam bank's id,
  // the value submit_diagnostic_answers reads as bank_question_id. Nothing
  // from the diagnostic_question_bank era reaches the browser.
  return NextResponse.json({
    session_id: session.id,
    subject_id: session.subject_id,
    question_count: picked.length,
    questions: picked.map((q) => ({
      id: q.id,
      topic_id: q.topic_id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: toOptions(q.options_json),
      difficulty: q.difficulty,
    })),
  });
}
