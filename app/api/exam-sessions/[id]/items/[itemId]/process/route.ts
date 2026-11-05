import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import { chunkTranscript, DEFAULT_CHUNK_CHARS } from "@/lib/ai/lecture-prompts";
import { runAiTask } from "@/lib/ai/tasks/runner";
import {
  claimItem,
  failItem,
  incrementUsage,
  renewLease,
  saveResult,
} from "@/lib/ai/exam-sessions";
import {
  ExamLeaseLostError,
  generateExamReview,
  estimateItemBudget,
  type ExamReviewDeps,
} from "@/lib/ai/exam-review";

/**
 * POST /api/exam-sessions/[id]/items/[itemId]/process
 *
 * حصاد واحد لكل نداء: claim → تحقق ميزانية → توليد → تجديد lease بعد كل
 * نداء → حفظ. لا يحجز Credit جديدًا أبدًا (الحجز حدث عند إنشاء الجلسة).
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_LOGICAL_CALLS = 15;
const MAX_PROVIDER_ATTEMPTS = 45;
const MAX_ITEM_ATTEMPTS = 2;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  const body = { error, ...(extra ?? {}) };
  if (status >= 500) console.warn("[exam-sessions] process", error, extra ?? "");
  else console.info("[exam-sessions] process", error, extra ?? "");
  return NextResponse.json(body, { status });
}

/**
 * تحديث حالة الجلسة — يحتاج service-role.
 *
 * ⚠️ السبب: لا توجد سياسة UPDATE على `exam_sessions` (المالك يقرأ فقط)،
 * وFORCE RLS يمنع كتابة عميل الجلسة. الملكية مُتحقَّق منها قبل النداء،
 * والفلتر `.eq("user_id", …)` يبقى طبقة ثانية.
 * الفشل هنا **غير قاتل**: الحالة عرضٌ للواجهة لا تصحيح بيانات.
 */
async function setSessionStatus(input: {
  sessionId: string;
  userId: string;
  status: 'created' | 'generating' | 'ready' | 'completed' | 'failed' | 'abandoned';
  startedAt?: string | null;
}) {
  try {
    const admin = createServiceClient();
    const patch: Record<string, unknown> = { status: input.status };
    if (input.status === "generating" && !input.startedAt) {
      patch.started_at = new Date().toISOString();
    }
    const { error } = await admin
      .from("exam_sessions")
      .update(patch)
      .eq("id", input.sessionId)
      .eq("user_id", input.userId);
    if (error) console.warn("[exam-sessions] status update failed", error.message);
  } catch (error) {
    console.warn(
      "[exam-sessions] status update skipped",
      error instanceof Error ? error.message : error
    );
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  const { user, supabase } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", 401);

  const { id: sessionId, itemId } = await ctx.params;

  // ── ١) الجلسة (ملكية صريحة)
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(
      "id, status, started_at, total_lectures, logical_calls_used, provider_attempts_used"
    )
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError) return fail("INTERNAL", 500, { detail: sessionError.message });
  if (!session) return fail("NOT_FOUND", 404);

  // ── ٢) البند (لازم يكون داخل نفس الجلسة)
  const { data: item, error: itemError } = await supabase
    .from("exam_session_items")
    .select("id, session_id, lecture_id, status")
    .eq("id", itemId)
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (itemError) return fail("INTERNAL", 500, { detail: itemError.message });
  if (!item) return fail("NOT_FOUND", 404);

  // ── ٣) الجلسة مغلقة؟
  if (["completed", "failed", "abandoned"].includes(session.status)) {
    return fail("SESSION_CLOSED", 423);
  }

  // ── ٤) المحاضرة (ملكية صريحة) — قبل أي حجز
  const { data: lecture, error: lectureError } = await supabase
    .from("lectures")
    .select("id, transcript_text")
    .eq("id", item.lecture_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lectureError) return fail("INTERNAL", 500, { detail: lectureError.message });
  if (!lecture || typeof lecture.transcript_text !== "string" || !lecture.transcript_text.trim()) {
    return fail("NO_TRANSCRIPT", 422);
  }
  const transcript = lecture.transcript_text;

  // ── ٥) الاستحواذ
  const claimed = await claimItem(supabase, {
    sessionId,
    itemId,
    maxAttempts: MAX_ITEM_ATTEMPTS,
  });

  if (!claimed.ok) {
    return claimed.code === "UNAUTHENTICATED"
      ? fail("UNAUTHORIZED", 401)
      : fail("INTERNAL", 500, { detail: claimed.error });
  }

  if (claimed.data.kind === "already_ready") {
    return NextResponse.json({
      status: "ready",
      result: claimed.data.state.result_json,
    });
  }
  if (claimed.data.kind === "busy") {
    return fail("BUSY", 423, { retry_after: claimed.data.state.lease_expires_at });
  }
  if (claimed.data.kind === "exhausted") {
    return fail("ATTEMPTS_EXHAUSTED", 423);
  }

  const claimToken = claimed.data.item.claim_token;
  // لحظة القياس: من بداية الجلسة (أو آخر 5 دقائق كحد أقصى) — تُستخدم لعدّ
  // محاولات المزوّد الفعلية من ai_usage_events لهذا البند.
  const usageSince =
    session.started_at ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // ── ٦) تحقق الميزانية قبل أي نداء AI
  const chunks = chunkTranscript(transcript, DEFAULT_CHUNK_CHARS);
  const estimate = estimateItemBudget(chunks.length);

  if (session.logical_calls_used + estimate.logical > MAX_LOGICAL_CALLS) {
    await failItem(supabase, {
      itemId,
      claimToken,
      errorCode: "BUDGET_LOGICAL",
      errorMessage: "session logical budget",
    });
    return fail("BUDGET", 429, { detail: "logical" });
  }
  if (session.provider_attempts_used + estimate.attempts > MAX_PROVIDER_ATTEMPTS) {
    await failItem(supabase, {
      itemId,
      claimToken,
      errorCode: "BUDGET_ATTEMPTS",
      errorMessage: "session attempts budget",
    });
    return fail("BUDGET", 429, { detail: "attempts" });
  }

  // ── ٧) الحالة → generating (قبل النداء الأول)
  await setSessionStatus({
    sessionId,
    userId: user.id,
    status: "generating",
    startedAt: session.started_at,
  });

  // ── ٨) التوليد
  const operationId = crypto.randomUUID();
  let sequence = 0;

  const deps: ExamReviewDeps = {
    runTask: async ({ messages, usage, temperature }) => {
      const result = await runAiTask("chat", {
        messages,
        options: { temperature },
        user: { userId: user.id, language: "ar" },
        usage,
      });
      return { content: result.content };
    },
    chunk: chunkTranscript,
    chunkChars: DEFAULT_CHUNK_CHARS,
    usageFor: (aiTask) => ({
      operationId,
      // ⚠️ مفتاح فريد لكل نداء منطقي: قيد (user_id, idempotency_key, attempt_no)
      // يُسقط أي سطر ثانٍ بنفس المفتاح صامتًا.
      idempotencyKey: `exam:${sessionId}:${item.lecture_id}:${aiTask}:${sequence++}`,
      source: "server",
      userId: user.id,
      feature: "exam_review",
      diagnostics: {
        exam_session_id: sessionId,
        lecture_id: item.lecture_id,
        ai_task: aiTask,
      },
    }),
    afterCall: async () => {
      const renewed = await renewLease(supabase, { itemId, claimToken });
      if (!renewed.ok || renewed.data !== true) throw new ExamLeaseLostError();
    },
  };

  let generated;
  try {
    generated = await generateExamReview({ transcript, deps });
  } catch (error) {
    if (error instanceof ExamLeaseLostError) {
      // عامل قديم: لا نُفشل البند — قد يستعيده عامل آخر بعد انتهاء الـ lease.
      return fail("LEASE_LOST", 423);
    }
    await failItem(supabase, {
      itemId,
      claimToken,
      errorCode: "PROVIDER_ERROR",
      errorMessage: "ai_provider_exhausted",
    });
    console.warn(
      "[exam-sessions] generation failed",
      error instanceof Error ? error.message : error
    );
    return fail("AI_UNAVAILABLE", 502);
  }

  // ── ٩) المحاولات الفعلية من ai_usage_events (كل سطر = محاولة مزوّد)
  let attempts = generated.logicalCalls;
  try {
    const { data: usageRows } = await supabase
      .from("ai_usage_events")
      .select("metadata")
      .eq("feature", "exam_review")
      .gte("created_at", usageSince);
    const rows = (usageRows ?? []) as Array<{ metadata: Record<string, unknown> | null }>;
    const matched = rows.filter((row) => {
      const meta = row.metadata ?? {};
      return (
        meta.exam_session_id === sessionId && meta.lecture_id === item.lecture_id
      );
    });
    if (matched.length > 0) attempts = matched.length;
  } catch (error) {
    console.warn(
      "[exam-sessions] usage read failed",
      error instanceof Error ? error.message : error
    );
  }

  const incremented = await incrementUsage(supabase, {
    sessionId,
    logical: generated.logicalCalls,
    attempts,
    maxLogical: MAX_LOGICAL_CALLS,
    maxAttempts: MAX_PROVIDER_ATTEMPTS,
  });
  if (!incremented.ok) {
    console.warn("[exam-sessions] usage increment failed", incremented.error);
  } else if (!incremented.data.allowed) {
    // البند اكتمل بالفعل؛ السقف best-effort تحت التزامن.
    console.warn("[exam-sessions] usage cap reached", incremented.data.reason);
  }

  // ── ١٠) الحفظ (مشروط بالـ token)
  const saved = await saveResult(supabase, {
    itemId,
    claimToken,
    result: generated.review as unknown as Record<string, unknown>,
    transcriptChars: transcript.length,
    chunkCount: generated.chunks,
  });
  if (!saved.ok) return fail("INTERNAL", 500, { detail: saved.error });
  if (!saved.data) return fail("LEASE_LOST", 423);

  // ── ١١) حالة الجلسة: ready لو كل البنود جاهزة
  const { count: readyCount } = await supabase
    .from("exam_session_items")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "ready");

  const allReady =
    typeof readyCount === "number" && readyCount >= session.total_lectures;
  await setSessionStatus({
    sessionId,
    userId: user.id,
    status: allReady ? "ready" : "generating",
    startedAt: session.started_at ?? usageSince,
  });

  return NextResponse.json({
    status: "ready",
    result: generated.review,
    usage: {
      logical_calls: generated.logicalCalls,
      attempts,
    },
  });
}
