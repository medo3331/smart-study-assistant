"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "research";

function detectLang(ctx: any): "ar" | "en" {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  return l.startsWith("ar") || l === "arabic" ? "ar" : "en";
}

export async function researchAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const lang = detectLang(ctx);
    const query = input.prompt;
    const sources = ctx.preferences?.sources || ctx.preferences?.documents || [];
    const hasSources = Array.isArray(sources) && sources.length > 0;

    const intro = lang === "ar"
      ? `أنت Research Assistant. دورك: جمع وتحليل معلومات من السياق المعطى فقط. لا تخترع مصادر أو URLs. اميز بين حقائق (facts)، ادعاءات (claims)، أعراض (evidence)، وعدم اليقين (uncertainty). إذا لم تكن البيانات كافية، اطلبها صراحة.`
      : `You are Research Assistant. Role: gather and analyze information from provided context only. Do NOT invent sources/URLs. Distinguish facts, claims, evidence, uncertainty. If data insufficient, ask clearly.`;

    const sourceNote = hasSources
      ? (lang === "ar" ? `\nالمصادر المتاحة (${sources.length}): ${sources.slice(0,3).join("، ")}` : `\nAvailable sources (${sources.length}): ${sources.slice(0,3).join(", ")}`)
      : (lang === "ar" ? `\nلا توجد مصادر خارجية متاحة حالياً. بناء على السياق المعطى فقط.` : `\nNo external sources available now; based on provided context only.`);

    const vision = ctx.preferences?.imageInput || ctx.preferences?.vision ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرئي مرفق (قد يكون مصدرًا)." : "\nNote: image/attachment provided (may be source).") : "";

    const prompt = `${intro}\n${sourceNote}\n${vision}\n\nUser query:\n${query}\n\nInstructions:\n- Use ONLY the provided context / sources.\n- If content missing/unclear, request explicitly; do not fabricate URLs or citations.\n- Mark facts vs claims vs uncertainty clearly.\n- Structure output: summary + key points + sources used + gaps + recommendations for Study Tutor / Quiz / Exam Solver.\n- Multilingual (ar/en) per user.`;

    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!vision } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Research Assistant: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Research Assistant requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "RESEARCH_ERROR", message: e?.message || String(e), retryable: true };
  }
}
