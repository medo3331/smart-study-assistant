"use strict";
import type { AgentResult, AgentId } from "./types";
const AGENT_ID: AgentId = "language"; // matches registry AGENT_IDS

type LangCode = "ar" | "en" | "fr" | "es" | "de" | "it" | "pt" | "tr" | string;

function detectUserLang(ctx: { language?: string; preferences?: { language?: string; targetLanguage?: string } }): LangCode {
  const l = (ctx?.language || ctx?.preferences?.language || "").toLowerCase();
  if (l.startsWith("ar") || l === "arabic") return "ar";
  if (l.startsWith("fr") || l === "french") return "fr";
  if (l.startsWith("es") || l === "spanish") return "es";
  if (l.startsWith("de") || l === "german") return "de";
  if (l.startsWith("it") || l === "italian") return "it";
  if (l.startsWith("pt") || l === "portuguese") return "pt";
  if (l.startsWith("tr") || l === "turkish") return "tr";
  return "en";
}

function detectTargetLang(ctx: { preferences?: { targetLanguage?: string; sourceLanguage?: string } }, fallbackLang: LangCode): LangCode {
  const t = ctx?.preferences?.targetLanguage;
  if (t) return t as LangCode;
  return fallbackLang;
}

function buildPrompt(ctx: any, query: string, mode?: string, vision?: boolean): string {
  const userLang = detectUserLang(ctx);
  const targetLang = detectTargetLang(ctx, userLang);
  const level = ctx?.educationLevel || ctx?.preferences?.level || "intermediate";
  const intro = userLang === "ar"
    ? `أنت Language Tutor. هدفك: مساعدة المستخدم في تعلم ${targetLang} (من ${userLang}). مستوى: ${level}. لا تخترع. استخدم السياق فقط.`
    : `You are Language Tutor. Goal: help learn ${targetLang} (from ${userLang}). Level: ${level}. Use context only — do not invent.`;
  const visionNote = vision ? (userLang === "ar" ? "\nملاحظة: صورة/ملف مرفق." : "\nNote: image/attachment provided.") : "";
  const modeLine = mode ? (userLang === "ar" ? `\nالوضع: ${mode}` : `\nMode: ${mode}`) : "";
  return `${intro}${visionNote}${modeLine}\n\nUser request (${userLang} → ${targetLang}, level ${level}):\n${query}\n\nRules:\n- Maintain conversation in user's language; practice in target language when appropriate.\n- Correct errors briefly with explanation and correct form.\n- Vocabulary with examples.\n- Translation preserves meaning/context; not literal when unnatural.\n- Use only provided context / sources.\n- If missing info, ask.\n- Return structured result.`;
}

export async function languageTutorAgent(
  input: { prompt: string; context?: any; options?: Record<string, unknown> },
  runAgent?: (opts: { agent: AgentId; prompt: string; context?: any; options?: Record<string, unknown> }) => Promise<AgentResult>
): Promise<AgentResult> {
  try {
    const ctx = input.context ?? {};
    const vision = !!(ctx.preferences?.imageInput || ctx.preferences?.vision);
    const mode = (input.options?.mode as string | undefined) || (ctx?.preferences?.mode as string | undefined) || "conversation";
    const prompt = buildPrompt(ctx, input.prompt, mode, vision);
    if (runAgent) {
      const result = await runAgent({ agent: AGENT_ID, prompt, context: ctx, options: { ...input.options, agent: AGENT_ID, vision, mode } });
      if (!result.ok && result.code === "MODEL_404") {
        return { ok: false, agent: AGENT_ID, code: "MODEL_404", message: "Language Tutor: NVIDIA unavailable. Router should fallback.", retryable: true };
      }
      return result;
    }
    return { ok: false, agent: AGENT_ID, code: "ROUTER_REQUIRED", message: "Language Tutor requires AgentRouter / AiRouter.", retryable: true };
  } catch (e: any) {
    return { ok: false, agent: AGENT_ID, code: "LANGUAGE_TUTOR_ERROR", message: e?.message || String(e), retryable: true };
  }
}
