"use strict";
import type { AgentResult, AgentId } from "./types";
import { withImageUnderstanding } from "./references/image-understanding-extension";
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
  input: { prompt: string; context?: any; options?: Record<string, unknown>; imageInput?: File | unknown },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const visionInput = ctx.preferences?.imageInput ?? ctx.preferences?.vision ?? input.imageInput ?? undefined;
    // Phase 8: Image Understanding Pipeline (shared OCR → text agent)
    if (visionInput) {
      try {
        const imgRes = await withImageUnderstanding({ prompt: input.prompt, context: ctx, options: input.options, imageInput: visionInput as File }, async (opts: any) => {
          if (runAgent) return await runAgent({ ...opts, agent: AGENT_ID, vision: false });
          return { ok: false, message: "Router required" };
        });
        if (!imgRes.ok && imgRes.error) {
          const prompt = buildPrompt(ctx, input.prompt, visionInput);
          if (runAgent) { const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!visionInput } }); return result; }
          return { ok: false, agent: AGENT_ID, code: "OCR_FAILED", message: imgRes.error, retryable: true };
        }
        if (imgRes.combinedPrompt && runAgent) {
          const result = await runAgent({ agent: AGENT_ID, prompt: imgRes.combinedPrompt, context: { ...ctx, imageUnderstood: true, ocrText: imgRes.imageResult?.text }, options: { ...input.options, agent: AGENT_ID, vision: false, imageInput: true } });
          if (!result.ok && (result as any)?.code === "MODEL_404") return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Agent: NVIDIA unavailable. OCR text available; use Groq.", retryable: true };
          return result.ok ? result : { ...result, agent: AGENT_ID };
        }
      } catch (e: any) {
        const prompt = buildPrompt(ctx, input.prompt, visionInput);
        if (runAgent) { const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!visionInput } }); return result; }
        return { ok: false, agent: AGENT_ID, code: "AGENT_ERROR", message: e?.message || String(e), retryable: true };
      }
    }

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
