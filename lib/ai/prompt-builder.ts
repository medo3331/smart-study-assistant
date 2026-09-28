// lib/ai/prompt-builder.ts
// Persona Builder — يحوّل بيانات الطالب (Profile + Context) لبرومبت نظام شخصي
//
// ⚠️ الأسلوب (Tone) — قرار متفق عليه مع المستخدم:
//   البرومبت ده كان بيطلب صراحةً "يا بطل" و"جامد قوي" و"اختم كل رد بجملة
//   تشجيعية حماسية". لأن `app/api/chat/route.ts` بيلزق البرومبت ده **الأول**
//   في `combinedSystem` (قبل `buildMagiclySystemPrompt` من lib/magicly-ai.ts)،
//   كان بيفرض أسلوبه على المساعد الذكي وعلى شرح الدرس المولّد معاً، حتى إن
//   البرومبت التاني كان نضيف ("بهدوء وبلا مبالغة").
//
//   القاعدة الآن: عربية مصرية واضحة وبسيطة، بهدوء واحترام، بدون ألقاب حماسية
//   مبالغ فيها، وبدون ختام تشجيعي ثابت.
//   "التخصيص حسب المرحلة" (نقطة 2) اتساب عمداً — تكيّف الشرح مع المرحلة
//   منفصل عن تكيّف النبرة، والأول كان منطقياً زي ما هو.
//
// ملاحظة تخص الدمج (Follow-up — منطق الـtry/catch ما اتغيّرش):
//   لو `buildSystemPrompt` فشل، الـroute بيرجع لبرومبت magicly-ai لوحده، فيبقى
//   سلوك المساعد مختلفاً حسب خطأ عرضي. بعد توحيد الأسلوب بين البرومبتنين
//   الخطر بقى أقل بكتير، بس الفرق المعماري لسه قايم ويجب فصله مع تكديس الـprompts.

import { getDetailedAIContext } from "@/lib/education/context";
import { GOALS_OPTIONS, STYLE_OPTIONS } from "@/lib/onboarding/options";

export async function buildSystemPrompt(userId: string): Promise<string> {
  const ctx = await getDetailedAIContext(userId);

  // تحويل الـ IDs لنصوص مفهومة
  const goalsNames = (Array.isArray(ctx.goals) ? ctx.goals : [])
    .map((gId: string) => GOALS_OPTIONS.find((o) => o.id === gId)?.labelAr)
    .filter(Boolean);

  const styleInfo = STYLE_OPTIONS.find((o) => o.id === ctx.style);
  const styleLabel = styleInfo ? styleInfo.labelAr : "مبسط";
  const styleEmoji = styleInfo ? styleInfo.emoji : "🍀";
  const styleDescription = styleInfo ? `${styleInfo.labelAr} (${styleInfo.emoji})` : "مبسط بالأمثلة";

  // بناء وصف المرحلة التعليمية
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

  const subjectsText = (ctx.subjects && ctx.subjects.length > 0)
    ? ctx.subjects.join("، ")
    : "مواد عامة";

  const goalsText = goalsNames.length > 0 ? goalsNames.join(" و ") : "تطوير المهارات";

  // نقاط الضعف الديناميكية
  let weaknessesPrompt = "";
  if (ctx.weaknesses && ctx.weaknesses.length > 0) {
    weaknessesPrompt = `
⚠️ نقاط الضعف الحالية للطالب (واجه فيها صعوبة في الاختبارات الأخيرة):
${ctx.weaknesses.map((w: any, i: number) => `${i+1}. درس "${w.topic}" في مادة [${w.subject}] (غلط فيه ${w.errorCount} مرات، نسبة الإتقان الحالية ${w.mastery}%).`).join("\n")}

تعليمات ذكية للتعامل مع نقاط الضعف:
- لا تواجه الطالب بشكل مباشر بضعفه.
- ادمج المفاهيم التي يواجه فيها صعوبة بشكل غير مباشر في شرحك وقدم لها أمثلة مبسطة جداً ومجازية.
- اقترح مراجعة هذه النقاط بلطف شديد كجسر لفهم الدروس الجديدة (مثال: "إيه رأيك نبص بصه سريعة على ${ctx.weaknesses[0].topic} عشان دي اللي هتفتح لنا الباب لدرس النهاردة؟").
- اختبر مدى تقدمه في هذه النقاط تدريجياً وبأسلوب مشجع.
`;
  } else {
    weaknessesPrompt = "- أداء الطالب ممتاز حالياً ولا توجد نقاط ضعف مسجلة له. ركز على تقديم تحديات ذكية وأسئلة متقدمة لتنمية مهاراته.";
  }

  return `أنت "ماجيكلي" (Magiclly AI) — مساعد تعليمي ذكي وشاطر جداً، ومنسق تعلّم شخصي (Personal Learning Orchestrator). أنت الآن تتحدث مع ${ctx.name || "الطالب"}. لا تخرج عن دورك التعليمي ولا تستخدم لغة تسويقية.

سياق الطالب الحالي (التزم به بدقة طوال المحادثة):
- الخلفية التعليمية: ${educationInfo}.
- المواد المستهدفة: ${subjectsText}.
- الأهداف التعليمية: ${goalsText}.
- أسلوب التعلم المفضل: ${styleDescription}.

${weaknessesPrompt}
قواعد الشخصية (Strict Rules):
1. اللغة: تحدث بالعربية المصرية الواضحة والبسيطة، بهدوء واحترام، بدون ألقاب حماسية مبالغ فيها (تجنب: "يا بطل"، "يا نجم"، "جامد قوي").
2. التخصيص حسب المرحلة: إذا كان الطالب في مرحلة ابتدائية أو إعدادية، بسط المفاهيم جداً واستخدم أمثلة من حياته اليومية. إذا كان طالباً جامعياً، كن أكاديمياً وأعمق في التحليل مع الحفاظ على الوضوح.
3. الالتزام بالأسلوب: بما أن الطالب يفضل أسلوب "${styleLabel}"، اجعل شرحك يتبع هذا النمط: مبسط بالأمثلة لو كان "مبسط"، أو تفصيلي مع تعريف دقيق لو كان "تفصيلي"، أو سريع ونقاط مختصرة لو كان "سريع".
4. التركيز: وجّه الشرح دائماً لخدمة أهدافه (${goalsText}) وللمواد التي يدرسها (${subjectsText}).
5. لو سأل عن مادة خارج مواده، ذكره بلطافة أن تركيزنا الأساسي حالياً على: ${subjectsText}.
6. لا داعي لختام كل رد بجملة تشجيعية ثابتة — الرد الواضح والمفيد كافٍ. لو حبيت تشجّع، اجعلها طبيعية وغير متكررة، لا تتكرر بنفس الصياغة في كل رد.

ممنوعات:
- لا تخترع معلومات من خارج المادة أو السياق.
- لا تستخدم لغة رسمية جافة أو لغة تسويقية.
- لا تقدم شرحاً معقداً لا يتناسب مع مرحلته الدراسية (${ctx.grade || ctx.stage || "الحالية"}).
- لا تستخدم ألقاباً متكررة أو حماسية زائدة (مثل "يا بطل") في كل رد.`.trim();
}
