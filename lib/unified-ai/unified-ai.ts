/**
 * UnifiedAI — REAL INFERENCE (not stub)
 *
 * Flow (verified):
 *   prompt + attachments
 *     → extractTextFromFile (Magic OCR — lib/extract-text.ts) if file/image
 *     → routerSelectAgent (hidden) → ONE agent
 *     → Groq provider (openai/gpt-oss-120b — verified HTTP 200 + Arabic answer)
 *     → real model response → answer
 *
 * Rules enforced:
 *   • No mock / demo / hardcoded answers.
 *   • Provider failure → controlled JSON error (no fake answer).
 *   • Router choice logged server-side only; never shown as picker to user.
 *   • OCR failure → continue with prompt only (resilient), log low confidence.
 */
import type { UnifiedAIInput, UnifiedAIResult } from "./types";
import { routerSelectAgent } from "./router";
import { extractTextFromFile } from "../extract-text";

// Groq adapter — verified working (key from env, model openai/gpt-oss-120b, HTTP 200)
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

async function callGroqWithModel(
  prompt: string,
  model: string,
  _language: string = "ar"
): Promise<{ ok: true; content: string; model: string } | { ok: false; error: string }> {
  void _language;
  const key = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
  if (!key) return { ok: false, error: "AI provider temporarily unavailable." };
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Groq error", res.status, detail.slice(0, 200));
      return { ok: false, error: "AI provider temporarily unavailable. Please try again." };
    }
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, error: "AI returned an empty response. Please try again." };
    }
    return { ok: true, content, model };
  } catch (e: unknown) {
    console.error("Groq exception:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "AI request failed. Please try again." };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy wrapper kept for external callers
async function callGroq(prompt: string, _language: string = "ar"): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const r = await callGroqWithModel(prompt, GROQ_MODEL, _language);
  if (!r.ok) return r;
  return { ok: true, content: r.content };
}

export async function unifiedAI(input: UnifiedAIInput): Promise<UnifiedAIResult> {
  try {
    let extractedText = "";
    let ocrMeta = { engineUsed: 1 as 1 | 3, confidence: "low" as "high" | "medium" | "low" };

    // 1. OCR (Magic existing pipeline — lib/extract-text.ts)
    if (input.imageInput || input.fileInput) {
      const file = (input.imageInput || input.fileInput) as File;
      try {
        const text = await extractTextFromFile(file, {
          maxFileBytes: 10 * 1024 * 1024,
          maxImageBytes: 2 * 1024 * 1024,
          maxTextChars: 8000,
        });
        extractedText = text.trim();
        ocrMeta = { engineUsed: 1, confidence: extractedText.length > 50 ? "high" : "medium" };
      } catch (ocrErr: unknown) {
        console.error("OCR error (resilient):", ocrErr instanceof Error ? ocrErr.message : String(ocrErr));
        extractedText = "";
        ocrMeta = { engineUsed: 3, confidence: "low" };
        // Continue — don't throw
      }
    }

    // 2. Hidden Router (user never sees selection)
    const hasImage = !!(input.imageInput || input.fileInput);
    const decision = routerSelectAgent(input.prompt, input.context, hasImage);

    // Server-side log only — never expose agentId to UI display
    console.log("[UnifiedAI Router] selectedAgent=", decision.agentId, "reason=", decision.reason, "ocr=", decision.requiresOcr, "conf=", decision.confidence);

    // 3. Build combined prompt (user + OCR note if any) + lesson context injection (مخفي)
    const lang = input.language || (String(input.context?.language || "").toLowerCase().startsWith("ar") ? "ar" : "en");
    // حقن سياق الدرس الحقيقي إذا متوفر — hidden system prompt (المستخدم لا يراه)
    let lessonPrefix = "";
    const lesson = (input.context as Record<string, unknown> | undefined)?.lesson as
      | { title?: string; subject?: string; content?: string; description?: string }
      | undefined;
    if (lesson && (lesson.title || lesson.content || lesson.description)) {
      const t = String(lesson.title || "").slice(0, 200);
      const s = String(lesson.subject || "").slice(0, 100);
      const c = String(lesson.content || lesson.description || "").slice(0, 4000);
      lessonPrefix = `أنت المساعد التعليمي الذكي للدرس الحالي.\nعنوان الدرس: ${t}\nالمادة: ${s}\nمحتوى الدرس: ${c}\n\nأجب على أسئلة الطالب بناءً على محتوى هذا الدرس فقط وبأسلوب مبسط، مع الإبقاء على المصطلحات التقنية بالإنجليزية كما هي.\n\n---\n\n`;
    }
    const ocrNote = extractedText
      ? (lang === "ar"
          ? `\n\nملاحظة من الصورة/الملف المرفق (تم استخراج النص عبر OCR):\n${extractedText.slice(0, 1200)}${extractedText.length > 1200 ? "..." : ""}`
          : `\n\nNote from attached file (OCR extracted):\n${extractedText.slice(0, 1200)}${extractedText.length > 1200 ? "..." : ""}`)
      : "";
    const combinedPrompt = `${lessonPrefix}${input.prompt}${ocrNote}`;

    // 4. REAL model call — Phase H: respect explicit model if provided (already entitlement-checked in route)
    // If input.model is present, route already verified entitlement before reserve — use it.
    // Otherwise use CURRENT_AI_MODEL (free, always accessible).
    const modelToUse = typeof input.model === "string" && input.model.trim().length > 0 ? input.model.trim() : GROQ_MODEL;
    const providerResult = await callGroqWithModel(combinedPrompt, modelToUse, lang);
    if (!providerResult.ok) {
      return {
        ok: false,
        agentUsed: decision.agentId,
        answer: "",
        error: providerResult.error,
        extractedText: extractedText || undefined,
        metadata: { ocrEngine: ocrMeta.engineUsed, confidence: ocrMeta.confidence, languageDetected: lang === "ar" ? "ar" : lang === "en" ? "en" : "mixed", imageProcessed: hasImage },
        reasoning: decision.reason,
      };
    }

    // 5. Return real dynamic answer (no mock — answer changes with prompt)
    return {
      ok: true,
      agentUsed: decision.agentId,
      answer: providerResult.content,
      extractedText: extractedText || undefined,
      metadata: {
        ocrEngine: ocrMeta.engineUsed,
        confidence: ocrMeta.confidence,
        languageDetected: lang === "ar" ? "ar" : lang === "en" ? "en" : "mixed",
        imageProcessed: hasImage,
      },
      reasoning: decision.reason,
    };
  } catch (e: unknown) {
    console.error("unifiedAI exception:", e instanceof Error ? e.message : String(e));
    return {
      ok: false,
      agentUsed: "unknown",
      answer: "",
      error: "حدث خطأ غير متوقع أثناء المعالجة.",
      extractedText: undefined,
      metadata: undefined,
      reasoning: undefined,
    };
  }
}
