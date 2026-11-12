import type { SupabaseClient } from "@supabase/supabase-js";

export interface CurrentLesson {
  id: string;
  day: number;
  topic: string;
  learningStyle: string;
  isCompleted: boolean;
}

/** أدوات بيانات صغيرة ومحددة: لا ترجع إلا بيانات المستخدم صاحب الجلسة. */
export async function getCurrentLesson(
  supabase: SupabaseClient,
  userId: string,
  configId: string,
  lessonDay: number
) {
  const { data, error } = await supabase
    .from("study_days")
    .select("id, day, topic, learning_style, is_completed")
    .eq("user_id", userId)
    .eq("config_id", configId)
    .eq("day", lessonDay)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: String(data.id),
    day: Number(data.day),
    topic: String(data.topic ?? ""),
    learningStyle: String(data.learning_style ?? "practical"),
    isCompleted: Boolean(data.is_completed),
  } satisfies CurrentLesson;
}

export async function getStudentProgress(supabase: SupabaseClient, userId: string, configId: string) {
  const { data, error } = await supabase
    .from("study_days")
    .select("is_completed")
    .eq("user_id", userId)
    .eq("config_id", configId);

  if (error) return { completed: 0, total: 0 };
  const days = data ?? [];
  return { completed: days.filter((day) => day.is_completed).length, total: days.length };
}

/**
 * بحث محدود في المواد والمحاضرات المحفوظة؛ نعيد مقتطفات صغيرة بدل
 * كامل ملفات المستخدم.
 *
 * ⚠️ **المحاضرات كمان (2026-11-12)**: قبل كده البحث كان على `materials`
 *    بس ⇒ سؤال عام عن محاضرة («إيه اللي اتقال عن الـ white lesion؟»)
 *    مابيشوفش **شيء** من تفريغها. دلوقتي بنبحث في `transcript_text`
 *    كمان وبنرجّع مقتطف من surroundings السؤال.
 *
 * ⚠️ **الحدود**: ٣ مواد + ٢ محاضرات، ومقتطف ٥٠٠ حرف لكل واحد ⇒
 *    أقصى ~٢.٥ ك.ب في البرومبت (من غير ده الـ prompt بيضخّم والكلفة
 *    بتطير).
 */
export async function searchUserFiles(supabase: SupabaseClient, userId: string, query: string) {
  // ⚠️ **التنظيف**: PostgREST بيتعامل مع `,` و`.` و`(` كـ فواصل ⇒ لازم
  //    تتفشّى (و`%` كـ wildcards).
  const clean = query.trim().replace(/[%,_()*"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean.length < 3) return [];

  const [materialsResult, lecturesResult] = await Promise.all([
    supabase
      .from("materials")
      .select("title, content, summary")
      .eq("user_id", userId)
      .or(`title.ilike.%${clean}%,content.ilike.%${clean}%`)
      .limit(3),
    // 📄 **المحاضرات** — تفريغها (مش الـ segments — الـ `ilike` على
    //    `transcript_text` أرخص بكتير من استخراج jsonb وتصفية كل مقطع).
    supabase
      .from("lectures")
      .select("title, original_filename, transcript_text")
      .eq("user_id", userId)
      .eq("status", "completed")
      .or(`title.ilike.%${clean}%,transcript_text.ilike.%${clean}%`)
      .limit(2),
  ]);

  const out: Array<{ title: string; snippet: string }> = [];

  for (const file of materialsResult.data ?? []) {
    out.push({
      title: String(file.title ?? "ملف"),
      snippet: String(file.summary || file.content || "").replace(/\s+/g, " ").slice(0, 500),
    });
  }

  for (const lecture of lecturesResult.data ?? []) {
    const text = String(lecture.transcript_text ?? "").replace(/\s+/g, " ");
    out.push({
      title: `محاضرة: ${String(lecture.title ?? lecture.original_filename ?? "بدون عنوان")}`,
      // ⚠️ **مقتطف حول موضع السؤال** — مش أول ٥٠٠ حرف (دي غالباً
      //    مقدمة المحاضرة، مش اللي بيسأل عليه الطالب).
      snippet: excerptAround(text, clean, 500),
    });
  }

  return out;
}

/**
 * 📄 **مقتطف حول موضع البحث** (مش من الأول).
 *
 * ⚠️ **ليه**: المحاضرة الطويلة — أول ٥٠٠ حرف هي المقدمة، والسؤال بUsually
 *    عن نص في النص. ⇒ بندور على أقرب موضع وناخد حواليه.
 */
function excerptAround(text: string, needle: string, maxChars: number): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return text.slice(0, maxChars);
  const start = Math.max(0, idx - Math.floor(maxChars / 3));
  const prefix = start > 0 ? "…" : "";
  return `${prefix}${text.slice(start, start + maxChars)}`;
}

/** لا نحدّث التقدم إلا عند طلب صريح من الطالب، وليس بناءً على تخمين الموديل. */
export async function updateStudyProgress(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  isCompleted: boolean
) {
  const { error } = await supabase
    .from("study_days")
    .update({ is_completed: isCompleted })
    .eq("id", lessonId)
    .eq("user_id", userId);

  return !error;
}

export function shouldMarkCurrentLessonComplete(message: string) {
  return /(?:علّم|علم|اعتبر|سجّل|سجل|خلصت|أنهيت).{0,20}(?:الدرس|الموضوع).{0,20}(?:مكتمل|خلصان|تم)?/i.test(message);
}
