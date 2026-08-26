import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

/**
 * التحقق الحي من كتالوج OpenRouter (Task 3B).
 *
 * ١) بيفحص وجود OPENROUTER_API_KEY — غيابه مش فشل، ده NOT_CONFIGURED.
 * ٢) بيجيب الكتالوج الحقيقي ويصنّف: مجاني من التسعير الفعلي (مش الاسم)،
 *    والرؤية من architecture.input_modalities، وتوليد الصور/الفيديو من
 *    architecture.output_modalities.
 * ٣) بيجرّب أفضل المرشحين المجانيين بطلب حي صغير واحد لكل موديل.
 * ممنوع طباعة أي مفاتيح أو هيدرات أو أجسام استجابة كاملة.
 */

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.log("OPENROUTER_API_KEY = NOT_CONFIGURED");
  console.log("التطبيق شغّال عادي بدون OpenRouter — أضف المفتاح ثم أعد التشغيل للتحقق.");
  process.exit(0);
}

const isZero = (v) => v === "0" || v === "0.00000000" || Number(v) === 0;

function isFree(m) {
  const p = m.pricing ?? {};
  // free = prompt/completion صفر وكل جوانب التسعير المعروومة صفر
  return (
    isZero(p.prompt) && isZero(p.completion) &&
    ["image", "request", "web_search", "input_cache_read"].every((k) => p[k] === undefined || isZero(p[k]))
  );
}

async function fetchCatalog() {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.log(`/models -> HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data?.data ?? [];
}

async function probeText(modelId) {
  const startedAt = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: 'Say "OK"' }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const latency = Date.now() - startedAt;
    if (!res.ok) {
      console.log(`  ${modelId} -> HTTP ${res.status} (${latency}ms)`);
      return false;
    }
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    const ok = typeof content === "string" && content.trim().length > 0;
    console.log(`  ${modelId} -> HTTP 200 (${latency}ms) ${ok ? "VALID ✓" : "EMPTY_RESPONSE ✗"}`);
    return ok;
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.log(`  ${modelId} -> ${timedOut ? "TIMEOUT" : `NETWORK ERROR (${error?.cause?.code ?? error?.name ?? "?"})`}`);
    return false;
  }
}

console.log("OpenRouter Free Model Verification");
console.log("==================================");
const models = await fetchCatalog();
if (models.length === 0) process.exit(0);
console.log(`catalog: ${models.length} models`);

const freeModels = models.filter(isFree);
console.log(`free models (pricing-verified): ${freeModels.length}`);

const visionFree = freeModels.filter((m) => (m.architecture?.input_modalities ?? []).includes("image"));
const imageOut = models.filter((m) => (m.architecture?.output_modalities ?? []).includes("image"));
const videoOut = models.filter((m) => (m.architecture?.output_modalities ?? []).includes("video"));

console.log(`free VISION-capable: ${visionFree.length}`);
for (const m of visionFree.slice(0, 8)) console.log(`  ${m.id}`);
console.log(`image-output models: ${imageOut.length} | any FREE: ${imageOut.some(isFree) ? "YES" : "NO"}`);
console.log(`video-output models: ${videoOut.length} | any FREE: ${videoOut.some(isFree) ? "YES" : "NO"}`);

// بروب حي لأفضل المرشحين النصيين/الرؤية المجانيين (حد أقصى 5 عشان ما نعملش سبام).
const probeCandidates = [...new Set([...visionFree, ...freeModels].map((m) => m.id))].slice(0, 5);
let verified = 0;
for (const id of probeCandidates) {
  const ok = await probeText(id);
  verified ||= ok;
}

console.log("");
console.log(
  imageOut.some(isFree)
    ? "فيه موديل صور مجاني في الكتالوج — راجعه يدويًا قبل التسجيل."
    : "مفيش موديل صور/فيديو مجاني في الكتالوج الحالي → MEDIA_MODEL_UNAVAILABLE هو السلوك الصحيح."
);
console.log(verified ? "الموديلات المتحقق منها فوق تتسجّل في lib/ai/models.ts." : "مفيش موديل اتأكد — راجع المفتاح/الحساب.");
