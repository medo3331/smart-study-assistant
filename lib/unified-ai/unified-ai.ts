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
 *   �¢ No mock / demo / hardcoded answers.
 *   �¢ Provider failure → controlled JSON error (no fake answer).
 *   �¢ Router choice logged server-side only; never shown as picker to user.
 *   �¢ OCR failure → continue with prompt only (resilient), log low confidence.
 */
import type { UnifiedAIInput, UnifiedAIResult } from "./types";
import { routerSelectAgent } from "./router";
import { extractTextFromFile, ExtractError } from "../extract-text";
import { GeminiProvider } from "../ai/gemini";
import { GroqProvider } from "../ai/groq";
import { OpenRouterProvider } from "../ai/openrouter";
import { detectFileKind } from "../extract-text";
import { selectModelForTask, getModelCapability } from "../ai/capabilities";
import { DIAGRAM_GUIDELINES } from "@/lib/ai/prompt-engine";
import { CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import { recordAiUsage, type UsageStatus } from "@/lib/ai/usage-accounting";
import { scheduleUsageRecording } from "@/lib/ai/usage-scheduler";
import type { AiUsageContext } from "@/lib/ai/usage-context";

// Groq adapter — verified working (key from env, HTTP 200)
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

  // ًں§¾ Phase 5-C5: نقطة القياس عند حدّ المزوّد الحقيقي.
  //
  // âڑ ï¸ڈ **ليه هنا بالذات؟** دي أول (وآخر) نقطة فيها نداء شبكة للمزوّد.
  //    أي try/catch بيرجع من فوق الـ fetch = صفر قياس.
  //
  // âڑ ï¸ڈ **مفيش streaming في المسار ده** — `fetch` بيرجّع الرد كامل و
  //    `await res.json()` بيستهلكه قبل ما التسجيل ينفّذ. فمافيش خطر
  //    الـ "بعد ما الـ stream يتقفل" اللي حذّر منه C4.1: احنا **جوه**
  //    الكود المتزامن، مش على `onFinish`.
  const startedAt = Date.now();

  /**
   * ًں§¾ سطر shadow واحد لكل محاولة مزوّد فعلية.
   *
   * âڑ ï¸ڈ **`await` إجباري:** مافيش `after()` ولا fire-and-forget. لو الكتابة
   *   اتفلتت كـ floating promise، السيرفر المجمّد بيقتلها — وده بالظبط
   *   اللي خلّى `max(created_at)` يتجمّد في C4.1.
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
        // 2048 بدل 1200 — المخططات (Mermaid) والردود الطويلة محتاجة مساحة
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

    // 0. True vision path (Phase 3C) — only if a configured provider supports it.
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
        const candidates = [
          { modelId: "gemini-3.6-flash", available: !!process.env.GEMINI_API_KEY?.trim(), create: () => new GeminiProvider() },
          { modelId: "llama-3.2-11b-vision-preview", available: !!process.env.GROQ_API_KEY?.trim(), create: () => new GroqProvider() },
          { modelId: "nvidia/nemotron-nano-12b-v2-vl:free", available: !!process.env.OPENROUTER_API_KEY?.trim(), create: () => new OpenRouterProvider() },
        ].filter((c) => c.available);
        // Prefer the selected model first, then the rest as fallback chain.
        const ordered = [
          ...candidates.filter((c) => c.modelId === visionModel),
          ...candidates.filter((c) => c.modelId !== visionModel),
        ];
        let lastError: unknown = null;
        for (const candidate of ordered) {
          try {
            const provider = candidate.create();
            const visionResult = await provider.analyzeMedia({
              data: base64,
              mimeType: fileForVision.type,
              prompt: input.prompt,
            });
            return {
              ok: true,
              agentUsed: `${provider.name}-vision`,
              answer: visionResult.content,
              metadata: {
                imageProcessed: true,
                visionUsed: true,
                languageDetected: input.language === 'ar' ? 'ar' : input.language === 'en' ? 'en' : 'mixed',
              },
              reasoning: `${provider.name} analyzeMedia (${candidate.modelId})`,
            };
          } catch (providerErr) {
            lastError = providerErr;
            console.error(`Vision provider ${candidate.modelId} failed:`, providerErr instanceof Error ? providerErr.message : String(providerErr));
          }
        }
        throw lastError ?? new Error("no vision provider available");
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

    // 1. OCR (Magic existing pipeline — lib/extract-text.ts) — only for non-image files (PDF/docx/text).
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
      lessonPrefix = `أنت المساعد التعليمي الذكي للدرس الحالي.\nعنوان الدرس: ${t}\nالمادة: ${s}\nمحتوى الدرس: ${c}\n\nأجب على أسئلة الطالب بناءً على محتوى هذا الدرس فق� وبأسلوب مبسء مع الإبقاء على المصطلحات التقنية بالإنجليزية كما هي.\n\n---\n\n`;
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
    const modelToUse = typeof input.model === "string" && input.model.trim().length > 0 ? input.model.trim() : textModel;
    // حقن إرشادات المخططات (Mermaid) — المساعد بيرسم خرائط ذهنية/مخططات
    // داخل الشات مباشرة، وبيعرضها MermaidViewer في الواجهة.
    // Unified brain: system من السيرفر (شخصية + سياق الطالب) + إرشادات المخططات.
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
      error: "حدث خطأ غير متوقع أثناء المعالجة.",
      extractedText: undefined,
      metadata: undefined,
      reasoning: undefined,
    };
  }
}
