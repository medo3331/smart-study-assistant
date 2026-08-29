/**
 * Agent Extension — Shared Image Understanding Capability.
 *
 * Phase 8: لا نعيد بناء الـ11 Agents. نضيف لهم قدرة فهم الصور كـshared
 * capability عبر هذا الملف. كل Agent يقدر استيراد `withImageUnderstanding`.
 *
 * يكمل التصميم:
 *   User Image → Image Processor → OCR → Text → Agent (Groq/NVIDIA/OpenRouter)
 *
 * لو Vision provider فشل (NVIDIA 404 / OpenRouter 404):
 *   Vision ❌ → OCR ✅ → Text Agent ✅
 */

import type { ImageUnderstandingResult } from "../../media/types";
import { understandImage } from "../../media/image-understanding";

/**
 * يضيف القدرة على استقبال صورة إلى أي Agent.
 * يستخدم فقط عند وجود imageInput في الـcontext.
 */
export async function withImageUnderstanding(
  input: { prompt: string; context?: any; options?: Record<string, unknown>; imageInput?: File | unknown },
  runTextAgent?: (opts: { agent: string; prompt: string; context?: any }) => Promise<any>
): Promise<{ ok: boolean; agentText?: string; imageResult?: ImageUnderstandingResult; combinedPrompt?: string; error?: string }> {
  const ctx = input.context ?? {};
  const imageInput = input.imageInput ?? ctx.preferences?.imageInput ?? ctx.preferences?.vision ?? undefined;

  if (!imageInput || !(imageInput instanceof File) && !(imageInput instanceof Blob)) {
    // لا يوجد صورة — نمسك مسار النص فقط
    return { ok: true, combinedPrompt: input.prompt };
  }

  // 1. OCR Pipeline
  const imgFile = imageInput as File;
  const imgRes = await understandImage({
    file: imgFile,
    fileName: imgFile?.name || (imgFile instanceof Blob ? undefined : "upload"),
    mimeType: imgFile?.type || (imgFile instanceof Blob ? "application/octet-stream" : undefined),
    options: { preprocess: true, detectLanguage: true },
  });

  if (!imgRes.ok || !imgRes.text) {
    return {
      ok: false,
      error: imgRes.error || "OCR failed to extract usable text.",
      imageResult: imgRes,
    };
  }

  // 2. بناء Prompt مجمع — النص المستخرج + السؤال الأصلي
  const lang = (ctx.language || ctx.preferences?.language || "").toLowerCase();
  const isAr = lang.startsWith("ar") || lang === "arabic";
  const ocrNote = isAr
    ? `\n\nملاحظة (من صورة مرفقة):\n${imgRes.text}`
    : `\n\nNote (from attached image):\n${imgRes.text}`;

  const combinedPrompt = `${input.prompt}${ocrNote}\n\nRules:\n- Solve/analyze using the extracted text above.\n- If the image contains diagrams/graphs without enough text, note the limitation.\n- Do not invent text not present in the extraction.`;

  // 3. تمرير إلى Agent النصي (Groq / NVIDIA text / OpenRouter text)
  // لا نحتاج Vision provider هنا — النص كافٍ لمعظم حالات الامتحان/الدراسة.
  if (runTextAgent) {
    const agentResult = await runTextAgent({ agent: ctx.agent || "study_tutor", prompt: combinedPrompt, context: ctx });
    return { ok: true, agentText: agentResult?.message || agentResult?.text || "", imageResult: imgRes, combinedPrompt };
  }

  return { ok: true, combinedPrompt, imageResult: imgRes };
}
