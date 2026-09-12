// Phase 1.5 — Dynamic Education Context → Subjects → Dashboard
// Foundation: abstraction; NO invented mapping per audit sec 3/4

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  country?: string | null;
  persona?: string | null;
  education_stage_id?: string | null;
  education_grade_id?: string | null;
  education_track_id?: string | null;
  university_id?: string | null;
  faculty_id?: string | null;
  department_id?: string | null;
  academic_level_id?: string | null;
  semester_id?: string | null;
  subject?: string | null;
}

export interface EducationContext {
  country: string | null;
  persona: string | null;
  stageId: string | null; gradeId: string | null; trackId: string | null;
  universityId: string | null; facultyId: string | null; departmentId: string | null;
  academicLevelId: string | null; semesterId: string | null;
  curriculumId: string | null;
  subjects: { id: string; name: string; curriculum_id: string | null }[];
}
export function getEducationContext(profile: Profile | null): Partial<EducationContext> {
  if (!profile) return {};
  return {
    country: profile.country ?? "Egypt", // verified country; default preserved
    persona: profile.persona ?? null,
    stageId: profile.education_stage_id ?? null,
    gradeId: profile.education_grade_id ?? null,
    trackId: profile.education_track_id ?? null,
    universityId: profile.university_id ?? null,
    facultyId: profile.faculty_id ?? null,
    departmentId: profile.department_id ?? null,
    academicLevelId: profile.academic_level_id ?? null,
    semesterId: profile.semester_id ?? null,
    curriculumId: null,
    subjects: [],
  };
}
export async function getAvailableSubjects(supabase: SupabaseClient, ctx: Partial<EducationContext>): Promise<Array<{ id: string; name: string; code?: string; type?: string; curriculum_id?: string; source_url?: string }>> {
  // School context (existing Phase 1.5)
  if (!supabase) return [];
  if (ctx.stageId) {
    try {
      // Secondary tracks: if trackId present, fetch general + specific; else only general
      let curriculaIds: string[] = [];
      if (ctx.trackId && ctx.gradeId) {
        const { data: general } = await supabase.from("curricula").select("id").eq("stage_id", ctx.stageId).eq("grade_id", ctx.gradeId).is("track_id", null);
        const { data: specific } = await supabase.from("curricula").select("id").eq("stage_id", ctx.stageId).eq("grade_id", ctx.gradeId).eq("track_id", ctx.trackId);
        curriculaIds = [...(general || []).map((x: { id: string }) => x.id), ...(specific || []).map((x: { id: string }) => x.id)];
      }
      if (curriculaIds.length === 0) {
        let q = supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
        if (ctx.gradeId) q = q.eq("grade_id", ctx.gradeId);
        if (ctx.trackId) {
          // Fallback: try track filter if grade handling missed
          q = q.eq("track_id", ctx.trackId);
        } else {
          // Prefer general curriculum when no track, fallback to any if none
          const { data: generalOnly } = await supabase.from("curricula").select("id").eq("stage_id", ctx.stageId).eq("grade_id", ctx.gradeId ?? "").is("track_id", null);
          if (generalOnly && generalOnly.length > 0) {
            curriculaIds = generalOnly.map((x: { id: string }) => x.id);
          } else {
            const { data: c } = await q;
            curriculaIds = (c || []).map((x: { id: string }) => x.id);
          }
          if (curriculaIds.length > 0) {
            const { data: s } = await supabase.from("subjects").select("id, name, curriculum_id").in("curriculum_id", curriculaIds);
            return s || [];
          }
          const { data: c } = await q;
          curriculaIds = (c || []).map((x: { id: string }) => x.id);
        }
        if (curriculaIds.length === 0) {
          const { data: c } = await q;
          if (!c || c.length === 0) return [];
          curriculaIds = c.map((x: { id: string }) => x.id);
        }
      }
      if (curriculaIds.length === 0) return [];
      const { data: s } = await supabase.from("subjects").select("id, name, curriculum_id").in("curriculum_id", curriculaIds);
      return s || [];
    } catch { return []; }
  }
  // University context (Phase 2.2 — verified Computer Engineering only)
  if (ctx.universityId && ctx.departmentId && ctx.academicLevelId && ctx.semesterId) {
    try {
      const { data: s } = await supabase
        .from("university_subjects")
        .select("id, name, code, type, source_url")
        .eq("university_id", ctx.universityId)
        .eq("department_id", ctx.departmentId)
        .eq("academic_level_id", ctx.academicLevelId)
        .eq("semester_id", ctx.semesterId);
      return (s as Array<{ id: string; name: string; code?: string; type?: string; source_url?: string }>) || [];
    } catch { return []; }
  }
  return [];
}

/** جلب السياق المفصل للطالب لبناء الـ System Prompt المخصص (Persona Builder) */
export async function getDetailedAIContext(userId: string) {
  const supabase = await createClient();

  // 1. جلب بيانات البروفايل مع أسماء المرحلة والصف والشعبة والجامعة
  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      full_name,
      persona,
      goals,
      learning_style,
      education_stage_id,
      education_stages(name, code),
      education_grade_id,
      education_grades(name, order_index),
      education_track_id,
      education_tracks(name, code),
      university_id,
      universities(name),
      university_faculties(name),
      university_departments(name)
    `)
    .eq("id", userId)
    .single();

  // 2. جلب أسماء المواد التي اختارها الطالب (user_subjects أو من settings)
  let subjects: string[] = [];
  try {
    const { data: subjectsData } = await supabase
      .from("user_subjects")
      .select("subject_id, subjects(name)")
      .eq("user_id", userId);
    subjects = subjectsData?.map((s: any) => s.subjects?.name).filter(Boolean) || [];
  } catch {
    // fallback: إذا لم يكن جدول user_subjects موجوداً بعد، نقرأ من profile.subject مباشرة
    if (profile?.subject) subjects = [String(profile.subject)];
  }

  return {
    name: profile?.full_name || "يا بطل",
    persona: profile?.persona ?? null,
    stage: (profile?.education_stages as { name?: string; code?: string } | null)?.name ?? null,
    grade: (profile?.education_grades as { name?: string; order_index?: number } | null)?.name ?? null,
    track: (profile?.education_tracks as { name?: string; code?: string } | null)?.name ?? null,
    university: (profile?.universities as { name?: string } | null)?.name ?? null,
    faculty: (profile?.university_faculties as { name?: string } | null)?.name ?? null,
    department: (profile?.university_departments as { name?: string } | null)?.name ?? null,
    goals: Array.isArray(profile?.goals) ? profile.goals : [],
    style: profile?.learning_style ?? null,
    subjects: subjects,
  };
}
