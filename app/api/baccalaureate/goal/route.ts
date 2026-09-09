import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/tasks/runner";

const BACC_CAPABILITIES = [
  { id: "study", label: "ذاكر الدرس", href: "/dashboard", reason: "شرح معمق لمسارك", keywords: ["ذاكر", "درس", "شرح", "فيزياء", "كيمياء", "أحياء", "رياضيات", "تاريخ"] },
  { id: "quiz", label: "حل أسئلة", href: "/exams", reason: "تدريب تراكمي", keywords: ["أسئلة", "اختبار", "حل"] },
  { id: "exam", label: "امتحان شامل", href: "/exams", reason: "محاكاة بكالوريا", keywords: ["امتحان", "شامل", "نموذج"] },
  { id: "practice", label: "مراجعة", href: "/dashboard", reason: "تثبيت سريع", keywords: ["راجع", "مراجعة"] },
  { id: "study_plan", label: "خطة بكالوريا", href: "/dashboard/planner", reason: "خطة طويلة المدى", keywords: ["خطة", "نظم", "ترتيب"] },
] as const;

type CapabilityId = typeof BACC_CAPABILITIES[number]["id"];

export interface BaccGoalRecommendation {
  intent: "study" | "quiz" | "exam" | "practice" | "study_plan" | "general";
  message: string;
  recommendedActions: Array<{ capability: CapabilityId; label: string; href: string; reason: string }>;
}

function heuristicRecommend(goal: string, subjectHints: string[]): BaccGoalRecommendation {
  const lower = goal.toLowerCase();
  let best: typeof BACC_CAPABILITIES[number] = BACC_CAPABILITIES[0];
  let maxScore = 0;
  for (const cap of BACC_CAPABILITIES) {
    let score = 0;
    for (const kw of cap.keywords) if (lower.includes(kw)) score += 1;
    for (const s of subjectHints) if (lower.includes(s.toLowerCase())) score += 1;
    if (score > maxScore) { maxScore = score; best = cap; }
  }
  const examScore = BACC_CAPABILITIES.find(c=>c.id==="exam")!.keywords.filter(k=>lower.includes(k)).length;
  const quizScore = BACC_CAPABILITIES.find(c=>c.id==="quiz")!.keywords.filter(k=>lower.includes(k)).length;
  const planScore = BACC_CAPABILITIES.find(c=>c.id==="study_plan")!.keywords.filter(k=>lower.includes(k)).length;
  let intent: BaccGoalRecommendation["intent"] = "general";
  if (maxScore===0) {
    intent="general";
    return { intent, message:"حدد مادة مسارك ونبدأ بخطة بكالوريا واضحة", recommendedActions:[
      { capability: best.id, label: best.label, href: best.href, reason: best.reason },
      { capability: "exam", label: "امتحان شامل", href: "/exams", reason:"قياس مستوى المسار"},
    ]};
  }
  if (examScore>=1) intent="exam";
  else if (quizScore>=1) intent="quiz";
  else if (planScore>=1) intent="study_plan";
  else if (lower.includes("راجع")) intent="practice";
  else intent="study";
  const second = BACC_CAPABILITIES.find(c=>c.id!==best.id)??BACC_CAPABILITIES[1];
  return { intent, message: intent==="exam"?"نبدأ بمحاكاة بكالوريا لمسارك": intent==="study_plan"?"نبني خطة بكالوريا طويلة المدى":"نبدأ بشرح معمق لمادتك", recommendedActions:[
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
    const {data: profile} = await supabase.from("profiles").select("persona, education_stage_id, education_grade_id, education_track_id").eq("id", user.id).maybeSingle();
    const ctx={ persona: profile?.persona??null, stageId: profile?.education_stage_id??null, gradeId: profile?.education_grade_id??null, trackId: profile?.education_track_id??null };
    let subjectHints: string[]=[]; let stageCode:string|null=null; let trackCode:string|null=null;
    try{
      if(ctx.stageId){ const {data: s}=await supabase.from("education_stages").select("code").eq("id", ctx.stageId).maybeSingle(); stageCode=s?.code??null; }
      if(ctx.trackId){ const {data: t}=await supabase.from("education_tracks").select("code,name").eq("id", ctx.trackId).maybeSingle(); trackCode=t?.code??t?.name??null; }
      if(ctx.stageId){
        let q=supabase.from("curricula").select("id").eq("stage_id", ctx.stageId);
        if(ctx.gradeId) q=q.eq("grade_id", ctx.gradeId);
        const {data: cur}=await q;
        if(cur && cur.length>0){ const ids=cur.map((c:{id:string})=>c.id); const {data: subs}=await supabase.from("subjects").select("name").in("curriculum_id", ids); if(subs) subjectHints=subs.map((s:{name:string})=>s.name).slice(0,12); }
      }
    }catch{}
    const systemPrompt=[
      "أنت مساعد بكالوريا — مرحلة مصيرية للجامعة.",
      "قدم توجيهاً مركزاً على المسار (طب/هندسة/إدارة/آداب) والامتحانات الشاملة.",
      "القيود: لا تقترح إلا study, quiz, exam, practice, study_plan. لا تذكر مزودي AI.",
      `السياق: persona=${ctx.persona}, stage=${stageCode}, track=${trackCode||"none"}, subjects=${subjectHints.join(", ")||"none"}`,
      'أرجع JSON فقط: {"intent":"study|quiz|exam|practice|study_plan|general","message":"..."}',
    ].join("\n");
    let aiResult: BaccGoalRecommendation|null=null; let usedHeuristic=false;
    try{
      const res=await runAiTask("chat",{messages:[{role:"system", content: systemPrompt},{role:"user", content: goal}], user:{role: ctx.persona??"student", language:"ar", educationLevel: stageCode?`baccalaureate:${stageCode}:${trackCode||""}`:"baccalaureate", preferences:{stage: stageCode||"unknown", track: trackCode||"unknown"}}, options:{temperature:0.5}});
      const raw=(res.content||"").trim(); const s=raw.indexOf("{"); const e=raw.lastIndexOf("}");
      if(s!==-1 && e!==-1 && e>s){
        const parsed=JSON.parse(raw.slice(s,e+1));
        const map: Record<string,BaccGoalRecommendation["intent"]>={study:"study",quiz:"quiz",exam:"exam",practice:"practice",study_plan:"study_plan",general:"general"};
        const intent=map[typeof parsed.intent==="string"?parsed.intent:"general"]??"general";
        const message=typeof parsed.message==="string" && parsed.message.trim().length>0 ? parsed.message.trim().slice(0,400) : heuristicRecommend(goal, subjectHints).message;
        const toCap: Record<string, CapabilityId>={study:"study",quiz:"quiz",exam:"exam",practice:"practice",study_plan:"study_plan",general:"study"};
        const primaryCapId=toCap[intent]??"study";
        const primaryCap=BACC_CAPABILITIES.find(c=>c.id===primaryCapId)??BACC_CAPABILITIES[0];
        const secondaryCap=BACC_CAPABILITIES.find(c=>c.id!==primaryCapId)??BACC_CAPABILITIES[1];
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
    const contract={goal, stageCode, trackCode, gradeId:ctx.gradeId, intent:aiResult.intent, recommended: aiResult.recommendedActions.map(a=>a.capability), timestamp:new Date().toISOString()};
    return NextResponse.json({success:true, data: aiResult, meta:{stageCode, trackCode, gradeId:ctx.gradeId, heuristic:usedHeuristic, subjectsAvailable: subjectHints.length}, event: contract});
  }catch(err){
    console.error("[baccalaureate/goal] error", err);
    const body=await req.clone().json().catch(()=>({}));
    const goal=clampText((body as {goal?:unknown})?.goal,500)||"";
    const fb=heuristicRecommend(goal||"مذاكرة",[]);
    return NextResponse.json({success:true, data: fb, meta:{fallback:true}});
  }
}
