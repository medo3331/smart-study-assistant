import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";
import { createExamSession, type ExamSessionMode } from "@/lib/ai/exam-sessions";

/**
 * POST /api/exam-sessions — إنشاء جلسة مراجعة + حجز Credit واحد.
 *
 * مفيش AI هنا (sync < 2s). الحجز والإنشاء يحدثان في معاملة واحدة داخل
 * `create_exam_session_with_reserve`، فإما الاثنان أو لا شيء.
 */
export const dynamic = "force-dynamic";

const MODES: readonly ExamSessionMode[] = ["last_minute_review"];

function fail(error: string, status: number, detail?: string) {
  const body = detail ? { error, detail } : { error };
  if (status >= 500) console.warn("[exam-sessions] create", error, detail ?? "");
  else console.info("[exam-sessions] create", error, detail ?? "");
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", 401);

  const body = (await req.json().catch(() => null)) as
    | { mode?: unknown; lectureIds?: unknown }
    | null;
  if (!body || typeof body !== "object") return fail("VALIDATION", 400, "body required");

  const mode = typeof body.mode === "string" ? body.mode.trim() : "";
  if (!MODES.includes(mode as ExamSessionMode)) {
    return fail("VALIDATION", 400, "invalid mode");
  }

  if (!Array.isArray(body.lectureIds) || body.lectureIds.length === 0) {
    return fail("VALIDATION", 400, "lectureIds required");
  }
  if (body.lectureIds.length > 3) {
    return fail("VALIDATION", 400, "max 3 lectures");
  }

  // تنظيف + إزالة التكرار (الـ RPC يزيله أيضًا — طبقتان)
  const lectureIds = Array.from(
    new Set(
      body.lectureIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value !== "")
    )
  );
  if (lectureIds.length === 0) return fail("VALIDATION", 400, "lectureIds required");

  const created = await createExamSession(supabase, {
    mode: mode as ExamSessionMode,
    lectureIds,
  });

  if (!created.ok) {
    switch (created.code) {
      case "VALIDATION":
        return fail("VALIDATION", 400, created.error);
      case "UNAUTHENTICATED":
        return fail("UNAUTHORIZED", 401);
      case "NOT_OWNED":
        // 404 لا 403 — لا نكشف وجود محاضرة ليست للمستخدم.
        return fail("NOT_FOUND", 404);
      case "BUDGET":
        return fail("BUDGET", 400, created.error);
      case "INSUFFICIENT_CREDITS":
        return fail("INSUFFICIENT_CREDITS", 402);
      default:
        return fail("INTERNAL", 500, created.error);
    }
  }

  const sessionId = created.data.session_id;

  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(
      "id, mode, status, total_chars, total_chunks, estimated_tokens, credit_reserved_at"
    )
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError || !session) {
    return fail("INTERNAL", 500, sessionError?.message ?? "session not readable");
  }

  const { data: items, error: itemsError } = await supabase
    .from("exam_session_items")
    .select("id, lecture_id, ordinal, status")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .order("ordinal", { ascending: true });

  if (itemsError) return fail("INTERNAL", 500, itemsError.message);

  const lectureItems = (items ?? []) as Array<{
    id: string;
    lecture_id: string;
    ordinal: number;
    status: string;
  }>;

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    mode: session.mode,
    total_chars: session.total_chars,
    total_chunks: session.total_chunks,
    estimated_tokens: session.estimated_tokens,
    credit_reserved_at: session.credit_reserved_at,
    items: lectureItems.map((item) => ({
      id: item.id,
      lecture_id: item.lecture_id,
      ordinal: item.ordinal,
      status: item.status,
    })),
  });
}
