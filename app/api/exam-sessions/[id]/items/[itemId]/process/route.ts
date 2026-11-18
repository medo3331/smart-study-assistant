import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";
import { AiProviderError } from "@/lib/ai/types";
import { summarizeProviderFailure } from "@/lib/ai/errors";
import { createServiceClient } from "@/lib/supabase/admin";
import { chunkTranscript, DEFAULT_CHUNK_CHARS } from "@/lib/ai/lecture-prompts";
import { runAiTask } from "@/lib/ai/tasks/runner";
import {
  claimItem,
  failItem,
  incrementUsage,
  renewLease,
  saveResult,
  selectExamItem,
} from "@/lib/ai/exam-sessions";
import {
  ExamLeaseLostError,
  generateExamReview,
  estimateItemBudget,
  normalizeExamSpec,
  type ExamReviewDeps,
} from "@/lib/ai/exam-review";
import {
  buildExamSource,
  readDocumentText,
  EXAM_SOURCE_CHUNK_CHARS,
  type ExamSourceKind,
} from "@/lib/ai/exam-sources";

/**
 * POST /api/exam-sessions/[id]/items/[itemId]/process
 *
 * حصاد واحد لكل نداء: claim → تحقق ميزانية → توليد → تجديد lease بعد كل
 * نداء → حفظ. لا يحجز Credit جديدًا أبدًا (الحجز حدث عند إنشاء الجلسة).
 */
/**
 * مهلة Vercel للراوت (ثانية) — Fluid Compute مفعّل على المشروع.
 *
 * ⚠️ من غيرها (الافتراضي 10–15s) الطلب بيتقتل في نص التوليد ⇒ 502/504
 *    من المنصة مش من كودنا. 300s = سقف Fluid Compute وبتغطي السلسلة
 *    كلها: ملخص لكل قطعة ← دمج ← أسئلة لكل قطعة ← إصلاح.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_LOGICAL_CALLS = 15;
const MAX_PROVIDER_ATTEMPTS = 45;
const MAX_ITEM_ATTEMPTS = 2;

/**
 * سقف الميزانية **لكل محاضرة** (بيتضاعف × عدد محاضرات الجلسة).
 *
 * ⚠️ **ليه كان السقف ثابت 15**: السقف ده كان محسوب لعنصر واحد بس،
 *    بينما `logical_calls_used` بينتجمع **على مستوى الجلسة** ⇒ امتحان
 *    من 3 محاضرات كان بيقع في BUDGET في المحاضرة التانية/التالتة (خطأ
 *    موجود من قبل التقسيم). دلوقتي السقف = 15 × عدد المحاضرات.
 */
const MAX_LOGICAL_CALLS_PER_ITEM = MAX_LOGICAL_CALLS;

/** 🔁 مهلة الانتظار بين محاولتي قراءة الجلسة (تأخّر الـreplica). */
const REPLICA_RETRY_DELAY_MS = 700;

/** صف الجلسة (الأعمدة اللي بنقراها في مسار المعالجة). */
type SessionRow = {
  id: string;
  status: string;
  started_at: string | null;
  total_lectures: number | null;
  total_chars?: number | null;
  logical_calls_used: number | null;
  provider_attempts_used: number | null;
  metadata: unknown;
};
const MAX_PROVIDER_ATTEMPTS_PER_ITEM = MAX_PROVIDER_ATTEMPTS;

/**
 * عميل الـservice-role — للقراءة خارج RLS (صفحات `knowledge_base`).
 *
 * ⚠️ **ليه service**: صفحات المستند في `knowledge_base` مش مغطّاة بـRLS
 *    للمستخدم العادي. الملكية **متحقَّق منها قبل القراءة**: المستند نفسه
 *    بيتقرا بـ`.eq("user_id", user.id)` (RLS + فلتر صريح).
 */
function serviceClient() {
  return createServiceClient();
}

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  const body = { error, ...(extra ?? {}) };
  if (status >= 500) console.warn("[exam-sessions] process", error, extra ?? "");
  else console.info("[exam-sessions] process", error, extra ?? "");
  return NextResponse.json(body, { status });
}

/**
 * 🧾 لوج تشخيصي مفصّل (نفس مستوى راوت الإنشاء).
 *
 * ⚠️ **بيفصل**: خطأ قاعدة (code=42703) / خطأ مزوّد (status=429/503) /
 *    timeout (TIMEOUT) — عشان Logs تقول السبب الحقيقي مش «500».
 */
function logCrash(where: string, error: unknown, context: Record<string, unknown> = {}): void {
  const err = error as
    | {
        message?: unknown;
        name?: unknown;
        stack?: unknown;
        code?: unknown;
        status?: unknown;
        statusCode?: unknown;
        details?: unknown;
        hint?: unknown;
        cause?: unknown;
        reason?: unknown;
      }
    | null;
  console.error(`[exam-sessions] CRASH in ${where}`, {
    message: typeof err?.message === "string" ? err.message : String(error),
    name: typeof err?.name === "string" ? err.name : typeof error,
    stack: typeof err?.stack === "string" ? err.stack : undefined,
    code: err?.code,
    status: err?.status ?? err?.statusCode,
    reason: err?.reason,
    details: err?.details,
    hint: err?.hint,
    cause: err?.cause instanceof Error ? err.cause.message : undefined,
    context,
  });
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
  const startedAt = Date.now();
  const logContext: Record<string, unknown> = { route: "POST process" };

  try {
  const { user, supabase } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", 401);

  const { id: sessionId, itemId } = await ctx.params;
  logContext.sessionId = sessionId;
  logContext.itemId = itemId;

  // ── ١) الجلسة (ملكية صريحة)
  //
  // ⚠️ **قراءة واحدة + إعادة محاولة واحدة**: الجلسة اتعملت قبل لحظات
  //   (بعد الإنشاء) والقراءة ممكن تقع على **replica لسه ماCatchت الكتابة**
  //   ⇒ 404 مؤقت. فبنستنى نص ثانية ونجرب تاني قبل ما تقول «مش موجودة» ✓.
  let session: SessionRow | null = null;
  let sessionError: { message?: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const read = await supabase
      .from("exam_sessions")
      .select(
        "id, status, started_at, total_lectures, total_chars, logical_calls_used, provider_attempts_used, metadata"
      )
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    session = read.data as SessionRow | null;
    sessionError = read.error;
    if (read.data || read.error) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, REPLICA_RETRY_DELAY_MS));
  }

  if (sessionError) {
    logCrash("read session", sessionError, { ...logContext });
    return fail("INTERNAL", 500, { detail: sessionError.message });
  }
  if (!session) return fail("NOT_FOUND", 404);

  // ── ٢) البند (لازم يكون داخل نفس الجلسة)
  //
  // ⚠️ **مستقل عن الـschema**: لو الـmigration 49 (عمود `document_id`) لسه
  //    متطبّقةش ⇒ PostgREST بيرجّع 42703 ⇒ كان 500 في **كل** عملية
  //    معالجة. دلوقتي بنرجع للاستعلام القديم بدل ما نكسر المسار.
  const { item, error: itemError, documentSupport } = await selectExamItem(supabase, {
    sessionId,
    itemId,
    userId: user.id,
  });

  if (itemError) {
    logCrash("read session item", itemError, { ...logContext });
    const detail =
      typeof (itemError as { message?: unknown }).message === "string"
        ? (itemError as { message: string }).message
        : "could not read item";
    return fail("INTERNAL", 500, { detail });
  }
  if (!item) {
    // ⚠️ نفس فكرة الجلسة: البند اتعمل مع الجلسة ⇒ ممكن يكون تأخّر replica.
    logCrash("item not found (maybe replica lag)", new Error("item not found"), {
      ...logContext,
    });
    return fail("NOT_FOUND", 404, { detail: "item not found" });
  }

  // ── ٣) الجلسة مغلقة؟
  if (["completed", "failed", "abandoned"].includes(session.status)) {
    return fail("SESSION_CLOSED", 423);
  }

  // ── ٤) المصدر — محاضرة (صوت) **أو** مستند (PDF/PPTX/DOCX)
  //
  // ⚠️ **ليه اتنين**: المولّد كان مربوط بالمحاضرات بس ⇒ الطالب اللي عنده
  //    ملفات PDF بس كان بياخد 502/503 من غير سبب حقيقي. دلوقتي البند
  //    بياخد مصدره من نوعه (محاضرة/مستند).
  //
  // ⚠️ **ملكية صريحة** على المصدر في الحالتين.
  const itemRow = item as {
    id: string;
    lecture_id: string | null;
    document_id?: string | null;
    topic?: string | null;
    status: string;
  };

  let transcript = "";
  let sourceTitle = "";
  let sourceKind: ExamSourceKind = "recording";
  // 🌍 وضع المعرفة: تفريغ (محاضرة/مستند) ولا معلومات عامة (موضوع).
  let knowledgeMode: "source" | "general" = "source";

  if (itemRow.topic) {
    // 🌍 موضوع عام — المصدر هو نص الموضوع (الـAI يكمّل بمعرفته العامة).
    sourceKind = "topic";
    knowledgeMode = "general";
    transcript = itemRow.topic;
    sourceTitle = `موضوع: ${itemRow.topic}`;
  } else if (itemRow.document_id) {
    // 📄 مستند — النص المستخرج وقت الرفع (صفحات knowledge_base).
    sourceKind = "document";
    let document: Awaited<ReturnType<typeof readDocumentText>> = null;
    try {
      document = await readDocumentText(serviceClient(), {
        documentId: itemRow.document_id,
        userId: user.id,
      });
    } catch (error) {
      // ⚠️ الجدول مش موجود (migration 36/49 متطبّقةش) ⇒ رسالة واضحة
      //    بدل 500 مبهم.
      logCrash("read document text", error, { ...logContext, document_id: itemRow.document_id });
      const code = (error as { code?: string } | null)?.code;
      if (code === "42P01" || code === "PGRST205" || code === "PGRST204") {
        return fail("SOURCE_TABLE_MISSING", 503, {
          detail: "documents/knowledge_base tables are missing (migrations not applied)",
        });
      }
      return fail("SOURCE_UNAVAILABLE", 503, { detail: "could not read document" });
    }
    if (!document) {
      // ⚠️ **مستند موجود بس مفيهوش نص مستخرج** (PDF صور/مشفّر/فارغ):
      //    ده كان بيرجّع **404** ⇒ والواجبة كانت بتقول «الجلسة مش موجودة»
      //    والطالب مش فاهم حاجة. الصواب: **422** برسالة واضحة ✓.
      logCrash("document without extractable text", new Error("no text"), {
        ...logContext,
        document_id: itemRow.document_id,
      });
      return fail("NO_TEXT", 422, {
        detail: "المستند مفيهوش نص قابل للقراءة — ارفع ملف تاني",
      });
    }
    transcript = document.text;
    sourceTitle = document.title;
  } else {
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id, title, transcript_text")
      .eq("id", itemRow.lecture_id ?? "")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lectureError) {
      logCrash("read lecture", lectureError, { ...logContext, lecture_id: itemRow.lecture_id });
      return fail("INTERNAL", 500, { detail: lectureError.message });
    }
    if (!lecture || typeof lecture.transcript_text !== "string" || !lecture.transcript_text.trim()) {
      return fail("NO_TRANSCRIPT", 422);
    }
    transcript = lecture.transcript_text;
    sourceTitle = lecture.title ?? "محاضرة";
  }

  if (!transcript.trim()) return fail("NO_TRANSCRIPT", 422);

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
  //
  // ⚠️ **ترتيب مهم**: اختيار الطالب (spec) بيتقرا **قبل** التقدير، لأن
  //    عدد نداءات الأسئلة بقى دالة في **عدد الأسئلة** (تقسيم 5 أسئلة
  //    لكل نداء) مش في عدد قطع المحاضرة بس.
  //
  //    والسقف بيتضاعف × عدد محاضرات الجلسة (كان ثابت فكان بيقع
  //    BUDGET في المحاضرة التانية من امتحان 3 محاضرات).
  const spec = normalizeExamSpec((session as { metadata?: unknown }).metadata &&
    typeof (session as { metadata?: unknown }).metadata === "object"
    ? ((session as { metadata: { spec?: unknown } }).metadata.spec)
    : undefined);

  // ⚠️ **التقطيع (chunking)**: ملف PDF من 50 صفحة نصّه أكبر من أي نداء
  //    واحد ⇒ بيتقطّع هنا لمجموعات (6 آلاف حرف لكل قطعة) والنداءات
  //    بتاخد قطعة piece. نفس مسار المحاضرات بالظبط.
  const source = buildExamSource({ kind: sourceKind, title: sourceTitle, text: transcript });
  const chunks = source.chunks;
  if (chunks.length === 0) return fail("NO_TRANSCRIPT", 422);

  const estimate = estimateItemBudget(chunks.length, spec.count);

  const totalLectures = Math.max(1, Number(session.total_lectures) || 1);
  /**
   * ⚠️ **السقف بيتحسب من حجم الجلسة الحقيقي** (مش رقم ثابت):
   *    لقط المصدر بقى 3000 حرف (بدل 6000) ⇒ القطع بضعف ⇒ نداءات
   *    أكتر ⇒ سقف ثابت 15 كان هيقع في **BUDGET (429)** على
   *    الجلسات الطويلة.
   *
   *    ⇒ السقف = (نداءات الجلسة المتوقعة) + هامش للإصلاح.
   *    عدد قطع الجلسة ≈ ceil(total_chars / حجم_القطعة).
   */
  const sessionChunks = Math.max(
    1,
    Math.ceil(Math.max(0, Number(session.total_chars) || 0) / EXAM_SOURCE_CHUNK_CHARS)
  );
  const sessionLogicalCap =
    estimateItemBudget(sessionChunks, spec.count).logical + MAX_LOGICAL_CALLS_PER_ITEM;
  const sessionAttemptsCap =
    estimateItemBudget(sessionChunks, spec.count).attempts + MAX_PROVIDER_ATTEMPTS_PER_ITEM;

  if ((session.logical_calls_used ?? 0) + estimate.logical > sessionLogicalCap) {
    await failItem(supabase, {
      itemId,
      claimToken,
      errorCode: "BUDGET_LOGICAL",
      errorMessage: "session logical budget",
    });
    return fail("BUDGET", 429, { detail: "logical" });
  }
  if ((session.provider_attempts_used ?? 0) + estimate.attempts > sessionAttemptsCap) {
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
  /** مفتاح المصدر (للـidempotency + ربط سجلات الاستخدام). */
  const sourceKey = item.lecture_id ?? itemRow.topic ?? itemRow.document_id ?? "topic";

  const deps: ExamReviewDeps = {
    runTask: async ({ messages, usage, temperature, maxTokens, timeoutMs }) => {
      // 🔥 **مهمة `exam_generation` مش `chat`**: التوليد نداءات JSON طويلة
      //    متتابعة — والموديل السريع (gpt-oss-20b) بيخلّيها ضمن المهلة
      //    بدل ما تستنزف الوقت على استدلال زي gpt-oss-120b (502/503).
      const result = await runAiTask("exam_generation", {
        messages,
        options: {
          temperature,
          // 🔢 سقف المخرج + ⏱️ مهلة الطلب: من غيرهم الموديلات الاستدلالية
          //    (gpt-oss) بترجع `content` فاضي أو بتتقطع في النص ⇒ 503.
          ...(maxTokens !== undefined ? { maxTokens } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        },
        user: { userId: user.id, language: "ar" },
        usage,
      });
      // 🧾 **لوج الموديل المنفّذ**: مع كل موديل بنعرفه نعرف مين تعطّل
      //    (GROQ/NVIDIA/OpenRouter) — ده أول حاجة تبصّها لو في 502/503.
      console.info("[exam-sessions] exam_generation call", {
        provider: result.provider,
        model: result.model,
        // ⚠️ `fallback.attempts` = المحاولات الفاشلة قبل النجاح ⇒ بتقول
        //    أي موديل اتعيط وباي حالة.
        attempts: result.fallback?.attempts?.map((attempt) => ({
          provider: attempt.provider,
          model: attempt.model,
          ok: attempt.ok,
          reason: attempt.reason,
        })),
      });
      return { content: result.content };
    },
    // ⚠️ **التقطيع اتعمل فوق** (ملف PDF كبير ⇒ مجموعات) — هنا بنرجّع
    //    القطع الجاهزة، ومافيش تقطيع تاني جوه المحرك.
    chunk: () => chunks,
    chunkChars: DEFAULT_CHUNK_CHARS,
    usageFor: (aiTask) => ({
      operationId,
      // ⚠️ مفتاح فريد لكل نداء منطقي: قيد (user_id, idempotency_key, attempt_no)
      // يُسقط أي سطر ثانٍ بنفس المفتاح صامتًا.
      // ⚠️ **مفتاح المصدر**: بند الموضوع مالهوش lecture_id ⇒ بنستخدم نص
      //    الموضوع في المفتاح (عشان مافيش تصادم بين بندين).
      idempotencyKey: `exam:${sessionId}:${sourceKey}:${aiTask}:${sequence++}`,
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

  // ⚠️ اختيار الطالب (spec) اتقرا فوق مع تقدير الميزانية (خطأ 6) —
  //    عشان التقدير يبقى مطابق لعدد النداءات الفعلي.

  let generated;
  try {
    generated = await generateExamReview({ transcript, deps, spec, mode: knowledgeMode });
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

    // 🧾 اللوج الكامل: الـstatus والرسالة من خطأ الـAI SDK (مش مجرد نص).
    //
    // ⚠️ **ليه `summarizeProviderFailure`**: الخطأ النهائي بعد استنزاف
    //    كل المزوّدات هو `AiRouteError` — **مالوش** `status` مباشرة
    //    (الأرقام جوه `reasons`). فال-raوت اللي بيفحص `error.status`
    //    كان بيلاقي `undefined` وبيرجّع 502 عشوائي. دلوقتي بنقرا
    //    الأرقام الحقيقية من المحاولات.
    const summary = summarizeProviderFailure(error);
    const providerStatus =
      summary.status ??
      (typeof (error as { status?: unknown } | null)?.status === "number"
        ? ((error as { status: number }).status)
        : undefined);
    const providerCode = (error as { code?: unknown } | null)?.code;
    const providerReason = (error as { reason?: unknown } | null)?.reason;
    logCrash("generateExamReview", error, {
      ...logContext,
      providerStatus,
      providerCode,
      providerReason,
      providerAttempts: summary.attempts,
      durationMs: Date.now() - startedAt,
    });

    // 🔄 429 من المزوّد (كل مفاتيح Groq اتعيطت) — مش خطأ الطالب ولا
    //    ميزانية الامتحان ⇒ 503 «الخدمة مشغولة» مع إعادة محاولة بعد دقيقة.
    if (providerStatus === 429 || summary.allRateLimited) {
      return fail("AI_RATE_LIMITED", 503, {
        detail: "provider rate limited (all keys)",
        retry_after: 60,
      });
    }
    // ⏱️ مهلة الطلب (20–120s) — المزوّد بطيء/محجوب.
    if (providerStatus === 504 || summary.hasTimeout || providerReason === "TIMEOUT") {
      return fail("AI_TIMEOUT", 503, { detail: "provider timeout", retry_after: 30 });
    }
    // 🖥️ 5xx من المزوّد (500/502/503) بعد كل محاولات الإعادة ⇒
    //    رسالة صريحة للطالب: «السيرفر مشغول، جرب تاني».
    if (
      (typeof providerStatus === "number" && providerStatus >= 500) ||
      summary.hasServerError
    ) {
      return fail("AI_PROVIDER_UNAVAILABLE", 503, {
        detail: "provider unavailable after retries",
        provider_status: providerStatus ?? null,
        retry_after: 30,
      });
    }
    // 📭 استجابة فاضية (نموذج استدلالي خلّص الـbudget من غير مخرجات).
    if (summary.reasonCode === "EMPTY_RESPONSE") {
      return fail("AI_EMPTY_RESPONSE", 503, { detail: "empty provider response", retry_after: 20 });
    }
    return fail("AI_UNAVAILABLE", 502, { detail: "generation failed" });
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
      // ⚠️ بند الموضوع: `lecture_id` = null في السطر والتطابق ⇒ بيطابق
      //    (جلسة الموضوع عندها بند واحد بس ⇒ مافيش خلط).
      return meta.exam_session_id === sessionId && meta.lecture_id === item.lecture_id;
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
    maxLogical: sessionLogicalCap,
    maxAttempts: sessionAttemptsCap,
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
  if (!saved.ok) {
    logCrash("saveResult", new Error(saved.error), { ...logContext });
    return fail("INTERNAL", 500, { detail: saved.error });
  }
  if (!saved.data) return fail("LEASE_LOST", 423);

  // ── ١١) حالة الجلسة: ready لو كل البنود جاهزة
  const { count: readyCount } = await supabase
    .from("exam_session_items")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "ready");

  const allReady =
    typeof readyCount === "number" && readyCount >= (session.total_lectures ?? 1);
  await setSessionStatus({
    sessionId,
    userId: user.id,
    status: allReady ? "ready" : "generating",
    startedAt: session.started_at ?? usageSince,
  });

  console.info("[exam-sessions] process — done", {
    sessionId,
    itemId,
    durationMs: Date.now() - startedAt,
    logicalCalls: generated.logicalCalls,
    attempts,
  });

  return NextResponse.json({
    status: "ready",
    result: generated.review,
    usage: {
      logical_calls: generated.logicalCalls,
      attempts,
    },
  });
  } catch (error) {
    // 🧾 أي exception غير متوقع ⇒ 500 **مع تفاصيل كاملة في اللوج**
    //    (الـstack + كود القاعدة/المزوّد + سياق الجلسة والبند).
    logCrash("POST /api/exam-sessions/[id]/items/[itemId]/process", error, {
      ...logContext,
      durationMs: Date.now() - startedAt,
    });
    return fail("INTERNAL", 500, { detail: "processing failed" });
  }
}
