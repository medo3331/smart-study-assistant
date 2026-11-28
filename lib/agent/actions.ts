// lib/agent/actions.ts
//
// Magic Agent Tools — عقد أدوات الوكيل (Action Contract).
//
// Magic Agent مش بيحدّ ويبعث روابط — بيقدر «ينفّذ»: بيعمل مخططات، ملفات
// (MD/PDF/DOCX/PPTX)، صور، بحث في الإنترنت، واختبارات تفاعلية داخل الشات.
//
// الآلية (نفس نمط plan-draft):
//   الموديل يضيف في آخر رده كتلة ```magic-action فيها JSON —
//   السيرفر يقراها، ينفّذها، ويرجّع artifacts للواجهة، والكتلة بتتشال من النص.
//
// هذا الملف pure — بيتستخدم من السيرفر (التنفيذ) ومن الواجهة (العرض).
// ممنوع استيراد أي حاجة server-only هنا.

/* -------------------------------------------------------------------------- */
/* الأنواع                                                                     */
/* -------------------------------------------------------------------------- */

export type MagicActionTool = "web_search" | "diagram" | "image" | "file" | "quiz";

export const MAGIC_ACTION_TOOLS: readonly MagicActionTool[] = [
  "web_search",
  "diagram",
  "image",
  "file",
  "quiz",
];

export interface WebSearchAction {
  tool: "web_search";
  query: string;
}

export type DiagramActionType =
  | "mindmap"
  | "flowchart"
  | "timeline"
  | "classDiagram"
  | "sequence"
  | "pie"
  | "gantt"
  | "graph";

export interface DiagramAction {
  tool: "diagram";
  topic: string;
  type: DiagramActionType;
  detail?: "simple" | "medium" | "detailed";
}

export interface ImageAction {
  tool: "image";
  prompt: string;
}

export type FileActionFormat = "md" | "pdf" | "docx" | "pptx";

export interface FileActionSection {
  heading: string;
  body: string;
}

export interface FileAction {
  tool: "file";
  title: string;
  format: FileActionFormat;
  sections: FileActionSection[];
}

export interface QuizActionQuestion {
  question: string;
  options: string[];
  /** فهرس الإجابة الصحيحة (0-based). */
  answerIndex: number;
  explanation?: string;
}

export interface QuizAction {
  tool: "quiz";
  title: string;
  subject?: string;
  questions: QuizActionQuestion[];
}

export type MagicAction =
  | WebSearchAction
  | DiagramAction
  | ImageAction
  | FileAction
  | QuizAction;

/* -------------------------------------------------------------------------- */
/* حدود الأمان                                                                 */
/* -------------------------------------------------------------------------- */

export const MAGIC_ACTION_LIMITS = {
  maxActionsPerTurn: 3,
  maxQuery: 300,
  maxPrompt: 600,
  maxTopic: 200,
  maxTitle: 150,
  maxSections: 30,
  maxSectionHeading: 150,
  maxSectionBody: 4_000,
  maxQuestions: 20,
  maxOptions: 6,
  maxQuestionText: 500,
  maxOptionText: 200,
  maxExplanation: 500,
  /** أقصى حجم buffer للملفات المولدة (3MB) — فوق كده بنرفض التضمين. */
  maxFileBytes: 3 * 1024 * 1024,
} as const;

const FENCE_RE = /```magic-action\s*\n([\s\S]*?)```/g;

/* -------------------------------------------------------------------------- */
/* تحقق المدخلات                                                               */
/* -------------------------------------------------------------------------- */

function clampStr(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampStrArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, maxLen))
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
}

const DIAGRAM_TYPES: readonly DiagramActionType[] = [
  "mindmap", "flowchart", "timeline", "classDiagram", "sequence", "pie", "gantt", "graph",
];

const FILE_FORMATS: readonly FileActionFormat[] = ["md", "pdf", "docx", "pptx"];

/** تحقق وتنظيف action واحدة — null لو غير صالحة. */
export function validateMagicAction(raw: unknown): MagicAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const tool = data.tool;

  if (tool === "web_search") {
    const query = clampStr(data.query, MAGIC_ACTION_LIMITS.maxQuery);
    if (!query) return null;
    return { tool, query };
  }

  if (tool === "diagram") {
    const topic = clampStr(data.topic, MAGIC_ACTION_LIMITS.maxTopic);
    const type = DIAGRAM_TYPES.find((t) => t === data.type);
    if (!topic || !type) return null;
    const detail = data.detail === "simple" || data.detail === "detailed" ? data.detail : "medium";
    return { tool, topic, type, detail };
  }

  if (tool === "image") {
    const prompt = clampStr(data.prompt, MAGIC_ACTION_LIMITS.maxPrompt);
    if (!prompt) return null;
    return { tool, prompt };
  }

  if (tool === "file") {
    const title = clampStr(data.title, MAGIC_ACTION_LIMITS.maxTitle);
    const format = FILE_FORMATS.find((f) => f === data.format);
    if (!title || !format) return null;
    const rawSections = Array.isArray(data.sections) ? data.sections : [];
    const sections: FileActionSection[] = rawSections
      .map((s) => {
        if (typeof s !== "object" || s === null) return null;
        const sec = s as Record<string, unknown>;
        const heading = clampStr(sec.heading, MAGIC_ACTION_LIMITS.maxSectionHeading);
        const body = clampStr(sec.body, MAGIC_ACTION_LIMITS.maxSectionBody);
        if (!heading && !body) return null;
        return { heading, body };
      })
      .filter((s): s is FileActionSection => s !== null)
      .slice(0, MAGIC_ACTION_LIMITS.maxSections);
    if (sections.length === 0) return null;
    return { tool, title, format, sections };
  }

  if (tool === "quiz") {
    const title = clampStr(data.title, MAGIC_ACTION_LIMITS.maxTitle) || "اختبار سريع";
    const subject = clampStr(data.subject, 120) || undefined;
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    const questions: QuizActionQuestion[] = rawQuestions
      .map((q): QuizActionQuestion | null => {
        if (typeof q !== "object" || q === null) return null;
        const qd = q as Record<string, unknown>;
        const question = clampStr(qd.question, MAGIC_ACTION_LIMITS.maxQuestionText);
        const options = clampStrArray(qd.options, MAGIC_ACTION_LIMITS.maxOptions, MAGIC_ACTION_LIMITS.maxOptionText);
        const answerIndex = typeof qd.answerIndex === "number" ? Math.floor(qd.answerIndex) : -1;
        if (!question || options.length < 2 || answerIndex < 0 || answerIndex >= options.length) return null;
        const explanation = clampStr(qd.explanation, MAGIC_ACTION_LIMITS.maxExplanation) || undefined;
        return { question, options, answerIndex, explanation };
      })
      .filter((q): q is QuizActionQuestion => q !== null)
      .slice(0, MAGIC_ACTION_LIMITS.maxQuestions);
    if (questions.length === 0) return null;
    return { tool: "quiz", title, subject, questions };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* الاستخراج من نص الرد                                                        */
/* -------------------------------------------------------------------------- */

export interface ExtractedActions {
  actions: MagicAction[];
  /** الرد بعد شيل كتل magic-action (للعرض والحفظ). */
  cleanedMessage: string;
}

/**
 * استخراج كل كتل magic-action من رد المساعد — الصالحة تنفّذ، والفاسدة تتشال.
 */
export function extractAgentActions(message: string): ExtractedActions {
  const actions: MagicAction[] = [];
  const cleaned = (message || "").replace(FENCE_RE, (full, body: string) => {
    if (actions.length >= MAGIC_ACTION_LIMITS.maxActionsPerTurn) return "";
    try {
      const parsed = JSON.parse(body);
      // دعم كتلة واحدة فيها مصفوفة أدوات أو أداة واحدة.
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (actions.length >= MAGIC_ACTION_LIMITS.maxActionsPerTurn) break;
        const valid = validateMagicAction(c);
        if (valid) actions.push(valid);
      }
    } catch {
      // JSON فاسد — نشيل الكتلة من العرض ونكمّل.
    }
    return "";
  });
  return { actions, cleanedMessage: cleaned.replace(/\n{3,}/g, "\n\n").trim() };
}

/* -------------------------------------------------------------------------- */
/* الـ Artifacts — نتائج تنفيذ الأدوات اللي بتوصل للواجهة (client-safe)        */
/* -------------------------------------------------------------------------- */

export interface WebResultsArtifact {
  kind: "web_results";
  title: string;
  query: string;
  answer?: string;
  results: { title: string; url: string; snippet: string }[];
}

export interface DiagramArtifact {
  kind: "diagram";
  title: string;
  mermaidCode: string;
  diagramType: string;
  error?: string;
}

export interface ImageArtifact {
  kind: "image";
  title: string;
  url: string;
  error?: string;
}

export interface FileArtifact {
  kind: "file";
  title: string;
  format: "md" | "pdf" | "docx" | "pptx";
  /** للملفات النصية (md) — المحتوى نفسه. */
  content?: string;
  /** أقسام المحتوى — للاستيراد في النوتة. */
  sections?: { heading: string; body: string }[];
  /** للملفات الثنائية — data URL جاهز للتحميل. */
  dataUrl?: string;
  filename?: string;
  size?: number;
  /** رسالة فشل التوليد — العميل يعرضها بدل زر التحميل. */
  error?: string;
}

export interface QuizArtifact {
  kind: "quiz";
  title: string;
  subject?: string;
  questions: QuizAction["questions"];
}

export type AgentArtifact =
  | WebResultsArtifact
  | DiagramArtifact
  | ImageArtifact
  | FileArtifact
  | QuizArtifact;

/* -------------------------------------------------------------------------- */
/* تعليمات الأدوات — تُحقن في system prompt                                    */
/* -------------------------------------------------------------------------- */

export const AGENT_ACTION_INSTRUCTIONS = [
  "🛠️ أدواتك (Magic Agent Tools) — أنت مش بس بترد، أنت بتنفّذ:",
  "لما الطلب يحتاج مخرَج حقيقي (مخطط، ملف، صورة، بحث، اختبار)، أضف في آخر ردك كتلة واحدة بالشكل ده:",
  "```magic-action",
  "{\"tool\":\"...\", ...}",
  "```",
  "الأدوات المتاحة:",
  "- بحث في الإنترنت: {\"tool\":\"web_search\",\"query\":\"نص البحث\"} — استخدمه لأي معلومة ممكن تكون حديثة أو مش متأكد منها.",
  "- مخطط: {\"tool\":\"diagram\",\"topic\":\"الموضوع\",\"type\":\"mindmap|flowchart|timeline|classDiagram|sequence|pie|gantt|graph\",\"detail\":\"simple|medium|detailed\"} — خريطة ذهنية أو مخطط انسيابي أو جانت لخطة مذاكرة.",
  "- صورة: {\"tool\":\"image\",\"prompt\":\"وصف الصورة التعليمية بالإنجليزية\"} — لو الشرح بيحتاج رسمة توضيحية.",
  "- ملف: {\"tool\":\"file\",\"title\":\"اسم الملف\",\"format\":\"md|pdf|docx|pptx\",\"sections\":[{\"heading\":\"عنوان\",\"body\":\"النص الكامل\"}]} — ملخصات وأبحاث وتقارير وعروض تقديمية (pptx = presentation). اكتب محتوى غني ومنظم: كل section = قسم واضح بعنوان وصورته ملونة في PDF، وكل section = شريحة في PowerPoint (خلي الـ body نقاط قصيرة سطر لكل نقطة).",
  "- اختبار تفاعلي: {\"tool\":\"quiz\",\"title\":\"عنوان\",\"subject\":\"المادة\",\"questions\":[{\"question\":\"السؤال\",\"options\":[\"أ\",\"ب\",\"ج\",\"د\"],\"answerIndex\":0,\"explanation\":\"ليه\"}]} — اختبر الطالب داخل الشات فورًا. نوّع بين اختيار من متعدد وصح/غلط (options: [\"صح\",\"غلط\"]) ورتّب من السهل للصعب.",
  "قواعد صارمة:",
  "- اكتب في ردك جملة أو جملتين تشرح اللي عملته، وبعدها الكتلة — الكتلة مش بتنعرض كنص، بتتنفّذ وتظهر للطالب كاملة.",
  "- متبعتش روابط لصفحات المنصة بدل التنفيذ: لو تقدر تعمل الحاجة بأداة، اعملها فورًا.",
  "- للبحث في محتوى ملفات الطالب نفسه اعتمد على السياق المرفق — أداة web_search للإنترنت فقط.",
  "- أداة واحدة كفاية لكل نوع مخرَج — لا تكرر نفس الأداة مرتين في رد واحد.",
].join("\n");

/** توجيه طلب الامتحان الصريح — اختبار داخل الشات بدل رابط المولّد. */
export const EXAM_ACTION_DIRECTIVE = [
  "📝 الطالب طلب امتحان/اختبار صراحةً: اعمله له فورًا هنا في الشات —",
  "- لو السياق فيه محتوى من ملفاته (محاضرة/ملف) اعتمد عليه في الأسئلة، ولو مفيش اعتمد على معلومات عامة صحيحة في المادة.",
  "- اكتب كتلة quiz (5 أسئلة افتراضيًا أو العدد المطلوب) بأربعة اختيارات وإجابة صحيحة وشرح مختصر لكل سؤال.",
  "- 🎯 امتحان احترافي: رتّب الأسئلة من السهل للصعب تدريجيًا، نوّع بين فهم/تطبيق/تحليل، وخلي المشتّتات (الاختيارات الغلط) منطقية ومقنعة مش عشوائية.",
  "- نوّع شكل الأسئلة: اختيار من متعدد، صح/غلط (خلي الاختيارات [\"صح\",\"غلط\"])، أكمل (اكتب الاختيارات كاقتراحات) — بحيث الاختبار يحسّسه امتحان حقيقي.",
  "- ابدأ ردك بجملة قصيرة («جهزتلك اختبار سريع 👇») وبعدها الكتلة.",
  "- بعد الاختبار اعرض عليه: أسئلة أصعب، اختبار تاني، أو مولّد الامتحان الكامل في صفحة /exams لو عايز امتحان رسمي أطول من تفريغ محاضراته (كمعلومة إضافية مش بديل).",
].join("\n");
