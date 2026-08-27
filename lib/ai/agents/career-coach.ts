"use strict";
/**
 * Career Coach Agent — real implementation.
 * Uses AgentRouter/AiRouter only. No direct provider.
 * Supports student, graduate, freelancer roles.
 * Multilingual (ar/en + generically); separates user lang / target lang.
 * No invented experience/credentials/sources/job listings.
 * Uses AgentResult (existing type).
 */
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "career";

function detectLang(ctx: any): "ar" | "en" | string {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  if (l.startsWith("ar") || l === "arabic") return "ar";
  return "en";
}

export async function careerCoachAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: { agent: AgentId; prompt: string; context?: any; options?: Record<string, unknown> }) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const lang = detectLang(ctx);
    const role = ctx?.role || ctx?.preferences?.role || "grad";
    const field = ctx?.preferences?.field || ctx?.preferences?.subject || "general";
    const level = ctx?.educationLevel || ctx?.preferences?.level || "intermediate";
    const hasRealContext =!!(ctx?.preferences?.goals || ctx?.preferences?.streak !== undefined || ctx?.preferences?.progress || ctx?.preferences?.subject);
    const vision = !!(ctx.preferences?.imageInput || ctx.preferences?.vision);

    const intro = lang === "ar"
      ? `أنت Career Coach. دورك: توجيه مهني (${role}: ${field}, مستوى ${level}). ${hasRealContext ? "نستخدم بيانات السياق (الأهداف، التقدم، الدور)." : "لا توجد بيانات كافية — نقدم خطة مرنة ونطلب التفاصيل."} لا تخترع خبرات أو شهادات أو وظائف غير موجودة.`
      : `You are Career Coach. Role: career guidance (${role}: ${field}, level ${level}). ${hasRealContext ? "Using real context (goals, progress, role)." : "Not enough data — providing flexible plan and asking for details."} Do NOT invent experience, credentials, or job listings.`;

    const prompt = `${intro}\n\nUser request (${lang}):\n${input.prompt}\n\nContext (only if real):\n- role: ${role}\n- field: ${field}\n- level: ${level}\n- hasGoals: ${hasRealContext}\n\nInstructions:\n- Suggest paths only from provided context / user's stated goals.\n- If missing deadline/time/skills, ask clearly — do not invent.\n- For student: study → internship → job readiness.\n- For graduate: career path → skills → interview → CV.\n- For freelancer: niche → portfolio → services → pricing.\n- No fake URLs, salaries, or company names.\n- Multilingual (ar/en + generically).\n- If provider fails, return structured failure.`;

    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Career Coach: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Career Coach requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "CAREER_ERROR", message: e?.message || String(e), retryable: true };
  }
}
