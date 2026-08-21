import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { AI_PROVIDER_BY_TASK, AiRouter } = await import("../lib/ai/routing.ts");
const { GEMINI_MODELS } = await import("../lib/ai-config.ts");

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed = 1;
};

// ١) سياسة التوجيه: كل مهمة على الـ provider الصح
check("groq is default for text tasks", ["chat", "content", "marketing_copy", "coding"].every((t) => AI_PROVIDER_BY_TASK[t] === "groq"));
check("gemini handles specialised tasks", ["file_analysis", "image_analysis", "data_analysis", "planning", "business_plan", "marketing_plan", "roadmap", "image_generation"].every((t) => AI_PROVIDER_BY_TASK[t] === "gemini"));

// ٢) image generation بيوصل لموديل صور فعلي مش موديل نص
check("image model differs from analysis model", GEMINI_MODELS.image && GEMINI_MODELS.image !== GEMINI_MODELS.analysis);

// ٣) مفيش fallback متقاطع: فشل توليد صورة لازم يطلع خطأ مش نص
const router = new AiRouter([{ name: "groq", completeChat: async () => ({ provider: "groq", model: "m", content: "نص", payload: {} }) }]);
try {
  await router.generateImage({ prompt: "اختبار" });
  check("image generation has no text fallback", false);
} catch {
  check("image generation has no text fallback", true);
}

// ٤) المفاتيح مش بتتسرب للكلاينت (مفيش NEXT_PUBLIC_ لملفات الـ AI)
check("no public AI env vars", !Object.keys(process.env).some((k) => k.startsWith("NEXT_PUBLIC_") && /GROQ|GEMINI/.test(k)));

// ٥) (اختياري) اختبار حي لو المفاتيح موجودة
if (process.env.GEMINI_API_KEY) {
  const { GoogleGenAI } = await import("@google/genai");
  try {
    const response = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.generateContent({
      model: GEMINI_MODELS.image,
      contents: "Generate a minimal blue circle on a plain white background.",
      config: { responseModalities: ["IMAGE"] },
    });
    check("live gemini image generation", (response.candidates?.[0]?.content?.parts ?? []).some((p) => p.inlineData?.data));
  } catch (error) {
    if (error?.status === 429 || error?.error?.code === 429) {
      console.log("SKIP  live gemini image generation (quota exceeded — not a code failure)");
    } else {
      check("live gemini image generation", false);
    }
  }
} else {
  console.log("SKIP  live gemini image generation (GEMINI_API_KEY missing)");
}

process.exit(failed);
