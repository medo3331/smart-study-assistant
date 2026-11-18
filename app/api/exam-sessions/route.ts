import { NextResponse } from "next/server";

import { requireUser, clampText } from "@/lib/api-guard";
import { createExamSession, selectSessionItems, type ExamSessionMode } from "@/lib/ai/exam-sessions";
import { parseExamSpec, DEFAULT_EXAM_SPEC } from "@/lib/ai/exam-review";
import { normalizeTopic } from "@/lib/ai/exam-sources";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * POST /api/exam-sessions — إنشاء جلسة مراجعة + حجز Credit واحد.
 *
 * مفيش AI هنا (sync < 2s). الحجز والإنشاء يحدثان في معاملة واحدة داخل
 * `create_exam_session_with_reserve`، فإما الاثنان أو لا شيء.
 */
export const dynamic = "force-dynamic";

/**
 * مهلة Vercel للراوت (ثانية).
 *
 * ⚠️ Fluid Compute مفعّل على المشروع، بس من غير السطر ده الراوت بيرجع
 * للمهلة الافتراضية (10–15 ثانية) ⇒ 502/504 من المنصة مش من كودنا.
 * 300 ثانية = سقف Fluid Compute، وبتغطي توليد الأسئلة (نداءات متتابعة:
 * ملخص لكل قطعة ← دمج ← أسئلة لكل قطعة ← إصلاح).
 */
export const maxDuration = 300;

const MODES: readonly ExamSessionMode[] = ["last_minute_review"];

/** تنظيف قائمة معرّفات (نصوص) + إزالة التكرار — نفس طبقة التنظيف مرتين. */
function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value !== "")
    )
  );
}

function fail(error: string, status: number, detail?: string) {
  const body = detail ? { error, detail } : { error };
  if (status >= 500) console.warn("[exam-sessions] create", error, detail ?? "");
  else console.info("[exam-sessions] create", error, detail ?? "");
  return NextResponse.json(body, { status });
}

/**
 * 🧾 لوج تشخيصي مفصّل — بتطبع السبب الحقيقي في Vercel Logs.
 *
 * ⚠️ **ليه**: كود 500 من غير stack = «مش عارف». هنا بنطبع: الرسالة،
 *    الاسم، الـstack، كود القاعدة/المزوّد، والـcontext (الجلسة/البند).
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
      }
    | null;
  console.error(`[exam-sessions] CRASH in ${where}`, {
    message: typeof err?.message === "string" ? err.message : String(error),
    name: typeof err?.name === "string" ? err.name : typeof error,
    stack: typeof err?.stack === "string" ? err.stack : undefined,
    // 🔢 كود القاعدة (مثل 42703 = عمود ناقص) أو كود المزوّد (429/503).
    code: err?.code,
    status: err?.status ?? err?.statusCode,
    details: err?.details,
    hint: err?.hint,
    cause: err?.cause instanceof Error ? err.cause.message : undefined,
    context,
  });
}

/** جسم الطلب بعد التحقق (مطبَّع). */
type ValidCreateBody = {
  mode: ExamSessionMode;
  lectureIds: string[];
  documentIds: string[];
  /** 🌍 موضوع عام — مصدر بديل (مفيش ملفات). */
  topic: string | null;
  spec: unknown;
  subjectId: string | null;
  subjectName: string;
  title: string;
  dayId: string | null;
};

/**
 * التحقق من شكل الـbody **قبل** أي تعامل مع القاعدة.
 *
 * ⚠️ **ليه**: `body.lectureIds` غير مصفوفة أو `body` مش object ⇒ كان
 *    بيرمي TypeError ⇒ 500 غامض. دلوقتي ⇒ 400 VALIDATION برسالة واضحة.
 *
 * ⚠️ **`lectureIds` + `documentIds`**: المصدرين مقبولين (محاضرة أو مستند)
 *    — والاتنين لازم يكونوا موجودين (واحد على الأقل).
 */
export function validateCreateBody(raw: unknown): { ok: true; body: ValidCreateBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const record = raw as Record<string, unknown>;

  const mode = typeof record.mode === "string" ? record.mode.trim() : "";
  if (!MODES.includes(mode as ExamSessionMode)) {
    return { ok: false, error: "invalid mode" };
  }

  const lectureIds = normalizeIds(record.lectureIds);
  const documentIds = normalizeIds(record.documentIds);
  // 🌍 الموضوع العام — نص (3..300 حرف) أو null.
  const topic = normalizeTopic(record.topic);

  // ⚠️ **مصدر واحد بس**: يا ملفات (محاضرات/مستندات) يا موضوع عام.
  //    الخلط بينهم مرفوض (الـRPC بيبني جلسة بمصدر واحد).
  if (topic && (lectureIds.length > 0 || documentIds.length > 0)) {
    return { ok: false, error: "topic cannot be combined with other sources" };
  }
  if (!topic && lectureIds.length === 0 && documentIds.length === 0) {
    return { ok: false, error: "lectureIds, documentIds or topic required" };
  }
  if (lectureIds.length + documentIds.length > 3) {
    return { ok: false, error: "max 3 sources" };
  }

  // اختيار الطالب (أنواع/صعوبة/عدد) — تحليل **صارم** من `parseExamSpec`.
  const spec =
    record.spec === undefined || record.spec === null
      ? { ...DEFAULT_EXAM_SPEC }
      : parseExamSpec(record.spec);
  if (!spec) return { ok: false, error: "invalid spec (types/difficulty/count)" };

  const rawSubject =
    record.subject && typeof record.subject === "object" && !Array.isArray(record.subject)
      ? (record.subject as { id?: unknown; name?: unknown })
      : null;
  const subjectId =
    rawSubject && typeof rawSubject.id === "string" && rawSubject.id.trim()
      ? clampText(rawSubject.id, 64).trim()
      : null;
  const subjectName =
    rawSubject && typeof rawSubject.name === "string" && rawSubject.name.trim()
      ? clampText(rawSubject.name, 120).trim()
      : "";
  const title =
    typeof record.title === "string" && record.title.trim()
      ? clampText(record.title, 120).trim()
      : "";
  const dayId =
    typeof record.dayId === "string" && record.dayId.trim()
      ? clampText(record.dayId, 64).trim()
      : null;

  return {
    ok: true,
    body: {
      mode: mode as ExamSessionMode,
      lectureIds,
      documentIds,
      topic,
      spec,
      subjectId,
      subjectName,
      title,
      dayId,
    },
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  // 🧾 سياق اللوج — بيتطبع مع أي crash عشان نعرف **مين** و**إيه** اللي فشل.
  const logContext: Record<string, unknown> = { route: "POST /api/exam-sessions" };

  try {
    const { user, supabase } = await requireUser();
    if (!user) return fail("UNAUTHORIZED", 401);

    // ⚠️ **قراءة الـbody**: JSON مكسور ⇒ 400 (مش 500) مع لوج.
    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch (parseError) {
      console.warn("[exam-sessions] create — invalid JSON body", {
        message: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return fail("VALIDATION", 400, "invalid JSON body");
    }

    // ⚠️ **التحقق قبل أي التعامل مع القاعدة** (types + المصادر + spec).
    const validated = validateCreateBody(rawBody);
    if (!validated.ok) {
      console.warn("[exam-sessions] create — invalid body", {
        reason: validated.error,
        received: Object.keys((rawBody ?? {}) as Record<string, unknown>),
      });
      return fail("VALIDATION", 400, validated.error);
    }
    const { mode, lectureIds, documentIds, topic, spec, subjectId, subjectName, title, dayId } =
      validated.body;

    logContext.lectureIds = lectureIds;
    logContext.documentIds = documentIds;
    logContext.topic = topic;
    logContext.mode = mode;
    logContext.spec = spec;

    const created = await createExamSession(supabase, {
      mode,
      lectureIds,
      documentIds,
      topic: topic ?? undefined,
    });

  if (!created.ok) {
    switch (created.code) {
      case "VALIDATION":
        return fail("VALIDATION", 400, created.error);
      case "UNAUTHENTICATED":
        return fail("UNAUTHORIZED", 401);
      case "NOT_OWNED":
        // 404 لا 403 — لا نكشف وجود مصدر ليس للمستخدم.
        return fail("NOT_FOUND", 404);
      case "BUDGET":
        return fail("BUDGET", 400, created.error);
      case "INSUFFICIENT_CREDITS":
        return fail("INSUFFICIENT_CREDITS", 402);
      case "SOURCES_UNAVAILABLE":
        // ⚠️ الـRPC الجديد (مستندات) لسه متطبّقش في القاعدة — رسالة صريحة
        //    بدل 500 غامض (والمسار القديم بيشتغل).
        console.warn("[exam-sessions] create — sources RPC unavailable", {
          detail: created.error,
          lectureIds: lectureIds.length,
          documentIds: documentIds.length,
        });
        return fail("SOURCES_UNAVAILABLE", 503, created.error);
      case "TOPIC_UNAVAILABLE":
        // ⚠️ الـmigration 50 (موضوع عام) لسه متطبّقةش ⇒ رسالة صريحة.
        console.warn("[exam-sessions] create — topic RPC unavailable", {
          detail: created.error,
        });
        return fail("TOPIC_UNAVAILABLE", 503, created.error);
      default:
        logCrash("createExamSession", created.error, { ...logContext });
        return fail("INTERNAL", 500, created.error);
    }
  }

  const sessionId = created.data.session_id;

  // metadata (المادة + spec الاختيار) — الكتابة service-role لأن RLS
  // على exam_sessions: المالك يقرأ فقط. best-effort: فشلها ما يوقّعش
  // الجلسة (الكريدت اتحجز أصلًا) لكن التوليد هيرجع للافتراضي.
  const metadata = {
    title: title || (subjectName ? `امتحان ${subjectName}` : "امتحان سريع"),
    subject_id: subjectId,
    subject_name: subjectName,
    day_id: dayId,
    spec,
  };
  try {
    const admin = createServiceClient();
    const { error: metaError } = await admin
      .from("exam_sessions")
      .update({ metadata })
      .eq("id", sessionId)
      .eq("user_id", user.id);
    if (metaError) console.warn("[exam-sessions] metadata write failed:", metaError.message);
  } catch (error) {
    console.warn(
      "[exam-sessions] metadata write skipped:",
      error instanceof Error ? error.message : error
    );
  }

  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select(
      "id, mode, status, total_chars, total_chunks, estimated_tokens, credit_reserved_at"
    )
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError || !session) {
    logCrash("read session after create", sessionError ?? new Error("session not readable"), {
      ...logContext,
      sessionId,
    });
    return fail("INTERNAL", 500, sessionError?.message ?? "session not readable");
  }

  const { rows: sessionItems, error: itemsError } = await selectSessionItems(supabase, {
    sessionId,
    userId: user.id,
    columns: "id, lecture_id, ordinal, status",
  });

  if (itemsError) {
    logCrash("read session items after create", itemsError, { ...logContext, sessionId });
    return fail("INTERNAL", 500, "could not read session items");
  }

  console.info("[exam-sessions] create — done", {
      sessionId,
      durationMs: Date.now() - startedAt,
      items: sessionItems.length,
    });

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    mode: session.mode,
    total_chars: session.total_chars,
    total_chunks: session.total_chunks,
    estimated_tokens: session.estimated_tokens,
    credit_reserved_at: session.credit_reserved_at,
    metadata,
    // 🌍 إشعار «موضوع عام» — الطالب لازم يعرف مصدر أسئلته.
    notice: topic
      ? "الامتحان ده مبني على معلومات عامة في الموضوع. لو عايز امتحان مخصص لمحاضرتك، ارفع الملف أو اختار من محاضراتك."
      : null,
    items: sessionItems.map((item) => ({
      id: item.id,
      lecture_id: item.lecture_id,
      // ⚠️ `document_id` بييجي بس لو الـmigration 49 متطبّقة (وإلا=null).
      document_id: item.document_id ?? null,
      topic: item.topic ?? null,
      source_kind: item.topic ? "topic" : item.document_id ? "document" : "recording",
      ordinal: item.ordinal,
      status: item.status,
    })),
  });
  } catch (error) {
    // 🧾 أي exception غير متوقع ⇒ 500 **مع تفاصيل كاملة في اللوج**.
    logCrash("POST /api/exam-sessions", error, { ...logContext, durationMs: Date.now() - startedAt });
    return fail("INTERNAL", 500, "could not create exam session");
  }
}
