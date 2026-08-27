"use strict";
/**
 * Exam Solver Agent — real implementation.
 * Distinct from Study Tutor: solves questions step-by-step, supports vision input shape.
 * Uses AgentRouter/AiRouter only (no direct provider).
 * Multilingual (ar/en) auto-detected from AgentContext.language / preferences.
 * Returns AgentResult (ok true/false). Never invents answer or data.
 */

import type { AgentResult, AgentId } from "./types";

const AGENT_ID: AgentId = "exam_solver";

function detectLang(ctx: any): "ar" | "en" {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  return (l.startsWith("ar") || l === "arabic") ? "ar" : "en";
}

function buildPrompt(ctx: any, question: string, imageInput?: unknown): string {
  const lang = detectLang(ctx);
  const subject = ctx?.preferences?.subject ?? ctx?.field ?? "unknown";
  const role = ctx?.role ?? "student";
  const level = ctx?.educationLevel ?? ctx?.preferences?.level ?? "unknown";

  const intro = lang === "ar"
    ? `أنت Exam Solver. دورك: حل سؤال الامتحان للمستخدم (${role}, ${subject}, مستوى ${level}). افهم السؤال أولاً، حدّد المادة، استخرج المطلوب، ثم حل خطوة بخطوة. إذا البيانات ناقصة، اطلبها بدل الاختراع. الإجابة النهائية واضحة. يدعم أنواع: الرياضيات، الفيزياء، الكيمياء، البرمجة، الإشارات، أسئلة أكاديمية.`
    : `You are Exam Solver. Role: solve exam questions for (${role}, ${subject}, level ${level}). Understand the question first, identify subject, extract requirements, solve step-by-step. If data missing, ask for it — do not invent. Final answer clear. Supports: Math, Physics, Chemistry, Programming, Signals, Academic.`;

  const visionNote = imageInput ? (lang === "ar" ? "\nملاحظة: هناك صورة/ملف مرفق — حل بناءً على ما فيها إذا كان واضحًا." : "\nNote: image/attachment provided — solve based on visible content if clear.") : "";

  return `${intro}\n\nQuestion (from user):\n${question}\n${visionNote}\n\nRules:\n- Understand before solving.\n- Identify subject/domain.\n- If information missing, request it explicitly.\n- Step-by-step reasoning.\n- Clear final answer.\n- No invented data.`;
}

export async function examSolverAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const visionInput = ctx.preferences?.imageInput ?? ctx.preferences?.vision ?? undefined;
    const prompt = buildPrompt(ctx, input.prompt, visionInput);

    if (runAgent) {
      const result = await runAgent({
        agent: AGENT_ID,
        prompt,
        context: ctx,
        options: { ...input.options, agent: AGENT_ID, vision: !!visionInput },
      });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Exam Solver: NVIDIA model unavailable (404). Router should fallback to OpenRouter/Groq.", retryable: true };
      }
      return result;
    }

    return {
      ok: false,
      agent: AGENT_ID,
      code: "ROUTER_REQUIRED",
      message: "Exam Solver requires AgentRouter / AiRouter to select provider (NVIDIA first, fallback OpenRouter/Groq). Direct provider call disabled by design.",
      retryable: true,
    };
  } catch (e: any) {
    return {
      ok: false,
      agent: AGENT_ID,
      code: "EXAM_SOLVER_ERROR",
      message: e?.message ?? String(e),
      retryable: true,
    };
  }
}
