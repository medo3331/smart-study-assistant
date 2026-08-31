"use strict";
import type { AgentResult, AgentId, AgentContext } from "./types";
import { withImageUnderstanding } from "./references/image-understanding-extension";
const AGENT_ID: AgentId = "document_analyzer";

type LooseContext = Omit<AgentContext, "preferences"> & { preferences?: Record<string, unknown> } & Record<string, unknown>;

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e);
}

function detectLang(ctx: LooseContext | undefined): "ar" | "en" {
  const prefs = ctx?.preferences as Record<string, unknown> | undefined;
  const raw = ((ctx?.language as string | undefined) ?? (prefs?.language as string | undefined) ?? "").toLowerCase();
  return raw.startsWith("ar") || raw === "arabic" ? "ar" : "en";
}

function buildPrompt(ctx: LooseContext | undefined, task: string, content?: string, imageInput?: unknown): string {
  const lang = detectLang(ctx);
  const prefs = ctx?.preferences as Record<string, unknown> | undefined;
  const subject = (prefs?.subject as string | undefined) ?? ((ctx as Record<string, unknown> | undefined)?.field as string | undefined) ?? "document";
  const intro = lang === "ar"
    ? `أنت Document Analyzer. دورك: فهم المحتوى، تلخيصه، شرحه، استخراج النقاط الرئيسية، توليد أسئلة، أو كتابة ملاحظات. تعتمد فقط على المحتوى المعطى — لا تخترع. لغة المستخدم: ${lang}. المادة: ${subject}.` + (content ? `\nالمحتوى (جزء): ${content.slice(0,1200)}` : "")
    : `You are Document Analyzer. Role: understand content, summarize, explain, extract key points, generate questions, or write notes. Use ONLY the provided content — do not invent. User language: ${lang}. Subject: ${subject}.` + (content ? `\nContent (partial): ${content.slice(0,1200)}` : "");
  const vision = imageInput ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرئي مرفق." : "\nNote: image/attachment provided.") : "";
  return `${intro}\n${vision}\n\nTask request:\n${task}\n\nRules:\n- Only use provided document/content.\n- If content is missing/unclear, ask for it.\n- Support summarization, explanation, extraction, questions, notes.\n- Multilingual (Arabic/English) per user.\n- Return structured result usable by Study Tutor / Quiz Generator / Exam Solver.`;
}

type RunAgentOpts = { agent: AgentId; prompt: string; context?: LooseContext; options?: Record<string, unknown> } & Record<string, unknown>;

export async function documentAnalyzerAgent(
  input: { prompt: string; context?: LooseContext; options?: Record<string, unknown>; imageInput?: File | unknown },
  runAgent?: (opts: RunAgentOpts) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = (input.context ?? {}) as LooseContext;
    const prefs = (ctx.preferences ?? {}) as Record<string, unknown>;
    const content = (prefs.content as string | undefined) ?? (prefs.documentText as string | undefined) ?? (prefs.fileText as string | undefined) ?? (prefs.pdfText as string | undefined) ?? "";
    const task = input.prompt;
    const imageInput = (prefs.imageInput as unknown) ?? (prefs.vision as unknown) ?? input.imageInput ?? undefined;

    // Phase 8: Shared Image Understanding Pipeline
    if (imageInput) {
      try {
        const imgRes = await withImageUnderstanding({ prompt: task, context: ctx as unknown as Record<string, unknown>, options: input.options, imageInput: imageInput as File }, async (opts: Record<string, unknown>) => {
          if (runAgent) {
            const o = opts as { prompt: string; context?: LooseContext; options?: Record<string, unknown> };
            return await runAgent({ agent: AGENT_ID, prompt: o.prompt, context: o.context, options: { ...(o.options ?? {}), vision: false } } as RunAgentOpts);
          }
          return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Router required", retryable: true } as AgentResult;
        });
        if (!imgRes.ok && imgRes.error) {
          const prompt = buildPrompt(ctx, task, content, imageInput);
          if (runAgent) { const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!imageInput } } as RunAgentOpts); return result; }
          return { ok: false, agent: AGENT_ID, code: "OCR_FAILED", message: imgRes.error, retryable: true };
        }
        if (imgRes.combinedPrompt && runAgent) {
          const result = await runAgent({ agent: AGENT_ID, prompt: imgRes.combinedPrompt, context: { ...ctx, imageUnderstood: true, ocrText: imgRes.imageResult?.text } as LooseContext, options: { ...input.options, agent: AGENT_ID, vision: false, imageInput: true } } as RunAgentOpts);
          if (!result.ok && result.code === "MODEL_404") return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Document Analyzer: NVIDIA unavailable. OCR text available; use Groq text.", retryable: true };
          return result;
        }
      } catch (e: unknown) {
        const prompt = buildPrompt(ctx, task, content, imageInput);
        if (runAgent) { const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!imageInput } } as RunAgentOpts); return result; }
        return { ok: false, agent: AGENT_ID, code: "DOCUMENT_ANALYZER_ERROR", message: getErrorMessage(e), retryable: true };
      }
    }

    const prompt = buildPrompt(ctx, task, typeof content === "string" ? content : undefined, imageInput);
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!imageInput } } as RunAgentOpts);
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Document Analyzer: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Document Analyzer requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: unknown) {
    return { ok: false, agent: AGENT_ID, code: "DOCUMENT_ANALYZER_ERROR", message: getErrorMessage(e), retryable: true };
  }
}
