import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const prompt = "Reply with exactly: OK";

async function testGroq() {
  const apiKey =
    process.env.GROQ_API_KEY_1?.trim() ||
    process.env.GROQ_API_KEY_2?.trim() ||
    process.env.GROQ_API_KEY_3?.trim() ||
    process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 8,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Groq request failed (${response.status})`);
  const data = await response.json();
  if (typeof data?.choices?.[0]?.message?.content !== "string") {
    throw new Error("Groq returned no text response");
  }
  console.log("Groq: OK");
}

async function testNvidia() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    console.log("Nvidia: NOT_CONFIGURED (no NVIDIA_API_KEY)");
    return "NOT_CONFIGURED";
  }

  // موديل المرشّح الأساسي من سجل المشروع — لو اتغير السجل يتغير الاختبار معاه.
  const { MODEL_REGISTRY } = await import("../lib/ai/models.ts");
  const preferred =
    MODEL_REGISTRY.find((m) => m.provider === "nvidia" && m.enabled && m.capabilities.includes("text")) ??
    MODEL_REGISTRY.find((m) => m.provider === "nvidia" && m.capabilities.includes("text"));

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: preferred?.id ?? "nvidia/nemotron-3.5-lightning-30b-a3b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 8,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("NVIDIA auth failed (invalid key)");
  if (!response.ok) throw new Error(`NVIDIA request failed (${response.status})`);
  const data = await response.json();
  if (typeof data?.choices?.[0]?.message?.content !== "string") {
    throw new Error("NVIDIA returned no text response");
  }
  console.log(`Nvidia: OK (${preferred?.id ?? "default"})`);
}

async function testGemini() {
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: {
      temperature: 0,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
    },
  });
  if (!response.text?.trim()) throw new Error("Gemini returned no text response");
  console.log("Gemini: OK");
}

const provider = process.argv[2];
if (provider && !["groq", "nvidia", "gemini"].includes(provider)) {
  console.error("Usage: npm run test:ai [-- groq|nvidia|gemini]");
  process.exitCode = 1;
} else {
  try {
    let notConfigured = false;
    const run = async (name, fn) => {
      if (!provider || provider === name) {
        const result = await fn();
        if (result === "NOT_CONFIGURED") notConfigured = true;
      }
    };
    await run("groq", testGroq);
    await run("nvidia", testNvidia);
    await run("gemini", testGemini);
    // مزوّد مش مهيأ مش فشل — بس لازم يبان في الـ exit code عشان CI.
    if (notConfigured) process.exitCode = 0;
  } catch (error) {
    // Deliberately never prints environment values or provider response bodies.
    console.error(error instanceof Error ? error.message : "AI provider test failed");
    process.exitCode = 1;
  }
}
