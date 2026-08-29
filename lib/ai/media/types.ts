"use strict";
/**
 * Shared Image Understanding Pipeline — Phase 8: Multimodal / OCR Reliability.
 *
 * لا نعيد بناء OCR من الصفر. نأخذ نفس pipeline الموجود في Magic
 * (lib/extract-text.ts → ocr.space engine 1/3 مع Arabic / auto)
 * ونحوّله لخدمة مستقلة يمكن كل Agent الوصول إليها.
 *
 * Architecture:
 *   User Image / PDF / File
 *        ↓
 *   Image Processor (preprocess + detect)  [lib/image-compress.ts موجود]
 *        ↓
 *   OCR (ocr.space engine 1/3 — نفس الكود الموجود)
 *        ↓
 *   Extracted Text + Metadata (lang, confidence, pages)
 *        ↓
 *   AgentRouter → Groq / NVIDIA / OpenRouter (text-only path)
 *
 * Vision providers (NVIDIA / OpenRouter vision) يظلوا منفصلين عبر media-router.
 * لو Vision فشل →هذا Pipeline هو الـfallback الموثوق.
 *
 * الملفات:
 *   ocr.ts              — استدعاء ocr.space + engine fallback (نفس الكود)
 *   image-preprocessor.ts — ضغط/تصحيح/اكتشاف النوع (يستفيد من lib/image-compress.ts)
 *   image-understanding.ts — unified entrypoint لكل Agents + metadata
 */

export interface ImageUnderstandingResult {
  ok: boolean;
  text: string;                 // النص المستخرج (عربي/إنجليزي/مختلط)
  metadata: {
    fileName?: string;
    mimeType?: string;
    pages?: number;             // للـPDF
    languageDetected?: "ar" | "en" | "mixed";
    ocrEngineUsed?: 1 | 3;
    confidence?: "high" | "medium" | "low";
    orientation?: "normal" | "rotated";
    imagePreprocessed?: boolean;
  };
  error?: string;              // رسالة عربية واضحة إذا فشل
  retryable?: boolean;
}

export interface ImageUnderstandingInput {
  file: File | Buffer;         // File من المتصفح أو Uint8Array من الخادم
  fileName?: string;
  mimeType?: string;
  options?: {
    preferEngine?: 1 | 3;     // افتراضي: 1 بالعربية، 3 للأقوى
    preprocess?: boolean;      // ضغط/تصحيح قبل OCR
    maxChars?: number;         // قص النص لو طويل
    detectLanguage?: boolean;  // ar/en/mixed
  };
}
