// Phase 1.5 — Dynamic Education Context → Subjects → Dashboard
// Foundation: abstraction; NO invented mapping per audit sec 3/4
export interface EducationContext {
  country: string | null;
  persona: string | null;
  stageId: string | null; gradeId: string | null; trackId: string | null;
  universityId: string | null; facultyId: string | null; departmentId: string | null;
  academicLevelId: string | null; semesterId: string | null;
  curriculumId: string | null;
  subjects: { id: string; name: string; curriculum_id: string | null }[];
}
export function getEducationContext(profile: any): Partial<EducationContext> {
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
export async function getAvailableSubjects(supabase: any, ctx: Partial<EducationContext>): Promise<any[]> {
  // School context (existing Phase 1.5)
  if (!supabase) return [];
  if (ctx.stageId) {
    try {
      let q = supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
      if (ctx.gradeId) q = q.eq("grade_id", ctx.gradeId);
      const { data: c } = await q;
      if (!c || c.length === 0) return [];
      const ids = c.map((x: any) => x.id);
      const { data: s } = await supabase.from("subjects").select("id, name, curriculum_id").in("curriculum_id", ids);
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
      return s || [];
    } catch { return []; }
  }
  return [];
}
