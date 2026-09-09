import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/tasks/runner";

const UNI_CAPABILITIES = [
  { id: "study", label: "ذاكر المادة", href: "/dashboard", reason: "شرح أكاديمي معمق", keywords: ["ذاكر", "درس", "شرح", "مادة"] },
  { id: "quiz", label: "حل أسئلة", href: "/exams", reason: "تدريب", keywords: ["أسئلة", "اختبار", "حل"] },
  { id: "exam", label: "امتحان", href: "/exams", reason: "محاكاة", keywords: ["امتحان", "شامل"] },
  { id: "practice", label: "مراجعة", href: "/dashboard", reason: "تثبيت", keywords: ["راجع", "مراجعة"] },
  { id: "study_plan", label: "خطة دراسية", href: "/dashboard/planner", reason: "تنظيم فصل دراسي", keywords: ["خطة", "نظم"] },
] as const;

type CapabilityId = typeof UNI_CAPABILITIES[number]["id"];

export interface UniversityGoalRecommendation {
  intent: "study" | "quiz" | "exam" | "practice" | "study_plan" | "general";
  message: string;
  recommendedActions: Array<{ capability: CapabilityId; label: string; href: string; reason: string }>;
}

function heuristicRecommend(goal: string, subjectHints: string[]): UniversityGoalRecommendation {
  const lower = goal.toLowerCase();
  let best: typeof UNI_CAPABILITIES[number] = UNI_CAPABILITIES[0];
  let maxScore = 0;
  for (const cap of UNI_CAPABILITIES) {
    let score = 0;
    for (const kw of cap.keywords) if (lower.includes(kw)) score += 1;
    for (const s of subjectHints) if (lower.includes(s.toLowerCase())) score += 1;
    if (score > maxScore) { maxScore = score; best = cap; }
  }
  const examScore = UNI_CAPABILITIES.find(c=>c.id==="exam")!.keywords.filter(k=>lower.includes(k)).length;
  const quizScore = UNI_CAPABILITIES.find(c=>c.id==="quiz")!.keywords.filter(k=>lower.includes(k)).length;
  const planScore = UNI_CAPABILITIES.find(c=>c.id==="study_plan")!.keywords.filter(k=>lower.includes(k)).length;
  let intent: UniversityGoalRecommendation["intent"] = "general";
  if (maxScore===0) {
    intent="general";
    return { intent, message:"حدد مادة تخصصك ونبدأ بخطة جامعية", recommendedActions:[
      { capability: best.id, label: best.label, href: best.href, reason: best.reason },
      { capability: "quiz", label: "حل أسئلة", href: "/exams", reason:"تدريب"},
    ]};
  }
  if (examScore>=1) intent="exam";
  else if (quizScore>=1) intent="quiz";
  else if (planScore>=1) intent="study_plan";
  else if (lower.includes("راجع")) intent="practice";
  else intent="study";
  const second = UNI_CAPABILITIES.find(c=>c.id!==best.id)??UNI_CAPABILITIES[1];
  return { intent, message: intent==="exam"?"نبدأ بمحاكاة امتحان جامعي": intent==="study_plan"?"نبني خطة فصل دراسي":"نبدأ بشرح أكاديمي معمق", recommendedActions:[
    { capability: best.id, label: best.label, href: best.href, reason: best.reason },
    { capability: second.id, label: second.label, href: second.href, reason: second.reason },
  ].slice(0,2)};
}

function clampText(v: unknown, max=500): string {
  if (typeof v!=="string") return "";
  return v.trim().slice(0,max);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) return NextResponse.json({success:false, error:"UNAUTHORIZED"}, {status:401});
    const body = await req.json().catch(()=>null);
    if (!body) return NextResponse.json({success:false, error:"INVALID_BODY"}, {status:400});
    const goal = clampText(body.goal, 500);
    if (!goal || goal.length<2) return NextResponse.json({success:false, error:"GOAL_REQUIRED"}, {status:400});
    const {data: profile} = await supabase.from("profiles").select("persona, university_id, faculty_id, department_id, academic_level_id, semester_id, education_stage_id").eq("id", user.id).maybeSingle();
    const ctx={ persona: profile?.persona??null, universityId: profile?.university_id??null, facultyId: profile?.faculty_id??null, departmentId: profile?.department_id??null, academicLevelId: profile?.academic_level_id??null, semesterId: profile?.semester_id??null, stageId: profile?.education_stage_id??null };
    let subjectHints: string[]=[]; let stageCode:string|null=null;
    try{
      if(ctx.stageId){ const {data: s}=await supabase.from("education_stages").select("code").eq("id", ctx.stageId).maybeSingle(); stageCode=s?.code??null; }
      // Try university_subjects if university context
      if(ctx.universityId && ctx.departmentId && ctx.academicLevelId && ctx.semesterId){
        const {data: subs}=await supabase.from("university_subjects").select("name").eq("university_id", ctx.universityId).eq("department_id", ctx.departmentId).eq("academic_level_id", ctx.academicLevelId).eq("semester_id", ctx.semesterId);
        if(subs) subjectHints=subs.map((s:{name:string})=>s.name).slice(0,12);
      } else if(ctx.stageId){
        let q=supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
        const {data: cur}=await q;
        if(cur && cur.length>0){ const ids=cur.map((c:{id:string})=>c.id); const {data: subs}=await supabase.from("subjects").select("name").in("curriculum_id", ids); if(subs) subjectHints=subs.map((s:{name:string})=>s.name).slice(0,12); }
      }
    }catch{}
    const systemPrompt=[
      "أنت مساعد جامعي — مرحلة تخصص أكاديمي.",
      "قدم توجيهاً احترافياً، مركزاً على التخصص والمواد الجامعية.",
      "القيود: لا تقترح إلا study, quiz, exam, practice, study_plan. لا تذكر مزودي AI.",
      `السياق: persona=${ctx.persona}, university=${ctx.universityId||"none"}, department=${ctx.departmentId||"none"}, level=${ctx.academicLevelId||"none"}, subjects=${subjectHints.join(", ")||"none"}`,
      'أرجع JSON فقط: {"intent":"study|quiz|exam|practice|study_plan|general","message":"..."}',
    ].join("\n");
    let aiResult: UniversityGoalRecommendation|null=null; let usedHeuristic=false;
    try{
      const res=await runAiTask("chat",{messages:[{role:"system", content: systemPrompt},{role:"user", content: goal}], user:{role: ctx.persona??"student", language:"ar", educationLevel: stageCode?`university:${stageCode}`:"university", preferences:{ university: ctx.universityId||"unknown"}}, options:{temperature:0.5}});
      const raw=(res.content||"").trim(); const s=raw.indexOf("{"); const e=raw.lastIndexOf("}");
      if(s!==-1 && e!==-1 && e>s){
        const parsed=JSON.parse(raw.slice(s,e+1));
        const map: Record<string,UniversityGoalRecommendation["intent"]>={study:"study",quiz:"quiz",exam:"exam",practice:"practice",study_plan:"study_plan",general:"general"};
        const intent=map[typeof parsed.intent==="string"?parsed.intent:"general"]??"general";
        const message=typeof parsed.message==="string" && parsed.message.trim().length>0 ? parsed.message.trim().slice(0,400) : heuristicRecommend(goal, subjectHints).message;
        const toCap: Record<string, CapabilityId>={study:"study",quiz:"quiz",exam:"exam",practice:"practice",study_plan:"study_plan",general:"study"};
        const primaryCapId=toCap[intent]??"study";
        const primaryCap=UNI_CAPABILITIES.find(c=>c.id===primaryCapId)??UNI_CAPABILITIES[0];
        const secondaryCap=UNI_CAPABILITIES.find(c=>c.id!==primaryCapId)??UNI_CAPABILITIES[1];
        aiResult={intent, message, recommendedActions:[
          { capability: primaryCap.id, label: primaryCap.label, href: primaryCap.href, reason: primaryCap.reason },
          { capability: secondaryCap.id, label: secondaryCap.label, href: secondaryCap.href, reason: secondaryCap.reason },
        ].slice(0,2)};
      } else {
        const fb=heuristicRecommend(goal, subjectHints);
        if(raw.length>10 && raw.length<600 && !raw.includes("<")) fb.message=raw.slice(0,400);
        aiResult=fb;
      }
    }catch{ usedHeuristic=true; aiResult=heuristicRecommend(goal, subjectHints); }
    if(!aiResult){ aiResult=heuristicRecommend(goal, subjectHints); usedHeuristic=true; }
    const contract={goal, stageCode, intent:aiResult.intent, recommended: aiResult.recommendedActions.map(a=>a.capability), timestamp:new Date().toISOString()};
    return NextResponse.json({success:true, data: aiResult, meta:{stageCode, heuristic:usedHeuristic, subjectsAvailable: subjectHints.length}, event: contract});
  }catch(err){
    console.error("[university/goal] error", err);
    const body=await req.clone().json().catch(()=>({}));
    const goal=clampText((body as {goal?:unknown})?.goal,500)||"";
    const fb=heuristicRecommend(goal||"مذاكرة",[]);
    return NextResponse.json({success:true, data: fb, meta:{fallback:true}});
  }
}
