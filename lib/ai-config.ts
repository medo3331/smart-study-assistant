/** إعدادات موديلات Groq المستخدمة في كل مسارات الذكاء الاصطناعي. */
export const GROQ_MODELS = {
  /** للشرح والمحتوى الطويل الذي يحتاج جودة أعلى. */
  advanced: "openai/gpt-oss-120b",
  /** للمهام المنظمة والسريعة مثل الخطط والـ JSON. */
  fast: "openai/gpt-oss-20b",
} as const;

/**
 * Gemini stays reserved for specialised work routed in `lib/ai/router.ts`.
 * `gemini-3.6-flash` accepts multimodal input and produces text/structured
 * output, but does not generate images, so it is not an image model.
 */
export const GEMINI_MODELS = {
  analysis: "gemini-3.6-flash",
  /** الموديل الوحيد اللي بيدعم Image Generation فعليًا في الحساب الحالي. */
  image: "gemini-3.1-flash-image",
} as const;
