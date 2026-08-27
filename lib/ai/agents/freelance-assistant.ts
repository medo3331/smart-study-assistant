"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "freelance";

function detectLang(ctx: any): "ar" | "en" | string {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  if (l.startsWith("ar") || l === "arabic") return "ar";
  return "en";
}

export async function freelanceAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: { agent: AgentId; prompt: string; context?: any; options?: Record<string, unknown> }) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const lang = detectLang(ctx);
    const role = ctx?.role || ctx?.preferences?.role || "freelancer";
    const hasContext = !!(ctx?.preferences?.goals || ctx?.preferences?.progress || ctx?.preferences?.streak !== undefined || ctx?.preferences?.subject);
    const intro = lang === "ar"
      ? `أنت Freelance Assistant. دورك: دعم المهني الحر (${role}). ${hasContext ? "نستخدم بيانات السياق (الأهداف، التقدم)." : "لا بيانات كافية — نقدم خطة مرنة ونطلب التفاصيل."} لا تخترع وظائف أو رواتب أو شركات.`
      : `You are Freelance Assistant. Role: support freelancer (${role}). ${hasContext ? "Using real context (goals, progress)." : "Not enough data — flexible plan, ask for details."} Do NOT invent jobs, salaries, or companies.`;
    const vision = !!(ctx.preferences?.imageInput || ctx.preferences?.vision);
    const prompt = `${intro}\n\nUser request (${lang}):\n${input.prompt}\n\nInstructions:\n- Help with: niche selection, portfolio, skills, pricing, project management.\n- No invented credentials / job listings / sources.\n- Ask if missing deadline/goal/time.\n- Multilingual (ar/en + generically).`;
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Freelance Assistant: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Freelance Assistant requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "FREELANCE_ERROR", message: e?.message || String(e), retryable: true };
  }
}
