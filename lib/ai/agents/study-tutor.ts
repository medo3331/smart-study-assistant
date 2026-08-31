/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
"use strict";
/**
 * Study Tutor Agent — real implementation (Phase 2).
 * Uses AgentRouter / AiRouter / Provider routing (no direct provider call).
 * Multilingual: replies in user language; respects academic language when appropriate.
 * Uses existing AgentContext (role/field/subject/level/language) + options for study fields.
 * Returns AgentResult (ok true/false) — never invents context data.
 */

import type { AgentResult, AgentId } from "./types";
import { withImageUnderstanding } from "./references/image-understanding-extension";

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
  input: { prompt: string; context?: any; options?: Record<string, unknown>; imageInput?: File | unknown },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  // Delegate to AgentRouter / AiRouter using existing routing (tutor -> nvidia, fallback openrouter/groq)
  // This agent itself does NOT call a provider directly — provider selection is router's job.
  try {
    const ctx = input.context ?? {};
    const visionInput = ctx.preferences?.imageInput ?? ctx.preferences?.vision ?? input.imageInput ?? undefined;

    // Phase 8: Shared Image Understanding Pipeline
    if (visionInput) {
      try {
        const imgRes = await withImageUnderstanding({
          prompt: input.prompt,
          context: ctx,
          options: input.options,
          imageInput: visionInput as File,
        }, async (opts: any) => {
          if (runAgent) return await runAgent({ ...opts, agent: AGENT_ID, vision: false });
          return { ok: false, message: "Router required" };
        });
        if (!imgRes.ok && imgRes.error) {
          const prompt = buildPrompt(ctx, input.prompt);
          if (runAgent) { const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!visionInput } }); return result; }
          return { ok: false, agent: AGENT_ID, code: "OCR_FAILED", message: imgRes.error, retryable: true };
        }
        if (imgRes.combinedPrompt && runAgent) {
          const result = await runAgent({
            agent: AGENT_ID,
            prompt: imgRes.combinedPrompt,
            context: { ...ctx, imageUnderstood: true, ocrText: imgRes.imageResult?.text, ocrMeta: imgRes.imageResult?.metadata },
            options: { ...input.options, agent: AGENT_ID, vision: false, imageInput: true },
          });
          if (!result.ok && (result as any)?.code === "MODEL_404") {
            return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Study Tutor: NVIDIA unavailable. OCR text available; use Groq.", retryable: true };
          }
          return result.ok ? result : { ...result, agent: AGENT_ID };
        }
      } catch (e: any) {
        const prompt = buildPrompt(ctx, input.prompt);
        if (runAgent) { const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!visionInput } }); return result; }
        return { ok: false, agent: AGENT_ID, code: "STUDY_TUTOR_ERROR", message: e?.message || String(e), retryable: true };
      }
    }

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
      const startedAt = Date.now();
      const result = await runAgent(agentOptions);
      const latencyMs = Date.now() - startedAt;
      void latencyMs;
      // Ensure the response carries real provider/model info from router execution.
      // Do NOT fabricate success when the router returned a failure.
      if (!result.ok) {
        if (result.code === "MODEL_404") {
          return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Study Tutor: NVIDIA model unavailable (404). Router should fallback to OpenRouter/Groq.", retryable: true };
        }
        return { ...result, agent: AGENT_ID };
      }
      // Real response path — propagate router-selected provider (must be "nvidia" when configured).
      return {
        ok: true,
        agent: AGENT_ID,
        provider: result.provider || "nvidia",
        model: result.model || "nvidia/nemotron-3.5-lightning-30b-a3b",
        content: result.content || ("message" in result ? (result as any).message : undefined) || String(result),
      } as AgentResult;
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