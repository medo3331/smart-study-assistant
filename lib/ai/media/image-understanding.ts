"use strict";
/**
 * Unified Image Understanding Entry — للربط بين أي Agent وOCR Pipeline.
 *
 * كل Agent (Exam Solver / Document Analyzer / Study Tutor / Quiz / Language / Image)
 * يقدر يستورد هذه الدالة مباشرة بدلاً من محاولة Vision provider منفردة.
 *
 * Flow:
 *   imageInput (File / Buffer) → preprocess → OCR → text + metadata → Agent
 *
 * لو كان المستخدم يريد Vision حقيقي (diagram / graph بدون نص كافي):
 *   يظل media-router (NVIDIA / OpenRouter / Gemini) مسؤولًا — هذا الـPipeline
 *   هو الـfallback الموثوق فقط عند فشل Vision.
 */

import type { ImageUnderstandingInput, ImageUnderstandingResult } from "./types";
import { preprocessImage } from "./image-preprocessor";
import { extractOcrText } from "./ocr";

// مفتاح OCR من البيئة — نفس ما تستخدمه lib/extract-text.ts
function getOcrKey(): string {
  const key = process.env.OCR_SPACE_API_KEY || process.env.NEXT_PUBLIC_OCR_SPACE_API_KEY || "";
  return key;
}

export async function understandImage(
  input: ImageUnderstandingInput
): Promise<ImageUnderstandingResult> {
  const apiKey = getOcrKey();
  if (!apiKey) {
    // لو لا يوجد مفتاح — نرجع خطأ واضح (نفس سلوك lib/extract-text.ts)
    return {
      ok: false,
      text: "",
      metadata: { confidence: "low" },
      error: "OCR API key not configured (OCR_SPACE_API_KEY). Set in .env.",
      retryable: false,
    };
  }

  try {
    // 1. preprocessing
    const { buffer, meta } = await preprocessImage(input);

    // 2. OCR — نفس attempts الموجودة (1 بالعربية، 3 للأقوى)
    const attempts = input.options?.preferEngine
      ? [{ engine: input.options.preferEngine }]
      : [{ engine: 1, language: "ara" }, { engine: 3 }];

    const ocr = await extractOcrText(apiKey, buffer, meta.fileName, meta.mimeType, attempts as any);

    // 3. metadata + language guess (بسيط — من النص)
    const text = (ocr.text || "").trim();
    const hasAr = /[\u0600-\u06FF]/.test(text);
    const hasEn = /[A-Za-z]{2,}/.test(text);
    const langDetected = hasAr && hasEn ? "mixed" : hasAr ? "ar" : hasEn ? "en" : "unknown";

    const confidence = text.length < 30 ? "low" : text.length < 200 ? "medium" : "high";

    return {
      ok: true,
      text,
      metadata: {
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        languageDetected: langDetected as any,
        ocrEngineUsed: ocr.engineUsed,
        confidence,
        imagePreprocessed: meta.prep,
      },
      retryable: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // رسائل عربية واضحة من الكود الأصلي
    const arabicMsg = msg.includes("quota")
      ? "خدمة قراءة الصور وصلت حدها اليومي. جرّب بكرة."
      : msg.includes("timeout") || msg.includes("Time")
      ? "قراءة الصورة خدت وقت طويل. جرّب صورة أصغر أو أوضح."
      : msg.includes("403") || msg.includes("key rejected")
      ? "مفتاح خدمة قراءة الصور غير صالح (403)."
      : msg.includes("invalid api key") || msg.includes("E550")
      ? "مفتاح خدمة قراءة الصور غير صالح (E550)."
      : "مقدرتش أقرا الصورة. جرّب صورة أوضح.";

    return {
      ok: false,
      text: "",
      metadata: { confidence: "low" },
      error: arabicMsg,
      retryable: msg.includes("timeout") || msg.includes("quota") || msg.includes("502"),
    };
  }
}
