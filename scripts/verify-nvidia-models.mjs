import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

/**
 * التحقق الحي من موديلات NVIDIA Free Endpoint قبل تفعيلها في MODEL_REGISTRY.
 *
 * ١) بيجيب قائمة الموديلات المتاحة فعليًا للحساب من /v1/models.
 * ٢) بيجرّب الموديلات المرشّحة بتاعة المشروع بطلب واحد صغير لكل موديل
 *    ("Say OK") وبيطبع حالة HTTP وزمن الاستجابة فقط.
 * ٣) ممنوع يطبع أي قيمة للمفتاح أو أجسام الاستجابة الكاملة.
 *
 * النتيجة هي اللي بتحدد إيه اللي يتقلب enabled:true في lib/ai/models.ts.
 * الاستخدام: node scripts/verify-nvidia-models.mjs
 */

const CANDIDATES = [
  { id: "nvidia/nemotron-3.5-lightning-30b-a3b", kind: "chat" },
  { id: "nvidia/nemotron-3-super-120b-a12b", kind: "chat" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", kind: "chat" },
  { id: "deepseek-ai/deepseek-v4-flash-0731", kind: "chat" },
  { id: "nvidia/nemotron-3-embed-1b", kind: "embeddings" },
];

const apiKey = process.env.NVIDIA_API_KEY?.trim();
if (!apiKey) {
  console.log("NVIDIA_API_KEY = NOT_CONFIGURED (متغير البيئة غير موجود/فاضي)");
  console.log("الخطوات: ضيف NVIDIA_API_KEY لـ .env.local ثم أعد تشغيل السكريبت.");
  process.exit(0);
}

async function listModels() {
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.log(`/v1/models -> HTTP ${res.status}${res.status === 401 ? " (AUTH_ERROR: مفتاح غير صالح)" : ""}`);
      return null;
    }
    const data = await res.json();
    const ids = Array.isArray(data?.data) ? data.data.map((m) => m?.id).filter(Boolean) : [];
    console.log(`/v1/models -> HTTP 200، عدد الموديلات المتاحة: ${ids.length}`);
    return new Set(ids);
  } catch (error) {
    console.log(`/v1/models -> NETWORK ERROR (${error?.cause?.code ?? error?.name ?? "unknown"})`);
    return null;
  }
}

async function probeChat(modelId) {
  const startedAt = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
      console.log(`  ${modelId} -> HTTP ${res.status} (${latency}ms)${res.status === 404 ? " — الموديل مش متاح للحساب" : res.status === 401 ? " — AUTH_ERROR" : res.status === 429 ? " — RATE_LIMITED" : ""}`);
      return false;
    }
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    const ok = typeof content === "string" && content.trim().length > 0;
    console.log(`  ${modelId} -> HTTP 200 (${latency}ms) ${ok ? "VALID ✓" : "EMPTY_RESPONSE ✗"}`);
    return ok;
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.log(`  ${modelId} -> ${timedOut ? "TIMEOUT" : `NETWORK ERROR (${error?.cause?.code ?? error?.name ?? "unknown"})`}`);
    return false;
  }
}

async function probeEmbedding(modelId) {
  const startedAt = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: ["ok"], model: modelId, encoding_format: "float" }),
      signal: AbortSignal.timeout(30_000),
    });
    const latency = Date.now() - startedAt;
    if (!res.ok) {
      console.log(`  ${modelId} -> HTTP ${res.status} (${latency}ms)`);
      return false;
    }
    const body = await res.json();
    const vector = body?.data?.[0]?.embedding;
    const ok = Array.isArray(vector) && vector.length > 0 && typeof vector[0] === "number";
    console.log(`  ${modelId} -> HTTP 200 (${latency}ms) ${ok ? `VALID ✓ dim=${vector.length}` : "EMPTY_RESPONSE ✗"}`);
    return ok;
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.log(`  ${modelId} -> ${timedOut ? "TIMEOUT" : `NETWORK ERROR (${error?.cause?.code ?? error?.name ?? "unknown"})`}`);
    return false;
  }
}

console.log("NVIDIA Free Endpoint verification");
console.log("=================================");
const available = await listModels();

let anyVerified = false;
for (const candidate of CANDIDATES) {
  if (available && !available.has(candidate.id)) {
    console.log(`  ${candidate.id} -> غير موجود في قائمة حسابك ✗`);
    continue;
  }
  const ok = candidate.kind === "chat" ? await probeChat(candidate.id) : await probeEmbedding(candidate.id);
  anyVerified ||= ok;
}

console.log("");
console.log(
  anyVerified
    ? "الموديلات المتحقق منها فوق تتفعّل في lib/ai/models.ts (enabled: true)."
    : "مفيش موديل مرشّح اتأكد — سيب enabled:false في lib/ai/models.ts وراجع المفتاح/الحساب."
);
