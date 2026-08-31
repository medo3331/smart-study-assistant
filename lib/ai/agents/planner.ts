/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "planner";

function detectLang(ctx: any): "ar" | "en" | string {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  if (l.startsWith("ar") || l === "arabic") return "ar";
  return "en";
}

export async function plannerAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: { agent: AgentId; prompt: string; context?: any; options?: Record<string, unknown> }) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const lang = detectLang(ctx);
    const role = ctx?.role || ctx?.preferences?.role || "student";
    const subject = ctx?.preferences?.subject || ctx?.field || "study";
    const level = ctx?.educationLevel || ctx?.preferences?.level || "intermediate";
    const streak = ctx?.streak || ctx?.preferences?.streak || 0;
    const xp = ctx?.xp || ctx?.preferences?.xp || 0;
    const progress = ctx?.studyProgress || ctx?.preferences?.progress || null;
    const goals = ctx?.goals || ctx?.preferences?.goals || null;

    const hasRealData = !!(progress || goals || (streak > 0) || (xp > 0));

    const intro = lang === "ar"
      ? `أنت Planner. دورك: تنظيم خطة (${role}, ${subject}, مستوى ${level}). ${hasRealData ? "نستخدم بيانات المستخدم الحقيقية (الاستمرارية، الأهداف، التقدم)." : "لا توجد بيانات كافية — نقدم خطة مرنة مع توضيح ما ينقص."}`
      : `You are Planner. Role: organize plan (${role}, ${subject}, level ${level}). ${hasRealData ? "Using real user data (streak, goals, progress)." : "No sufficient data — providing flexible plan and noting gaps."}`;

    const vision = ctx?.preferences?.imageInput || ctx?.preferences?.vision ? (lang === "ar" ? "\nملاحظة: صورة/ملف مرئي مرفق." : "\nNote: image/attachment provided.") : "";

    const prompt = `${intro}${vision}\n\nUser request:\n${input.prompt}\n\nContext summary:\n- role: ${role}\n- subject: ${subject}\n- level: ${level}\n- streak: ${streak}\n- xp: ${xp}\n- progress: ${progress ? JSON.stringify(progress) : "not provided"}\n- goals: ${goals ? JSON.stringify(goals) : "not provided"}\n\nInstructions:\n- Build realistic plan (no 12-hour impossible schedules).\n- If deadline/time missing, ask or offer flexible plan.\n- Priority order + estimated duration + reasoning.\n- If conflicting goals, note conflict and suggest order.\n- Multilingual (ar/en + generically).`;

    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!vision } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Planner: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Planner requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "PLANNER_ERROR", message: e?.message || String(e), retryable: true };
  }
}