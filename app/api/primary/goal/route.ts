import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/tasks/runner";

// Whitelisted capabilities that actually exist in the app for Primary
// Each maps to a real route or action; AI may only suggest these.
const PRIMARY_CAPABILITIES = [
  {
    id: "study",
    label: "ذاكر الدرس",
    href: "/dashboard",
    reason: "ابدأ بدرس صغير في المادة",
    keywords: ["ذاكر", "درس", "شرح", "افهم", "اتعلم", "مذاكرة", "رياضيات", "علوم", "عربي", "انجليزي", "دراسات"],
  },
  {
    id: "quiz",
    label: "حل أسئلة",
    href: "/exams",
    reason: "اختبر فهمك بأسئلة قصيرة",
    keywords: ["أسئلة", "اختبار", "حل", "راجع", "تدريب", "تمرين", "كويز"],
  },
  {
    id: "study_plan",
    label: "اعمل خطة صغيرة",
    href: "/dashboard/planner",
    reason: "نرتب خطوات اليوم مع بعض",
    keywords: ["خطة", "نظم", "ترتيب", "جدول", "أنظم", "خطوة"],
  },
  {
    id: "practice",
    label: "راجع الدرس",
    href: "/dashboard",
    reason: "راجع اللي ذاكرته بسرعة",
    keywords: ["راجع", "مراجعة", "تلخيص"],
  },
] as const;

type CapabilityId = typeof PRIMARY_CAPABILITIES[number]["id"];

export interface PrimaryGoalRecommendation {
  intent: "study" | "quiz" | "practice" | "study_plan" | "general";
  message: string;
  recommendedActions: Array<{ capability: CapabilityId; label: string; href: string; reason: string }>;
}

// Simple keyword-based intent detection (fallback when AI unavailable)
function heuristicRecommend(goal: string, subjectHints: string[]): PrimaryGoalRecommendation {
  const lower = goal.toLowerCase();
  let best: typeof PRIMARY_CAPABILITIES[number] = PRIMARY_CAPABILITIES[0];
  let maxScore = 0;
  for (const cap of PRIMARY_CAPABILITIES) {
    let score = 0;
    for (const kw of cap.keywords) if (lower.includes(kw)) score += 1;
    // bonus if subject hint matches
    for (const s of subjectHints) if (lower.includes(s.toLowerCase())) score += 1;
    if (score > maxScore) { maxScore = score; best = cap; }
  }
  // If quiz keywords dominate
  const quizScore = PRIMARY_CAPABILITIES.find(c=>c.id==="quiz")!.keywords.filter(k=>lower.includes(k)).length;
  const planScore = PRIMARY_CAPABILITIES.find(c=>c.id==="study_plan")!.keywords.filter(k=>lower.includes(k)).length;
  let intent: PrimaryGoalRecommendation["intent"] = "general";
  if (maxScore === 0) {
    intent = "general";
    return {
      intent,
      message: "جميل! اختار المادة اللي عايز تبدأ بيها، ونبدأ بخطوة صغيرة مع بعض 🌟",
      recommendedActions: [
        { capability: best.id, label: best.label, href: best.href, reason: best.reason },
        { capability: "quiz", label: "حل أسئلة", href: "/exams", reason: "لما تخلص، حل سؤالين تتأكد إنك فهمت" },
      ],
    };
  }
  if (quizScore >= 1) intent = "quiz";
  else if (planScore >= 1) intent = "study_plan";
  else if (lower.includes("راجع") || lower.includes("مراجعة")) intent = "practice";
  else intent = "study";

  const second = PRIMARY_CAPABILITIES.find(c => c.id !== best.id) ?? PRIMARY_CAPABILITIES[1];
  return {
    intent,
    message: intent === "quiz"
      ? "ممتاز! نبدأ بسؤالين صغار ونشوف فهمت قد إيه ✨"
      : intent === "study_plan"
        ? "يلا نرتب يومك بخطوة واحدة واضحة 📝"
        : "ممتاز! نبدأ بدرس صغير ونخلصه للآخر 📚",
    recommendedActions: [
      { capability: best.id, label: best.label, href: best.href, reason: best.reason },
      { capability: second.id, label: second.label, href: second.href, reason: second.reason },
    ].slice(0, 2),
  };
}

function clampText(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ success: false, error: "INVALID_BODY" }, { status: 400 });

    const goal = clampText(body.goal, 500);
    if (!goal || goal.length < 2) {
      return NextResponse.json({ success: false, error: "GOAL_REQUIRED" }, { status: 400 });
    }

    // Read profile for education context
    const { data: profile } = await supabase.from("profiles").select("persona, education_stage_id, education_grade_id, education_track_id").eq("id", user.id).maybeSingle();
    const ctx = {
      persona: profile?.persona ?? null,
      stageId: profile?.education_stage_id ?? null,
      gradeId: profile?.education_grade_id ?? null,
      trackId: profile?.education_track_id ?? null,
    };

    // Resolve subject hints from DB via curricula if possible (best effort, no throw)
    let subjectHints: string[] = [];
    let stageCode: string | null = null;
    try {
      if (ctx.stageId) {
        const { data: stageRow } = await supabase.from("education_stages").select("code").eq("id", ctx.stageId).maybeSingle();
        stageCode = stageRow?.code ?? null;
      }
      if (ctx.stageId) {
        // Try to get subjects for hints
        let q = supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
        if (ctx.gradeId) q = q.eq("grade_id", ctx.gradeId);
        const { data: curricula } = await q;
        if (curricula && curricula.length > 0) {
          const ids = curricula.map((c: { id: string }) => c.id);
          const { data: subjects } = await supabase.from("subjects").select("name").in("curriculum_id", ids);
          if (subjects) subjectHints = subjects.map((s: { name: string }) => s.name).slice(0, 12);
        }
      }
    } catch { /* hints optional */ }

    // Build AI prompt with structured context — uses existing AI router
    const systemPrompt = [
      "أنت مساعد تعليمي لطفل في المرحلة الابتدائية داخل تطبيق Magiclly.",
      "مهمتك فهم هدف الطفل واقتراح خطوة واحدة بسيطة ومناسبة لسنه.",
      "القيود الصارمة:",
      "- لا تقترح إلا قدرات موجودة: study (مذاكرة درس), quiz (حل أسئلة), study_plan (خطة), practice (مراجعة).",
      "- لا تذكر مزودي AI أو تفاصيل تقنية.",
      "- كن داعمًا، قصيرًا، بلغة عربية بسيطة مناسبة لطفل.",
      "- إذا كان الهدف غير واضح، اقترح البدء بمادة واحدة.",
      `السياق: persona=${ctx.persona ?? "student"}, stageCode=${stageCode ?? "UNKNOWN"}, gradeId=${ctx.gradeId ?? "none"}, subjects=${subjectHints.join(", ") || "none"}`,
      'أرجع JSON فقط بهذا الشكل (بدون markdown): {"intent": "study|quiz|practice|study_plan|general", "message": "..."}. ثم سأقوم أنا بربط الاقتراحات بالقدرات المسموحة.',
    ].join("\n");

    let aiResult: PrimaryGoalRecommendation | null = null;
    let usedHeuristic = false;

    try {
      const res = await runAiTask("chat", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: goal },
        ],
        user: {
          role: ctx.persona ?? "student",
          language: "ar",
          educationLevel: stageCode ? `primary:${stageCode}` : "primary",
          preferences: {
            stage: stageCode ?? "unknown",
            grade: ctx.gradeId ?? "unknown",
          },
        },
        options: { temperature: 0.5 },
      });

      // Try to parse JSON from content
      const raw = (res.content || "").trim();
      // Extract JSON object if wrapped
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const slice = raw.slice(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(slice);
        const intentRaw = typeof parsed.intent === "string" ? parsed.intent : "general";
        const intentMap: Record<string, PrimaryGoalRecommendation["intent"]> = {
          study: "study", quiz: "quiz", practice: "practice", study_plan: "study_plan", general: "general"
        };
        const intent = intentMap[intentRaw] ?? "general";
        const message = typeof parsed.message === "string" && parsed.message.trim().length > 0
          ? parsed.message.trim().slice(0, 400)
          : heuristicRecommend(goal, subjectHints).message;

        // Map intent to whitelisted capabilities only
        const intentToCap: Record<string, CapabilityId> = {
          study: "study", quiz: "quiz", practice: "practice", study_plan: "study_plan", general: "study"
        };
        const primaryCapId = intentToCap[intent] ?? "study";
        const primaryCap = PRIMARY_CAPABILITIES.find(c => c.id === primaryCapId) ?? PRIMARY_CAPABILITIES[0];
        const secondaryCap = PRIMARY_CAPABILITIES.find(c => c.id !== primaryCapId) ?? PRIMARY_CAPABILITIES[1];
        aiResult = {
          intent,
          message,
          recommendedActions: [
            { capability: primaryCap.id, label: primaryCap.label, href: primaryCap.href, reason: primaryCap.reason },
            { capability: secondaryCap.id, label: secondaryCap.label, href: secondaryCap.href, reason: secondaryCap.reason },
          ].slice(0, 2),
        };
      } else {
        // AI returned non-JSON — use heuristic but keep AI message if useful
        const fallback = heuristicRecommend(goal, subjectHints);
        if (raw.length > 10 && raw.length < 600 && !raw.includes("<")) {
          fallback.message = raw.slice(0, 400);
        }
        aiResult = fallback;
      }
    } catch {
      // AI unavailable — fallback gracefully
      usedHeuristic = true;
      aiResult = heuristicRecommend(goal, subjectHints);
    }

    if (!aiResult) {
      aiResult = heuristicRecommend(goal, subjectHints);
      usedHeuristic = true;
    }

    // Data contract for future parent visibility (no heavy event system - just response includes context)
    const contract = {
      goal,
      stageCode,
      gradeId: ctx.gradeId,
      intent: aiResult.intent,
      recommended: aiResult.recommendedActions.map(a => a.capability),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: aiResult,
      meta: {
        stageCode,
        gradeId: ctx.gradeId,
        heuristic: usedHeuristic,
        subjectsAvailable: subjectHints.length,
      },
      // For future parent oversight — lightweight contract, not persisted yet
      event: contract,
    });
  } catch (err) {
    console.error("[primary/goal] error", err);
    // Never crash — return heuristic fallback
    const body = await req.clone().json().catch(() => ({}));
    const goal = clampText((body as { goal?: unknown })?.goal, 500) || "";
    const fallback = heuristicRecommend(goal || "مذاكرة", []);
    return NextResponse.json({
      success: true,
      data: fallback,
      meta: { fallback: true },
    });
  }
}
