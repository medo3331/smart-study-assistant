import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/tasks/runner";

const SECONDARY_CAPABILITIES = [
  { id: "study", label: "ذاكر الدرس", href: "/dashboard", reason: "شرح أكاديمي مركز", keywords: ["ذاكر", "درس", "شرح", "افهم", "فيزياء", "كيمياء", "رياضيات", "تاريخ", "جغرافيا"] },
  { id: "quiz", label: "حل أسئلة", href: "/exams", reason: "تدريب موجه", keywords: ["أسئلة", "اختبار", "حل", "كويز", "تدريب"] },
  { id: "exam", label: "حل امتحان", href: "/exams", reason: "محاكاة امتحان", keywords: ["امتحان", "نموذج", "شامل"] },
  { id: "practice", label: "مراجعة مركزة", href: "/dashboard", reason: "تثبيت سريع", keywords: ["راجع", "مراجعة", "تلخيص"] },
  { id: "study_plan", label: "خطة مذاكرة", href: "/dashboard/planner", reason: "تنظيم أسبوعي", keywords: ["خطة", "نظم", "ترتيب", "جدول"] },
] as const;

type CapabilityId = typeof SECONDARY_CAPABILITIES[number]["id"];

export interface SecondaryGoalRecommendation {
  intent: "study" | "quiz" | "practice" | "study_plan" | "exam" | "general";
  message: string;
  recommendedActions: Array<{ capability: CapabilityId; label: string; href: string; reason: string }>;
}

function heuristicRecommend(goal: string, subjectHints: string[]): SecondaryGoalRecommendation {
  const lower = goal.toLowerCase();
  let best: typeof SECONDARY_CAPABILITIES[number] = SECONDARY_CAPABILITIES[0];
  let maxScore = 0;
  for (const cap of SECONDARY_CAPABILITIES) {
    let score = 0;
    for (const kw of cap.keywords) if (lower.includes(kw)) score += 1;
    for (const s of subjectHints) if (lower.includes(s.toLowerCase())) score += 1;
    if (score > maxScore) { maxScore = score; best = cap; }
  }
  const examScore = SECONDARY_CAPABILITIES.find(c=>c.id==="exam")!.keywords.filter(k=>lower.includes(k)).length;
  const quizScore = SECONDARY_CAPABILITIES.find(c=>c.id==="quiz")!.keywords.filter(k=>lower.includes(k)).length;
  const planScore = SECONDARY_CAPABILITIES.find(c=>c.id==="study_plan")!.keywords.filter(k=>lower.includes(k)).length;
  let intent: SecondaryGoalRecommendation["intent"] = "general";
  if (maxScore === 0) {
    intent = "general";
    return {
      intent,
      message: "حدد مادتك الأساسية ونبدأ بخطة مذاكرة مركزة",
      recommendedActions: [
        { capability: best.id, label: best.label, href: best.href, reason: best.reason },
        { capability: "quiz", label: "حل أسئلة", href: "/exams", reason: "تثبيت بعد الشرح" },
      ],
    };
  }
  if (examScore >= 1) intent = "exam";
  else if (quizScore >= 1) intent = "quiz";
  else if (planScore >= 1) intent = "study_plan";
  else if (lower.includes("راجع")) intent = "practice";
  else intent = "study";
  const second = SECONDARY_CAPABILITIES.find(c => c.id !== best.id) ?? SECONDARY_CAPABILITIES[1];
  return {
    intent,
    message: intent === "exam" ? "نبدأ بمحاكاة امتحان لتقييم مستواك" : intent === "quiz" ? "نحل مجموعة أسئلة مركزة" : intent === "study_plan" ? "نبني خطة أسبوعية واضحة" : "نبدأ بشرح أكاديمي منظم",
    recommendedActions: [
      { capability: best.id, label: best.label, href: best.href, reason: best.reason },
      { capability: second.id, label: second.label, href: second.href, reason: second.reason },
    ].slice(0,2),
  };
}

function clampText(v: unknown, max=500): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, {status:401});
    const body = await req.json().catch(()=>null);
    if (!body) return NextResponse.json({ success:false, error:"INVALID_BODY" }, {status:400});
    const goal = clampText(body.goal, 500);
    if (!goal || goal.length < 2) return NextResponse.json({ success:false, error:"GOAL_REQUIRED" }, {status:400});

    const { data: profile } = await supabase.from("profiles").select("persona, education_stage_id, education_grade_id, education_track_id").eq("id", user.id).maybeSingle();
    const ctx = {
      persona: profile?.persona ?? null,
      stageId: profile?.education_stage_id ?? null,
      gradeId: profile?.education_grade_id ?? null,
      trackId: profile?.education_track_id ?? null,
    };
    let subjectHints: string[] = [];
    let stageCode: string|null=null;
    let trackCode: string|null=null;
    try {
      if (ctx.stageId) {
        const { data: stageRow } = await supabase.from("education_stages").select("code").eq("id", ctx.stageId).maybeSingle();
        stageCode = stageRow?.code ?? null;
      }
      if (ctx.trackId) {
        const { data: trackRow } = await supabase.from("education_tracks").select("code,name").eq("id", ctx.trackId).maybeSingle();
        trackCode = trackRow?.code ?? trackRow?.name ?? null;
      }
      if (ctx.stageId) {
        let q = supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
        if (ctx.gradeId) q = q.eq("grade_id", ctx.gradeId);
        // Note: curricula track filtering is handled via getAvailableSubjects logic; here we collect hints broadly
        const { data: curricula } = await q;
        if (curricula && curricula.length>0) {
          const ids = curricula.map((c:{id:string})=>c.id);
          const { data: subjects } = await supabase.from("subjects").select("name").in("curriculum_id", ids);
          if (subjects) subjectHints = subjects.map((s:{name:string})=>s.name).slice(0,12);
        }
      }
    } catch {}

    const systemPrompt = [
      "أنت مساعد أكاديمي لطالب ثانوي (Secondary) في Magiclly.",
      "هدفك تقديم توجيه مركز، أكاديمي، ومحفز نحو الدراسة والامتحانات.",
      "القيود: لا تقترح إلا study, quiz, exam, practice, study_plan. لا تذكر مزودي AI.",
      "استخدم لغة عربية فصحى واضحة مع نبرة محفزة.",
      `السياق: persona=${ctx.persona}, stage=${stageCode}, grade=${ctx.gradeId}, track=${trackCode || "none"}, subjects=${subjectHints.join(", ")||"none"}`,
      'أرجع JSON فقط: {"intent":"study|quiz|exam|practice|study_plan|general","message":"..."}',
    ].join("\n");

    let aiResult: SecondaryGoalRecommendation|null=null;
    let usedHeuristic=false;
    try {
      const res = await runAiTask("chat", {
        messages: [{role:"system", content: systemPrompt},{role:"user", content: goal}],
        user: { role: ctx.persona ?? "student", language:"ar", educationLevel: stageCode ? `secondary:${stageCode}:${trackCode||""}` : "secondary", preferences:{ stage: stageCode||"unknown", grade: ctx.gradeId||"unknown", track: trackCode||"unknown"} },
        options:{ temperature:0.5 }
      });
      const raw=(res.content||"").trim();
      const start=raw.indexOf("{");
      const end=raw.lastIndexOf("}");
      if (start!==-1 && end!==-1 && end>start) {
        const parsed=JSON.parse(raw.slice(start,end+1));
        const intentMap: Record<string, SecondaryGoalRecommendation["intent"]>={study:"study",quiz:"quiz",exam:"exam",practice:"practice",study_plan:"study_plan",general:"general"};
        const intent=intentMap[typeof parsed.intent==="string"?parsed.intent:"general"]??"general";
        const message=typeof parsed.message==="string" && parsed.message.trim().length>0 ? parsed.message.trim().slice(0,400) : heuristicRecommend(goal, subjectHints).message;
        const toCap: Record<string, CapabilityId>={study:"study",quiz:"quiz",exam:"exam",practice:"practice",study_plan:"study_plan",general:"study"};
        const primaryCapId=toCap[intent]??"study";
        const primaryCap=SECONDARY_CAPABILITIES.find(c=>c.id===primaryCapId)??SECONDARY_CAPABILITIES[0];
        const secondaryCap=SECONDARY_CAPABILITIES.find(c=>c.id!==primaryCapId)??SECONDARY_CAPABILITIES[1];
        aiResult={ intent, message, recommendedActions:[
          { capability: primaryCap.id, label: primaryCap.label, href: primaryCap.href, reason: primaryCap.reason },
          { capability: secondaryCap.id, label: secondaryCap.label, href: secondaryCap.href, reason: secondaryCap.reason },
        ].slice(0,2)};
      } else {
        const fb=heuristicRecommend(goal, subjectHints);
        if (raw.length>10 && raw.length<600 && !raw.includes("<")) fb.message=raw.slice(0,400);
        aiResult=fb;
      }
    } catch { usedHeuristic=true; aiResult=heuristicRecommend(goal, subjectHints); }

    if (!aiResult) { aiResult=heuristicRecommend(goal, subjectHints); usedHeuristic=true; }

    const contract={ goal, stageCode, trackCode, gradeId:ctx.gradeId, intent:aiResult.intent, recommended: aiResult.recommendedActions.map(a=>a.capability), timestamp:new Date().toISOString()};
    return NextResponse.json({ success:true, data: aiResult, meta:{ stageCode, trackCode, gradeId:ctx.gradeId, heuristic:usedHeuristic, subjectsAvailable: subjectHints.length }, event: contract });
  } catch (err) {
    console.error("[secondary/goal] error", err);
    const body = await req.clone().json().catch(()=>({}));
    const goal = clampText((body as {goal?:unknown})?.goal, 500) || "";
    const fb=heuristicRecommend(goal||"مذاكرة", []);
    return NextResponse.json({ success:true, data: fb, meta:{ fallback:true }});
  }
}
