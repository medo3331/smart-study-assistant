import type { AiTaskDefinition } from "./types";

/**
 * مهام النصوص الحرّة — الجاهزة فعليًا عبر /api/ai في هذه المرحلة.
 * باقي المهام معرّفة كنقاط توسّع: تعريفها موجود، والتفعيل بيحصل بتحويل
 * implemented إلى true لما تدفقها يتبني (quiz/flashcards/… في مراحل قادمة).
 */
export const CHAT_TASK: AiTaskDefinition = {
  id: "chat",
  label: "محادثة حرّة",
  implemented: true,
  temperature: 0.7,
};

export const EXPLAIN_TASK: AiTaskDefinition = {
  id: "explain",
  label: "شرح درس",
  implemented: true,
  temperature: 0.4,
  buildSystemPrompt: (input) => {
    const preferences = input.user;
    const level = preferences?.educationLevel ? ` المستوى التعليمي: ${preferences.educationLevel}.` : "";
    return [
      "أنت «ماجيكلي»، مساعد مذاكرة مصري خفيف وطبيعي. مهمتك شرح الموضوع اللي الطالب سأل عنه.",
      "اتبع Teaching Flow: شرح بسيط قصير، ثم مثال واضح، ثم سؤال واحد للتحقق من الفهم — ولا تعطي إجابة سؤال التحقق قبل ما الطالب يرد.",
      "اكتب بالعربية المصرية الواضحة، فقرات قصيرة مناسبة للموبايل، ومن غير مبالغة تسويقية.",
      "لا تخترع معلومة من ملف أو مصدر غير موجود في الطلب؛ لو نقصت معلومة جوهرية اسأل سؤال متابعة واحدًا محددًا." + level,
    ].join("\n");
  },
};

export const TUTOR_TASK: AiTaskDefinition = {
  id: "tutor",
  label: "مدرّس خاص تفاعلي",
  implemented: true,
  temperature: 0.5,
  buildSystemPrompt: (input) => {
    const level = input.user?.educationLevel ? ` المستوى التعليمي: ${input.user.educationLevel}.` : "";
    return [
      "أنت «ماجيكلي»، مدرّس خاص مصري صبور. هدفك إن الطالب يوصل للإجابة بنفسه خطوة بخطوة، مش إنك تحلّله بدال عنه.",
      "قسّم الشرح لخطوات قصيرة جدًا، وبعد كل خطوة اسأل سؤال تحقق صغير واستنى رد الطالب قبل الخطوة اللي بعدها.",
      "لو الطالب غلط، وضّح مكان الغلطة بلطف وارجع لآخر خطوة فهمها صح، وما تكررش الشرح كله من الأول.",
      "اكتب بالعربية المصرية الواضحة والبسيطة، ومن غير أي مبالغة تسويقية." + level,
    ].join("\n");
  },
};

/** السجل الكامل — أي مهمة جديدة بتتمركز هنا الأول قبل أي استخدام. */
export const AI_TASK_REGISTRY = {
  chat: CHAT_TASK,
  explain: EXPLAIN_TASK,
  tutor: TUTOR_TASK,
} as const satisfies Record<string, AiTaskDefinition>;

export type ImplementedAiTaskId = keyof typeof AI_TASK_REGISTRY;

export function isImplementedAiTask(value: unknown): value is ImplementedAiTaskId {
  return typeof value === "string" && value in AI_TASK_REGISTRY;
}

export function getAiTask(id: ImplementedAiTaskId): AiTaskDefinition {
  return AI_TASK_REGISTRY[id];
}
