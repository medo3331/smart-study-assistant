"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "quiz_generator";

function detectLang(ctx: any): "ar" | "en" {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  return l.startsWith("ar") || l === "arabic" ? "ar" : "en";
}

function buildPrompt(ctx: any, request: string, imageInput?: unknown): string {
  const lang = detectLang(ctx);
  const subject = ctx?.preferences?.subject || ctx?.field || "unknown";
  const role = ctx?.role || "student";
  const intro = lang === "ar"
    ? `أنت Quiz Generator. دورك: توليد أسئلة اختبار للمستخدم (${role}, ${subject}). استخدم سياق الدرس فقط. لا تخترع. تدعم: اختيار من متعدد، صح/خطأ، تعبئة فراغ، إجابة قصيرة. إذا كانت الصورة/الملف موجودًا، استخدمه كمصدر.`
    : `You are Quiz Generator. Role: generate exam questions (${role}, ${subject}). Use lesson context only — do not invent. Types: MCQ, True/False, Fill, Short. If image/file attached, use as source.`;
  const vision = imageInput ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرفق." : "\nNote: image/attachment provided.") : "";
  return `${intro}\n\nUser request:\n${request}\n${vision}\n\nRules:\n- Only from provided context / lesson data.\n- No invented questions or answers.\n- If info missing, ask rather than fabricate.\n- Return structured quiz output (questions + answers + type markers).\n- Arabic/English according to user language.`;
}

export async function quizGeneratorAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const vision = ctx.preferences?.imageInput ?? ctx.preferences?.vision ?? undefined;
    const prompt = buildPrompt(ctx, input.prompt, vision);
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!vision } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Quiz Generator: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Quiz Generator requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "QUIZ_GENERATOR_ERROR", message: e?.message || String(e), retryable: true };
  }
}
