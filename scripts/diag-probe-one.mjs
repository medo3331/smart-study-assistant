import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

/** بروب واحد محدد لموديل أساسي مسجّل — بدون سبام. */
const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const modelId = process.argv[2] ?? "nvidia/nemotron-3.5-lightning:free";
const startedAt = Date.now();
try {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: 'Say "OK"' }], max_tokens: 8, temperature: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  const latency = Date.now() - startedAt;
  if (!res.ok) {
    console.log(`${modelId} -> HTTP ${res.status} (${latency}ms)`);
    process.exit(0);
  }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  console.log(`${modelId} -> HTTP 200 (${latency}ms) ${typeof content === "string" && content.trim() ? "VALID ✓" : "EMPTY_RESPONSE ✗"}`);
} catch (error) {
  console.log(`${modelId} -> ${error?.name === "TimeoutError" || error?.name === "AbortError" ? "TIMEOUT" : `NETWORK ERROR (${error?.cause?.code ?? error?.name ?? "?"})`}`);
}
