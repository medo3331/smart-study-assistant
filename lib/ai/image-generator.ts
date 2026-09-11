/**
 * lib/ai/image-generator.ts — توليد الصور التعليمية
 *
 * سلسلة مزوّدين مع Fallback:
 *   Pollinations (مجاني — الأول دائمًا) → DALL-E 3 (OpenAI — الأعلى جودة)
 *   → Flux Pro (Replicate) → SD3/SDXL (Stability — الأرخص بين المدفوعين)
 *
 * أي مزوّد مدفوع بيشتغل بمفتاح البيئة الخاص به، ولو المفتاح مش موجود
 * بيتعدّى للذي بعده — ووجود Pollinations المجاني معناه إن الخدمة
 * بتفضل شغالة حتى لو مفيش أي مفاتيح مدفوعة خالص.
 *
 * ملحوظة: دي طبقة المزوّدين المستقلة عن مسار Gemini المجاني في
 * /api/ai/image-gen وبتستخدمها خدمة "استوديو الصور التعليمية".
 */

export type ImageModel =
  | "pollinations"
  | "dall-e-3"
  | "flux-pro"
  | "stable-diffusion-xl";
export type ImageSize = "1024x1024" | "1024x1792" | "1792x1024";
export type ImageStyle = "educational" | "realistic" | "cartoon" | "infographic";

export interface GenerateImageOptions {
  prompt: string;
  subject?: string;
  stage?: string;
  model?: ImageModel;
  size?: ImageSize;
  style?: ImageStyle;
  language?: "ar" | "en";
}

export interface ImageResult {
  url: string;
  revisedPrompt?: string;
  model: string;
  /** تكلفة تقريبية بالدولار — للتسجيل والتقارير فقط. */
  cost: number;
}

const REQUEST_TIMEOUT_MS = 90_000;
const FLUX_POLL_TIMEOUT_MS = 120_000;

// ============================================
// 1. بناء Prompt تعليمي محسّن
// ============================================
export function buildEducationalImagePrompt(options: GenerateImageOptions): string {
  const { prompt, subject, stage, style = "educational", language = "ar" } = options;

  const styleInstructions: Record<ImageStyle, string> = {
    educational: `Create a clear, educational illustration suitable for students.
Use bright colors, clean lines, and labeled diagrams.
Include visual metaphors that make abstract concepts concrete.
The image should look like a high-quality textbook illustration.`,

    realistic: `Create a photorealistic image that accurately depicts the scientific concept.
Suitable for advanced students. Include real-world context.`,

    cartoon: `Create a friendly, colorful cartoon illustration perfect for young learners.
Use cute characters, simple shapes, and fun visual metaphors.
Style similar to educational children's books.`,

    infographic: `Create a clean, modern infographic-style illustration.
Use icons, arrows, and structured layout.
Include data visualization elements where appropriate.
Minimal text, maximum visual clarity.`,
  };

  const stageAdjustments: Record<string, string> = {
    "ابتدائي": "Very simple, colorful, child-friendly. Large elements, minimal detail.",
    "متوسط": "Moderate complexity. Include some technical detail with visual explanations.",
    "إعدادي": "Moderate complexity. Include some technical detail with visual explanations.",
    "ثانوي": "Detailed and scientifically accurate. Include labels and annotations.",
    "جامعي": "Professional, publication-quality. Include complex diagrams and data.",
  };

  let fullPrompt = `${prompt}\n\n${styleInstructions[style]}`;

  if (stage && stageAdjustments[stage]) {
    fullPrompt += `\nTarget audience: ${stageAdjustments[stage]}`;
  }

  if (subject) {
    fullPrompt += `\nSubject context: ${subject}`;
  }

  if (language === "ar") {
    fullPrompt += `\nIf any text appears in the image, use Arabic script.`;
  }

  return fullPrompt;
}

// ============================================
// 2. Pollinations — مجاني وسريع، المزوّد الأول والفولباك الدائم
//    (موديل flux عبر Pollinations بيكتب نصوص عربي/إنجليزي كويس
//     و &nologo=true بيشيل اللوجو عشان الصور تبقى جاهزة للملفات)
// ============================================
const POLLINATIONS_TIMEOUT_MS = 75_000;

async function generateWithPollinations(
  prompt: string,
  size: ImageSize
): Promise<ImageResult> {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  const seed = Math.floor(Math.random() * 1_000_000);
  const [width, height] = size.split("x").map(Number);

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Pollinations failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) {
    throw new Error("Pollinations returned an empty image");
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const mimeType = contentType.startsWith("image/")
    ? contentType.split(";")[0]
    : "image/jpeg";
  const base64Image = `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;

  return {
    url: base64Image,
    model: "pollinations",
    cost: 0, // مجاني — لا تكلفة
  };
}

// ============================================
// 3. DALL-E 3 (OpenAI) — الأعلى جودة
// ============================================
async function generateWithDalle3(prompt: string, size: ImageSize): Promise<ImageResult> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size,
      quality: "standard",
      style: "vivid",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`DALL-E 3 failed: ${response.status} — ${err.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ url?: string; revised_prompt?: string }>;
  };
  const first = data.data?.[0];
  if (!first?.url) throw new Error("DALL-E 3 returned no image");

  return {
    url: first.url,
    revisedPrompt: first.revised_prompt,
    model: "dall-e-3",
    cost: size === "1024x1024" ? 0.04 : 0.08,
  };
}

// ============================================
// 4. Flux Pro (Replicate) — سريع وممتاز
// ============================================
async function generateWithFlux(prompt: string, size: ImageSize): Promise<ImageResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  const [width, height] = size.split("x").map(Number);

  const response = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio:
            size === "1024x1024" ? "1:1" : size === "1024x1792" ? "9:16" : "16:9",
          output_format: "png",
          width,
          height,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Flux failed: ${response.status}`);
  }

  type Prediction = {
    status: string;
    output?: string[] | string;
    error?: unknown;
    urls?: { get?: string };
  };

  let result = (await response.json()) as Prediction;
  const started = Date.now();

  // Poll for completion
  while (result.status !== "succeeded" && result.status !== "failed") {
    if (Date.now() - started > FLUX_POLL_TIMEOUT_MS) {
      throw new Error("Flux generation timed out");
    }
    if (!result.urls?.get) throw new Error("Flux returned no polling URL");
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(result.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    result = (await poll.json()) as Prediction;
  }

  if (result.status === "failed") {
    throw new Error(`Flux generation failed: ${String(result.error ?? "unknown")}`);
  }

  const output = Array.isArray(result.output) ? result.output[0] : result.output;
  if (!output) throw new Error("Flux returned no output");

  return {
    url: output,
    model: "flux-pro",
    cost: 0.055,
  };
}

// ============================================
// 5. Stable Diffusion (Stability AI) — الأرخص بين المدفوعين
// ============================================
async function generateWithSDXL(prompt: string, size: ImageSize): Promise<ImageResult> {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append(
    "aspect_ratio",
    size === "1024x1024" ? "1:1" : size === "1024x1792" ? "9:16" : "16:9"
  );
  form.append("output_format", "png");

  const response = await fetch(
    "https://api.stability.ai/v2beta/stable-image/generate/sd3",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Stability failed: ${response.status}`);
  }

  const data = (await response.json()) as { image?: string };
  if (!data.image) throw new Error("Stability returned no image data");

  return {
    url: `data:image/png;base64,${data.image}`,
    model: "stable-diffusion-xl",
    cost: 0.035,
  };
}

// ============================================
// 6. الدالة الرئيسية مع Fallback
// ============================================
export async function generateEducationalImage(
  options: GenerateImageOptions
): Promise<ImageResult> {
  const { model = "pollinations", size = "1024x1024" } = options;

  const enhancedPrompt = buildEducationalImagePrompt(options);

  // Fallback chain: ابدأ بالموديل المطلوب ثم جرّب الباقي بالترتيب.
  // المفتاح = متطلب البيئة؛ `undefined` يعني المزوّد شغال من غير مفتاح (مجاني).
  const generators: Array<{
    name: ImageModel;
    fn: () => Promise<ImageResult>;
    key?: string;
  }> = [
    {
      name: "pollinations",
      fn: () => generateWithPollinations(enhancedPrompt, size),
      // مجاني — من غير مفتاح
    },
    {
      name: "dall-e-3",
      fn: () => generateWithDalle3(enhancedPrompt, size),
      key: "OPENAI_API_KEY",
    },
    {
      name: "flux-pro",
      fn: () => generateWithFlux(enhancedPrompt, size),
      key: "REPLICATE_API_TOKEN",
    },
    {
      name: "stable-diffusion-xl",
      fn: () => generateWithSDXL(enhancedPrompt, size),
      key: "STABILITY_API_KEY",
    },
  ];

  const startIndex = generators.findIndex((g) => g.name === model);
  const first = startIndex >= 0 ? startIndex : 0;
  const ordered = [generators[first], ...generators.filter((_, i) => i !== first)];

  for (const gen of ordered) {
    if (gen.key && !process.env[gen.key]) {
      console.warn(`[Image Gen] Skipping ${gen.name}: no API key`);
      continue;
    }

    try {
      const result = await gen.fn();
      console.log(`[Image Gen] Success with ${gen.name} (~$${result.cost})`);
      return result;
    } catch (err) {
      console.error(`[Image Gen] ${gen.name} failed:`, (err as Error).message);
    }
  }

  throw new Error("عذراً، تعذر توليد الصورة حالياً. يرجى المحاولة مرة أخرى لاحقاً.");
}
