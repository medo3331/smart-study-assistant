import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";

/**
 * GET /api/exam-sessions/[id] — حالة الجلسة وبنودها.
 *
 * بلا AI (sync < 500ms). لا يُعيد `result_json` نفسه، فقط `has_result`،
 * لأنه قد يكون كبيرًا. هذا هو مسار الاستئناف بعد إغلاق الصفحة.
 */
export const dynamic = "force-dynamic";

/** صفوف مُقاسة يدويًا — المشروع لا يولّد أنواع Supabase (لا `Database` generic). */
type SessionRow = {
  id: string;
  mode: string;
  status: string;
  total_lectures: number;
  total_chars: number;
  total_chunks: number;
  estimated_tokens: number;
  logical_calls_used: number;
  provider_attempts_used: number;
  credit_reserved_at: string | null;
  credit_refunded_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  lecture_id: string;
  ordinal: number;
  status: string;
  attempt_count: number;
  transcript_chars: number | null;
  chunk_count: number | null;
  result_json: unknown;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await requireUser();
  if (!user) {
    console.info("[exam-sessions] state", "UNAUTHORIZED");
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(
      "id, mode, status, total_lectures, total_chars, total_chunks, estimated_tokens, logical_calls_used, provider_attempts_used, credit_reserved_at, credit_refunded_at, started_at, completed_at, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError) {
    console.warn("[exam-sessions] state read failed", sessionError.message);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
  if (!session) {
    console.info("[exam-sessions] state", "NOT_FOUND");
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("exam_session_items")
    .select(
      "id, lecture_id, ordinal, status, attempt_count, transcript_chars, chunk_count, result_json, error_code, error_message, started_at, completed_at"
    )
    .eq("session_id", id)
    .eq("user_id", user.id)
    .order("ordinal", { ascending: true });

  if (itemsError) {
    console.warn("[exam-sessions] state items read failed", itemsError.message);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }

  const rows = (items ?? []) as ItemRow[];
  const completedLectures = rows.filter((item) => item.status === "ready").length;
  const lastCompletedAt = rows.reduce<string | null>((latest, item) => {
    if (!item.completed_at) return latest;
    if (!latest) return item.completed_at;
    return item.completed_at > latest ? item.completed_at : latest;
  }, null);

  return NextResponse.json({
    id: session.id,
    mode: session.mode,
    status: session.status,
    total_lectures: session.total_lectures,
    completed_lectures: completedLectures,
    last_completed_at: lastCompletedAt,
    total_chars: session.total_chars,
    total_chunks: session.total_chunks,
    estimated_tokens: session.estimated_tokens,
    logical_calls_used: session.logical_calls_used,
    provider_attempts_used: session.provider_attempts_used,
    credit_reserved_at: session.credit_reserved_at,
    credit_refunded_at: session.credit_refunded_at,
    started_at: session.started_at,
    completed_at: session.completed_at,
    created_at: session.created_at,
    updated_at: session.updated_at,
    items: rows.map((item) => ({
      id: item.id,
      lecture_id: item.lecture_id,
      ordinal: item.ordinal,
      status: item.status,
      attempt_count: item.attempt_count,
      transcript_chars: item.transcript_chars,
      chunk_count: item.chunk_count,
      has_result: item.result_json !== null,
      error_code: item.error_code,
      error_message: item.error_message,
      started_at: item.started_at,
      completed_at: item.completed_at,
    })),
  });
}
