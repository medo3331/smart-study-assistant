import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { fetchActiveExamPlan, todaysDay, daysUntilExam } from "@/lib/exam-plans";
import { buildMagicGreeting, type MagicGreeting } from "@/lib/magic/greeting";

/* ==========================================================================
   Magic Greeting — ترحيب الداشبورد واقتراحات اليوم.
   منطق pure بدون AI ⇒ بدون خصم Credits. القراءات كلها best-effort:
   أي فشل بيرجّع ترحيب عام بدل خطأ.
   ========================================================================== */

export async function GET() {
  try {
    const { user, supabase, response: authError } = await requireUser("success");
    if (authError) return authError;

    const fallback: MagicGreeting = buildMagicGreeting({
      displayName: null,
      hour: new Date().getHours(),
      activePlan: null,
      workspaceFiles: 0,
    });

    const [planResult, materialsCount, lecturesCount] = await Promise.all([
      fetchActiveExamPlan(supabase, user.id).catch(() => ({ data: null, error: { kind: "GENERIC" as const, message: "" } })),
      supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .then((r: { count: number | null }) => r.count ?? 0)
        .catch(() => 0),
      supabase
        .from("lectures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .then((r: { count: number | null }) => r.count ?? 0)
        .catch(() => 0),
    ]);

    const plan = planResult.data;
    const today = plan ? todaysDay(plan) : null;
    const greeting = buildMagicGreeting({
      displayName: null,
      hour: new Date().getHours(),
      activePlan: plan
        ? {
            subject: plan.subject,
            examDate: plan.examDate,
            daysLeft: daysUntilExam(plan),
            todayTask: today && !today.isDone ? { title: today.title } : null,
          }
        : null,
      workspaceFiles: (materialsCount ?? 0) + (lecturesCount ?? 0),
    });

    return NextResponse.json({ success: true, greeting, fallback });
  } catch (err) {
    console.error("magic-greeting:", err);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع." }, { status: 500 });
  }
}
