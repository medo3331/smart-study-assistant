import { createServiceClient } from "@/lib/supabase/admin";

type InsightError = { source: string; message: string };

export type StudyCourse = {
  id: string;
  subject: string;
  category: string | null;
  sub_category: string | null;
  days_count: number | null;
  created_at: string;
  total_days: number;
  completed_days: number;
};

export type LectureSummary = {
  id: string;
  title: string | null;
  original_filename: string | null;
  source_type: string;
  status: string;
  created_at: string;
};

export type ExamSummary = {
  id: string;
  mode: string;
  status: string;
  total_lectures: number;
  created_at: string;
  completed_at: string | null;
};

export type UserProfileInsights = {
  courses: StudyCourse[];
  workspaceSubjects: Array<{ id: string; name: string; stage: string; curriculum: string | null; grade_or_year: string | null; specialization: string | null; created_at: string }>;
  lectures: LectureSummary[];
  exams: ExamSummary[];
  ai: { total: number | null; completed: number | null; failed: number | null; recent: Array<{ task_type: string; model: string; status: string; created_at: string }> };
  activeConfigId: string | null;
  errors: InsightError[];
};

/** Reads student study and AI records, always scoped by the canonical auth UUID. */
export async function getUserProfileInsights(userId: string): Promise<UserProfileInsights> {
  const supabase = createServiceClient();
  const errors: InsightError[] = [];
  const [configsResult, daysResult, workspaceSubjectsResult, lecturesResult, examsResult, aiCountResult, aiCompletedResult, aiFailedResult, aiRecentResult, profileResult] = await Promise.all([
    supabase.from("study_configs").select("id, subject, category, sub_category, days_count, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("study_days").select("config_id, is_completed").eq("user_id", userId).limit(10000),
    supabase.from("workspace_subjects").select("id, name, stage, curriculum, grade_or_year, specialization, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("lectures").select("id, title, original_filename, source_type, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("exam_sessions").select("id, mode, status, total_lectures, created_at, completed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("ai_operations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("ai_operations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase.from("ai_operations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "failed"),
    supabase.from("ai_operations").select("task_type, model, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("active_config_id").eq("id", userId).maybeSingle(),
  ]);

  if (configsResult.error) errors.push({ source: "المواد والمسارات الدراسية", message: configsResult.error.message });
  if (daysResult.error) errors.push({ source: "تقدم الدروس", message: daysResult.error.message });
  if (workspaceSubjectsResult.error) errors.push({ source: "مواد مساحة العمل", message: workspaceSubjectsResult.error.message });
  if (lecturesResult.error) errors.push({ source: "المحاضرات", message: lecturesResult.error.message });
  if (examsResult.error) errors.push({ source: "جلسات الامتحان", message: examsResult.error.message });
  if (aiCountResult.error) errors.push({ source: "إجمالي عمليات الذكاء الاصطناعي", message: aiCountResult.error.message });
  if (aiCompletedResult.error) errors.push({ source: "عمليات الذكاء الاصطناعي المكتملة", message: aiCompletedResult.error.message });
  if (aiFailedResult.error) errors.push({ source: "عمليات الذكاء الاصطناعي الفاشلة", message: aiFailedResult.error.message });
  if (aiRecentResult.error) errors.push({ source: "نشاط الذكاء الاصطناعي الأخير", message: aiRecentResult.error.message });
  if (profileResult.error) errors.push({ source: "المادة النشطة", message: profileResult.error.message });

  const dayCounts = new Map<string, { total: number; completed: number }>();
  for (const day of daysResult.data ?? []) {
    const counts = dayCounts.get(day.config_id) ?? { total: 0, completed: 0 };
    counts.total += 1;
    if (day.is_completed) counts.completed += 1;
    dayCounts.set(day.config_id, counts);
  }
  const courses: StudyCourse[] = (configsResult.data ?? []).map((course) => {
    const counts = dayCounts.get(course.id) ?? { total: 0, completed: 0 };
    return { ...course, total_days: counts.total, completed_days: counts.completed };
  });

  const recentAi = aiRecentResult.data ?? [];
  return {
    courses,
    workspaceSubjects: (workspaceSubjectsResult.data ?? []) as UserProfileInsights["workspaceSubjects"],
    lectures: (lecturesResult.data ?? []) as LectureSummary[],
    exams: (examsResult.data ?? []) as ExamSummary[],
    ai: {
      total: aiCountResult.error ? null : (aiCountResult.count ?? 0),
      completed: aiCompletedResult.error ? null : (aiCompletedResult.count ?? 0),
      failed: aiFailedResult.error ? null : (aiFailedResult.count ?? 0),
      recent: recentAi,
    },
    activeConfigId: profileResult.data?.active_config_id ?? null,
    errors,
  };
}
