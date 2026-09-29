import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** The projected shape of past_exam_questions. Declared rather than inferred so
    an added column cannot widen the response by accident. */
interface ExamQuestionRow {
  id: string;
  question_number: number | null;
  question_text: string;
  question_type: string | null;
  marks: number | null;
  options_json: unknown;
  topic_id: string | null;
  difficulty: string | null;
}

/* ============================================================================
   GET /api/exam-bank/questions?examId=<uuid>
   ----------------------------------------------------------------------------
   Phase 4.4-F. Serves past_exam_questions for a published exam.

   WHY THIS IS AN API ROUTE AND NOT A SERVER COMPONENT
   Two different reads, and conflating them would give one of them the wrong
   permissions.

     /api/diagnostic/start   the diagnostic needs verified questions for a
                             subject even when the exam is unpublished,
                             because whether a paper is published on /exams
                             and whether its questions have been reviewed are
                             different facts. That route reads with the
                             service-role client and states its own
                             eligibility rule.

     this route               the public exam bank is a different promise: a
                             student who opens /exams is looking at published
                             content, and a question from an unpublished exam
                             must not appear. So this reads through the
                             caller's own client and lets RLS decide.

   Giving the viewer service-role access would have solved the is_published
   problem by removing the check that answer depends on.

   THE ANSWER KEY NEVER LEAVES THE DATABASE
   correct_option_index is not in the SELECT. It is not selected and then
   filtered out of the response, which would still put it in the network
   payload -- it is never fetched, which is stronger. The same is true of
   source_question_id, source_note, verification_status and exam_id: none is
   projected, so a column added to the table later cannot appear in a
   response by accident.

   A published exam is a public promise, but the questions inside it are still
   only correct-until-graded. A student who can read every answer key in the
   bank has no reason to answer anything.
   ========================================================================== */

const MAX_QUESTIONS = 50;

/** Narrows an unknown jsonb value to a string array. */
function toOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export async function GET(req: Request) {
  const examId = new URL(req.url).searchParams.get("examId") ?? "";

  if (!examId) {
    return NextResponse.json(
      { error: "لازم تحدد الامتحان." },
      { status: 400 }
    );
  }

  // Shaped like a uuid before it reaches the database, so a junk value gets a
  // 400 rather than a 22P02 from Postgres.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId)
  ) {
    return NextResponse.json(
      { error: "معرّف الامتحان مش صحيح." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // The exam is resolved first, and is_published is stated here rather than
  // left to the read policy. An unpublished exam is not an error -- it simply
  // is not there, which is what 404 means and what /exams already does.
  const { data: exams, error: examError } = await supabase
    .from("past_exams")
    .select("id, title, subject_id, exam_date")
    .eq("id", examId)
    .eq("is_published", true)
    .limit(1);

  if (examError) {
    return NextResponse.json(
      { error: "مش قادرين نقرا بيانات الامتحان." },
      { status: 500 }
    );
  }

  const exam = exams?.[0];
  if (!exam) {
    return NextResponse.json(
      { error: "مفيش امتحان منشور بالمعرّف ده." },
      { status: 404 }
    );
  }

  const { data: rows, error: qError } = await supabase
    .from("past_exam_questions")
    .select("id, question_number, question_text, question_type, marks, options_json, topic_id, difficulty")
    .eq("exam_id", examId)
    .order("question_number", { ascending: true })
    .limit(MAX_QUESTIONS);

  if (qError) {
    return NextResponse.json(
      { error: "مش قادرين نقرا أسئلة الامتحان." },
      { status: 500 }
    );
  }

  const questions = (rows ?? []) as ExamQuestionRow[];

  // Topic names are resolved in one extra query rather than embedded, so the
  // viewer shows what a student would recognise instead of a uuid. Topics are
  // taxonomy, not answers, so including the name leaks nothing.
  const topicIds = [
    ...new Set(questions.map((q) => q.topic_id).filter(Boolean)),
  ] as string[];
  const topicNames = new Map<string, string>();
  if (topicIds.length > 0) {
    const { data: topics } = await supabase
      .from("diagnostic_topics")
      .select("id, name")
      .in("id", topicIds);
    for (const t of topics ?? []) topicNames.set(t.id, t.name);
  }

  // Built field by field. No spread of a row, so nothing reaches the client
  // that was not deliberately listed above.
  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      subject_id: exam.subject_id,
      exam_date: exam.exam_date,
    },
    questions: questions.map((q) => ({
      id: q.id,
      question_number: q.question_number,
      question_text: q.question_text,
      question_type: q.question_type,
      marks: q.marks,
      options: toOptions(q.options_json),
      topic: q.topic_id ? topicNames.get(q.topic_id) ?? null : null,
      difficulty: q.difficulty,
    })),
  });
}
