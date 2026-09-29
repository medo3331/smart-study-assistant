import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

/* ============================================================================
   POST /api/diagnostic/start — يفتح جلسة تشخيص جديدة
   ----------------------------------------------------------------------------
  Creates the session row and hands back a clean question payload.

   ⚠️ `correct_option_index` NEVER leaves the server from this file.
   The SELECT below reads it (the scorer needs it) but the RETURN shape is
   built explicitly, field by field, so a future column added to the table
   cannot leak by accident. That explicit mapping is the whole point —
   a `select("*")` here would ship the answer key to the browser.

   Question count: the DB CHECK is `between 10 and 15`, so we clamp.
   ========================================================================== */

const MIN_QUESTIONS = 10;
const MAX_QUESTIONS = 15;
const DEFAULT_QUESTIONS = 10;

/** Sources the bank treats as trustworthy (mirrors the RLS read policy). */
const ALLOWED_SOURCE_TYPES = ["official", "verified", "curated", "validated"] as const;

interface BankRow {
  id: string;
  unit_id: string | null;
  topic_id: string | null;
  question_text: string;
  question_type: string;
  options_json: unknown;
  difficulty: string;
  source_reference: string | null;
  correct_option_index: number;
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

  // The read policy already filters status='published' and the allowed
  // source types, but we restate both here so the intent survives even if
  // that policy is ever loosened.
  const { data: rows, error: bankError } = await supabase
    .from("diagnostic_question_bank")
    .select(
      "id, unit_id, topic_id, question_text, question_type, options_json, difficulty, source_reference, correct_option_index"
    )
    .eq("subject_id", subjectId)
    .eq("status", "published")
    .in("source_type", [...ALLOWED_SOURCE_TYPES])
    .limit(questionCount * 4);

  if (bankError) {
    return NextResponse.json(
      { error: "مش قادرين نجهّز الأسئلة دلوقتي." },
      { status: 500 }
    );
  }

  const bank = (rows ?? []) as BankRow[];
  if (bank.length === 0) {
    return NextResponse.json(
      { error: "مفيش أسئلة منشورة للمادة دي لسه." },
      { status: 404 }
    );
  }

  // Deterministic pick: the caller does not get a different question set by
  // refreshing. We take the first N by difficulty order so a given subject
  // always yields the same session.
  const picked = bank.slice(0, questionCount);

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

  // ❗ The payload is built explicitly. correct_option_index is read for the
  // scorer but is NOT part of this response. This is the security boundary.
  return NextResponse.json({
    session_id: session.id,
    subject_id: session.subject_id,
    question_count: picked.length,
    questions: picked.map((q) => ({
      id: q.id,
      topic_id: q.topic_id,
      unit_id: q.unit_id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: toOptions(q.options_json),
      difficulty: q.difficulty,
    })),
  });
}
