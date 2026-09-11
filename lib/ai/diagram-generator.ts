/**
 * lib/ai/diagram-generator.ts — توليد المخططات والرسوم البيانية
 *
 * بنولّد كود Mermaid عبر نموذج اللغة، والعرض بيتم في المتصفح عبر
 * مكتبة mermaid — من غير أي API خارجي للرسم (مجاني 100%).
 */

export type DiagramType =
  | "mindmap" // خريطة ذهنية
  | "flowchart" // مخطط انسيابي
  | "timeline" // جدول زمني
  | "classDiagram" // مخطط تصنيفي
  | "sequence" // مخطط تسلسلي
  | "pie" // رسم بياني دائري
  | "gantt" // مخطط جانت (لخطط المذاكرة)
  | "graph"; // رسم بياني خطي/أعمدة

export interface GenerateDiagramOptions {
  topic: string;
  type: DiagramType;
  subject?: string;
  stage?: string;
  detail?: "simple" | "medium" | "detailed";
  language?: "ar" | "en";
}

export interface DiagramResult {
  /** كود Mermaid الخام. */
  mermaidCode: string;
  /** SVG جاهز للعرض — بيتملى من جهة العرض في المتصفح. */
  svg?: string;
  type: DiagramType;
  title: string;
}

/** تسميات عربية للواجهة. */
export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  mindmap: "خريطة ذهنية",
  flowchart: "مخطط انسيابي",
  timeline: "جدول زمني",
  classDiagram: "مخطط تصنيفي",
  sequence: "مخطط تسلسلي",
  pie: "رسم دائري",
  gantt: "مخطط جانت",
  graph: "رسم بياني",
};

/** أول سطر صالح لكل نوع — للتحقق السريع من استجابة الموديل. */
const DIAGRAM_FIRST_TOKEN: Record<DiagramType, string[]> = {
  mindmap: ["mindmap"],
  flowchart: ["graph", "flowchart"],
  timeline: ["timeline"],
  classDiagram: ["classDiagram"],
  sequence: ["sequenceDiagram"],
  pie: ["pie"],
  gantt: ["gantt"],
  graph: ["xychart-beta", "xychart"],
};

// ============================================
// 1. Prompt لتوليد كود Mermaid عبر الـ AI
// ============================================
export function buildDiagramPrompt(options: GenerateDiagramOptions): string {
  const { topic, type, subject, stage, detail = "medium", language = "ar" } = options;

  const typeInstructions: Record<DiagramType, string> = {
    mindmap: `Create a Mermaid mindmap diagram. Use the "mindmap" syntax — the FIRST word must be "mindmap".
Root node = main topic. Branch = subtopics. Leaves = details.
Example:
mindmap
  root((الموضوع))
    الفرع الأول
      تفصيل 1
      تفصيل 2
    الفرع الثاني
      تفصيل 3`,

    flowchart: `Create a Mermaid flowchart (TD = top-down). The FIRST word must be "graph" or "flowchart".
Use rectangles for steps, diamonds for decisions, rounded for start/end.
Example:
graph TD
  A[البداية] --> B{شرط؟}
  B -->|نعم| C[خطوة 1]
  B -->|لا| D[خطوة 2]`,

    timeline: `Create a Mermaid timeline diagram. The FIRST word must be "timeline".
Example:
timeline
  title الجدول الزمني
  2020 : حدث 1
  2021 : حدث 2 : حدث 3`,

    classDiagram: `Create a Mermaid class diagram showing relationships between concepts.
The FIRST word must be "classDiagram". Use short class names and clear relation arrows.`,

    sequence: `Create a Mermaid sequence diagram showing interactions between entities.
The FIRST word must be "sequenceDiagram".
Example:
sequenceDiagram
  الطالب->>المساعد: سؤال
  المساعد-->>الطالب: إجابة`,

    pie: `Create a Mermaid pie chart. The FIRST word must be "pie".
Example:
pie title التوزيع
  "جزء 1" : 40
  "جزء 2" : 35
  "جزء 3" : 25`,

    gantt: `Create a Mermaid Gantt chart for study planning. The FIRST word must be "gantt".
Example:
gantt
  title خطة المذاكرة
  dateFormat YYYY-MM-DD
  section الرياضيات
  الجبر :a1, 2024-01-01, 3d
  الهندسة :a2, after a1, 2d`,

    graph: `Create a Mermaid XY chart for data visualization. The FIRST word must be "xychart-beta".
Example:
xychart-beta
  title "الدرجات"
  x-axis [يناير, فبراير, مارس]
  y-axis "الدرجة" 0 --> 100
  bar [85, 90, 78]`,
  };

  return `أنت خبير في إنشاء مخططات Mermaid التعليمية.

المطلوب: مخطط ${type} عن "${topic}"
${subject ? `المادة: ${subject}` : ""}
${stage ? `المرحلة: ${stage}` : ""}
مستوى التفصيل: ${detail}
اللغة: ${language === "ar" ? "العربية" : "English"}

${typeInstructions[type]}

القواعد:
1. أرجع كود Mermaid صالح فقط — بدون أي شرح أو نص إضافي
2. لا تستخدم \`\`\`mermaid أو \`\`\` حول الكود
3. تأكد من صحة الـ syntax (لا تنسى الأقواس والسهام)
4. استخدم نصوص قصيرة في كل node (3-5 كلمات كحد أقصى)
5. ${language === "ar" ? "اكتب كل النصوص بالعربية" : "Write all text in English"}
6. تجنب علامات التنصيص المزدوجة وعلامات الترقيم الخاصة داخل أسماء العقد إلا إذا كان الـ syntax يتطلبها (مثل قيم pie)
7. اجعل المخطط ${
    detail === "simple"
      ? "بسيط (5-8 عناصر)"
      : detail === "medium"
        ? "متوسط (8-15 عنصر)"
        : "مفصّل (15-25 عنصر)"
  }`;
}

// ============================================
// 2. تنظيف الاستجابة — إزالة الأسوار والنصوص الزائدة
// ============================================
export function cleanMermaidCode(raw: string, type: DiagramType): string {
  let code = (raw ?? "").trim();

  // إزالة code blocks لو موجودة
  const codeMatch = code.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (codeMatch) {
    code = codeMatch[1].trim();
  }

  // لو الموديل لفّ الكود بشرح قبل أو بعد، خد الجزء اللي بيبدأ بكلمة المفتاح
  const keywords = DIAGRAM_FIRST_TOKEN[type];
  const lines = code.split("\n");
  const startIdx = lines.findIndex((line) => {
    const t = line.trim();
    return keywords.some((k) => t === k || t.startsWith(`${k} `) || t.startsWith(`${k}\t`));
  });
  if (startIdx > 0) {
    code = lines.slice(startIdx).join("\n").trim();
  }

  return code;
}

// ============================================
// 3. الدالة الرئيسية
// ============================================
export async function generateDiagram(
  options: GenerateDiagramOptions,
  aiCompleteFn: (messages: Array<{ role: string; content: string }>) => Promise<string>
): Promise<DiagramResult> {
  const prompt = buildDiagramPrompt(options);

  const messages = [
    {
      role: "system",
      content:
        "أنت مولّد مخططات Mermaid. أرجع كود Mermaid صالح فقط بدون أي نص إضافي أو code blocks.",
    },
    { role: "user", content: prompt },
  ];

  const raw = await aiCompleteFn(messages);
  const mermaidCode = cleanMermaidCode(raw, options.type);

  if (!mermaidCode) {
    throw new Error("الموديل أرجع مخططًا فارغًا — جرّب مرة تانية.");
  }

  return {
    mermaidCode,
    type: options.type,
    title: options.topic,
  };
}

// ============================================
// 4. أنواع المخططات المتاحة حسب المادة
// ============================================
export const SUBJECT_DIAGRAM_MAP: Record<string, DiagramType[]> = {
  "رياضيات": ["flowchart", "mindmap", "graph"],
  "فيزياء": ["flowchart", "sequence", "mindmap"],
  "كيمياء": ["flowchart", "classDiagram", "mindmap"],
  "أحياء": ["mindmap", "flowchart", "timeline"],
  "تاريخ": ["timeline", "mindmap", "gantt"],
  "جغرافيا": ["mindmap", "pie", "graph"],
  "لغة عربية": ["mindmap", "flowchart", "classDiagram"],
  "لغة إنجليزية": ["mindmap", "flowchart", "sequence"],
  "عام": ["mindmap", "flowchart", "timeline", "gantt", "pie"],
};

export function diagramTypesForSubject(subject?: string): DiagramType[] {
  if (subject && SUBJECT_DIAGRAM_MAP[subject]) return SUBJECT_DIAGRAM_MAP[subject];
  return SUBJECT_DIAGRAM_MAP["عام"];
}
