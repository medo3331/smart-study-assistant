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

/** بحث محدود في المواد المحفوظة؛ نعيد مقتطفات صغيرة بدل كامل ملفات المستخدم. */
export async function searchUserFiles(supabase: SupabaseClient, userId: string, query: string) {
  const clean = query.trim().replace(/[%,_()]/g, "").slice(0, 80);
  if (clean.length < 3) return [];

  const { data, error } = await supabase
    .from("materials")
    .select("title, content, summary")
    .eq("user_id", userId)
    .or(`title.ilike.%${clean}%,content.ilike.%${clean}%`)
    .limit(3);

  if (error) return [];
  return (data ?? []).map((file) => ({
    title: String(file.title ?? "ملف"),
    snippet: String(file.summary || file.content || "").replace(/\s+/g, " ").slice(0, 500),
  }));
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
