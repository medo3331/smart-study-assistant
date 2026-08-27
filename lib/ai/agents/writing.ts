"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "writing";

function detectLang(ctx: any): "ar" | "en" {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  return l.startsWith("ar") || l === "arabic" ? "ar" : "en";
}

export async function writingAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const lang = detectLang(ctx);
    const topic = ctx?.preferences?.subject || ctx?.preferences?.topic || "writing";
    const intro = lang === "ar"
      ? `أنت Writing Assistant. دورك: مساعدة المستخدم في الكتابة — صياغة، مراجعة، تحسين أسلوب، أو توليد مسودة. لا تخترع حقائق. تعتمد فقط على السياق المعطى. لغة المستخدم: ${lang}. الموضوع: ${topic}.`
      : `You are Writing Assistant. Role: help with writing — drafting, reviewing, improving style, or generating outlines. Use ONLY provided context. User language: ${lang}. Topic: ${topic}.`;
    const vision = ctx.preferences?.imageInput || ctx.preferences?.vision ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرئي مرفق (يمكن أن يكون مصدرًا)." : "\nNote: image/attachment provided (may be source).") : "";
    const prompt = `${intro}\n\nUser request:\n${input.prompt}\n${vision}\n\nInstructions:\n- Use only provided context / notes.\n- If source missing/unclear, ask — do not invent citations or claims.\n- Support drafting, reviewing, outlining, style improvement.\n- Multilingual (ar/en) per user.`;
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!vision } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Writing Assistant: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Writing Assistant requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "WRITING_ERROR", message: e?.message || String(e), retryable: true };
  }
}
