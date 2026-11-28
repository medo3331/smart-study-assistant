/**
 * lib/ai/notebook-writer.ts — Magic Write engine (Explain & Write on the page).
 *
 * The model returns a STRUCTURED document (JSON), not a chat reply: the notebook
 * engine owns rendering, so every block becomes a real, editable page element
 * (heading, paragraph, example, table, diagram…). Untrusted model output is
 * always sanitized here before it reaches the client.
 */

import { extractJson, expectArray, expectObject, optionalString, rejectUnknownKeys } from "./structured";

export type NotebookWriteStyle =
  | "smart" // ملاحظات منظمة بعناوين ونقاط
  | "steps" // خطوة بخطوة لحل المسائل
  | "revision" // ورقة مراجعة سريعة
  | "simplify" // تبسيط موضوع صعب
  | "qa" // سؤال وجواب
  | "compare"; // مقارنة بين مفهومين في جدول

export type NotebookBlockType =
  | "heading"
  | "text"
  | "bullet"
  | "definition"
  | "example"
  | "tip"
  | "question"
  | "table"
  | "diagram";

export type NotebookDiagramType =
  | "mindmap"
  | "flowchart"
  | "timeline"
  | "classDiagram"
  | "sequence"
  | "pie"
  | "graph";

export type NotebookBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "bullet"; text: string }
  | { type: "definition"; text: string }
  | { type: "example"; text: string }
  | { type: "tip"; text: string }
  | { type: "question"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "diagram"; title: string; mermaidType: NotebookDiagramType; mermaidCode: string };

export interface NotebookWriteResult {
  title: string;
  blocks: NotebookBlock[];
}

export interface NotebookWriteOptions {
  /** الموضوع المطلوب شرحه — نص مختار من الصفحة أو موضوع مكتوب. */
  topic: string;
  style: NotebookWriteStyle;
  /** سياق الصفحة/النوتة الحالي (نص مكتوب فقط). */
  pageContext?: string;
  /** مستوى الطالب — اختياري. */
  level?: string;
  language?: "ar" | "en";
}

export const NOTEBOOK_WRITE_STYLES: NotebookWriteStyle[] = [
  "smart",
  "steps",
  "revision",
  "simplify",
  "qa",
  "compare",
];

export const NOTEBOOK_WRITE_STYLE_LABELS: Record<NotebookWriteStyle, string> = {
  smart: "ملاحظات ذكية",
  steps: "خطوة بخطوة",
  revision: "ورقة مراجعة",
  simplify: "تبسيط",
  qa: "سؤال وجواب",
  compare: "مقارنة",
};

const MAX_BLOCKS = 40;
const MAX_BLOCK_TEXT = 600;
const MAX_TABLE_ROWS = 10;
const MAX_TABLE_COLS = 4;
const MAX_TABLE_CELL = 120;
const MAX_MERMAID_LINES = 80;
const VALID_MERMAID: NotebookDiagramType[] = [
  "mindmap",
  "flowchart",
  "timeline",
  "classDiagram",
  "sequence",
  "pie",
  "graph",
];

const STYLE_INSTRUCTIONS: Record<NotebookWriteStyle, string> = {
  smart: `Organize as study notes: a clear title heading, section headings, short bullet points for facts, one "definition" block for the core term, one short "example", and one small "question" at the end to check understanding.`,
  steps: `Teach problem solving: numbered logic expressed as "bullet" blocks in strict order, each step ONE action, then one worked "example" and a final "tip" for common mistakes.`,
  revision: `Produce a fast pre-exam sheet: dense "heading"+"bullet" pairs only, at most one compact "table" for the key facts, and one "tip" with the most exam-relevant reminder.`,
  simplify: `Explain as if to a beginner: plain-language "text" blocks, everyday analogy as an "example", avoid jargon; define one key term as a "definition" block.`,
  qa: `Turn the topic into self-testing: alternating "question" and "text" (answer) blocks, 4 to 6 pairs, ending with a "tip".`,
  compare: `Compare exactly two concepts: a "table" block (3 columns: aspect, first concept, second concept) with 3 to 5 rows, then a short "text" summary of when to use each.`,
};

export function buildNotebookWritePrompt(options: NotebookWriteOptions): string {
  const { topic, style, pageContext, level, language = "ar" } = options;
  const parts: string[] = [
    `Topic: ${topic.slice(0, 300)}`,
    `Style: ${STYLE_INSTRUCTIONS[style]}`,
  ];
  if (level) parts.push(`Student level: ${level.slice(0, 120)}`);
  if (pageContext?.trim()) {
    parts.push(`Existing page context (build on it, do not repeat it):\n${pageContext.trim().slice(0, 1500)}`);
  }
  parts.push(
    [
      "Return ONLY a JSON object, no prose, no code fences, shaped exactly like:",
      '{"title":"...","blocks":[{"type":"heading","text":"..."},{"type":"text","text":"..."},{"type":"bullet","text":"..."},{"type":"definition","text":"..."},{"type":"example","text":"..."},{"type":"tip","text":"..."},{"type":"question","text":"..."},{"type":"table","rows":[["a","b","c"],["1","2","3"]]},{"type":"diagram","title":"...","mermaidType":"flowchart|mindmap|sequence|timeline|classDiagram|pie|graph","mermaidCode":"..."}]}',
      "Rules:",
      "- 6 to 14 blocks total; first block MUST be a heading with the title content.",
      "- Use the diagram block ONLY when the topic genuinely benefits from a drawing (flow, structure, relationships). Keep mermaidCode under 40 lines and syntactically valid.",
      `- Write in ${language === "ar" ? "Egyptian-flavored simple Arabic" : "English"}, keeping technical terms in English.`,
      "- Never invent fake exam questions or guarantee exam content.",
    ].join("\n"),
  );
  return parts.join("\n\n");
}

function sanitizeText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().slice(0, MAX_BLOCK_TEXT) : "";
  return text || null;
}

/**
 * Sanitize untrusted model output into a strict NotebookWriteResult.
 * Throws when the shape is unusable so the route can fail cleanly.
 */
export function validateNotebookWrite(raw: unknown): NotebookWriteResult {
  const root = expectObject(typeof raw === "string" ? extractJson(raw) : raw);
  rejectUnknownKeys(root, ["title", "blocks"]);
  let title = optionalString(root, "title", 160) ?? "";
  const rawBlocks = expectArray(root.blocks);

  const blocks: NotebookBlock[] = [];
  for (const entry of rawBlocks.slice(0, MAX_BLOCKS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const block = entry as Record<string, unknown>;
    const type = typeof block.type === "string" ? block.type : "";
    switch (type) {
      case "heading":
      case "text":
      case "bullet":
      case "definition":
      case "example":
      case "tip":
      case "question": {
        const text = sanitizeText(block.text);
        if (text) blocks.push({ type, text } as NotebookBlock);
        break;
      }
      case "table": {
        const rowsRaw = expectArray(block.rows).slice(0, MAX_TABLE_ROWS);
        const rows = rowsRaw
          .map((row) =>
            expectArray(row)
              .slice(0, MAX_TABLE_COLS)
              .map((cell) => String(cell ?? "").trim().slice(0, MAX_TABLE_CELL))
              .filter(Boolean),
          )
          .filter((row) => row.length > 1);
        if (rows.length >= 2) blocks.push({ type: "table", rows });
        break;
      }
      case "diagram": {
        const mermaidType = VALID_MERMAID.includes(block.mermaidType as NotebookDiagramType)
          ? (block.mermaidType as NotebookDiagramType)
          : "flowchart";
        const mermaidCode =
          typeof block.mermaidCode === "string"
            ? block.mermaidCode
                .split("\n")
                .slice(0, MAX_MERMAID_LINES)
                .join("\n")
                .trim()
                .slice(0, 4000)
            : "";
        const diagramTitle = optionalString(block as Record<string, unknown>, "title", 120) ?? "";
        if (mermaidCode) {
          blocks.push({ type: "diagram", title: diagramTitle, mermaidType, mermaidCode });
        }
        break;
      }
      default:
        break;
    }
  }

  if (blocks.length === 0) {
    throw new Error("الموديل رجّع ملف فاضي — جرّب تاني.");
  }
  if (!title) {
    const firstHeading = blocks.find((block) => block.type === "heading");
    title = firstHeading && "text" in firstHeading ? firstHeading.text.slice(0, 160) : "ملاحظات Magic";
  }
  return { title, blocks };
}

export async function generateNotebookWrite(
  options: NotebookWriteOptions,
  aiCompleteFn: (messages: Array<{ role: string; content: string }>) => Promise<string>,
): Promise<NotebookWriteResult> {
  const messages = [
    {
      role: "system",
      content:
        "أنت Magic — مدرّس خاص شاطر بيكتب في نوتة طالب. رجّع JSON صالح فقط بلا أي نص إضافي أو code fences.",
    },
    { role: "user", content: buildNotebookWritePrompt(options) },
  ];

  const raw = await aiCompleteFn(messages);
  return validateNotebookWrite(extractJson(raw));
}
