/* ==========================================================================
   🖼️ عميل صور OpenRouter — مصدر واحد للحقيقة
   ============================================================================

   OpenRouter عنده **واجهة صور مستقلة** عن الـ chat:
   `POST https://openrouter.ai/api/v1/images`

   ═══ الشكل (من openapi.json بتاع OpenRouter — مSchemas) ═══
   الطلب:
   ```json
   {
     "model": "black-forest-labs/flux.2-pro",
     "prompt": "وصف الصورة المطلوبة",
     "resolution": "1K",
     "aspect_ratio": "16:9"
   }
   ```
   `model` + `prompt` إجباريين. `resolution` من
   `512 | 768 | 1K | 1.5K | 2K | 4K`، و`aspect_ratio` من قائمة نسب
   معروفة (Providers بيقصّوها للمsubset اللي بييدعموه).

   الرد:
   ```json
   {
     "created": 1748372400,
     "data": [{ "b64_json": "<base64>" }],
     "usage": { "cost": 0.04, "total_tokens": 4175 }
   }
   ```

   ═══ ليه OpenRouter وماشي Gemini ═══
   - **مفتاح موجود فعلاً** في `.env.local` (OpenRouter هو المزوّد الأساسي
     في المشروع أصلاً — مفيش دمج جديد ولا إعداد).
   - `gemini-3.1-flash-image` بقى **ميتّ** (المفتاح اتشال من `.env.local`
     — كان باطل من الأصل).

   ⚠️ **الرصيد**: الـ endpoint بيرجّع **402 "Insufficient credits"** لو
      حساب OpenRouter مش فيه رصيد. ⇒ `OpenRouterCreditsExhaustedError`
      بيت طلّع بسرعة ⇒ السلسلة بتنتقل للمزوّد المجاني (Pollinations)
      بدل ما الطلب يموت.
   ========================================================================== */

/** عنوان واجهة الصور — مختلف عن `/chat/completions`. */
export const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

/**
 * الموديلات المتاحة للـ images endpoint.
 *
 * ⚠️ **ليه الـ slug بالظبط كده**: اتأكدت إن الاتنين موجودين فعلاً
 *    (`GET /api/v1/models/<slug>/endpoints` → 200):
 *      `black-forest-labs/flux.2-pro`  ← الافتراضي (الأرخص/الأسرع)
 *      `bytedance-seed/seedream-4.5`   ← بديل
 *
 * ملاحظة: الموديلات دي **مش ظاهرة** في `GET /api/v1/models` العام
 * (قائمة الـ chat) — بس موجودة على الـ endpoints route. فالتشابه
 * مع كتالوج الـ chat مضلّل.
 */
export const OPENROUTER_IMAGE_MODELS = {
  "flux-2-pro": "black-forest-labs/flux.2-pro",
  "seedream-4.5": "bytedance-seed/seedream-4.5",
} as const;

export type OpenRouterImageModelId = keyof typeof OPENROUTER_IMAGE_MODELS;

/** الموديل الافتراضي — `flux.2-pro` (الأرخص والأسرع). */
export const DEFAULT_OPENROUTER_IMAGE_MODEL: OpenRouterImageModelId = "flux-2-pro";

/** أسماء الموديلات بصيغة `ImageModel` (للاستخدام في السلسلة والتسجيل). */
export const OPENROUTER_IMAGE_MODEL_KEYS = [
  "openrouter-flux",
  "openrouter-seedream",
] as const;

export type OpenRouterImageModelKey = (typeof OPENROUTER_IMAGE_MODEL_KEYS)[number];

/** خريطة `ImageModel` ⇄ slug بتاع OpenRouter. */
export const OPENROUTER_SLUG_BY_KEY: Record<OpenRouterImageModelKey, string> = {
  "openrouter-flux": OPENROUTER_IMAGE_MODELS["flux-2-pro"],
  "openrouter-seedream": OPENROUTER_IMAGE_MODELS["seedream-4.5"],
};

/** الخطأ ده معناه: حساب OpenRouter مش فيه رصيد (402). */
export class OpenRouterCreditsExhaustedError extends Error {
  readonly status = 402;
  constructor(message = "OpenRouter: رصيد غير كافٍ") {
    super(message);
    this.name = "OpenRouterCreditsExhaustedError";
  }
}

/* ═══════════════════════════ حالة الرصيد ═══════════════════════════ */

/**
 * ⚠️ **الرصيد خلص** ⇒ مش بنعمل نداء شبكة تاني لحد ما ينتهي الوقت.
 *
 * السبب: من غير الكاش ده، **كل** طلب صورة هيستنى رد OpenRouter (402)
 * قبل ما ينتقل لـ Pollinations ⇒ تأخير مكرر على كل صورة.
 *
 * المدة ١٠ دقايق: لو المستخدم زوّد رصيد، أبعد شوية هيتشتغل تاني.
 * (على serverless الـ instance بتموت قبل كده ⇒ إعادة تشغيل = كاش نضيف.)
 */
const CREDITS_COOLDOWN_MS = 10 * 60_000;
let creditsExhaustedUntil = 0;

/** هل الرصيد خلص دلوقتي (يعني نتخطّى OpenRouter)؟ */
export function openRouterCreditsExhausted(): boolean {
  return Date.now() < creditsExhaustedUntil;
}

/** يحدّث كاش «الرصيد خلص» — للاختبارات كمان. */
export function markOpenRouterCreditsExhausted(now: number = Date.now()): void {
  creditsExhaustedUntil = now + CREDITS_COOLDOWN_MS;
}

/** يمسح كاش «الرصيد خلص» (للاختبارات / بعد إضافة رصيد). */
export function resetOpenRouterCreditsState(): void {
  creditsExhaustedUntil = 0;
}

/* ═══════════════════════════ أدوات ═══════════════════════════ */

/**
 * يحدّد نوع الصورة من **بايتاتها** (مش من الـ content-type).
 *
 * ⚠️ ليه؟ الـ OpenRouter بيرجّع `b64_json` بس — **مافيش** content-type
 *    ولا امتداد ملف. فبدون ده هنخزّن صورة PNG بسمي JPEG.
 */
export function detectImageMime(base64: string): string {
  const head = base64.slice(0, 16);
  try {
    const bytes = Buffer.from(head, "base64");
    if (bytes.length >= 4) {
      // PNG: 89 50 4E 47
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return "image/png";
      }
      // JPEG: FF D8 FF
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
      }
      // WEBP: "RIFF" .... "WEBP"
      const riff = bytes.toString("ascii", 0, 4);
      if (riff === "RIFF") return "image/webp";
    }
  } catch {
    // fallback تحت
  }
  return "image/png";
}

/**
 * يحوّل `ImageSize` (أبعاد البكسل) لنسبة `aspect_ratio` بتاعة OpenRouter.
 *
 * ⚠️ **ليه نسب مش بكسل؟** الـ API بياخد `resolution` (دُرّة) +
 *    `aspect_ratio` (نسبة) — والبكسل بيتحسب لكل مزوّد.
 */
export function aspectRatioForSize(size: string): string {
  if (size === "1024x1792") return "9:16";
  if (size === "1792x1024") return "16:9";
  return "1:1";
}

/* ═══════════════════════════ الطلب ═══════════════════════════ */

export type OpenRouterImageInput = {
  prompt: string;
  /** `ImageModel` بتاع المشروع (مثل `openrouter-flux`). */
  model: OpenRouterImageModelKey;
  /** دُرّة الدقة — الافتراضي `1K`. */
  resolution?: string;
  /** نسبة الأبعاد — الافتراضي `1:1`. */
  aspectRatio?: string;
  /** مهلة الطلب (ms). */
  timeoutMs?: number;
};

export type OpenRouterImageOutput = {
  /** base64 خام (مش data URL). */
  base64: string;
  mimeType: string;
  /** slug الكامل (`black-forest-labs/flux.2-pro`). */
  model: string;
  /** تكلفة تقريبية بالدولار — من `usage.cost` لو رجعت. */
  cost: number;
};

/**
 * يولّد صورة واحدة من OpenRouter.
 *
 * ⚠️ **بيعمل نداء شبكة واحد بس** — مافيش retry داخلي. لو فشل،
 *    السلسلة (chain) بتنتقل للمزوّد اللي بعده.
 */
export async function generateWithOpenRouterImages(
  input: OpenRouterImageInput
): Promise<OpenRouterImageOutput> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenRouter: OPENROUTER_API_KEY غير معرّف");
  }

  // ⚠️ كاش الرصيد: نتجنّب نداء بيلفّ 402 كل مرة.
  if (openRouterCreditsExhausted()) {
    throw new OpenRouterCreditsExhaustedError(
      "OpenRouter: رصيد غير كافٍ (تخطّي مؤقت)",
    );
  }

  const slug = OPENROUTER_SLUG_BY_KEY[input.model];
  const resolution = input.resolution ?? "1K";
  const aspectRatio = input.aspectRatio ?? "1:1";

  const response = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // ⚠️ OpenRouter بتفضّل الـ attribution headers (اختيارية).
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
      "X-Title": "Magicly AI Core",
    },
    body: JSON.stringify({
      model: slug,
      prompt: input.prompt,
      resolution,
      aspect_ratio: aspectRatio,
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // ⚠️ 402 = رصيد مش كافٍ ⇒ ده مش فشل تقني، ده «حالة مزوّد».
    if (response.status === 402) {
      markOpenRouterCreditsExhausted();
      throw new OpenRouterCreditsExhaustedError(
        `OpenRouter: رصيد غير كافٍ — ${detail.slice(0, 200)}`,
      );
    }
    throw new Error(
      `OpenRouter images failed: ${response.status} — ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    usage?: { cost?: number };
  } | null;

  const first = payload?.data?.[0];
  const base64 = typeof first?.b64_json === "string" ? first.b64_json : "";
  if (!base64) {
    throw new Error("OpenRouter images: الرد مفيهوش صورة (b64_json فاضي)");
  }

  const cost =
    typeof payload?.usage?.cost === "number" ? payload.usage.cost : 0;

  return {
    base64,
    mimeType: detectImageMime(base64),
    model: slug,
    cost,
  };
}
