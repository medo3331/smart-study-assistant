/**
 * UnifiedAI â€” REAL INFERENCE (not stub)
 *
 * Flow (verified):
 *   prompt + attachments
 *     â†’ extractTextFromFile (Magic OCR â€” lib/extract-text.ts) if file/image
 *     â†’ routerSelectAgent (hidden) â†’ ONE agent
 *     â†’ Groq provider (openai/gpt-oss-120b â€” verified HTTP 200 + Arabic answer)
 *     â†’ real model response â†’ answer
 *
 * Rules enforced:
 *   â€¢ No mock / demo / hardcoded answers.
 *   â€¢ Provider failure â†’ controlled JSON error (no fake answer).
 *   â€¢ Router choice logged server-side only; never shown as picker to user.
 *   â€¢ OCR failure â†’ continue with prompt only (resilient), log low confidence.
 */
import type { UnifiedAIInput, UnifiedAIResult } from "./types";
import { routerSelectAgent } from "./router";
import { extractTextFromFile, ExtractError } from "../extract-text";
import { GeminiProvider } from "../ai/gemini";
import { detectFileKind } from "../extract-text";
import { selectModelForTask, getModelCapability } from "../ai/capabilities";
import { DIAGRAM_GUIDELINES } from "@/lib/ai/prompt-engine";
import { CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { recordAiUsage, type UsageStatus } from "@/lib/ai/usage-accounting";
import { scheduleUsageRecording } from "@/lib/ai/usage-scheduler";
import type { AiUsageContext } from "@/lib/ai/usage-context";

// Groq adapter â€” verified working (key from env, HTTP 200)
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = CURRENT_AI_MODEL;

async function callGroqWithModel(
  prompt: string,
  model: string,
  _language: string = "ar",
  system?: string,
  usage?: AiUsageContext
): Promise<{ ok: true; content: string; model: string } | { ok: false; error: string }> {
  const key = process.env.GROQ_API_KEY || "";
  if (!key) return { ok: false, error: "AI provider temporarily unavailable." };

  // ًںŒگ Language handling: honour the requested language instead of discarding it.
  const langDirective =
    _language === "ar"
      ? "أجب باللغة العربية (Arabic) إلا إذا طلب المستخدم غير ذلك."
      : _language === "en"
        ? "Respond in English unless the user explicitly asks otherwise."
        : "";
  const fullSystem = [langDirective, system]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join("\n\n");

  // ًں§¾ Phase 5-C5: ظ†ظ‚ط·ط© ط§ظ„ظ‚ظٹط§ط³ ط¹ظ†ط¯ ط­ط¯ظ‘ ط§ظ„ظ…ط²ظˆظ‘ط¯ ط§ظ„ط­ظ‚ظٹظ‚ظٹ.
  //
  // âڑ ï¸ڈ **ظ„ظٹظ‡ ظ‡ظ†ط§ ط¨ط§ظ„ط°ط§طھطں** ط¯ظٹ ط£ظˆظ„ (ظˆط¢ط®ط±) ظ†ظ‚ط·ط© ظپظٹظ‡ط§ ظ†ط¯ط§ط، ط´ط¨ظƒط© ظ„ظ„ظ…ط²ظˆظ‘ط¯.
  //    ط£ظٹ try/catch ط¨ظٹط±ط¬ط¹ ظ…ظ† ظپظˆظ‚ ط§ظ„ظ€ fetch = طµظپط± ظ‚ظٹط§ط³.
  //
  // âڑ ï¸ڈ **ظ…ظپظٹط´ streaming ظپظٹ ط§ظ„ظ…ط³ط§ط± ط¯ظ‡** â€” `fetch` ط¨ظٹط±ط¬ظ‘ط¹ ط§ظ„ط±ط¯ ظƒط§ظ…ظ„ ظˆ
  //    `await res.json()` ط¨ظٹط³طھظ‡ظ„ظƒظ‡ ظ‚ط¨ظ„ ظ…ط§ ط§ظ„طھط³ط¬ظٹظ„ ظٹظ†ظپظ‘ط°. ظپظ…ط§ظپظٹط´ ط®ط·ط±
  //    ط§ظ„ظ€ "ط¨ط¹ط¯ ظ…ط§ ط§ظ„ظ€ stream ظٹطھظ‚ظپظ„" ط§ظ„ظ„ظٹ ط­ط°ظ‘ط± ظ…ظ†ظ‡ C4.1: ط§ط­ظ†ط§ **ط¬ظˆظ‡**
  //    ط§ظ„ظƒظˆط¯ ط§ظ„ظ…طھط²ط§ظ…ظ†طŒ ظ…ط´ ط¹ظ„ظ‰ `onFinish`.
  const startedAt = Date.now();

  /**
   * ًں§¾ ط³ط·ط± shadow ظˆط§ط­ط¯ ظ„ظƒظ„ ظ…ط­ط§ظˆظ„ط© ظ…ط²ظˆظ‘ط¯ ظپط¹ظ„ظٹط©.
   *
   * âڑ ï¸ڈ **`await` ط¥ط¬ط¨ط§ط±ظٹ:** ظ…ط§ظپظٹط´ `after()` ظˆظ„ط§ fire-and-forget. ظ„ظˆ ط§ظ„ظƒطھط§ط¨ط©
   *   ط§طھظپظ„طھطھ ظƒظ€ floating promiseطŒ ط§ظ„ط³ظٹط±ظپط± ط§ظ„ظ…ط¬ظ…ظ‘ط¯ ط¨ظٹظ‚طھظ„ظ‡ط§ â€” ظˆط¯ظ‡ ط¨ط§ظ„ط¸ط¨ط·
   *   ط§ظ„ظ„ظٹ ط®ظ„ظ‘ظ‰ `max(created_at)` ظٹطھط¬ظ…ظ‘ط¯ ظپظٹ C4.1.
   */
  const recordAttempt = async (status: UsageStatus, tokens?: { prompt?: number; completion?: number }) => {
    if (!usage) return;
    await scheduleUsageRecording(() =>
      recordAiUsage({
        userId: usage.userId ?? null,
        feature: usage.feature ?? "chat",
        operationId: usage.operationId,
        idempotencyKey: usage.idempotencyKey,
        attemptNo: 0,
        provider: "groq",
        model,
        status,
        units: 1,
        promptTokens: tokens?.prompt ?? null,
        completionTokens: tokens?.completion ?? null,
        latencyMs: Date.now() - startedAt,
        metadata: { path: "unified_ai", source: usage.source, ...usage.diagnostics },
      }),
    );
  };

  try {
    const messages = [
      ...(fullSystem ? [{ role: "system", content: fullSystem }] : []),
      { role: "user", content: prompt },
    ];
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        // 2048 ط¨ط¯ظ„ 1200 â€” ط§ظ„ظ…ط®ط·ط·ط§طھ (Mermaid) ظˆط§ظ„ط±ط¯ظˆط¯ ط§ظ„ط·ظˆظٹظ„ط© ظ…ط­طھط§ط¬ط© ظ…ط³ط§ط­ط©
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Groq error", res.status, detail.slice(0, 200));
      await recordAttempt("failed_no_response");
      return { ok: false, error: "AI provider temporarily unavailable. Please try again." };
    }
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      await recordAttempt("failed_after_response");
      return { ok: false, error: "AI returned an empty response. Please try again." };
    }
    await recordAttempt("completed", {
      prompt: data?.usage?.prompt_tokens,
      completion: data?.usage?.completion_tokens,
    });
    return { ok: true, content, model };
  } catch (e: unknown) {
    console.error("Groq exception:", e instanceof Error ? e.message : String(e));
    await recordAttempt("failed_no_response");
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
    let visionFallback = false;

    // 0. True vision path (Phase 3C) â€” only if a configured provider supports it.
    const hasImageInput = !!(input.imageInput || input.fileInput);
    const fileForVision = input.imageInput as (File & { arrayBuffer?: () => Promise<ArrayBuffer> }) | undefined;
    const visionModel = selectModelForTask("image_understanding", {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    });
    if (hasImageInput && fileForVision && typeof fileForVision.arrayBuffer === 'function') {
      // Image present: MUST use a vision-capable provider. Never fall back to text-only claiming image understood.
      if (!visionModel) {
        return {
          ok: false,
          agentUsed: 'unknown',
          answer: '',
          error: 'فهم الصور غير متاح حالياً. يرجى المحاولة لاحقاً أو أرسل نصاً فقط.',
          code: 'VISION_NOT_CONFIGURED',
          metadata: { imageProcessed: true, visionUsed: false },
          reasoning: 'No vision-capable provider configured',
        };
      }
      const cap = getModelCapability(visionModel);
      if (!cap || !cap.imageInput) {
        return {
          ok: false,
          agentUsed: 'unknown',
          answer: '',
          error: 'الموديل المحدد لا يدعم الصور.',
          code: 'MODEL_NO_VISION',
          metadata: { imageProcessed: true, visionUsed: false },
          reasoning: `Selected model ${visionModel} lacks imageInput capability`,
        };
      }
      if (!fileForVision.type?.startsWith('image/')) {
        return {
          ok: false,
          agentUsed: 'unknown',
          answer: '',
          error: 'Unsupported image type.',
          code: 'UNSUPPORTED_IMAGE_TYPE',
          metadata: { imageProcessed: true },
        };
      }
      if (fileForVision.size > 2 * 1024 * 1024) {
        return {
          ok: false,
          agentUsed: 'unknown',
          answer: '',
          error: 'Image too large.',
          code: 'IMAGE_TOO_LARGE',
          metadata: { imageProcessed: true },
        };
      }
      try {
        const buffer = new Uint8Array(await fileForVision.arrayBuffer());
        const base64 = Buffer.from(buffer).toString('base64');
        const gemini = new GeminiProvider();
        const visionResult = await gemini.analyzeMedia({
          data: base64,
          mimeType: fileForVision.type,
          prompt: input.prompt,
        });
        return {
          ok: true,
          agentUsed: 'gemini-vision',
          answer: visionResult.content,
          metadata: {
            imageProcessed: true,
            visionUsed: true,
            languageDetected: input.language === 'ar' ? 'ar' : input.language === 'en' ? 'en' : 'mixed',
          },
          reasoning: 'gemini analyzeMedia',
        };
      } catch (visionErr) {
        console.error('Vision provider failed:', visionErr instanceof Error ? visionErr.message : String(visionErr));
        const ocrKey = process.env.OCR_SPACE_API_KEY?.trim();
        if (ocrKey) {
          try {
            const text = await extractTextFromFile(fileForVision as File, {
              maxFileBytes: 10 * 1024 * 1024,
              maxImageBytes: 2 * 1024 * 1024,
              maxTextChars: 8000,
            });
            extractedText = (text || '').trim();
            ocrMeta = { engineUsed: 1, confidence: extractedText.length > 50 ? 'high' : 'medium' };
            visionFallback = true;
          } catch (ocrErr) {
            console.error('OCR fallback failed:', ocrErr instanceof Error ? ocrErr.message : String(ocrErr));
            return {
              ok: false,
              agentUsed: 'unknown',
              answer: '',
              error: 'لم نتمكن من قراءة الصورة حاليًا. يمكنك إعادة المحاولة أو تجربة استخراج النص باستخدام OCR إذا كانت الخدمة متاحة، أو إرسال بلاغ للدعم.',
              code: 'VISION_PROVIDER_FAILED',
              metadata: { imageProcessed: true, visionUsed: false },
              reasoning: 'vision provider error; OCR failed',
            };
          }
        } else {
          return {
            ok: false,
            agentUsed: 'unknown',
            answer: '',
            error: 'لم نتمكن من قراءة الصورة حاليًا. يمكنك إعادة المحاولة أو تجربة استخراج النص باستخدام OCR إذا كانت الخدمة متاحة، أو إرسال بلاغ للدعم.',
            code: 'VISION_PROVIDER_FAILED',
            metadata: { imageProcessed: true, visionUsed: false },
            reasoning: 'vision provider error',
          };
        }
      }
    }

    // 1. OCR (Magic existing pipeline â€” lib/extract-text.ts) â€” only for non-image files (PDF/docx/text).
    // Images are handled by the vision path above; if we reach here with an image, something is inconsistent.
    if (!input.imageInput && input.fileInput) {
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
         console.error("Extraction error:", ocrErr instanceof Error ? ocrErr.message : String(ocrErr));
         const isPdf = detectFileKind(file.type, file.name) === "pdf";
         if (isPdf) {
           const message = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
           const code = ocrErr instanceof ExtractError ? ocrErr.code : undefined;
           return {
             ok: false,
             agentUsed: "unknown",
             answer: "",
              error: "تعذر قراءة النص من هذا الـ PDF. يرجى رفع صورة للصفحة بدلاً من ذلك.",
             code: code || "PDF_READ_FAILED",
             errorCode: "PDF_READ_FAILED",
             extractedText: undefined,
             metadata: undefined,
             reasoning: undefined,
           };
         }
         // Continue for non-PDF — don't throw
         extractedText = "";
         ocrMeta = { engineUsed: 3, confidence: "low" };
       }
    }

    // TEXT MODEL ROUTING (Phase H): choose text model by capability, not hardcoded Groq.
    const textModel = selectModelForTask("text_chat", {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    });
    if (!textModel) {
      return {
        ok: false,
        agentUsed: 'unknown',
        answer: '',
        error: 'لا يوجد مزود نصي متاح حالياً.',
        code: 'NO_TEXT_PROVIDER',
        metadata: undefined,
        reasoning: 'No text-capable provider configured',
      };
    }

    // 2. Hidden Router (user never sees selection)
    const hasImage = !!(input.imageInput || input.fileInput);
    const decision = routerSelectAgent(input.prompt, input.context, hasImage);

    // Server-side log only â€” never expose agentId to UI display
    console.log("[UnifiedAI Router] selectedAgent=", decision.agentId, "reason=", decision.reason, "ocr=", decision.requiresOcr, "conf=", decision.confidence);

    // 3. Build combined prompt (user + OCR note if any) + lesson context injection (ظ…ط®ظپظٹ)
    const lang = input.language || (String(input.context?.language || "").toLowerCase().startsWith("ar") ? "ar" : "en");
    // ط­ظ‚ظ† ط³ظٹط§ظ‚ ط§ظ„ط¯ط±ط³ ط§ظ„ط­ظ‚ظٹظ‚ظٹ ط¥ط°ط§ ظ…طھظˆظپط± â€” hidden system prompt (ط§ظ„ظ…ط³طھط®ط¯ظ… ظ„ط§ ظٹط±ط§ظ‡)
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
          ? `\n\nظ…ظ„ط§ط­ط¸ط© ظ…ظ† ط§ظ„طµظˆط±ط©/ط§ظ„ظ…ظ„ظپ ط§ظ„ظ…ط±ظپظ‚ (طھظ… ط§ط³طھط®ط±ط§ط¬ ط§ظ„ظ†طµ ط¹ط¨ط± OCR):\n${extractedText.slice(0, 1200)}${extractedText.length > 1200 ? "..." : ""}`
          : `\n\nNote from attached file (OCR extracted):\n${extractedText.slice(0, 1200)}${extractedText.length > 1200 ? "..." : ""}`)
      : "";
    const combinedPrompt = `${lessonPrefix}${input.prompt}${ocrNote}`;

    // 4. REAL model call â€” Phase H: respect explicit model if provided (already entitlement-checked in route)
    // If input.model is present, route already verified entitlement before reserve â€” use it.
    // Otherwise use CURRENT_AI_MODEL (free, always accessible).
    const modelToUse = typeof input.model === "string" && input.model.trim().length > 0 ? input.model.trim() : textModel;
    // ط­ظ‚ظ† ط¥ط±ط´ط§ط¯ط§طھ ط§ظ„ظ…ط®ط·ط·ط§طھ (Mermaid) â€” ط§ظ„ظ…ط³ط§ط¹ط¯ ط¨ظٹط±ط³ظ… ط®ط±ط§ط¦ط· ط°ظ‡ظ†ظٹط©/ظ…ط®ط·ط·ط§طھ
    // ط¯ط§ط®ظ„ ط§ظ„ط´ط§طھ ظ…ط¨ط§ط´ط±ط©طŒ ظˆط¨ظٹط¹ط±ط¶ظ‡ط§ MermaidViewer ظپظٹ ط§ظ„ظˆط§ط¬ظ‡ط©.
    // Unified brain: system ظ…ظ† ط§ظ„ط³ظٹط±ظپط± (ط´ط®طµظٹط© + ط³ظٹط§ظ‚ ط§ظ„ط·ط§ظ„ط¨) + ط¥ط±ط´ط§ط¯ط§طھ ط§ظ„ظ…ط®ط·ط·ط§طھ.
    const serverSystem = typeof input.system === "string" ? input.system.trim() : "";
    const systemPrompt = serverSystem ? `${serverSystem}\n\n${DIAGRAM_GUIDELINES}` : DIAGRAM_GUIDELINES;
    const providerResult = await callGroqWithModel(combinedPrompt, modelToUse, lang, systemPrompt, input.usage);
    if (!providerResult.ok) {
      return {
        ok: false,
        agentUsed: decision.agentId,
        answer: "",
        error: providerResult.error,
        extractedText: extractedText || undefined,
        metadata: { ocrEngine: ocrMeta.engineUsed, confidence: ocrMeta.confidence, languageDetected: lang === "ar" ? "ar" : lang === "en" ? "en" : "mixed", imageProcessed: hasImage, visionFallback },
        reasoning: decision.reason,
      };
    }

    // 5. Return real dynamic answer (no mock â€” answer changes with prompt)
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
        visionFallback,
      },
      reasoning: decision.reason,
    };
  } catch (e: unknown) {
    console.error("unifiedAI exception:", e instanceof Error ? e.message : String(e));
    return {
      ok: false,
      agentUsed: "unknown",
      answer: "",
      error: "ط­ط¯ط« ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، ط§ظ„ظ…ط¹ط§ظ„ط¬ط©.",
      extractedText: undefined,
      metadata: undefined,
      reasoning: undefined,
    };
  }
}
