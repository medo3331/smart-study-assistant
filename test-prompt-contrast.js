import { GOALS_OPTIONS, STYLE_OPTIONS } from "./lib/onboarding/options";

// محاكاة بسيطة لـ buildSystemPrompt بدون Supabase
function mockBuildSystemPrompt(ctx) {
  const goalsNames = (ctx.goals || [])
    .map((gId) => GOALS_OPTIONS.find(o => o.id === gId)?.labelAr)
    .filter(Boolean);

  const styleInfo = STYLE_OPTIONS.find(o => o.id === ctx.style);
  const styleLabel = styleInfo ? styleInfo.labelAr : "مبسط";
  const styleEmoji = styleInfo ? styleInfo.emoji : "🍀";
  const styleDescription = styleInfo ? `${styleInfo.labelAr} (${styleInfo.emoji})` : "مبسط بالأمثلة";

  let educationInfo = "";
  if (ctx.university && ctx.faculty) {
    educationInfo = `طالب جامعي في ${ctx.university}، كلية ${ctx.faculty}${ctx.department ? `، قسم ${ctx.department}` : ""}`;
  } else if (ctx.stage && ctx.grade) {
    educationInfo = `طالب في ${ctx.stage}${ctx.grade ? ` (${ctx.grade})` : ""}${ctx.track ? ` — شعبة ${ctx.track}` : ""}`;
  } else if (ctx.persona === "grad") {
    educationInfo = "خريج";
  } else if (ctx.persona === "freelancer") {
    educationInfo = "مستقل (Freelancer)";
  } else {
    educationInfo = "متعلم";
  }

  const subjectsText = (ctx.subjects && ctx.subjects.length > 0) ? ctx.subjects.join("، ") : "مواد عامة";
  const goalsText = goalsNames.length > 0 ? goalsNames.join(" و ") : "تطوير المهارات";

  let weaknessesPrompt = "";
  if (ctx.weaknesses && ctx.weaknesses.length > 0) {
    weaknessesPrompt = `
⚠️ نقاط الضعف الحالية للطالب (واجه فيها صعوبة في الاختبارات الأخيرة):
${ctx.weaknesses.map((w, i) => `${i+1}. درس "${w.topic}" في مادة [${w.subject}] (غلط فيه ${w.errorCount} مرات، نسبة الإتقان الحالية ${w.mastery}%).`).join("\n")}

تعليمات ذكية للتعامل مع نقاط الضعف:
- لا تواجه الطالب بشكل مباشر بضعفه.
- ادمج المفاهيم التي يواجه فيها صعوبة بشكل غير مباشر في شرحك وقدم لها أمثلة مبسطة جداً ومجازية.
- اقترح مراجعة هذه النقاط بلطف شديد كجسر لفهم الدروس الجديدة (مثال: "إيه رأيك نبص بصه سريعة على ${ctx.weaknesses[0].topic} عشان دي اللي هتفتح لنا الباب لدرس النهاردة؟").
- اختبر مدى تقدمه في هذه النقاط تدريجياً وبأسلوب مشجع.
`;
  } else {
    weaknessesPrompt = "- أداء الطالب ممتاز حالياً ولا توجد نقاط ضعف مسجلة له. ركز على تقديم تحديات ذكية وأسئلة متقدمة لتنمية مهاراته.";
  }

  return `أنت "ماجيكلي" (Magiclly AI)...
الطالب: ${ctx.name}
المرحلة: ${educationInfo}
المواد: ${subjectsText}
الأهداف: ${goalsText}
الأسلوب: ${styleDescription}
${weaknessesPrompt}`;
}

// سيناريو 1: بدون نقاط ضعف
const ctxNoWeak = {
  name: "أحمد",
  persona: "student",
  stage: "ثانوي",
  grade: "تانية",
  track: "علمي",
  university: null,
  faculty: null,
  department: null,
  goals: ["exam","mastery"],
  style: "simple",
  subjects: ["فيزياء","رياضيات"],
  weaknesses: []
};

// سيناريو 2: مع نقاط ضعف
const ctxWithWeak = {
  ...ctxNoWeak,
  weaknesses: [
    { topic: "قانون أوم", subject: "فيزياء", errorCount: 4, mastery: 40 },
    { topic: "المقاومات المتسلسلة", subject: "فيزياء", errorCount: 3, mastery: 55 },
    { topic: "المتتابعات الحسابية", subject: "رياضيات", errorCount: 2, mastery: 60 }
  ]
};

console.log("=== سيناريو 1: بدون نقاط ضعف ===\n");
console.log(mockBuildSystemPrompt(ctxNoWeak));

console.log("\n\n=== سيناريو 2: مع نقاط ضعف ===\n");
console.log(mockBuildSystemPrompt(ctxWithWeak));
