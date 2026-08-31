/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
"use strict";
/**
 * Exam Solver Agent — real implementation.
 * Distinct from Study Tutor: solves questions step-by-step, supports vision input shape.
 * Uses AgentRouter/AiRouter only (no direct provider).
 * Multilingual (ar/en) auto-detected from AgentContext.language / preferences.
 * Returns AgentResult (ok true/false). Never invents answer or data.
 */

import type { AgentResult, AgentId } from "./types";
import { withImageUnderstanding } from "./references/image-understanding-extension";

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

  const visionNote = imageInput ? (lang === "ar" ? "\nملاحظة: هناك صورة/ملف مرفق — النص المستخرج من الصورة سيستخدم للحل." : "\nNote: image/attachment provided — extracted text from image will be used.") : "";

  return `${intro}\n\nQuestion (from user):\n${question}\n${visionNote}\n\nRules:\n- Understand before solving.\n- Identify subject/domain.\n- If information missing, request it explicitly.\n- Step-by-step reasoning.\n- Clear final answer.\n- No invented data.`;
}

export async function examSolverAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown>; imageInput?: File | unknown },
  runAgent?: (opts: any) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const visionInput = ctx.preferences?.imageInput ?? ctx.preferences?.vision ?? input.imageInput ?? undefined;

    // Phase 8: Shared Image Understanding Pipeline — OCR first, then text agent.
    // This removes the dependency on NVIDIA/OpenRouter vision for text-heavy images.
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
          const prompt = buildPrompt(ctx, input.prompt, visionInput);
          if (runAgent) {
            const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!visionInput } });
            return result.ok ? result : { ok: false, agent: AGENT_ID, code: "OCR_FAILED", message: (result as any)?.message || "Agent failed" + " | OCR also failed: " + imgRes.error, retryable: true };
          }
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
            return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Exam Solver: NVIDIA model unavailable (404). OCR fallback provided text; router should use Groq text model.", retryable: true };
          }
          return result;
        }
      } catch (e: any) {
        const prompt = buildPrompt(ctx, input.prompt, visionInput);
        if (runAgent) {
          const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision: !!visionInput } });
          return result;
        }
        return { ok: false, agent: AGENT_ID, code: "EXAM_SOLVER_ERROR", message: e?.message ?? String(e), retryable: true };
      }
    }

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