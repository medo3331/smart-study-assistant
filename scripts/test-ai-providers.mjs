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

/**
 * 📋 قائمة موديلات Groq المتاحة فعليًا على الحساب (read-only).
 *
 * ⚠️ **ليه**: قبل ما نضيف موديل لسجل المشروع (MODEL_REGISTRY) لازم نتأكد
 *    إنه موجود عند المزوّد فعلاً — مش من الذاكرة (ممنوع التخمّن).
 *
 * ⚠️ **مفيش أي secret بيتطبع** — أسماء الموديلات فقط.
 */
async function listGroqModels() {
  const apiKey =
    process.env.GROQ_API_KEY_1?.trim() ||
    process.env.GROQ_API_KEY_2?.trim() ||
    process.env.GROQ_API_KEY_3?.trim() ||
    process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Groq models list failed (${response.status})`);
  const data = await response.json();
  const models = (data.data ?? []).map((m) => m.id).sort((a, b) => a.localeCompare(b));
  console.log(`Groq models: ${models.length}`);
  for (const id of models) console.log("  •", id);

  // ⚠️ الموديلات المرشّحة للتوليد السريع — نتأكد من وجودها.
  const wanted = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ];
  console.log("\n=== المرشّحات ===");
  for (const id of wanted) {
    console.log(`${models.includes(id) ? "AVAILABLE" : "MISSING  "} — ${id}`);
  }
}

/**
 * 🔬 تشخيص **JSON التوليد**: هل الموديل بيرجّع `content` مبتور/فاضي؟
 *
 * ⚠️ **ليه**: في الإنتاج كل بنود الامتحان فشلت بـ`PROVIDER_ERROR` **بعد**
 *    ما الـsummary والـquestions اتنفذوا بنجاح (status=completed في
 *    `ai_usage_events`) ⇒ الفشل بعد النداء = غالبًا **JSON مش صالح**.
 *    و`gpt-oss-*` موديلات **استدلال**: ميزانية الـ`max_tokens` بتروح على
 *    التفكير ⇒ الـcontent بيتقطع ⇒ الـparse يفشل ⇒ 502/503.
 *
 * ⚠️ **مافيش بيانات طالب** — البرومبت أدناه اصطناعي بالكامل.
 */
async function diagExamJson() {
  const apiKey =
    process.env.GROQ_API_KEY_1?.trim() ||
    process.env.GROQ_API_KEY_2?.trim() ||
    process.env.GROQ_API_KEY_3?.trim() ||
    process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const model = process.argv[3] || "openai/gpt-oss-20b";
  const system = [
    "أنت «ماجيكلي»، مساعد مذاكرة. ولّد أسئلة اختبار من تفريغ محاضرة جامعية.",
    "",
    "اكتب بالضبط 5 سؤالًا بصيغة JSON فقط بالشكل:",
    '  {"type":"mcq","question":"…","options":["…","…","…","…"],"correctAnswer":0,"explanation":"…"}',
    "",
    "الأنواع المطلوبة بالظبط: اختيار من متعدد. أي سؤال بغير هذا النوع مرفوض.",
    "شروط عامة:",
    "• mcq: 4 اختيارات بالظبط، واحد صحيح فقط، وممنوع خياران متطابقان.",
    "• ممنوع مفاتيح إضافية في الـJSON.",
  ].join("\n");
  const user = "البناء الضوئي: الانكسار، العدسة، قانون سنل، البؤرة.";

  console.log(`=== تشخيص JSON التوليد — ${model} ===\n`);
  for (const maxTokens of [2048, 4000, 8000]) {
    const startedAt = Date.now();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const latency = Date.now() - startedAt;
    const text = await response.text();
    if (!response.ok) {
      console.log(`  ❌ max_tokens=${maxTokens} → ${response.status} (${latency}ms) ${text.slice(0, 160)}`);
      continue;
    }
    const data = JSON.parse(text);
    const choice = data.choices?.[0];
    const content = String(choice?.message?.content ?? "");
    const completion = data.usage?.completion_tokens;
    let jsonOk = false;
    let questions = 0;
    try {
      const parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
      jsonOk = true;
      questions = Array.isArray(parsed.questions) ? parsed.questions.length : 0;
    } catch {}
    const truncated = typeof completion === "number" && completion >= maxTokens;
    console.log(
      `  ${jsonOk && questions === 5 && !truncated ? "✅" : "⚠️"} max_tokens=${maxTokens} → ${latency}ms | completion_tokens=${completion} | json=${jsonOk} | أسئلة=${questions}${truncated ? " | ⚠️ مبتور" : ""}`
    );
    console.log(`     ↳ ${content.slice(0, 160).replace(/\n/g, " ")}`);
  }
}

const provider = process.argv[2];
if (provider === "groq:models") {
  try {
    await listGroqModels();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Groq models list failed");
    process.exitCode = 1;
  }
} else if (provider === "groq:json") {
  try {
    await diagExamJson();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Groq JSON diagnostic failed");
    process.exitCode = 1;
  }
} else if (provider && !["groq", "nvidia", "gemini"].includes(provider)) {
  console.error("Usage: npm run test:ai [-- groq|nvidia|gemini|groq:models]");
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
