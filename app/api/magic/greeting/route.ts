import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { fetchActiveExamPlan, todaysDay, daysUntilExam, todayISO } from "@/lib/exam-plans";
import { fetchGoals } from "@/lib/pages-data";
import { buildMagicGreeting, type MagicGreeting } from "@/lib/magic/greeting";

/* ==========================================================================
   Magic Greeting — ترحيب الداشبورد واقتراحات اليوم (نمط Duolingo).
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

    const [planResult, materialsCount, lecturesCount, profileResult, goalsResult, tasksDoneCount] = await Promise.all([
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
      supabase
        .from("profiles")
        .select("display_name, xp, streak, last_study_day")
        .eq("id", user.id)
        .maybeSingle()
        .catch(() => null),
      fetchGoals(supabase, user.id).catch(() => ({ data: null, error: { kind: "GENERIC" as const, message: "" } })),
      supabase
        .from("planner_goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_done", true)
        .then((r: { count: number | null }) => r.count ?? 0)
        .catch(() => 0),
    ]);

    const plan = planResult.data;
    const today = plan ? todaysDay(plan) : null;
    const profile = profileResult as {
      display_name?: string | null;
      xp?: number | null;
      streak?: number | null;
      last_study_day?: string | null;
    } | null;

    // 🏅 المستوى والسلسلة + 📋 مهام المخطط المفتوحة (المهمّة الأول ثم الأقرب ميعادًا).
    const goals = goalsResult.data ?? [];
    const todayIso = todayISO();
    const openTasks = goals
      .filter((g) => !g.isDone)
      .sort(
        (a, b) =>
          (b.priority - a.priority) ||
          ((a.dueDate ?? "9999-12-31") < (b.dueDate ?? "9999-12-31") ? -1 : 1),
      )
      .slice(0, 5)
      .map((g) => g.title);

    const greeting = buildMagicGreeting({
      displayName: profile?.display_name ?? null,
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
      economy: profile
        ? {
            xp: profile.xp ?? 0,
            streak: profile.streak ?? 1,
            lastStudyDay: profile.last_study_day ?? null,
            today: todayIso,
          }
        : null,
      tasks: openTasks,
      tasksDoneTotal: tasksDoneCount ?? 0,
    });

    return NextResponse.json({ success: true, greeting, fallback });
  } catch (err) {
    console.error("magic-greeting:", err);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع." }, { status: 500 });
  }
}
