import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/tasks/runner";

// Whitelisted capabilities that exist for Preparatory (more exam-focused than Primary)
const PREPARATORY_CAPABILITIES = [
  {
    id: "study",
    label: "ذاكر الدرس",
    href: "/dashboard",
    reason: "ابدأ بشرح منظم للدرس",
    keywords: ["ذاكر", "درس", "شرح", "افهم", "اتعلم", "مذاكرة", "رياضيات", "علوم", "عربي", "دراسات"],
  },
  {
    id: "quiz",
    label: "حل أسئلة",
    href: "/exams",
    reason: "اختبر فهمك بأسئلة متنوعة",
    keywords: ["أسئلة", "اختبار", "حل", "كويز", "تدريب", "تمرين"],
  },
  {
    id: "exam",
    label: "حل امتحان",
    href: "/exams",
    reason: "جرّب امتحان كامل على المادة",
    keywords: ["امتحان", "اختبار شامل", "نموذج", "امتحانات"],
  },
  {
    id: "practice",
    label: "راجع الدرس",
    href: "/dashboard",
    reason: "راجع أهم نقاط الدرس",
    keywords: ["راجع", "مراجعة", "تلخيص"],
  },
  {
    id: "study_plan",
    label: "اعمل خطة",
    href: "/dashboard/planner",
    reason: "نظّم مذاكرتك بخطة واضحة",
    keywords: ["خطة", "نظم", "ترتيب", "جدول", "أنظم"],
  },
] as const;

type CapabilityId = typeof PREPARATORY_CAPABILITIES[number]["id"];

export interface PreparatoryGoalRecommendation {
  intent: "study" | "quiz" | "practice" | "study_plan" | "exam" | "general";
  message: string;
  recommendedActions: Array<{ capability: CapabilityId; label: string; href: string; reason: string }>;
}

function heuristicRecommend(goal: string, subjectHints: string[]): PreparatoryGoalRecommendation {
  const lower = goal.toLowerCase();
  let best: typeof PREPARATORY_CAPABILITIES[number] = PREPARATORY_CAPABILITIES[0];
  let maxScore = 0;
  for (const cap of PREPARATORY_CAPABILITIES) {
    let score = 0;
    for (const kw of cap.keywords) if (lower.includes(kw)) score += 1;
    for (const s of subjectHints) if (lower.includes(s.toLowerCase())) score += 1;
    if (score > maxScore) { maxScore = score; best = cap; }
  }
  const quizScore = PREPARATORY_CAPABILITIES.find(c=>c.id==="quiz")!.keywords.filter(k=>lower.includes(k)).length;
  const examScore = PREPARATORY_CAPABILITIES.find(c=>c.id==="exam")!.keywords.filter(k=>lower.includes(k)).length;
  const planScore = PREPARATORY_CAPABILITIES.find(c=>c.id==="study_plan")!.keywords.filter(k=>lower.includes(k)).length;
  let intent: PreparatoryGoalRecommendation["intent"] = "general";
  if (maxScore === 0) {
    intent = "general";
    return {
      intent,
      message: "تمام! اختار المادة اللي عايز تبدأ بيها، ونرتب أول خطوة مع بعض 📚",
      recommendedActions: [
        { capability: best.id, label: best.label, href: best.href, reason: best.reason },
        { capability: "quiz", label: "حل أسئلة", href: "/exams", reason: "اختبر فهمك بعد المذاكرة" },
      ],
    };
  }
  if (examScore >= 1) intent = "exam";
  else if (quizScore >= 1) intent = "quiz";
  else if (planScore >= 1) intent = "study_plan";
  else if (lower.includes("راجع") || lower.includes("مراجعة")) intent = "practice";
  else intent = "study";

  const second = PREPARATORY_CAPABILITIES.find(c => c.id !== best.id) ?? PREPARATORY_CAPABILITIES[1];
  return {
    intent,
    message: intent === "exam"
      ? "ممتاز! نبدأ بامتحان صغير نشوف مستواك ✍️"
      : intent === "quiz"
        ? "يلا نحل شوية أسئلة ونثبّت المعلومة"
        : intent === "study_plan"
          ? "خلينا نعمل خطة مذاكرة منظمة ليومك"
          : "تمام! نبدأ بشرح منظم للدرس خطوة بخطوة",
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

    const { data: profile } = await supabase.from("profiles").select("persona, education_stage_id, education_grade_id, education_track_id").eq("id", user.id).maybeSingle();
    const ctx = {
      persona: profile?.persona ?? null,
      stageId: profile?.education_stage_id ?? null,
      gradeId: profile?.education_grade_id ?? null,
      trackId: profile?.education_track_id ?? null,
    };

    let subjectHints: string[] = [];
    let stageCode: string | null = null;
    try {
      if (ctx.stageId) {
        const { data: stageRow } = await supabase.from("education_stages").select("code").eq("id", ctx.stageId).maybeSingle();
        stageCode = stageRow?.code ?? null;
      }
      if (ctx.stageId) {
        let q = supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
        if (ctx.gradeId) q = q.eq("grade_id", ctx.gradeId);
        const { data: curricula } = await q;
        if (curricula && curricula.length > 0) {
          const ids = curricula.map((c: { id: string }) => c.id);
          const { data: subjects } = await supabase.from("subjects").select("name").in("curriculum_id", ids);
          if (subjects) subjectHints = subjects.map((s: { name: string }) => s.name).slice(0, 12);
        }
      }
    } catch {}

    const systemPrompt = [
      "أنت مساعد تعليمي لطالب في المرحلة الإعدادية داخل تطبيق Magiclly.",
      "مهمتك فهم هدف الطالب واقتراح خطوة منظمة ومناسبة لسنه (أكثر نضجاً من الابتدائي).",
      "القيود:",
      "- لا تقترح إلا قدرات موجودة: study, quiz, exam, practice, study_plan.",
      "- لا تذكر مزودي AI أو تفاصيل تقنية.",
      "- كن منظماً، واضحاً، بلغة عربية فصحى مبسطة مع لمسة مصرية خفيفة.",
      "- إذا كان الهدف غير واضح، اقترح البدء بمادة واحدة بتركيز.",
      `السياق: persona=${ctx.persona ?? "student"}, stageCode=${stageCode ?? "UNKNOWN"}, gradeId=${ctx.gradeId ?? "none"}, subjects=${subjectHints.join(", ") || "none"}`,
      'أرجع JSON فقط بهذا الشكل (بدون markdown): {"intent": "study|quiz|exam|practice|study_plan|general", "message": "..."}. ثم سأقوم أنا بربط الاقتراحات بالقدرات المسموحة.',
    ].join("\n");

    let aiResult: PreparatoryGoalRecommendation | null = null;
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
          educationLevel: stageCode ? `preparatory:${stageCode}` : "preparatory",
          preferences: {
            stage: stageCode ?? "unknown",
            grade: ctx.gradeId ?? "unknown",
          },
        },
        options: { temperature: 0.5 },
      });

      const raw = (res.content || "").trim();
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const slice = raw.slice(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(slice);
        const intentRaw = typeof parsed.intent === "string" ? parsed.intent : "general";
        const intentMap: Record<string, PreparatoryGoalRecommendation["intent"]> = {
          study: "study", quiz: "quiz", exam: "exam", practice: "practice", study_plan: "study_plan", general: "general"
        };
        const intent = intentMap[intentRaw] ?? "general";
        const message = typeof parsed.message === "string" && parsed.message.trim().length > 0
          ? parsed.message.trim().slice(0, 400)
          : heuristicRecommend(goal, subjectHints).message;

        const intentToCap: Record<string, CapabilityId> = {
          study: "study", quiz: "quiz", exam: "exam", practice: "practice", study_plan: "study_plan", general: "study"
        };
        const primaryCapId = intentToCap[intent] ?? "study";
        const primaryCap = PREPARATORY_CAPABILITIES.find(c => c.id === primaryCapId) ?? PREPARATORY_CAPABILITIES[0];
        const secondaryCap = PREPARATORY_CAPABILITIES.find(c => c.id !== primaryCapId) ?? PREPARATORY_CAPABILITIES[1];
        aiResult = {
          intent,
          message,
          recommendedActions: [
            { capability: primaryCap.id, label: primaryCap.label, href: primaryCap.href, reason: primaryCap.reason },
            { capability: secondaryCap.id, label: secondaryCap.label, href: secondaryCap.href, reason: secondaryCap.reason },
          ].slice(0, 2),
        };
      } else {
        const fallback = heuristicRecommend(goal, subjectHints);
        if (raw.length > 10 && raw.length < 600 && !raw.includes("<")) {
          fallback.message = raw.slice(0, 400);
        }
        aiResult = fallback;
      }
    } catch {
      usedHeuristic = true;
      aiResult = heuristicRecommend(goal, subjectHints);
    }

    if (!aiResult) {
      aiResult = heuristicRecommend(goal, subjectHints);
      usedHeuristic = true;
    }

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
      event: contract,
    });
  } catch (err) {
    console.error("[preparatory/goal] error", err);
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
