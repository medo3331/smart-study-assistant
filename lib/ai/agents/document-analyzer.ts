"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "document_analyzer";

function detectLang(ctx: any): "ar" | "en" {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  return l.startsWith("ar") || l === "arabic" ? "ar" : "en";
}

function buildPrompt(ctx: any, task: string, content?: string, imageInput?: unknown): string {
  const lang = detectLang(ctx);
  const subject = ctx?.preferences?.subject || ctx?.field || "document";
  const intro = lang === "ar"
    ? `أنت Document Analyzer. دورك: فهم المحتوى، تلخيصه، شرحه، استخراج النقاط الرئيسية، توليد أسئلة، أو كتابة ملاحظات. تعتمد فقط على المحتوى المعطى — لا تخترع. لغة المستخدم: ${lang}. المادة: ${subject}.` + (content ? `\nالمحتوى (جزء): ${content.slice(0,1200)}` : "")
    : `You are Document Analyzer. Role: understand content, summarize, explain, extract key points, generate questions, or write notes. Use ONLY the provided content — do not invent. User language: ${lang}. Subject: ${subject}.` + (content ? `\nContent (partial): ${content.slice(0,1200)}` : "");
  const vision = imageInput ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرئي مرفق." : "\nNote: image/attachment provided.") : "";
  return `${intro}\n${vision}\n\nTask request:\n${task}\n\nRules:\n- Only use provided document/content.\n- If content is missing/unclear, ask for it.\n- Support summarization, explanation, extraction, questions, notes.\n- Multilingual (Arabic/English) per user.\n- Return structured result usable by Study Tutor / Quiz Generator / Exam Solver.`;
}

export async function documentAnalyzerAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const content = ctx.preferences?.content || ctx.preferences?.documentText || ctx.preferences?.fileText || ctx.preferences?.pdfText || "";
    const imageInput = ctx.preferences?.imageInput || ctx.preferences?.vision || undefined;
    const task = input.prompt;
    const prompt = buildPrompt(ctx, task, typeof content === "string" ? content : undefined, imageInput);
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!imageInput } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Document Analyzer: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Document Analyzer requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "DOCUMENT_ANALYZER_ERROR", message: e?.message || String(e), retryable: true };
  }
}
