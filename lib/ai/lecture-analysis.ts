import type { AiUsageContext } from "./usage-context";
/* ==========================================================================
   🧠 معالجة المحاضرات بالذكاء الاصطناعي — Phase 4-A
   ═══════════════════════════════════════════════════════════════════════

   **سيرفر بس.** الدخول من الراوت بس.

   ═══ ليه `runAiTask` ومش مزوّد مباشرة ═══
   المشروع عنده راوتر مركزي في `lib/ai/tasks/runner.ts` بيعمل اختيار
   الموديل والـ fallback واحتساب الكروت. لو نادينا مزوّد مباشرة كنا
   هنعمل نظام موازي يفتقد كل ده ويستهلك كروت من غير احتساب.
   فبنستخدم `runAiTask` بحته.

   ═══ ليه map-reduce ═══
   تفريغ محاضرة ٣ ساعات ≈ ٩٠ ألف كلمة، وده أطول من نافذة الموديل.
   بإرساله كله مرة واحدة المزوّد بيرجّع 400 والـ fallback كله يفشل.
   فبنقسّم (شوف `chunkTranscript`)، كل جزء بيتلخّص لوحده، وبعدين
   الأجزاء بتتدمج في نداء ثانٍ. **مفيش قص** — كل جزء من المحاضرة
   بيوصل للموديل.

   ═══ الأمان ═══
     - `userId` من الجلسة بس (الراوت بيجيبه). بنستخدمه للتنقيح والفوترة
       بس — **مش** بنكتب بيه.
     - الكتابة في القاعدة **بعميل الجلسة** (RLS شغّال) وعندنا
       `.eq("user_id", userId)` كمان — طبقتان.
     - مافيش أي مفتاح بيتقرا هنا أصلاً؛ الراوتر هو اللي بيتكفّل بيه.
   ═══════════════════════════════════════════════════════════════════════ */

import type { SupabaseClient } from "@supabase/supabase-js";

import { runAiTask } from "./tasks/runner";
import { toAiPublicError } from "./errors";
import {
  buildMessages,
  chunkTranscript,
  DEFAULT_CHUNK_CHARS,
  type LectureAnalysisKind,
} from "./lecture-prompts";

/** خطأ معروف للراوت يترجمه لـ HTTP + رسالة عربية آمنة. */
export class LectureAnalysisError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "LectureAnalysisError";
    this.code = code;
    this.status = status;
  }
}

/** النتيجة: المحتوى المولّد لكل نوع اتطلب. */
export type LectureAnalysis = {
  summary: string | null;
  explanation: string | null;
  /** كام نداء للموديل اتعمل — مفيد للتشخيص وحساب التكلفة. */
  aiCalls: number;
};

const ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
];

/** اسم الجزء بالعربي — «الجزء الثاني من ٥». */
function partLabel(index: number, total: number): string {
  if (total <= 1) return "";
  return `${ORDINALS[index] ?? `رقم ${index + 1}`} من ${total}`;
}

/**
 * ⚠️ تنظيف الناتج قبل الحفظ.
 *
 * الموديل أحياناً بيرجّع النص ملفوف في ```markdown fences. لو خزّنّا
 * كده، الطالب هيشوف الـ fences في صفحة /lectures. بنشيلها بس لو كانت
 * ملفوفة **بالفعل** (بتبدأ وبتنتهي بيها) — مش لو النص نفسه فيه كود.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).trim();
}

/**
 * ينفّذ نوع واحد (summary أو explanation) على تفريغ واحد.
 *
 * نداء واحد لو التفريغ قصير، وmap-reduce لو طويل.
 *
 * ⚠️ **مهم**: لو فشل أي نداء من نداءات الـ map-reduce بنرميه —
 * **مافيش partial**. السبب: نداء الدمج بياخد ناتج الأجزاء، فلو جزء
 * ناقص هينتج ملخص ناقص من غير ما حد ياخد باله. الفشل الصريح أحسن من
 * نتيجة ناقصة متنكرة إنها كاملة؛ الراوت بيرجّع خطأ والطالب يعيد.
 */
async function runSingle(
  kind: LectureAnalysisKind,
  transcript: string,
  user: { userId: string; educationLevel?: string },
  usage?: AiUsageContext,
): Promise<{ content: string; calls: number }> {
  const chunks = chunkTranscript(transcript, DEFAULT_CHUNK_CHARS);
  if (chunks.length === 0) {
    throw new LectureAnalysisError(
      "EMPTY_TRANSCRIPT",
      "مفيش نص في المحاضرة دي نتعامل معاه.",
      422,
    );
  }

  // ── المرحلة ١: كل قطعة لوحدها ──
  const notes: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const result = await runAiTask("chat", {
      usage,
      messages: buildMessages({
        kind,
        content: chunk,
        partLabel: partLabel(index, chunks.length),
      }),
      user: {
        userId: user.userId,
        language: "ar",
        ...(user.educationLevel ? { educationLevel: user.educationLevel } : {}),
      },
      // ٠.٣: قريبة من الصفر عمداً — ده محتوى دراسي، مش كتابة إبداعية.
      options: { temperature: 0.3 },
    });
    notes.push(stripCodeFence(result.content));
  }

  // ── المرحلة ٢: الدمج (بس لو فعلاً فيه قطع) ──
  let content = notes[0] ?? "";
  let calls = chunks.length;
  if (chunks.length > 1) {
    const merged = await runAiTask("chat", {
      usage,
      messages: buildMessages({
        kind: "synthesis",
        content: notes.join("\n\n"),
      }),
      user: { userId: user.userId, language: "ar" },
      options: { temperature: 0.3 },
    });
    content = stripCodeFence(merged.content);
    calls += 1;
  }

  // ⚠️ لو الموديل رجّع نص فاضي، ده فشل مش «نتيجة فاضية».
  if (content.trim() === "") {
    throw new LectureAnalysisError(
      "EMPTY_OUTPUT",
      "الخدمة رجعت نتيجة فاضية. جرّب تاني كمان شوية.",
      502,
    );
  }

  return { content, calls };
}

/**
 * ينفّذ المعالجة المطلوبة على محاضرة واحدة ويحفظ النتيجة.
 *
 * ⚠️ **`supabase` عميل الجلسة مش service role** — RLS شغّال، والفلتر
 * الصريح `.eq("user_id", userId)` فوقه طبقة تانية. لو RLS اتكسر موقتاً،
 * الفلتر الصريح لسه بيمنع الكتابة على محاضرة حد تاني.
 */
export async function analyzeLecture(input: {
  supabase: SupabaseClient;
  lectureId: string;
  transcript: string;
  kinds: LectureAnalysisKind[];
  user: { userId: string; educationLevel?: string };
  /** \ud83e\udde1 C4-FINAL: \u0633\u064a\u0627\u0642 \u0627\u0644\u0637\u0644\u0628 \u2014 \u0645\u0646 \u0627\u0644\u0631\u0648\u0627\u062a. */
  usage?: AiUsageContext;
}): Promise<LectureAnalysis> {
  const { supabase, lectureId, transcript, kinds, user, usage } = input;
  /**
   * \ud83d\udd11 \u0633\u064a\u0627\u0642 \u0645\u062e\u062a\u0644\u0641 \u0644\u0643\u0644 \u0646\u0648\u0639 \u0645\u062e\u062a\u0644\u0641.
   *
   * \u26a0\ufe0f \u0644\u0648\u0644\u0647 \u0627\u0644\u0643\u0644\u0645 \u0648\u0627\u062d\u062f: \u0639\u0646\u0627\u0635\u0631 \u0645\u062d\u0627\u0638\u0631\u0629 \u0645\u0639\u0627\u0645\u0644\u0629\u060c \u0648\u0645\u0627\u0637\u0644\u0628\u0627\u062a\u062a\u0647\u0627\u0643\u060c
   * \u0628\u064a\u0628\u062f\u0628\u0644\u0648 \u0646\u0641\u0633 \u0627\u0644 operation_id \u0648\u0627\u0644 feature \u0644\u0643\u0644 \u0645\u0639\u0627\u0645\u0644\u0629 \u0648\u0627\u062d\u062f\u0629\u060c \u0644\u0643\u0646 \u0646\u0635\u064a\u0631 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u062d\u062f\u064a\u062f.
   * \u0627\u0644\u0645\u0641\u062a\u0627\u062d \u064a\u0628\u0642\u0649 operation_id \u0648\u0627\u0642\u0647 \u0645\u0634\u0627\u0628\u0631\u0629\u0614 \u0644\u0623\u0646 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u062a\u0641\u0631\u0651\u062f
   * (user_id, idempotency_key, attempt_no) \u062a\u0637\u0628\u064a\u0639 \u0627\u0644\u062b\u0627\u0646\u064a\u0629 \u0645\u0639 \u0627\u0644\u0623\u0648\u0644\u0649.
   *
   * \u0644\u0630\u0644\u0643 \u0628\u0636\u064a\u0641 \u0627\u0644\u0643\u0644\u0645\u0629 \u0628\u0639\u062f \u0627\u0644\u0646\u0648\u0639: \u064a\u064f\u0642\u062a\u0637\u0639 \u062a\u0639\u062f\u064a\u062f \u0627\u0644\u0645\u062d\u062a\u0641\u0631\u062f \u0642\u0628\u0644 \u0627\u0644\u0631\u0641\u0639.
   */
  const forKind = (kind: LectureAnalysisKind): AiUsageContext | undefined =>
    usage
      ? { ...usage, feature: `lecture_${kind}`, idempotencyKey: `${usage.idempotencyKey}:${kind}` }
      : undefined;

  const summaryResult = kinds.includes("summary")
    ? await runSingle("summary", transcript, user, forKind("summary"))
    : null;
  const explanationResult = kinds.includes("explanation")
    ? await runSingle("explanation", transcript, user, forKind("explanation"))
    : null;

  const summary = summaryResult?.content ?? null;
  const explanation = explanationResult?.content ?? null;

  // ⚠️ الكتابة بالـ patch ده: بنحدّد الأعمدة بالاسم صريح. لو استعملنا
  // upsert بصف كامل كنا هنكتب transcript_data من جديد ونخاطر نلمس
  // تفريغ محفوظ — والشرط هنا إن التفريغ **ما يتلمسش أبداً**.
  const patch: Record<string, string> = {};
  if (summary !== null) patch.summary = summary;
  if (explanation !== null) patch.explanation = explanation;
  if (Object.keys(patch).length === 0) {
    throw new LectureAnalysisError(
      "NOTHING_REQUESTED",
      "مفيش حاجة مطلوبة.",
      400,
    );
  }

  const { error } = await supabase
    .from("lectures")
    .update(patch)
    .eq("id", lectureId)
    .eq("user_id", user.userId);

  if (error) {
    // ⚠️ لوج آمن: كود ورسالة Supabase مفيهاش أسرار. التفريغ **مش**
    // بيتطبع — كان هيعمل لوج بحجم النص كله.
    console.error(
      `lecture-analysis: فشل حفظ النتيجة [${error.code ?? "no-code"}] — ${error.message ?? ""}`,
    );
    throw new LectureAnalysisError(
      "DB_WRITE_FAILED",
      "المحتوى اتولّد بس مقدرش نحفظه. جرّب تاني كمان شوية.",
      500,
    );
  }

  return {
    summary,
    explanation,
    aiCalls: (summaryResult?.calls ?? 0) + (explanationResult?.calls ?? 0),
  };
}

/** يترجم أي خطأ (من الراوتر أو منّا) لخطأ آمن للراوت. */
export function toSafeAnalysisError(error: unknown): {
  code: string;
  message: string;
  status: number;
} {
  if (error instanceof LectureAnalysisError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  // ⚠️ الراوتر بيرمي أخطاء المزوّدين — نحوّلها لرسالة **آمنة** من
  // `errors.ts`، وهي بتتأكد إن الرسالة مفيهاش أسماء مزوّدين ولا مفاتيح
  // ولا تفاصيل داخلية.
  const publicError = toAiPublicError(error);
  console.error(`lecture-analysis: فشل الموديل [${publicError.code}]`);
  return {
    code: publicError.code,
    message: publicError.message,
    status: 502,
  };
}

