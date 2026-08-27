"use strict";
/**
 * Study Tutor Agent — real implementation (Phase 2).
 * Uses AgentRouter / AiRouter / Provider routing (no direct provider call).
 * Multilingual: replies in user language; respects academic language when appropriate.
 * Uses existing AgentContext (role/field/subject/level/language) + options for study fields.
 * Returns AgentResult (ok true/false) — never invents context data.
 */

import type { AgentResult, AgentId } from "./types";

const AGENT_ID: AgentId = "study_tutor";

function detectResponseLang(ctx: { language?: string; preferences?: Record<string, string> }): "ar" | "en" {
  const lang = (ctx.language || ctx.preferences?.language || "").toLowerCase();
  if (lang.startsWith("ar") || lang === "arabic") return "ar";
  return "en";
}

function buildPrompt(ctx: any, prompt: string): string {
  const lang = detectResponseLang(ctx);
  const role = ctx.role ?? ctx.preferences?.role ?? "student";
  const level = ctx.educationLevel ?? ctx.preferences?.level ?? "unknown";
  const subject = ctx.preferences?.subject ?? ctx.preferences?.field ?? "unknown";
  const lessons = ctx.preferences?.currentLesson ?? ctx.preferences?.currentLessonName ?? "current lesson";
  const progress = ctx.preferences?.progress ?? "unknown";
  const style = ctx.preferences?.learningStyle ?? "mixed";

  const intro = lang === "ar"
    ? `أنت Study Tutor. دورك: شرح الدرس للمستخدم (${role}, مستوى ${level}, مادة ${subject}). الدرس الحالي: ${lessons}. التقدم: ${progress}. أسلوب التعلم: ${style}. اشرح تدريجيًا بالعربية إذا كانت لغة المستخدم عربية، واحتفظ باللغة الإنجليزية للأجزاء الأكاديمية عند الحاجة.`
    : `You are Study Tutor. Role: explain lesson to user (${role}, level ${level}, subject ${subject}). Current lesson: ${lessons}. Progress: ${progress}. Learning style: ${style}. Explain step-by-step in the user's language; keep academic terms in English when appropriate.`;

  return `${intro}\n\nUser asks: ${prompt}\n\nInstructions:\n- Answer only from provided context / known study material.\n- Do not invent user data or lesson content.\n- Use the user's language; maintain academic language for the subject when needed.`;
}

export async function studyTutorAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  // Delegate to AgentRouter / AiRouter using existing routing (tutor -> nvidia, fallback openrouter/groq)
  // This agent itself does NOT call a provider directly — provider selection is router's job.
  try {
    const ctx = input.context ?? {};
    const prompt = buildPrompt(ctx, input.prompt);

    // Routing: use existing agent layer (AgentRouter -> AiRouter -> provider)
    // We pass the constructed prompt into the router via a standard agent-run call.
    const agentOptions = {
      agent: AGENT_ID,
      prompt,
      context: ctx,
      options: { ...input.options, agent: AGENT_ID },
    };

    if (runAgent) {
      const result = await runAgent(agentOptions);
      // If NVIDIA DeepSeek returns MODEL_404, rely on router fallback (openrouter/groq) — do not treat as success.
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Study Tutor: NVIDIA deepseek-v4-flash unavailable (404). Router should fallback to OpenRouter/Groq.", retryable: true };
      }
      return result;
    }

    // Fallback when router not injected: return structured result indicating router dependency.
    return {
      ok: false,
      agent: AGENT_ID,
      code: "ROUTER_REQUIRED",
      message: "Study Tutor requires AgentRouter / AiRouter to select provider (NVIDIA first, fallback OpenRouter/Groq). Direct provider call disabled by design.",
      retryable: true,
    };
  } catch (e: any) {
    return {
      ok: false,
      agent: AGENT_ID,
      code: "STUDY_TUTOR_ERROR",
      message: e?.message ?? String(e),
      retryable: true,
    };
  }
}
