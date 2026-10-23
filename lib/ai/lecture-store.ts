/* ==========================================================================
   📚 حفظ المحاضرات المفرَّغة — lib/ai/lecture-store.ts
   ═══════════════════════════════════════════════════════════════════════

   **سيرفر بس.** بتستخدم `createClient` بتاع الجلسة (RLS شغّال) — ممنوع
   أي استيراد من كومپوننت كلاينت.

   ═══ ليه ملف منفصل عن الراوت ═══
   الراوت = حدود HTTP + ترجمة أخطاء. الملف ده = "إزاي نحوّل تفريغ لصف
   في الجدول". تغيير قواعد الحفظ يبقى تعديل هنا بس.

   ═══ ليه `buildLectureRow` دالة نقية منفصلة ═══
   ده أهم قرار في الملف: **كل تحويل الـ transcript لصف جدول بيبقى في
   دالة نقية واحدة** تقدر تتست من غير Supabase ولا شبكة. ده اللي بيخلّي
   أهم سؤال في المرحلة دي — "هل المقاطع والكلمات بتفضل زي ما هي؟" —
   يجاوب عليه اختبار حقيقي مش مراجعة بعين. الـ `saveLecture` بيرجّع
   الأعمدة من الدالة دي حرفياً، فما فيش مكان لبوتل الـ تفريغ في غيرها.

   ═══ الأمان ═══
     - `user_id` بيتحدّد من **الجلسة** (Supabase session) — لا يُقبل من
       المتصفح أبداً. العميل بيبعت transcript + filename بس.
     - بنستخدم عميل الجلسة (مش service role) فـ RLS شغّال **ولوحده**
       بيمنع الكتابة باسم حد تاني: `with check (auth.uid() = user_id)`
       هترفض أي سطر `user_id` مش بتاعك.
     - upsert على (user_id, storage_path) فإعادة المحاولة ترجّع نفس
       السطر بدل ما تعمل تاني (القيد موجود في `db/14-lectures.sql`).
   ═══════════════════════════════════════════════════════════════════════ */

import { createClient } from "@/lib/supabase/server";
import type { LectureTranscript } from "./transcription-shared";

/** القيم اللي بتتحوّل لصف واحد في `public.lectures`. */
export type LectureRow = {
  id: string;
  /** صاحب المحاضرة. NOT NULL في القاعدة — من الجلسة بس، مش من الـ body. */
  user_id: string;
  title: string | null;
  original_filename: string | null;
  storage_path: string | null;
  source_type: "upload" | "live_recording";
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  language: string | null;
  transcript_text: string | null;
  transcript_data: unknown;
  transcription_model: string | null;
  transcription_provider: string | null;
  status: "processing" | "completed" | "failed";
  created_at: string;
};

/** الصف كما بيرجع للعميل (أخف من كل الأعمدة — مفيش transcript_data). */
export type SavedLectureRef = {
  id: string;
  title: string | null;
  original_filename: string | null;
  source_type: string;
  status: string;
  created_at: string;
  duration_seconds: number | null;
};

/**
 * ⚠️ الحد الأقصى لطول العنوان. مش للزخرفة: العنوان بيتخزّن ويتقرا في
 * القوائم، وطوله غير المحدود بيكسر التخطيط على الموبايل.
 */
const MAX_TITLE_CHARS = 200;

/**
 * العنوان الافتراضي من اسم الملف — بلا امتداد.
 *
 * مثال: `محاضرة 3 - عمليات البحث.mp3` → `محاضرة 3 - عمليات البحث`
 *
 * ⚠️ الاسم الأصلي بيتخزّن **متسجّل** في `original_filename` — المسار في
 * التخزين بيستخدم UUID مش الاسم (شوف `buildObjectPath`)، فالاسم ده
 * **مش** جزء من أي مسار فمافيش خطر path traversal منّه.
 */
function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const trimmed = withoutExt.trim();
  return (trimmed === "" ? "محاضرة" : trimmed).slice(0, MAX_TITLE_CHARS);
}

/** مدّة بالثواني → عدد صحيح (العمود `integer`). `null` بيفضل `null`. */
function toDurationSeconds(duration: number | null): number | null {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    return null;
  }
  return Math.round(duration);
}

/** الحجم بالبايت → `bigint` صالح. أي حاجة مش رقم بتبقى `null`. */
function toFileSize(size: number | null | undefined): number | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return null;
  return Math.round(size);
}

/** يقرا نص من قيمة مجهولة ويرجّعه `null` لو مش نص أو فاضي. */
function asText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, max);
}


/**
 * 🔥 الدالة الأهم في الملف: `LectureTranscript` → صف `public.lectures`.
 *
 * **نقطة حرجة — `transcript_data`:** بنخزّن كائن `transcript` **كامل**
 * كما رجع من ElevenLabs: `segments[]` و`words[]` بتوقيتاتها على مستوى
 * الكلمة، واللغة، والموديل. مفيش أي تقليم أو اختيار حقول — والـ CHECK
 * في الـ migration بيطمّن إن العمود كائن (`jsonb_typeof = 'object'`).
 *
 * السبب إن المراحل الجاية محتاجة الحاجات دي: المزامنة الحية محتاجة
 * التوقيتات، والمعالجة بالـ AI محتاجة المقاطع، والمساعد محتاج السياق.
 * لو حفظنا `text` بس كان الضياع نهائي ومش راجع.
 *
 * **نقطة تانية — `transcript_text`:** فايبرة (derived) من نفس المصدر
 * مش من الـ input — فالمستحيل يبقى النص المحفوظ مش متطابق مع
 * `transcript_data` لو الـ input اتغيّر في نص الكود.
 */
export function buildLectureRow(input: {
  userId: string;
  transcript: LectureTranscript;
  originalFilename: string;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): LectureRow {
  const { userId, transcript } = input;
  const filename = asText(input.originalFilename, MAX_TITLE_CHARS) ?? "محاضرة";

  return {
    id: crypto.randomUUID(),
    // ⚠️ لازم السطر ده موجود — `user_id` NOT NULL في القاعدة. لو
    // اتنسى هنا، الـ insert بيرجع خطأ 42501 (not-null violation) وبيتحوّل
    // لـ "فشل الحفظ" عند الطالب. الـ ESLint warning على `userId` غير
    // المستخدم كان الإشارة، والتغطية من الاختبارات (user_id جوه الصف).
    user_id: userId,
    title: titleFromFilename(filename),
    original_filename: filename,
    storage_path: asText(input.storagePath, 300),
    source_type: "upload",
    mime_type: asText(input.mimeType, 120),
    file_size: toFileSize(input.fileSize),
    duration_seconds: toDurationSeconds(transcript.duration),
    language: asText(transcript.language, 20),
    transcript_text: transcript.text,
    // العقد الكامل — segments + words + التوقيتات. من غير قص.
    transcript_data: transcript,
    transcription_model: asText(transcript.model, 80),
    transcription_provider: asText(transcript.provider, 80),
    status: "completed",
    created_at: new Date().toISOString(),
  };
}

/** النتيجة: الحفظ نجح ولا لأ، وليه. */
export type SaveLectureResult =
  | { ok: true; lecture: SavedLectureRef }
  | { ok: false; code: "AUTH_REQUIRED" | "DB_FAILED"; message: string };

/**
 * يحفظ المحاضرة لصاحب الجلسة.
 *
 * ⚠️ **مالوش `userId` في الـ input عمداً**: `user_id` بيتقرا من جلسة
 * المستخدم المتحقّقة جوّه الدالة. لو كان بارامتر، كان أي راوت ناسي
 * يمرّره من الـ body هيخلّي حد يكتب باسم حد تاني. هنا مافيش طريق.
 */
export async function saveLectureForCurrentUser(input: {
  transcript: LectureTranscript;
  originalFilename: string;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): Promise<SaveLectureResult> {
  const supabase = await createClient();

  // ١) التحقق من المستخدم — من الجلسة، مش من الـ body.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "سجّل دخول الأول لو عايز تحفظ المحاضرة في حسابك.",
    };
  }

  // ٢) السطر — `user_id` من الخطوة ١ بالظبط.
  const row = buildLectureRow({ userId: user.id, ...input });

  // ٣) الحفظ. RLS شغّال لأن ده عميل الجلسة (anon + bearer) مش service
  //    role، فـ `with check (auth.uid() = user_id)` بيمسكنا لو حاولنا
  //    نكتب باسم حد تاني — وده مستحيل هنا أصلاً عشان الـ id من الجلسة.
  const { data, error } = await supabase
    .from("lectures")
    .upsert(row, { onConflict: "user_id,storage_path" })
    .select("id, title, original_filename, source_type, status, created_at, duration_seconds")
    .single();

  if (error || !data) {
    // ⚠️ لوج آمن: كود/رسالة Supabase مفيهاش أسرار (مفتاح الخدمة مش
    //    بيتنقل أصلاً — إحنا عميل جلسة). بتطبع للتشخيص بس، والطالب
    //    بياخد رسالة عربية عامة.
    console.error(
      `lecture-store: فشل حفظ المحاضرة [${error?.code ?? "no-code"}] — ${error?.message ?? "no data"}`,
    );
    return {
      ok: false,
      code: "DB_FAILED",
      message: "حصلت مشكلة أثناء حفظ المحاضرة. جرّب تاني كمان شوية.",
    };
  }

  return { ok: true, lecture: data as SavedLectureRef };
}
