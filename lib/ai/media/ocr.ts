"use strict";
/**
 * Shared OCR Service — نفس pipeline موجود في lib/extract-text.ts.
 *
 * لا نعيد الكتابة من الصفر. نأخذ منطق ocr.space (engine 1 / 3) مع:
 *   - Arabic first (engine 1 + language=ara)
 *   - Fallback to engine 3 (handwriting + 200+ langs, أبطأ، كوتة منفصلة)
 *   - Timeout 25s (نفس القيمة)
 *   - Error messages عربية واضحة (E550 / quota / timeout / 403)
 *
 * الفرق: هذه نسخة مستقلة في lib/ai/media/ يمكن Agents استيرادها مباشرة.
 */

const OCR_TIMEOUT_MS = 25_000;
const MIN_USEFUL_CHARS = 12;

/* =====================================================================
   نفس حالتي engine — نأخذ من الكود الأصلي بدون تغيير.
   (الآن نعيد كتابتها هنا كنسخة shared — لا نكسر lib/extract-text.ts)
   ===================================================================== */

type OcrAttempt = { engine: 1 | 3; language?: string };

async function callOcrSpace(
  apiKey: string,
  buffer: Uint8Array,
  fileName: string,
  mimeType: string,
  { engine, language }: OcrAttempt
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
  form.append("OCREngine", String(engine));
  form.append("language", language ?? "auto");
  form.append("isOverlayRequired", "false");
  form.append("scale", "true");
  form.append("detectOrientation", "true");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: apiKey },
    body: form,
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });

  if (!response.ok) {
    const _detail = await response.text().catch(() => "");
    void _detail;
    throw new Error(
      response.status === 403 ? "OCR key rejected (403)" : `OCR HTTP ${response.status}`
    );
  }

  const result = await response.json().catch(() => null);
  if (!result || typeof result !== "object") throw new Error("OCR invalid JSON");

  const rawError = (result as { ErrorMessage?: unknown }).ErrorMessage;
  const errorText = Array.isArray(rawError)
    ? rawError.join(" | ")
    : typeof rawError === "string"
    ? rawError
    : "";

  if ((result as { IsErroredOnProcessing?: boolean }).IsErroredOnProcessing) {
    if (/E550|invalid.*api key/i.test(errorText)) throw new Error("OCR invalid api key (E550)");
    if (/limit|quota|exceed/i.test(errorText)) throw new Error("OCR quota exceeded (429)");
    throw new Error("OCR processing error: " + (errorText || "unknown"));
  }

  const parsed = (result as { ParsedResults?: unknown }).ParsedResults;
  if (!Array.isArray(parsed) || parsed.length === 0) return "";

  return parsed
    .map((page) => {
      const text = (page as { ParsedText?: unknown }).ParsedText;
      return typeof text === "string" ? text : "";
    })
    .join("\n\n")
    .trim();
}

export async function extractOcrText(
  apiKey: string,
  buffer: Uint8Array,
  fileName: string,
  mimeType: string,
  attempts: OcrAttempt[] = [{ engine: 1, language: "ara" }, { engine: 3 }]
): Promise<{ text: string; bestText: string; engineUsed: 1 | 3; error?: Error }> {
  let bestText = "";
  let lastError: Error | null = null;
  let engineUsed: 1 | 3 = 1;

  for (const attempt of attempts) {
    try {
      const text = await callOcrSpace(apiKey, buffer, fileName, mimeType, attempt);
      if (text.replace(/\s/g, "").length >= MIN_USEFUL_CHARS) {
        return { text, bestText: text, engineUsed: attempt.engine };
      }
      if (text.trim().length > bestText.length) bestText = text.trim();
      engineUsed = attempt.engine;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // مفتاح/كوتة: لا نكرر
      if (/invalid api key|quota exceeded|403|429/i.test(lastError.message)) {
        if (bestText) return { text: bestText, bestText, engineUsed };
        throw lastError;
      }
    }
  }

  if (bestText) return { text: bestText, bestText, engineUsed };
  if (lastError) throw lastError;
  return { text: "", bestText: "", engineUsed };
}
