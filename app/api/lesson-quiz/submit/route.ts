import { NextResponse } from "next/server";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { awardCoins } from "@/lib/shop/shop-data";

/**
 * POST /api/lesson-quiz/submit — تصحيح سيرفري لكويز الدرس (D-M-04)
 *
 * الإثبات: الأسئلة (بإجاباتها) محفوظة في `lesson_quiz_attempts` من لحظة
 * التوليد — الكلاينت بيرجّع اختياراته بس، فمفيش طريق يعدّل الدرجة من
 * الواجهة. النجاح (≥٦٠%) بيتسجّل على المحاولة، والمكافأة بتمر من
 * `award_coins('lesson_quiz_passed', attemptId)`:
 *   - المبلغ من `coin_source_rules` (٥ كوينز) — الكلاينت مابيبعتش رقم.
 *   - الفهرس الفريد (user_id, source, ref_id) بيمنع منح نفس المحاولة مرتين.
 *   - إعادة الاختبار على محاولة جديدة مكافأة تانية — السقف اليومي (٥) هو
 *     اللي بيحافظ على التوازن، وبيتعدّل من Economy Balancing (D-M-06).
 */

type SubmitBody = {
  attemptId?: unknown;
  answers?: unknown;
};

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit("lesson-quiz-submit:" + user.id, 12, 60_000, "message");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as SubmitBody | null;
    const attemptId = typeof body?.attemptId === "string" ? body.attemptId : "";
    const answers = Array.isArray(body?.answers) ? body.answers : null;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) {
      return NextResponse.json({ error: { message: "معرّف المحاولة غير صالح." } }, { status: 400 });
    }
    if (!answers || answers.some((a) => !Number.isInteger(a))) {
      return NextResponse.json({ error: { message: "إجابات غير صالحة." } }, { status: 400 });
    }

    const { data: attempt, error: loadError } = await supabase
      .from("lesson_quiz_attempts")
      .select("id, user_id, questions, status, expires_at")
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError || !attempt) {
      return NextResponse.json({ error: { message: "المحاولة غير موجودة." } }, { status: 404 });
    }
    if (attempt.status !== "pending") {
      return NextResponse.json({ error: { message: "المحاولة دي اتسجّلت بالفعل." } }, { status: 409 });
    }
    if (attempt.expires_at && new Date(attempt.expires_at as string).getTime() < Date.now()) {
      return NextResponse.json({ error: { message: "الاختبار ده انتهى وقته — ابدأ واحد جديد." } }, { status: 410 });
    }

    const questions = (attempt.questions as Array<{ options?: unknown[]; correctIndex?: unknown }>) ?? [];
    if (questions.length === 0 || answers.length !== questions.length) {
      return NextResponse.json({ error: { message: "عدد الإجابات غير مطابق للاختبار." } }, { status: 400 });
    }

    // التصحيح على السيرفر — الإجابة الصحيحة من المحاولة المحفوظة مش من الكلاينت
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
      const correct = questions[i]?.correctIndex;
      if (typeof correct === "number" && answers[i] === correct) score++;
    }
    const total = questions.length;
    const passed = score >= Math.ceil(total * 0.6);

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("lesson_quiz_attempts")
      .update({ answers, score, total, passed, status: passed ? "passed" : "failed", completed_at: now })
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (updateError) {
      console.error("lesson-quiz submit update failed:", updateError.message);
      return NextResponse.json({ error: { message: "تعذّر تسجيل نتيجة الاختبار." } }, { status: 500 });
    }

    // المكافأة — لو نجح. فشلها صامت: الاختبار شغّال من غير كوينز.
    let awarded = 0;
    let balance: number | null = null;
    if (passed) {
      try {
        const res = await awardCoins(supabase, "lesson_quiz_passed", attemptId, { score, total });
        if (res.data) {
          awarded = res.data.awarded;
          balance = res.data.balance;
        }
      } catch (e) {
        console.warn("lesson_quiz_passed award failed (متجاهَل):", e);
      }
    }

    return NextResponse.json({ score, total, passed, awarded, balance });
  } catch (error) {
    console.error("lesson-quiz submit error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء تسليم الاختبار." } }, { status: 500 });
  }
}
