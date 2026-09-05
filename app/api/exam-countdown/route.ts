import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ============================================================================
   Phase 1.3 — Exam countdown endpoint (verified future exams only)
   - Only reads verified exam schedule; never invents exam dates
   - Returns safe state: future / today / past / missing
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

    const { searchParams } = new URL(req.url);
    const curriculumId = searchParams.get("curriculum_id") || undefined;
    const stageId = searchParams.get("stage_id") || undefined;
    const gradeId = searchParams.get("grade_id") || undefined;
    const trackId = searchParams.get("track_id") || undefined;

    // Read verified future exams only
    const query = supabase
      .from("curriculum_exams")
      .select(
        `id, exam_title, exam_date, exam_time, timezone, status, is_verified, source_name, curriculum_id, subject_id, subjects(id, name, code)`
      )
      .eq("is_verified", true)
      .gte("exam_date", new Date().toISOString().split("T")[0]);

    if (curriculumId) query.eq("curriculum_id", curriculumId);
    if (stageId) query.eq("stage_id", stageId);
    if (gradeId) query.eq("grade_id", gradeId);
    if (trackId) query.eq("track_id", trackId);

    const { data, error } = await query
      .order("exam_date", { ascending: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { error: error.message, status: "db_error" },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        status: "ok",
        data: null,
        message: "موعد الأمتحان غير محدد حاليًا",
      });
    }

    const exam = data[0];
    const examDateStr = exam.exam_date as string;
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = examDateStr === todayStr;
    const isPast = examDateStr < todayStr;

    let daysRemaining = 0;
    if (!isPast) {
      const examMs = new Date(examDateStr + "T23:59:59Z").getTime();
      const nowMs = new Date(todayStr + "T00:00:00Z").getTime();
      daysRemaining = Math.max(0, Math.ceil((examMs - nowMs) / (1000 * 60 * 60 * 24)));
    }

    const countdownState = isToday ? "today" : isPast ? "past" : "future";

    return NextResponse.json({
      status: "ok",
      data: {
        examId: exam.id,
        examTitle: exam.exam_title,
        examDate: examDateStr,
        examTime: exam.exam_time,
        timezone: exam.timezone ?? "Africa/Cairo",
        subjectName: exam.subjects?.name ?? null,
        daysRemaining: isToday ? 0 : daysRemaining,
        isToday,
        isPast,
        countdownState,
        isVerified: exam.is_verified,
        status: exam.status,
        sourceName: exam.source_name,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "خطأ في حساب العد التنازلي.",
        status: "error",
      },
      { status: 500 }
    );
  }
}
