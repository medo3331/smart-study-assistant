/**
 * Phase 1.3 — Curriculum Coverage & Exam Countdown (Server-side only)
 *
 * Source of truth rules (enforced):
 * - Coverage = mapped curriculum lessons completed / mapped curriculum lessons total
 * - Completion = ONLY study_day_completion (complete_study_day RPC / study_days.is_completed)
 * - Planner goals, page loads, planner item creation = NOT completion
 * - Client NEVER submits a percentage; server computes deterministically
 * - Unmapped content = tracked separately; never fabricated
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CoverageState =
  | "no_data"
  | "partially_mapped"
  | "active"
  | "complete"
  | "insufficient_data";

export interface CoverageBreakdown {
  curriculumId: string;
  curriculumName: string;
  curriculumCode: string;
  countryName?: string | null;
  stageName?: string | null;
  gradeName?: string | null;
  trackName?: string | null;

  totalMappedLessons: number;
  completedLessons: number;
  remainingLessons: number;
  coveragePercent: number; // 0-100
  unmappedContentCount: number;

  coverageState: CoverageState;

  subjectBreakdown: SubjectCoverage[];
  nextExam?: ExamCountdown | null;

  // Context info
  hasAcademicContext: boolean;
  academicContext?: {
    stageCode?: string;
    gradeCode?: string;
    trackCode?: string;
    countryCode?: string;
  };

  // Isolation markers
  isGeneralSecondary: boolean;
  isBaccalaureate: boolean;
}

export interface SubjectCoverage {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  totalLessons: number;
  completedLessons: number;
  remainingLessons: number;
  percent: number;
}

export interface ExamCountdown {
  examId: string;
  examTitle: string;
  examDate: string; // YYYY-MM-DD
  examTime?: string | null;
  timezone: string;
  subjectId?: string | null;
  subjectName?: string | null;
  curriculumId?: string | null;
  daysRemaining: number;
  hoursRemaining?: number | null;
  minutesRemaining?: number | null;
  isToday: boolean;
  isPast: boolean;
  isVerified: boolean;
  sourceName?: string | null;
  status: string;
  countdownState: "future" | "today" | "past" | "missing";
}

export interface CurriculumCoverageContext {
  userId: string;
  curriculumId?: string | null;
  countryId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  trackId?: string | null;
  profileCurriculumId?: string | null;
  profileStageId?: string | null;
  profileGradeId?: string | null;
  profileTrackId?: string | null;
  profileCountryId?: string | null;
}

/* ============================================================================
   COVERAGE STATE DETERMINATION (deterministic, never client-submitted)
 ============================================================================ */

function determineCoverageState(
  totalMapped: number,
  completed: number,
  unmapped: number
): CoverageState {
  if (totalMapped === 0) {
    return unmapped > 0 ? "partially_mapped" : "no_data";
  }
  if (completed === 0 && totalMapped > 0) {
    return totalMapped < 3 ? "insufficient_data" : "active";
  }
  if (completed >= totalMapped && totalMapped > 0) {
    return "complete";
  }
  return "active";
}

function safePercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  const val = Math.round((completed / total) * 100);
  return Math.min(100, Math.max(0, val));
}

/* ============================================================================
   MAIN COVERAGE COMPUTATION (server-side; real DB query; no mock data)
 ============================================================================ */

export async function getCurriculumCoverage(
  supabase: SupabaseClient,
  context: CurriculumCoverageContext
): Promise<CoverageBreakdown> {
  const {
    userId,
    curriculumId,
    profileCurriculumId,
    profileStageId,
    profileGradeId,
    profileTrackId,
    profileCountryId,
  } = context;

  // Resolve the effective curriculum from context or profile
  const effectiveCurriculumId = curriculumId || profileCurriculumId || null;

  // Check profile academic context
  const hasAcademicContext = !!(
    profileStageId || profileGradeId || profileCurriculumId || profileCountryId
  );

  // Identify stage/track for isolation checks (General Secondary vs Baccalaureate)
  let stageCode: string | null = null;
  let trackCode: string | null = null;
  if (profileStageId) {
    const { data: stageRow } = await supabase
      .from("education_stages")
      .select("code")
      .eq("id", profileStageId)
      .maybeSingle();
    stageCode = stageRow?.code ?? null;
  }
  if (profileTrackId) {
    const { data: trackRow } = await supabase
      .from("education_tracks")
      .select("code")
      .eq("id", profileTrackId)
      .maybeSingle();
    trackCode = trackRow?.code ?? null;
  }
  const isGeneralSecondary = stageCode === "SECONDARY";
  const isBaccalaureate = stageCode === "BACCALAUREATE";

  // If no academic context set, return empty state (never guess)
  if (!hasAcademicContext) {
    return {
      curriculumId: effectiveCurriculumId || "",
      curriculumName: "",
      curriculumCode: "",
      totalMappedLessons: 0,
      completedLessons: 0,
      remainingLessons: 0,
      coveragePercent: 0,
      unmappedContentCount: 0,
      coverageState: "no_data",
      subjectBreakdown: [],
      nextExam: null,
      hasAcademicContext: false,
      isGeneralSecondary: false,
      isBaccalaureate: false,
    };
  }

  // If no curriculum selected and profile has nothing mapped, return empty
  if (!effectiveCurriculumId) {
    return {
      curriculumId: "",
      curriculumName: "",
      curriculumCode: "",
      totalMappedLessons: 0,
      completedLessons: 0,
      remainingLessons: 0,
      coveragePercent: 0,
      unmappedContentCount: 0,
      coverageState: "no_data",
      subjectBreakdown: [],
      nextExam: null,
      hasAcademicContext: true,
      academicContext: {
        stageCode: stageCode ?? undefined,
        gradeCode: undefined,
        trackCode: trackCode ?? undefined,
        countryCode: profileCountryId ?? undefined,
      },
      isGeneralSecondary,
      isBaccalaureate,
    };
  }

  // Fetch curriculum info
  const { data: curriculumRow } = await supabase
    .from("curricula")
    .select("id, name, code, country_id")
    .eq("id", effectiveCurriculumId)
    .maybeSingle();

  let countryName: string | null = null;
  if (curriculumRow?.country_id) {
    const { data: countryRow } = await supabase
      .from("countries")
      .select("name")
      .eq("id", curriculumRow.country_id)
      .maybeSingle();
    countryName = countryRow?.name ?? null;
  }

  // Fetch mapped content for this curriculum
  const { data: mappingRows } = await supabase
    .from("curriculum_content_mapping")
    .select(
      `
      id, subject_id, unit_name, topic_name, lesson_title, lesson_code,
      is_verified, content_ref_type, content_ref_uuid
    `
    )
    .eq("curriculum_id", effectiveCurriculumId)
    .eq("is_verified", true);

  // Fetch lesson-level mappings with study_day references
  const { data: lessonRows } = await supabase
    .from("curriculum_lessons")
    .select("id, mapping_id, curriculum_id, subject_id, lesson_code, lesson_title, study_day_id")
    .eq("curriculum_id", effectiveCurriculumId);

  // Get real study completion (trusted source: study_days.is_completed via complete_study_day)
  const studyDayIds = lessonRows
    ?.map((r) => r.study_day_id)
    .filter((id): id is string => !!id) ?? [];

  let completedDayIds: string[] = [];
  if (studyDayIds.length > 0) {
    const { data: completedDays } = await supabase
      .from("study_days")
      .select("id")
      .in("id", studyDayIds)
      .eq("is_completed", true);
    completedDayIds = (completedDays ?? []).map((d) => d.id);
  }

  // Build a set for fast lookup
  const completedDaySet = new Set(completedDayIds);

  // Aggregate by mapping / lesson
  const completedLessons = lessonRows?.filter(
    (l) => l.study_day_id && completedDaySet.has(l.study_day_id)
  ).length ?? 0;

  const totalMappedLessons = lessonRows?.length ?? 0;

  // Unmapped content count (verified mappings with no lesson mapping yet)
  const unmappedContentCount = Math.max(0, (mappingRows?.length ?? 0) - totalMappedLessons);

  // Subject-level breakdown
  const subjectMap = new Map<string, { name: string; code: string; total: number; completed: number }>();
  for (const row of mappingRows ?? []) {
    const sid = row.subject_id;
    if (!subjectMap.has(sid)) {
      // Fetch subject info (batch where possible; here we rely on already-known data from mapping join)
      // For simplicity we query the subjects table once for all referenced subjects
      subjectMap.set(sid, { name: "", code: "", total: 0, completed: 0 });
    }
  }

  // Fetch subject names in batch
  const subjectIds = Array.from(subjectMap.keys());
  const subjectBreakdown: SubjectCoverage[] = [];
  if (subjectIds.length > 0) {
    const { data: subjectInfo } = await supabase
      .from("subjects")
      .select("id, name, code")
      .in("id", subjectIds);
    const infoMap = new Map((subjectInfo ?? []).map((s) => [s.id, s]));
    for (const sid of subjectIds) {
      const info = infoMap.get(sid);
      const total = lessonRows?.filter((l) => {
        // Map lesson to subject via mapping; for simplicity count per mapping subject
        const mapping = mappingRows?.find((m) => m.id === l.mapping_id);
        return mapping?.subject_id === sid;
      }).length ?? 0;
      const completed = lessonRows?.filter((l) => {
        const mapping = mappingRows?.find((m) => m.id === l.mapping_id);
        return mapping?.subject_id === sid && l.study_day_id && completedDaySet.has(l.study_day_id);
      }).length ?? 0;
      subjectBreakdown.push({
        subjectId: sid,
        subjectName: info?.name ?? "",
        subjectCode: info?.code ?? "",
        totalLessons: total,
        completedLessons: completed,
        remainingLessons: Math.max(0, total - completed),
        percent: safePercent(completed, total),
      });
    }
  }

  // Sort by percent descending
  subjectBreakdown.sort((a, b) => b.percent - a.percent);

  // Determine coverage state
  const coverageState = determineCoverageState(
    totalMappedLessons,
    completedLessons,
    unmappedContentCount
  );

  const percent = safePercent(completedLessons, totalMappedLessons);

  // Fetch exam countdown (verified future exam linked to this curriculum/subject)
  const examCountdown = await getNextExamCountdown(supabase, {
    userId,
    curriculumId: effectiveCurriculumId,
    stageId: profileStageId ?? undefined,
    gradeId: profileGradeId ?? undefined,
    trackId: profileTrackId ?? undefined,
  });

  // Fetch stage/grade/track names
  let stageName: string | null = null;
  let gradeName: string | null = null;
  let trackName: string | null = null;
  if (profileStageId) {
    const { data: s } = await supabase.from("education_stages").select("name").eq("id", profileStageId).maybeSingle();
    stageName = s?.name ?? null;
  }
  if (profileGradeId) {
    const { data: g } = await supabase.from("education_grades").select("name").eq("id", profileGradeId).maybeSingle();
    gradeName = g?.name ?? null;
  }
  if (profileTrackId) {
    const { data: t } = await supabase.from("education_tracks").select("name").eq("id", profileTrackId).maybeSingle();
    trackName = t?.name ?? null;
  }

  return {
    curriculumId: effectiveCurriculumId || "",
    curriculumName: curriculumRow?.name ?? "",
    curriculumCode: curriculumRow?.code ?? "",
    countryName,
    stageName,
    gradeName,
    trackName,
    totalMappedLessons,
    completedLessons,
    remainingLessons: Math.max(0, totalMappedLessons - completedLessons),
    coveragePercent: percent,
    unmappedContentCount,
    coverageState,
    subjectBreakdown,
    nextExam: examCountdown,
    hasAcademicContext,
    academicContext: {
      stageCode: stageCode ?? undefined,
      gradeCode: undefined,
      trackCode: trackCode ?? undefined,
      countryCode: profileCountryId ?? undefined,
    },
    isGeneralSecondary,
    isBaccalaureate,
  };
}

/* ============================================================================
   EXAM COUNTDOWN (deterministic; uses verified exam schedule only; never fake)
 ============================================================================ */

export async function getNextExamCountdown(
  supabase: SupabaseClient,
  context: {
    userId: string;
    curriculumId?: string | null;
    stageId?: string | null;
    gradeId?: string | null;
    trackId?: string | null;
  }
): Promise<ExamCountdown | null> {
  const { curriculumId, stageId, gradeId, trackId } = context;

  // Query verified future exams for this curriculum/stage/grade/track
  const query = supabase
    .from("curriculum_exams")
    .select(`
      id, exam_title, exam_date, exam_time, timezone, status,
      is_verified, source_name, curriculum_id, subject_id,
      subjects(id, name, code)
    `)
    .eq("is_verified", true)
    .gte("exam_date", new Date().toISOString().split("T")[0]);

  if (curriculumId) {
    query.eq("curriculum_id", curriculumId);
  }
  if (stageId) {
    query.eq("stage_id", stageId);
  }
  if (gradeId) {
    query.eq("grade_id", gradeId);
  }
  if (trackId) {
    query.eq("track_id", trackId);
  }

  const { data, error } = await query
    .order("exam_date", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const exam = data[0] as any;
  const examDateStr = exam.exam_date as string; // YYYY-MM-DD
  const examDate = new Date(examDateStr + (exam.exam_time ? "T" + exam.exam_time : "T00:00:00"));
  const now = new Date();

  // Handle timezone difference safely (use local/browser time for countdown comparison)
  // For simplicity: compare date strings directly to avoid timezone offset issues
  const todayStr = now.toISOString().split("T")[0];
  const examStr = examDateStr;

  const isToday = examStr === todayStr;
  const isPast = examStr < todayStr;

  let daysRemaining = 0;
  if (!isPast) {
    const examMs = new Date(examStr + "T23:59:59Z").getTime();
    const nowMs = new Date(todayStr + "T00:00:00Z").getTime();
    daysRemaining = Math.max(0, Math.ceil((examMs - nowMs) / (1000 * 60 * 60 * 24)));
  }

  // Adjust for "today" case
  const finalDays = isToday ? 0 : isPast ? 0 : daysRemaining;

  // Hours/minutes when appropriate
  let hoursRemaining: number | null = null;
  let minutesRemaining: number | null = null;
  if (!isPast && isToday) {
    const examMs = new Date(examStr + (exam.exam_time ? "T" + exam.exam_time : "T23:59:59Z")).getTime();
    const nowLocalMs = Date.now();
    const diffMs = examMs - nowLocalMs;
    if (diffMs > 0) {
      hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));
      minutesRemaining = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    }
  }

  const countdownState: "future" | "today" | "past" | "missing" =
    isToday ? "today" : isPast ? "past" : "future";

  if (countdownState === "past") {
    return null; // Don't show past exams in countdown; handled separately if needed
  }

  // "missing" state never occurs from this logic, but kept for completeness.
  // If exam title is missing, treat as unverified/missing.
  if (!exam.exam_title || exam.exam_title === "") {
    return null;
  }

  return {
    examId: exam.id,
    examTitle: exam.exam_title ?? "",
    examDate: examStr,
    examTime: exam.exam_time ?? null,
    timezone: exam.timezone ?? "Africa/Cairo",
    subjectId: exam.subject_id ?? null,
    subjectName: exam.subjects?.name ?? null,
    curriculumId: exam.curriculum_id ?? null,
    daysRemaining: finalDays,
    hoursRemaining,
    minutesRemaining,
    isToday,
    isPast,
    isVerified: exam.is_verified === true,
    sourceName: exam.source_name ?? null,
    status: exam.status ?? "scheduled",
    countdownState,
  };
}

/* ============================================================================
   COVERAGE COMPUTATION WITH CONTEXT VALIDATION
 ============================================================================ */

export async function computeCoverageState(
  supabase: SupabaseClient,
  userId: string,
  profileCurriculumId?: string | null,
  profileStageId?: string | null,
  profileGradeId?: string | null,
  profileTrackId?: string | null,
  profileCountryId?: string | null
): Promise<{
  coverage: CoverageBreakdown;
  hasRealData: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check real mapped content exists
  const { count: mappingCount, error: mappingError } = await supabase
    .from("curriculum_content_mapping")
    .select("id", { count: "exact", head: true })
    .eq("is_verified", true);

  if (mappingError) {
    errors.push(`Mapping query failed: ${mappingError.message}`);
  }

  // Ensure no fake coverage: only compute from verified mappings
  if (!mappingCount || mappingCount === 0) {
    errors.push("No verified curriculum mappings found — coverage cannot be computed.");
    errors.push("Please complete academic context and verify curriculum mappings before viewing coverage.");
  }

  const coverage = await getCurriculumCoverage(supabase, {
    userId,
    profileCurriculumId: profileCurriculumId ?? null,
    profileStageId: profileStageId ?? null,
    profileGradeId: profileGradeId ?? null,
    profileTrackId: profileTrackId ?? null,
    profileCountryId: profileCountryId ?? null,
  });

  return {
    coverage,
    hasRealData: (mappingCount ?? 0) > 0 && coverage.hasAcademicContext,
    errors,
  };
}
