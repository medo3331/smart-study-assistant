/**
 * lib/ai/prompt-engine.ts — قواعد الـ Prompt المشتركة
 *
 * حاليًا بيضم إرشادات رسم المخططات (Mermaid) اللي بتتحقن في نظام
 * الشات، عشان المساعد يرسم خريطة ذهنية/مخطط انسيابي/جدول زمني
 * داخل المحادثة مباشرة بدل ما يرجّع كود نصي.
 *
 * العرض نفسه بيتم في المتصفح عبر components/ui/MermaidViewer.tsx
 * اللي بيتعرف على بلوكات ```mermaid من داخل MarkdownRenderer.
 */

export const DIAGRAM_GUIDELINES = `
## 📊 إرشادات رسم المخططات والخرائط الذهنية (Mermaid):
- لما الطالب يطلب (خريطة ذهنية، مخطط انسيابي، مخطط سريان، جدول زمني، مقارنة شجرية، خطوات تجربة، رسم بياني)، ارسمها فورًا داخل ردّك باستخدام بلوك كود \`\`\`mermaid.
- استخدم الصيغ التالية حسب المطلوب:
  1. الخرائط الذهنية: \`mindmap\`
  2. تسلسل الخطوات والشروط: \`graph TD\` أو \`flowchart TD\`
  3. التواريخ والتسلسل الزمني: \`timeline\`
  4. المقارنات والنسب: \`pie title العنوان\`
  5. خطط المذاكرة الزمنية: \`gantt\` مع \`dateFormat YYYY-MM-DD\`
  6. الرسوم البيانية بالقيم: \`xychart-beta\`
- احرص دايمًا إن النصوص داخل العقد (Nodes) تكون قصيرة ومباشرة بالعربي (3-5 كلمات) بدون علامات تنصيص معقدة تتلف الـ Syntax.
- بلوك الـ mermaid لازم يحتوي على الكود فقط — بدون شرح داخل البلوك، وأي تعليق للطالب يكون خارج البلوك.
- لو الرسم غير مناسب للطلب (سؤال سريع أو حساب بسيط) لا ترسم مخططًا بدون داعٍ.
`.trim();

/** إلحاق إرشادات المخططات بأي system prompt قائم. */
export function withDiagramGuidelines(systemPrompt: string): string {
  return `${systemPrompt}\n\n${DIAGRAM_GUIDELINES}`;
}

/* ------------------------------------------------------------------ */
/*  تعليمات النظام المقيدة بالحجم (context-builder + chaos tests)      */
/* ------------------------------------------------------------------ */

/** الحد الأقصى لحروف التعليمة الملحقة — أي زيادة بتتقطع مع …. */
export const SYSTEM_INSTRUCTION_MAX_CHARS = 1200;

/** علامة بداية التعليمات — ثابتة عشان التشخيص والاختبارات يلاقوها. */
const INSTRUCTION_MARKER = "تعليمات تنسيق الإخراج الإلزامية";

/** قصّ نص لطول أقصى مع … في الآخر. النص الأقصر بيرجع زي ما هو. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…".slice(0, Math.max(0, maxChars));
  return text.slice(0, maxChars - 1) + "…";
}

/**
 * إلحاق تعليمة ببرومبت النظام تحت علامة ثابتة، مقصوصة للحد الأقصى.
 * التعليمة بتيجي في الآخر دايمًا — وحتى الفاضية بتسيب العلامة موجودة
 * عشان اللي بيقرا البرومبت يعرف إن مكان التعليمات هنا.
 */
export function appendSystemInstruction(basePrompt: string, instruction: string): string {
  return `${basePrompt}\n\n${INSTRUCTION_MARKER}\n${truncateText(instruction, SYSTEM_INSTRUCTION_MAX_CHARS)}`;
}
