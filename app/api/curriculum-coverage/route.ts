import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurriculumCoverage, CoverageBreakdown } from "@/lib/curriculum-coverage";

/* ============================================================================
   Phase 1.3 — Server-side coverage endpoint
   - Returns deterministic coverage computed from real DB data
   - Never accepts a client-submitted percentage
   - Protects user data via RLS (only user's own progress)
 ============================================================================ */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "لم يتم تسجيل الدخول.", status: "auth_missing" },
        { status: 401 }
      );
    }

    // Read optional filters from query params (verified server-side only)
    const { searchParams } = new URL(req.url);
    const curriculumId = searchParams.get("curriculum_id") || undefined;
    const refresh = searchParams.get("refresh") === "true";

    // Fetch user profile for academic context
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, selected_curriculum_id, selected_stage_id, selected_grade_id, selected_track_id, selected_country_id"
      )
      .eq("id", user.id)
      .maybeSingle();

    // Compute coverage deterministically
    const coverage = await getCurriculumCoverage(supabase, {
      userId: user.id,
      curriculumId: curriculumId || profileRow?.selected_curriculum_id || null,
      profileCurriculumId: profileRow?.selected_curriculum_id || null,
      profileStageId: profileRow?.selected_stage_id || null,
      profileGradeId: profileRow?.selected_grade_id || null,
      profileTrackId: profileRow?.selected_track_id || null,
      profileCountryId: profileRow?.selected_country_id || null,
    });

    // Security: verify user access (RLS protects progress; server verifies)
    const result: Partial<CoverageBreakdown> = {
      curriculumId: coverage.curriculumId,
      curriculumName: coverage.curriculumName,
      curriculumCode: coverage.curriculumCode,
      stageName: coverage.stageName,
      gradeName: coverage.gradeName,
      trackName: coverage.trackName,
      countryName: coverage.countryName,
      hasAcademicContext: coverage.hasAcademicContext,
      totalMappedLessons: coverage.totalMappedLessons,
      completedLessons: coverage.completedLessons,
      remainingLessons: coverage.remainingLessons,
      coveragePercent: coverage.coveragePercent,
      unmappedContentCount: coverage.unmappedContentCount,
      coverageState: coverage.coverageState,
      isGeneralSecondary: coverage.isGeneralSecondary,
      isBaccalaureate: coverage.isBaccalaureate,
      subjectBreakdown: coverage.subjectBreakdown,
      nextExam: coverage.nextExam,
    };

    return NextResponse.json({
      status: "ok",
      data: result,
      meta: {
        computedAt: new Date().toISOString(),
        source: "server_aggregation",
        refreshRequested: refresh,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "خطأ في حساب التغطية.",
        status: "error",
      },
      { status: 500 }
    );
  }
}
