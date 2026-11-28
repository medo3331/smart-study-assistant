// lib/agent/action-runner.ts
//
// منفّذ أدوات Magic Agent — بياخد الـ actions المتحقق منها وينفّذها فعليًا
// بالخدمات الموجودة في المشروع:
//   web_search → lib/ai/web-search (Tavily)
//   diagram    → lib/ai/diagram-generator (Mermaid عبر الموديل)
//   image      → lib/ai/image-generator (OpenRouter/Pollinations)
//   file       → Markdown مباشرة أو lib/ai/file-generator (PDF/DOCX/PPTX)
//   quiz       → validation بس (الأسئلة جاية من الموديل — العرض تفاعلي في الواجهة)
//
// ⚠️ Server-only — مستورد في app/api/unified-ai/route.ts فقط.

import { generateDiagram } from "@/lib/ai/diagram-generator";
import { generateEducationalImage } from "@/lib/ai/image-generator";
import { generateFile } from "@/lib/ai/file-generator";
import { webSearch } from "@/lib/ai/web-search";
import {
  MAGIC_ACTION_LIMITS,
  type AddTaskAction,
  type AgentArtifact,
  type DiagramAction,
  type FileAction,
  type ImageAction,
  type ListTasksAction,
  type MagicAction,
  type QuizAction,
  type WebSearchAction,
} from "./actions";

export type { AgentArtifact } from "./actions";

/* -------------------------------------------------------------------------- */
/* منفذ المهام الشخصية — بيتنفّذ ضد planner_goals من السيرفر (route.ts)          */
/* -------------------------------------------------------------------------- */

export interface AgentTasksPort {
  addTask(input: { title: string; dueDate?: string; priority?: number }): Promise<{ ok: boolean; id?: string; error?: string }>;
  listTasks(): Promise<{ id: string; title: string; dueDate: string | null; priority: number }[]>;
}

/* -------------------------------------------------------------------------- */
/* التنفيذ                                                                     */
/* -------------------------------------------------------------------------- */

export interface AgentActionRunnerContext {
  subject?: string | null;
  stage?: string | null;
  /** نداء موديل واحد لمولّد المخططات (Mermaid). */
  aiComplete: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  /** منفذ المهام الشخصية — موجود للطالب المسجّل بس، وبدونه أدوات المهام ترجّع خطأ لطيف. */
  tasks?: AgentTasksPort;
}

async function runWebSearch(action: WebSearchAction): Promise<AgentArtifact> {
  const outcome = await webSearch(action.query, { deep: true });
  if (!outcome.ok) {
    return {
      kind: "web_results",
      title: `بحث: ${action.query}`,
      query: action.query,
      results: [],
    };
  }
  return {
    kind: "web_results",
    title: `بحث: ${action.query}`,
    query: action.query,
    answer: outcome.answer,
    results: outcome.results,
  };
}

async function runDiagram(action: DiagramAction, ctx: AgentActionRunnerContext): Promise<AgentArtifact> {
  try {
    const result = await generateDiagram(
      {
        topic: action.topic,
        type: action.type,
        detail: action.detail,
        subject: ctx.subject ?? undefined,
        stage: ctx.stage ?? undefined,
      },
      ctx.aiComplete,
    );
    return {
      kind: "diagram",
      title: result.title || action.topic,
      mermaidCode: result.mermaidCode,
      diagramType: result.type,
    };
  } catch (e) {
    return { kind: "diagram", title: action.topic, mermaidCode: "", diagramType: action.type, error: (e as Error).message };
  }
}

async function runImage(action: ImageAction): Promise<AgentArtifact> {
  try {
    const result = await generateEducationalImage({ prompt: action.prompt });
    return { kind: "image", title: action.prompt.slice(0, 80), url: result.url };
  } catch (e) {
    return { kind: "image", title: action.prompt.slice(0, 80), url: "", error: (e as Error).message };
  }
}

function sectionsToMarkdown(title: string, sections: FileAction["sections"]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const s of sections) {
    if (s.heading) lines.push(`## ${s.heading}`, "");
    if (s.body) lines.push(s.body, "");
  }
  return lines.join("\n").trim();
}

async function runFile(action: FileAction): Promise<AgentArtifact> {
  const base = { kind: "file" as const, title: action.title, format: action.format, sections: action.sections };
  try {
    if (action.format === "md") {
      const content = sectionsToMarkdown(action.title, action.sections);
      return { ...base, content, filename: `${action.title}.md` };
    }
    const result = await generateFile({
      type: action.format,
      content: "report",
      title: action.title,
      data: { sections: action.sections, theme: action.theme },
    });
    if (result.size > MAGIC_ACTION_LIMITS.maxFileBytes) {
      return { ...base, error: "الملف اكبر من الحد المسموح — جرب تقسمه لأجزاء أصغر." };
    }
    return {
      ...base,
      dataUrl: `data:${result.mimeType};base64,${result.buffer.toString("base64")}`,
      filename: result.filename,
      size: result.size,
    };
  } catch (e) {
    return { ...base, error: (e as Error).message || "فشل توليد الملف." };
  }
}

function runQuiz(action: QuizAction): AgentArtifact {
  return {
    kind: "quiz",
    title: action.title,
    subject: action.subject,
    questions: action.questions,
  };
}

async function runAddTask(action: AddTaskAction, ctx: AgentActionRunnerContext): Promise<AgentArtifact> {
  const base = { kind: "task_saved" as const, title: action.title, dueDate: action.dueDate, priority: action.priority };
  if (!ctx.tasks) {
    return { ...base, error: "المهام الشخصية متاحة للطالب المسجّل بس." };
  }
  try {
    const result = await ctx.tasks.addTask({ title: action.title, dueDate: action.dueDate, priority: action.priority });
    if (!result.ok) return { ...base, error: result.error || "فشل تسجيل المهمة." };
    return base;
  } catch (e) {
    return { ...base, error: (e as Error).message || "فشل تسجيل المهمة." };
  }
}

async function runListTasks(_action: ListTasksAction, ctx: AgentActionRunnerContext): Promise<AgentArtifact> {
  if (!ctx.tasks) {
    return { kind: "task_list", tasks: [] };
  }
  try {
    const tasks = await ctx.tasks.listTasks();
    return { kind: "task_list", tasks };
  } catch (e) {
    console.warn("[agent-actions] list_tasks failed:", e);
    return { kind: "task_list", tasks: [] };
  }
}

/**
 * تنفيذ كل الأدوات المطلوبة — كل أداة في try/catch مستقل، وفشلها ما يوقفش الباقي.
 */
export async function runAgentActions(
  actions: MagicAction[],
  ctx: AgentActionRunnerContext,
): Promise<AgentArtifact[]> {
  const artifacts: AgentArtifact[] = [];
  for (const action of actions) {
    try {
      if (action.tool === "web_search") artifacts.push(await runWebSearch(action));
      else if (action.tool === "diagram") artifacts.push(await runDiagram(action, ctx));
      else if (action.tool === "image") artifacts.push(await runImage(action));
      else if (action.tool === "file") artifacts.push(await runFile(action));
      else if (action.tool === "quiz") artifacts.push(runQuiz(action));
      else if (action.tool === "add_task") artifacts.push(await runAddTask(action, ctx));
      else if (action.tool === "list_tasks") artifacts.push(await runListTasks(action, ctx));
    } catch (e) {
      console.warn("[agent-actions] tool execution failed:", action.tool, e);
    }
  }
  return artifacts;
}
