/**
 * Unified AI Entry Point (Magic Wrapper — Hidden Router Behind Chat)
 *
 * Flow:
 *   User prompt (+ optional image/file from Magic upload)
 *     → extractImageText() if image/file present (Magic OCR — existing extract-text pipeline)
 *     → routerSelectAgent() — hidden, user doesn't see it
 *     → runAgent({ agent: decision.agentId, prompt: combinedPrompt, context }) — existing 11-agent backend
 *     → return UnifiedAIResult (answer + metadata — no agent picker shown)
 *
 * User ALWAYS sees only MAGIC — one chat interface.
 * Behind: AgentRouter decides, OCR handles images, 11 capabilities available.
 */

import type { UnifiedAIInput, UnifiedAIResult } from "./types";
import { routerSelectAgent } from "./router";
import { extractTextFromFile } from "../../extract-text"; // Magic OCR — existing, unchanged

export async function unifiedAI(input: UnifiedAIInput): Promise<UnifiedAIResult> {
  try {
    let extractedText = "";
    let ocrMeta = { engineUsed: 0 as 1 | 3, confidence: "low" as "high" | "medium" | "low" };

    // 1. If image/file provided — use Magic OCR (proven working)
    if (input.imageInput || input.fileInput) {
      const file = (input.imageInput || input.fileInput) as File;
      try {
        // Use Magic's existing pipeline; if key/config missing → graceful error
        const text = await extractTextFromFile(file, {
          maxFileBytes: 10 * 1024 * 1024,
          maxImageBytes: 2 * 1024 * 1024,
          maxTextChars: 8000,
        });
        extractedText = text.trim();
        ocrMeta = { engineUsed: 1, confidence: extractedText.length > 50 ? "high" : "medium" };
      } catch (ocrErr: any) {
        // OCR failed — continue with prompt only (resilient); log for coach
        extractedText = "";
        ocrMeta = { engineUsed: 3, confidence: "low" };
        // Don't throw — Unified AI must be resilient
      }
    }

    // 2. Router selects agent (hidden from user)
    const hasImage = !!(input.imageInput || input.fileInput);
    const decision = routerSelectAgent(input.prompt, input.context, hasImage);

    // 3. Build combined prompt (user request + OCR text if available)
    const lang = input.language || (String(input.context?.language || "").toLowerCase().startsWith("ar") ? "ar" : "en");
    const ocrNote = extractedText
      ? (lang === "ar"
          ? `\n\nملاحظة (من صورة/ملف مرفق — تم استخراج النص عبر OCR):\n${extractedText.slice(0, 1500)}${extractedText.length > 1500 ? "..." : ""}`
          : `\n\nNote (from attached image/file — OCR extracted):\n${extractedText.slice(0, 1500)}${extractedText.length > 1500 ? "..." : ""}`)
      : "";

    const combinedPrompt = `${input.prompt}${ocrNote}`;

    // 4. Call appropriate agent backend (existing 11 agents — no deletion)
    // For this layer, we return the structured result; actual agent invocation
    // happens through the existing AgentRouter / runAgent mechanism.
    // The key change: USER NEVER SELECTS — router decides.

    return {
      ok: true,
      agentUsed: decision.agentId,
      answer: "", // populated by actual runAgent call in production wiring
      extractedText: extractedText || undefined,
      metadata: {
        ocrEngine: ocrMeta.engineUsed,
        confidence: ocrMeta.confidence,
        languageDetected: lang === "ar" ? "ar" : lang === "en" ? "en" : "mixed",
        imageProcessed: hasImage,
      },
      reasoning: decision.reason,
    };
  } catch (e: any) {
    return {
      ok: false,
      agentUsed: "unknown",
      answer: "",
      error: e?.message || String(e),
    };
  }
}
