import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

/**
 * بروب حي واحد صغير لكل موديل مرشّح ("Say OK") — بدون طباعة أي قيم حساسة.
 * بيحدد إيه اللي يتفعّل فعلًا في MODEL_REGISTRY.
 */
const apiKey = process.env.NVIDIA_API_KEY?.trim();
const CANDIDATES = [
  "deepseek-ai/deepseek-v4-flash-0731",   // retry بعد أول 404
  "nvidia/nemotron-3-super-120b-a12b",    // مرشح PLANNING الأول في المصفوفة
  "nvidia/nemotron-3-ultra-550b-a55b",    // مرشح PLANNING البديل
];

for (const model of CANDIDATES) {
  const startedAt = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: 'Say "OK"' }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const latency = Date.now() - startedAt;
    if (!res.ok) {
      console.log(`${model} -> HTTP ${res.status} (${latency}ms)`);
      continue;
    }
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    console.log(
      `${model} -> HTTP 200 (${latency}ms) ${typeof content === "string" && content.trim() ? "VALID ✓" : "EMPTY_RESPONSE ✗"}`
    );
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.log(`${model} -> ${timedOut ? "TIMEOUT" : `NETWORK ERROR (${error?.cause?.code ?? error?.name ?? "?"})`}`);
  }
}
