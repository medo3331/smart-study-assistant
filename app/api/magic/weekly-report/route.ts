import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { todayISO, addDaysISO } from "@/lib/exam-plans";
import { generateFile } from "@/lib/ai/file-generator";
import { levelFromXp } from "@/lib/shop/economy";

/* ==========================================================================
   📊 تقرير الأسبوع من Magic — ملخص أسبوعي (شات + PDF ملون).
   بيجمع من الجداول الموجودة (planner_goals + coin_ledger + profiles) —
   بدون جداول جديدة وبدون AI: الأرقام كلها server-truth.
   ========================================================================== */

interface WeeklySummary {
  weekStart: string;
  today: string;
  displayName: string | null;
  xp: number;
  level: number;
  streak: number;
  tasksDoneThisWeek: number;
  pendingTasks: number;
  coinsThisWeek: number;
  studyDaysThisWeek: number;
  topSources: { source: string; amount: number }[];
  recentTaskTitles: string[];
}

function ar(n: number): string {
  return n.toLocaleString("ar-EG");
}

export async function GET(request: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("success");
    if (authError) return authError;

    const wantPdf = new URL(request.url).searchParams.get("pdf") === "1";
    const today = todayISO();
    const weekStart = addDaysISO(today, -6);

    const [profileResult, doneGoalsResult, pendingCount, ledgerResult] = await Promise.all([
      supabase.from("profiles").select("display_name, xp, streak").eq("id", user.id).maybeSingle(),
      supabase
        .from("planner_goals")
        .select("title, done_at")
        .eq("user_id", user.id)
        .eq("is_done", true)
        .gte("done_at", weekStart)
        .order("done_at", { ascending: false })
        .limit(10),
      supabase
        .from("planner_goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_done", false)
        .then((r: { count: number | null }) => r.count ?? 0)
        .catch(() => 0),
      supabase
        .from("coin_ledger")
        .select("source, amount, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "earn")
        .gte("created_at", weekStart)
        .limit(500),
    ]);

    const profile = profileResult.data as { display_name?: string | null; xp?: number | null; streak?: number | null } | null;
    const ledger = (ledgerResult.data ?? []) as { source: string; amount: number; created_at: string }[];

    // أيام المذاكرة الفعلية = أيام فيها كسب day_done (server-truth — مش مجرد فتح الصفحة).
    const studyDays = new Set(
      ledger.filter((r) => r.source === "day_done").map((r) => String(r.created_at).slice(0, 10)),
    );
    const coinsThisWeek = ledger.reduce((acc, r) => acc + (r.amount || 0), 0);
    const bySource = new Map<string, number>();
    for (const r of ledger) bySource.set(r.source, (bySource.get(r.source) ?? 0) + (r.amount || 0));
    const topSources = [...bySource.entries()]
      .map(([source, amount]) => ({ source, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    const doneGoals = (doneGoalsResult.data ?? []) as { title: string; done_at: string }[];
    const xp = profile?.xp ?? 0;

    const summary: WeeklySummary = {
      weekStart,
      today,
      displayName: profile?.display_name ?? null,
      xp,
      level: levelFromXp(xp),
      streak: profile?.streak ?? 0,
      tasksDoneThisWeek: doneGoals.length,
      pendingTasks: pendingCount ?? 0,
      coinsThisWeek,
      studyDaysThisWeek: studyDays.size,
      topSources,
      recentTaskTitles: doneGoals.slice(0, 5).map((g) => g.title),
    };

    if (!wantPdf) {
      return NextResponse.json({ success: true, summary });
    }

    // 📄 PDF ملون — بنفس مولّد الملفات بتاع أدوات Magic Agent.
    const doneList = summary.recentTaskTitles.length
      ? summary.recentTaskTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "مفيش مهام اتعلّمت منجزة الأسبوع ده — الأسبوع الجاي نبدأ بمهمة صغيرة كل يوم.";
    const sourcesList = summary.topSources.length
      ? summary.topSources.map((s) => `• ${s.source}: ${ar(s.amount)} كوين`).join("\n")
      : "مفيش كوينز اتصرفت الأسبوع ده.";

    const pdf = await generateFile({
      type: "pdf",
      content: "report",
      title: `تقرير الأسبوع — ${summary.displayName || "الطالب"} 📊`,
      data: {
        theme: "royal",
        sections: [
          {
            heading: "الأسبوع من " + summary.weekStart + " إلى " + summary.today,
            body:
              `أيام مذاكرة فعلية: ${ar(summary.studyDaysThisWeek)} من ٧\n` +
              `مهام منجزة: ${ar(summary.tasksDoneThisWeek)} — وفاضل ${ar(summary.pendingTasks)} مهمة مفتوحة\n` +
              `كوينز اتجمعت الأسبوع ده: ${ar(summary.coinsThisWeek)} 🪙\n` +
              `السلسلة الحالية: ${ar(summary.streak)} يوم 🔥 — المستوى ${ar(summary.level)} ⭐ (${ar(summary.xp)} XP)`,
          },
          { heading: "المهام اللي خلصتها", body: doneList },
          { heading: "الكوينز جات منين", body: sourcesList },
          {
            heading: "أهداف الأسبوع الجاي",
            body:
              `1. خلّص ${ar(Math.max(3, summary.pendingTasks))} مهام من المخطط — مهمة كل يوم أحسن من ٥ في يوم واحد.\n` +
              `2. حافظ على السلسلة: ربع ساعة مذاكرة كل يوم بتفرق أكتر من جلسة واحدة طويلة.\n` +
              `3. جرّب تعمل اختبار سريع من Magic على أضعف جزء ذاكرته الأسبوع ده.\n` +
              `4. لو خطتك فيها امتحان قريب — راجع بالملخصات قبل النوم بيثبّت المعلومات.`,
          },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      summary,
      pdf: {
        dataUrl: `data:${pdf.mimeType};base64,${pdf.buffer.toString("base64")}`,
        filename: pdf.filename,
        size: pdf.size,
      },
    });
  } catch (err) {
    console.error("magic-weekly-report:", err);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع في التقرير." }, { status: 500 });
  }
}
