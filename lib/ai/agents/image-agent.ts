"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "image";

function detectLang(ctx: any): "ar" | "en" | string {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  if (l.startsWith("ar") || l === "arabic") return "ar";
  return "en";
}

export async function imageAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: { agent: AgentId; prompt: string; context?: any; options?: Record<string, unknown> }) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const lang = detectLang(ctx);
    const mode = (input.options?.mode as string) || (ctx?.preferences?.mode as string) || "general";
    const vision = !!(ctx.preferences?.imageInput || ctx.preferences?.vision);
    const intro = lang === "ar"
      ? `أنت Image Agent. دورك: مساعدة في الفهم/تحليل/إعداد طلبات الصور التعليمية. لا تولد صورة مباشرة إلا إذا كان provider يدعمها فعليًا عبر AgentRouter. لا تخترع صورًا أو URLs.`
      : `You are Image Agent. Role: help with image understanding, analysis, and image-generation request preparation. Do NOT claim image generation unless provider actually supports it via AgentRouter. Never invent images/URLs.`;
    const prompt = `${intro}\n\nMode: ${mode}\nUser request (${lang}):\n${input.prompt}\n${vision ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرئي مرفق." : "\nNote: image/attachment provided.") : ""}\n\nInstructions:\n- If analyzing an image: describe what is visible; do not invent details beyond what can be seen.\n- If preparing a generation request: produce structured prompt (no fabricated image).\n- If mode is generate/edit/diagram/educational: prepare request; do not claim completion unless provider responds with actual image data.\n- Multilingual (ar/en + generically).\n- If provider/model unavailable: return structured failure.`;
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision, mode } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Image Agent: NVIDIA model unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Image Agent requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "IMAGE_ERROR", message: e?.message || String(e), retryable: true };
  }
}
