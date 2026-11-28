import { NextResponse } from "next/server";
import { requireUser, checkRateLimit } from "@/lib/api-guard";
import { saveExamPlan, fetchActiveExamPlan } from "@/lib/exam-plans";
import { validatePlanDraft, PLAN_DRAFT_LIMITS } from "@/lib/agent/plan-draft";

/* ==========================================================================
   Academic Agent — اعتماد خطة المذاكرة (Execution Engine)

   الطالب وافق على مسودة خطة قدّمها Coach في الشات → الـ POST ده بينشئ
   بيانات حقيقية في exam_plans + exam_plan_days (نفس بنية المخطط الحالي).

   ⚠️ بدون خصم Credits: المسودة انتجها الـ AI في الشات (اتحاسب عليها هناك)،
   والـ POST ده كتابة بيانات فقط — من غير نداء موديل ⇒ لا خصم مزدوج.

   ⚠️ Idempotency: لو فيه خطة نشطة لنفس المادة ونفس تاريخ الامتحان،
   بنرجّعها زي ما هي بدل إنشاء نسخة مكررة.
   ========================================================================== */

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("success");
    if (authError) return authError;

    const limited = await checkRateLimit(`agent-study-plan:${user.id}`, 10, 60_000, "success");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const validation = validatePlanDraft(body);
    if (!validation.draft) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const draft = validation.draft;

    // Idempotency — نفس المادة + نفس تاريخ الامتحان = نفس الخطة (النشطة غير المؤرشفة).
    const active = await fetchActiveExamPlan(supabase, user.id);
    if (active.data) {
      const p = active.data;
      if (p.subject === draft.subject && p.examDate === draft.examDate) {
        return NextResponse.json({
          success: true,
          planId: p.id,
          daysCount: p.days.length,
          duplicated: true,
          href: "/dashboard/planner",
        });
      }
    }

    const saved = await saveExamPlan(supabase, user.id, {
      subject: draft.subject,
      examDate: draft.examDate,
      sourceText: null,
      days: draft.days,
    });

    if (!saved.data) {
      return NextResponse.json(
        { success: false, error: saved.error.message },
        { status: saved.error.kind === "MISSING_TABLE" ? 503 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      planId: saved.data.id,
      daysCount: saved.data.days.length,
      duplicated: false,
      href: "/dashboard/planner",
      limits: { maxDays: PLAN_DRAFT_LIMITS.maxDays },
    });
  } catch (err) {
    console.error("agent-study-plan:", err);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع." }, { status: 500 });
  }
}
