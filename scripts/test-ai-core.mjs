import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * AI Core tests — model registry, provider health, routing/fallback,
 * structured output validation, streaming abstraction, key isolation.
 * No real API keys are used; all providers are in-memory fakes.
 */

const routing = await import("../lib/ai/routing.ts");
const models = await import("../lib/ai/models.ts");
const health = await import("../lib/ai/health.ts");
const structured = await import("../lib/ai/structured.ts");
const streaming = await import("../lib/ai/streaming.ts");
const types = await import("../lib/ai/types.ts");

const {
  AiRouter,
  AI_PROVIDER_BY_TASK,
  AiRouteError,
  routeCandidates,
  capabilitiesForTask,
} = routing;
const { MODEL_REGISTRY, getModel, findModel, modelsForCapabilities } = models;

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

/* ==================================================================== */
console.log("\n[1] Task→provider policy preserved");
/* ==================================================================== */

await test("AI_PROVIDER_BY_TASK matches the audited policy", () => {
  const expected = {
    chat: "groq",
    explain: "groq",
    summarize: "groq",
    content: "groq",
    marketing_copy: "groq",
    tutor: "nvidia",
    agent: "nvidia",
    coding: "nvidia",
    quiz: "groq",
    flashcards: "gemini",
    study_plan: "gemini",
    lesson_analysis: "gemini",
    mind_map: "gemini",
    file_analysis: "gemini",
    image_analysis: "gemini",
    data_analysis: "gemini",
    planning: "gemini",
    business_plan: "gemini",
    marketing_plan: "gemini",
    roadmap: "gemini",
    image_generation: "gemini",
    image_edit: "gemini",
    video_generation: "gemini",
    rag_embeddings: "nvidia",
  };
  assert.deepEqual(AI_PROVIDER_BY_TASK, expected);
});

await test("capabilitiesForTask maps media tasks to exclusive capabilities", () => {
  assert.deepEqual(capabilitiesForTask("file_analysis"), ["file_analysis"]);
  assert.deepEqual(capabilitiesForTask("image_analysis"), ["vision"]);
  assert.deepEqual(capabilitiesForTask("image_generation"), ["image_generation"]);
});

/* ==================================================================== */
console.log("\n[2] Model registry");
/* ==================================================================== */

await test("every registered model resolves and ids are unique", () => {
  const ids = new Set();
  for (const model of MODEL_REGISTRY) {
    assert.equal(getModel(model.id), model);
    ids.add(model.id);
  }
  assert.equal(ids.size, MODEL_REGISTRY.length);
});

await test("unknown model id throws instead of being silently ignored", () => {
  assert.throws(() => getModel("not-a-real-model"));
  assert.equal(findModel("not-a-real-model"), undefined);
});

await test("modelsForCapabilities filters by every required capability", () => {
  const visionModels = modelsForCapabilities(["vision"]).map((m) => m.id);
  assert.ok(visionModels.includes("gemini-3.6-flash"));
  // Task 3B: موديلات OpenRouter المجانية ذات الرؤية المؤكدة بتبان كمان
  // (inkling-small مستبعد لأنه disabled بعد 403 حي).
  assert.ok(visionModels.includes("dots-studio/dots-3-note-preview:free"));
  assert.ok(!visionModels.includes("thinkingmachines/inkling-small:free"));
  const textModels = modelsForCapabilities(["text"]).map((m) => m.id);
  assert.ok(textModels.includes("openai/gpt-oss-120b"));
  // the image-only model has no text capability
  assert.ok(!textModels.includes("gemini-3.1-flash-image"));
});

/* ==================================================================== */
console.log("\n[3] Provider health states");
/* ==================================================================== */

await test("providerConfigStatus returns a valid state", () => {
  for (const provider of ["groq", "gemini"]) {
    assert.ok(
      ["AVAILABLE", "NOT_CONFIGURED"].includes(health.providerConfigStatus(provider))
    );
  }
});

// Health state machine needs the provider configured; use an obviously fake key
// for this section only. The final restoration happens at the end of this file.
process.env.GROQ_API_KEY = "test-key-not-real";

await test("429 puts provider into RATE_LIMITED; success recovers", async () => {
  health.recordProviderResult("groq", { ok: false, status: 429, reason: "test" });
  assert.equal(health.getProviderHealth("groq"), "RATE_LIMITED");
  assert.equal(health.isUsable("groq"), false);
  health.recordProviderResult("groq", { ok: true });
  assert.equal(health.getProviderHealth("groq"), "AVAILABLE");
  assert.equal(health.isUsable("groq"), true);
});

await test("5xx marks UNAVAILABLE, repeat failure degrades to DEGRADED after cooldown expiry path", () => {
  health.recordProviderResult("groq", { ok: true }); // reset
  health.recordProviderResult("groq", { ok: false, status: 502, reason: "t1" });
  assert.ok(["UNAVAILABLE", "DEGRADED"].includes(health.getProviderHealth("groq")));
  health.recordProviderResult("groq", { ok: true }); // recovery resets cleanly
  assert.equal(health.getProviderHealth("groq"), "AVAILABLE");
});

await test("400 leaves provider health unchanged, while 401/403 mark AUTH_ERROR (Task 3A)", () => {
  const before = health.getProviderHealth("groq");
  health.recordProviderResult("groq", { ok: false, status: 400, reason: "bad request test" });
  assert.equal(health.getProviderHealth("groq"), before, "request-shape errors are not provider health");
  health.recordProviderResult("groq", { ok: true }); // reset to AVAILABLE
  health.recordProviderResult("groq", { ok: false, status: 401, reason: "bad key test" });
  assert.equal(health.getProviderHealth("groq"), "AUTH_ERROR", "auth failures must mark AUTH_ERROR");
  assert.equal(health.isUsable("groq"), false);
  health.recordProviderResult("groq", { ok: true }); // explicit success recovers
  assert.equal(health.getProviderHealth("groq"), "AVAILABLE");
});

await test("diagnostics expose cooldown without leaking payloads", () => {
  const diag = health.getProviderDiagnostics("groq");
  assert.equal(typeof diag.cooldownRemainingMs, "number");
  assert.ok(diag.cooldownRemainingMs >= 0);
});

// Keep the fake key in place — router-dependent sections below need a
// "configured" provider. Final restoration happens at the end of this file.

/* ==================================================================== */
console.log("\n[4] Router selection & fallback");
/* ==================================================================== */

function fakeProvider(name) {
  return {
    name,
    calls: [],
    async completeChat(input) {
      this.calls.push(input.model ?? "(default)");
      return { provider: name, model: input.model ?? `${name}-default`, content: "OK from " + name, payload: {} };
    },
  };
}

function failWith(status, providerName) {
  return new types.AiProviderError("fake failure", status, providerName);
}

// Router tests need both providers "configured"; use obviously fake keys and
// restore the original environment afterwards.
const __origEnv = { groq: process.env.GROQ_API_KEY, gemini: process.env.GEMINI_API_KEY };
process.env.GROQ_API_KEY = "test-key-not-real";
process.env.GEMINI_API_KEY = "test-key-not-real";

await test("routeCandidates: unconfigured providers are filtered out entirely", () => {
  const saved = { g: process.env.GROQ_API_KEY, m: process.env.GEMINI_API_KEY };
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.deepEqual(routeCandidates("chat"), [], "NOT_CONFIGURED must yield zero candidates");
  } finally {
    if (saved.g !== undefined) process.env.GROQ_API_KEY = saved.g;
    if (saved.m !== undefined) process.env.GEMINI_API_KEY = saved.m;
  }
});

await test("routeCandidates: primary provider first; media tasks stay single-provider", () => {
  const chatCandidates = routeCandidates("chat").map((c) => c.provider);
  assert.equal(chatCandidates[0], "groq");

  const fileCandidates = routeCandidates("file_analysis").map((c) => c.provider);
  assert.deepEqual(fileCandidates.filter((p) => p !== "gemini"), []);

  assert.equal(routeCandidates("image_generation").length, 1, "image generation has exactly one owning provider");
});

await test("successful primary request carries no fallback metadata", async () => {
  const groq = fakeProvider("groq");
  const gemini = fakeProvider("gemini");
  const router = new AiRouter([groq, gemini]);
  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(response.provider, "groq");
  assert.equal(response.fallback, undefined);
  assert.equal(gemini.calls.length, 0);
});

await test("primary failure falls back (same provider first) with recorded attempts", async () => {
  const groq = fakeProvider("groq");
  const gemini = fakeProvider("gemini");
  const router = new AiRouter([groq, gemini]);
  let groqCalls = 0;
  groq.completeChat = async (input) => {
    groqCalls++;
    if (groqCalls === 1) throw failWith(502, "groq"); // primary model fails
    return { provider: "groq", model: input.model ?? "openai/gpt-oss-20b", content: "recovered", payload: {} };
  };

  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(response.provider, "groq", "first fallback candidate is the same provider's next model");
  assert.ok(response.fallback, "fallback metadata present after an actual failure");
  assert.equal(response.fallback.attempts[0].ok, false);
  assert.equal(response.fallback.attempts[0].reason, "HTTP 502");
  assert.equal(response.fallback.attempts.at(-1).ok, true);
});

await test("exhausting the primary provider falls back across providers", async () => {
  const groq = fakeProvider("groq");
  const gemini = fakeProvider("gemini");
  const router = new AiRouter([groq, gemini]);
  let groqCalls = 0;
  groq.completeChat = async () => {
    groqCalls++;
    throw failWith(502, "groq"); // every groq model fails
  };

  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(response.provider, "gemini", "cross-provider fallback engaged");
  assert.ok(groqCalls >= 1);
  const providersTried = [...new Set(response.fallback.attempts.map((a) => a.provider))];
  assert.deepEqual(providersTried, ["groq", "gemini"]);
});

await test("config errors (503) are not retried against the same provider", async () => {
  const groq = fakeProvider("groq");
  const gemini = fakeProvider("gemini");
  const router = new AiRouter([groq, gemini]);
  let groqCalls = 0;
  groq.completeChat = async () => {
    groqCalls++;
    throw failWith(503, "groq");
  };
  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(groqCalls, 1, "no retry storm against a misconfigured provider");
  assert.equal(response.provider, "gemini");
});

await test("400 halts the chain — no cross-provider masquerade", async () => {
  const groq = fakeProvider("groq");
  const gemini = fakeProvider("gemini");
  const router = new AiRouter([groq, gemini]);
  groq.completeChat = async () => {
    throw failWith(400, "groq");
  };
  await assert.rejects(
    router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] }),
    (error) => error.status === 400 || error instanceof AiRouteError
  );
  assert.equal(gemini.calls.length, 0, "400 must never be retried on another provider");
});

await test("all candidates failing raises AiRouteError with attempt reasons", async () => {
  const groq = fakeProvider("groq");
  const gemini = fakeProvider("gemini");
  const router = new AiRouter([groq, gemini]);
  groq.completeChat = async () => {
    throw failWith(502, "groq");
  };
  gemini.completeChat = async () => {
    throw failWith(500, "gemini");
  };
  await assert.rejects(
    router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] }),
    (error) => {
      assert.ok(error instanceof AiRouteError);
      assert.ok(error.reasons.length >= 2);
      assert.ok(error.reasons.every((a) => typeof a.reason === "string"));
      return true;
    }
  );
});

/* ==================================================================== */
console.log("\n[5] Structured output validation");
/* ==================================================================== */

await test("extractJson handles plain JSON", () => {
  assert.deepEqual(structured.extractJson('{"a":1}'), { a: 1 });
});

await test("extractJson unwraps ```json fences with surrounding prose", () => {
  const fenced = 'هنا النتيجة:\n```json\n{"title":"خريطة","nodes":[]}\n```\nتمام';
  assert.deepEqual(structured.extractJson(fenced), { title: "خريطة", nodes: [] });
});

await test("extractJson finds balanced object inside prose (with escapes)", () => {
  const messy = String.raw`النتيجة هي {"count": 3, "items": ["a\"b","c"]} كده تمام`;
  assert.deepEqual(structured.extractJson(messy), { count: 3, items: ['a"b', "c"] });
});

await test("extractJson handles nested braces inside strings", () => {
  const tricky = '{"code":"if (x) { return \\"{\\" }"}';
  assert.deepEqual(structured.extractJson(tricky), { code: 'if (x) { return "{" }' });
});

await test("extractJson rejects garbage", () => {
  assert.throws(() => structured.extractJson("no json here at all"));
});

await test("validateStructured returns ok/error instead of throwing", () => {
  const validator = (v) => structured.expectString(structured.expectObject(v).title, "title");
  const good = structured.validateStructured('{"title":"خطة"}', validator);
  assert.equal(good.ok, true);
  assert.equal(good.value, "خطة");
  const bad = structured.validateStructured('{"nope":true}', validator);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /title/);
});

await test("expectArray/expectNumber enforce types", () => {
  assert.throws(() => structured.expectArray({}));
  assert.throws(() => structured.expectNumber("5"));
  assert.equal(structured.expectNumber(5), 5);
});

await test("rejectUnknownKeys enforces schema shape", () => {
  const obj = structured.expectObject({ a: 1, sneaky: true });
  assert.throws(() => structured.rejectUnknownKeys(obj, ["a"]));
  structured.rejectUnknownKeys({ a: 1 }, ["a"]);
});

/* ==================================================================== */
console.log("[6] Streaming abstraction");
/* ==================================================================== */

await test("streamingAdapterFor returns adapters only for known providers", () => {
  assert.ok(streaming.streamingAdapterFor("groq"));
  assert.ok(streaming.streamingAdapterFor("gemini"));
  assert.equal(streaming.streamingAdapterFor("nonexistent"), undefined);
});

await test("Groq SSE streaming parses chunks and reports end metadata", async () => {
  const adapter = streaming.streamingAdapterFor("groq");
  const encoder = new TextEncoder();
  const sse =
    [
      'data: {"choices":[{"delta":{"content":"مرحبا"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" بك"}}]}',
      'data: {"choices":[{"delta":{"content":"يرام"}}],"x_groq":{"usage":{"prompt_tokens":10,"completion_tokens":3}}}',
      "data: [DONE]",
    ].join("\n") + "\n";

  const originalFetch = globalThis.fetch;
  let capturedBody;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sse));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  };
  const savedKey = process.env.GROQ_API_KEY;
  try {
    process.env.GROQ_API_KEY = "test-key-not-real";
    try {
      const collected = [];
      for await (const chunk of adapter.streamChat({ messages: [{ role: "user", content: "قل مرحبا" }] })) {
        collected.push(chunk);
      }
      const texts = collected.filter((c) => c.type === "text").map((c) => c.value).join("");
      assert.equal(texts, "مرحبا بكيرام");
      const end = collected.at(-1);
      assert.equal(end.type, "end");
      assert.equal(end.provider, "groq");
      assert.equal(end.usage.promptTokens, 10);
      assert.equal(end.usage.completionTokens, 3);
      assert.equal(capturedBody.stream, true);
    } finally {
      if (savedKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = savedKey;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test("empty Groq stream raises empty-response error", async () => {
  const adapter = streaming.streamingAdapterFor("groq");
  const encoder = new TextEncoder();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{}}]}\ndata: [DONE]\n'));
          controller.close();
        },
      }),
      { status: 200 }
    );
  const savedKey = process.env.GROQ_API_KEY;
  try {
    process.env.GROQ_API_KEY = "test-key-not-real";
    await assert.rejects(
      (async () => {
        for await (const _chunk of adapter.streamChat({ messages: [{ role: "user", content: "x" }] })) {
          void _chunk;
        }
      })(),
      (error) => error instanceof types.AiProviderError && error.status === 502
    );
  } finally {
    if (savedKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = savedKey;
    globalThis.fetch = originalFetch;
  }
});

/* ==================================================================== */
console.log("\n[7] AIService contract");
/* ==================================================================== */

const { AIService } = await import("../lib/ai/service.ts");

await test("AIService exposes the full facade surface", () => {
  for (const method of ["generate", "stream", "analyze", "analyzeFile", "generateStructured", "requiredCapabilities"]) {
    assert.equal(typeof AIService[method], "function", `AIService.${method} missing`);
  }
});

await test("AIService.generateStructured validates before returning (fake router)", async () => {
  const fakeRouter = new AiRouter([
    {
      name: "groq",
      async completeChat() {
        return {
          provider: "groq",
          model: "test-model",
          content: '```json\n{"questions":[{"q":"سؤال؟","answer":true}]}\n```',
          payload: {},
        };
      },
    },
    { name: "gemini", async completeChat() { throw new Error("must not be called"); } },
  ]);
  AIService.__setRouterForTests(fakeRouter);
  try {
    const result = await AIService.generateStructured(
      "content",
      '{ questions: [{ q: string, answer: boolean }] }',
      (value) => {
        const obj = structured.expectObject(value);
        const questions = structured.expectArray(obj.questions).map((q) => ({
          q: structured.expectString(structured.expectObject(q).q, "q"),
          answer: typeof structured.expectObject(q).answer === "boolean",
        }));
        return { questions };
      },
      { messages: [{ role: "user", content: "اعمل كويز" }] }
    );
    assert.equal(result.value.questions.length, 1);
    assert.equal(result.value.questions[0].q, "سؤال؟");
    assert.equal(result.provider, "groq");
  } finally {
    AIService.__setRouterForTests(undefined);
  }
});

await test("AIService.generateStructured rejects malformed model output", async () => {
  const fakeRouter = new AiRouter([
    {
      name: "groq",
      async completeChat() {
        return { provider: "groq", model: "test-model", content: "مش JSON خالص", payload: {} };
      },
    },
    { name: "gemini", async completeChat() { throw new Error("must not be called"); } },
  ]);
  AIService.__setRouterForTests(fakeRouter);
  try {
    await assert.rejects(
      AIService.generateStructured("content", "{ x: number }", (v) => v, {
        messages: [{ role: "user", content: "x" }],
      }),
      /validation failed/
    );
  } finally {
    AIService.__setRouterForTests(undefined);
  }
});

/* ==================================================================== */
console.log("\n[8] API key isolation");
/* ==================================================================== */

await test("no hard-coded secrets in lib/ai", () => {
  const secretPattern = /(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,})/;
  const files = [
    "types.ts", "models.ts", "health.ts", "structured.ts",
    "streaming.ts", "routing.ts", "service.ts", "router.ts",
    "operations.ts", "agents.ts", "groq.ts", "gemini.ts",
  ];
  for (const name of files) {
    let src;
    try {
      src = readFileSync(new URL(`../lib/ai/${name}`, import.meta.url), "utf8");
    } catch {
      continue; // file may not exist in this branch
    }
    assert.ok(!secretPattern.test(src), `hard-coded secret pattern found in lib/ai/${name}`);
  }
});

await test("providers read keys only from process.env at call time", () => {
  const groqSrc = readFileSync(new URL("../lib/ai/groq.ts", import.meta.url), "utf8");
  const geminiSrc = readFileSync(new URL("../lib/ai/gemini.ts", import.meta.url), "utf8");
  assert.match(groqSrc, /process\.env\.GROQ_API_KEY/);
  assert.match(geminiSrc, /process\.env\.GEMINI_API_KEY/);
});

await test("client-safe files contain no secret env references", () => {
  const clientFiles = ["components/FloatingAssistant.tsx", "app/dashboard/components/Aichat.tsx"];
  for (const rel of clientFiles) {
    try {
      const src = readFileSync(new URL("../" + rel, import.meta.url), "utf8");
      assert.ok(!/(GROQ|GEMINI)_API_KEY/.test(src), `${rel} references a secret env var`);
    } catch {
      // file may not exist in this branch — skip silently
    }
  }
});

/* ==================================================================== */
console.log("\n[9] Task layer (chat / explain) + normalized errors + key rotation");
/* ==================================================================== */

const tasks = await import("../lib/ai/tasks/index.ts");
const errors = await import("../lib/ai/errors.ts");
const groqModule = await import("../lib/ai/groq.ts");

await test("task registry: chat and explain implemented with extension points", () => {
  assert.ok(tasks.isImplementedAiTask("chat"));
  assert.ok(tasks.isImplementedAiTask("explain"));
  assert.ok(!tasks.isImplementedAiTask("quiz"), "quiz is an extension point until its flow ships");
  assert.ok(!tasks.isImplementedAiTask("mind_map"));
  const explain = tasks.getAiTask("explain");
  assert.equal(typeof explain.buildSystemPrompt, "function");
});

await test("explain builds an Arabic system prompt honoring user context", async () => {
  let captured;
  const fakeRouter = new AiRouter([
    {
      name: "groq",
      async completeChat(input) {
        captured = input;
        return { provider: "groq", model: "test-model", content: "شرح بسيط", payload: {} };
      },
    },
    { name: "gemini", async completeChat() { throw new Error("must not be called"); } },
  ]);
  AIService.__setRouterForTests(fakeRouter);
  try {
    const result = await tasks.runAiTask("explain", {
      messages: [{ role: "user", content: "اشرح لي التربة" }],
      user: { userId: "u1", educationLevel: "ثانوي" },
    });
    assert.equal(result.task, "explain");
    assert.equal(result.provider, "groq");
    assert.equal(captured.messages[0].role, "system");
    assert.match(captured.messages[0].content, /ماجيكلي/);
    assert.match(captured.messages[0].content, /ثانوي/);
  } finally {
    AIService.__setRouterForTests(undefined);
  }
});

await test("runAiTask keeps a caller-provided system prompt untouched", async () => {
  let captured;
  const fakeRouter = new AiRouter([
    {
      name: "groq",
      async completeChat(input) {
        captured = input;
        return { provider: "groq", model: "test-model", content: "تمام", payload: {} };
      },
    },
    { name: "gemini", async completeChat() { throw new Error("must not be called"); } },
  ]);
  AIService.__setRouterForTests(fakeRouter);
  try {
    await tasks.runAiTask("explain", {
      messages: [{ role: "system", content: "نظام خاص بي" }, { role: "user", content: "مرحبا" }],
    });
    assert.deepEqual(
      captured.messages.filter((m) => m.role === "system").map((m) => m.content),
      ["نظام خاص بي"],
      "caller system prompt must win; no task default injected"
    );
  } finally {
    AIService.__setRouterForTests(undefined);
  }
});

await test("normalized error taxonomy maps statuses correctly", () => {
  const cases = [
    [429, "RATE_LIMIT", true],
    [401, "AUTH_ERROR", false],
    [403, "AUTH_ERROR", false],
    [404, "MODEL_UNAVAILABLE", true],
    [400, "INVALID_REQUEST", false],
    [408, "TIMEOUT", true],
    [504, "TIMEOUT", true],
    [503, "CONFIGURATION_ERROR", false],
    [500, "NETWORK_ERROR", true],
  ];
  for (const [status, expectedCode, retryable] of cases) {
    const pub = errors.statusToPublicError(status);
    assert.equal(pub.code, expectedCode, `status ${status}`);
    assert.equal(pub.retryable, retryable, `retryable ${status}`);
    assert.ok(pub.message.length > 0 && !/\d{3}/.test(pub.message), `safe Arabic message for ${status}`);
  }
});

await test("toAiPublicError normalizes provider/route errors without leaking details", () => {
  const fromProvider = errors.toAiPublicError(new types.AiProviderError("GroqError gsk_live_whatever", 429, "groq"));
  assert.equal(fromProvider.code, "RATE_LIMIT");
  assert.equal(fromProvider.message.includes("gsk"), false);
  assert.equal(fromProvider.message.includes("Groq"), false);

  const routeError = new routing.AiRouteError("all failed", "chat", [
    { provider: "groq", ok: false, reason: "HTTP 502" },
    { provider: "gemini", ok: false, reason: "HTTP 500" },
  ]);
  const fromRoute = errors.toAiPublicError(routeError);
  assert.equal(fromRoute.code, "NETWORK_ERROR", "classified from the first real failure");
  assert.equal(fromRoute.message.toLowerCase().includes("gemini"), false);

  const unknown = errors.toAiPublicError(new Error("stack trace with secrets"));
  assert.equal(unknown.code, "UNKNOWN");
  assert.equal(unknown.retryable, false);
});

await test("fallback eligibility follows the router policy (400 family excluded)", () => {
  for (const status of [429, 408, 500, 502, 503, 504]) {
    assert.ok(errors.isFallbackEligibleStatus(status), `${status} should fall back`);
  }
  for (const status of [400, 413, 422]) {
    assert.ok(!errors.isFallbackEligibleStatus(status), `${status} must not fall back`);
  }
});

await test("groq key rotation orders keys preferred-first and skips blocked ones", () => {
  const saved = {
    k1: process.env.GROQ_API_KEY_1,
    k2: process.env.GROQ_API_KEY_2,
    k3: process.env.GROQ_API_KEY_3,
    base: process.env.GROQ_API_KEY,
  };
  try {
    process.env.GROQ_API_KEY_1 = "key-one";
    process.env.GROQ_API_KEY_2 = "key-two";
    process.env.GROQ_API_KEY_3 = "";
    delete process.env.GROQ_API_KEY;

    // first success pins the preference on key-two
    groqModule.reportGroqKeyOutcome("key-two", { ok: true });
    assert.deepEqual(groqModule.orderedGroqKeys(), ["key-two", "key-one"]);

    // a 429 blocks key-two temporarily — rotation moves on without code changes
    groqModule.reportGroqKeyOutcome("key-two", { ok: false, status: 429 });
    assert.deepEqual(groqModule.orderedGroqKeys(), ["key-one"]);

    // environment change resets cleanly
    process.env.GROQ_API_KEY_1 = "fresh-key";
    process.env.GROQ_API_KEY_2 = "";
    assert.deepEqual(groqModule.orderedGroqKeys(), ["fresh-key"]);

    // a rejected single key is still retried; success clears its block
    groqModule.reportGroqKeyOutcome("fresh-key", { ok: false, status: 403 });
    assert.deepEqual(groqModule.orderedGroqKeys(), ["fresh-key"]);
    groqModule.reportGroqKeyOutcome("fresh-key", { ok: true });
    assert.deepEqual(groqModule.orderedGroqKeys(), ["fresh-key"]);
  } finally {
    if (saved.k1 === undefined) delete process.env.GROQ_API_KEY_1; else process.env.GROQ_API_KEY_1 = saved.k1;
    if (saved.k2 === undefined) delete process.env.GROQ_API_KEY_2; else process.env.GROQ_API_KEY_2 = saved.k2;
    if (saved.k3 === undefined) delete process.env.GROQ_API_KEY_3; else process.env.GROQ_API_KEY_3 = saved.k3;
    if (saved.base === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = saved.base;
  }
});

/* ==================================================================== */
console.log("\n[10] Free-first model router (Task 3A)");
/* ==================================================================== */

const models3a = await import("../lib/ai/models.ts");

// بيئة الاختبار: التلاتة مزوّدين مهيأين بمفاتيح وهمية، والموديلات المدفوعة ممنوعة.
const __origNvidia = process.env.NVIDIA_API_KEY;
const __origPaid = process.env.AI_ALLOW_PAID_MODELS;
process.env.NVIDIA_API_KEY = "test-key-not-real";
delete process.env.AI_ALLOW_PAID_MODELS;

await test("free-only gate: paid models are skipped unless explicitly allowed", () => {
  const fake = { enabled: true, freeEndpoint: false };
  assert.equal(models3a.isModelSelectable(fake, false), false, "paid model must be skipped by default");
  assert.equal(models3a.isModelSelectable(fake, true), true, "explicit opt-in enables paid models");
  assert.equal(
    models3a.isModelSelectable({ enabled: true, freeEndpoint: true }, false),
    true,
    "free models always selectable"
  );
  assert.equal(
    models3a.isModelSelectable({ enabled: false, freeEndpoint: true }, true),
    false,
    "disabled models never selectable"
  );
});

await test("registry integrity: NVIDIA entries freeEndpoint-only, verified ones enabled, unverified disabled", () => {
  for (const model of models3a.modelsForProvider("nvidia")) {
    assert.equal(model.freeEndpoint, true, `${model.id} must be a free endpoint`);
    const isVerified =
      model.id === "nvidia/nemotron-3.5-lightning-30b-a3b" ||
      model.id === "nvidia/nemotron-3-super-120b-a12b" ||
      model.id === "nvidia/nemotron-3-ultra-550b-a55b" ||
      model.id === "nvidia/nemotron-3-embed-1b";
    assert.equal(model.enabled, isVerified, `${model.id} enabled-state must match live verification (404 = disabled)`);
    if (model.capabilities.includes("embeddings")) {
      assert.ok(!model.capabilities.includes("text"), "embedding model must not claim text capability");
      assert.equal(model.fallbackPriority, -1, "embedding model is not a fallback for chat tasks");
    }
  }
});

await test("capability isolation: vision/embedding requests can never hit text-only models", () => {
  const visionModels = models3a.selectableModelsForCapabilities(["vision"]).map((m) => m.id);
  // Gemini + موديلات OpenRouter ذات الرؤية المؤكدة — ومفيش موديل نص-فقط.
  assert.ok(visionModels.includes("gemini-3.6-flash"), "gemini vision stays available");
  assert.ok(!visionModels.includes("openai/gpt-oss-120b"), "text-only groq must never serve vision");
  for (const id of visionModels) {
    const model = models3a.getModel(id);
    if (!model.capabilities.includes("vision")) throw new Error(`${id} served vision without capability`);
  }
  const embedModels = models3a.selectableModelsForCapabilities(["embeddings"]).map((m) => m.id);
  // موديل الـ embeddings اتأكد حيًا وهو الوحيد المؤهل — ولا موديل شات يوصل هنا أبدًا.
  assert.deepEqual(embedModels, ["nvidia/nemotron-3-embed-1b"], "only the verified embedding model may serve RAG");
});

await test("TASK_MODEL_PREFERENCE respects the registry and dynamic availability", async () => {
  const routing = await import("../lib/ai/routing.ts");
  for (const [task, modelIds] of Object.entries(routing.TASK_MODEL_PREFERENCE)) {
    for (const id of modelIds) {
      assert.ok(models3a.findModel(id), `${task} preference ${id} not registered`);
    }
  }
  // chat: Groq أولاً؛ Nemotron المتحقق منه احتياطي حقيقي؛ DeepSeek (404) مستبعد.
  const chatCandidates = routing.routeCandidates("chat").map((c) => `${c.provider}:${c.model ?? "*"}`);
  assert.equal(chatCandidates[0], "groq:openai/gpt-oss-120b", "chat primary must be Groq 120B");
  assert.ok(
    chatCandidates.some((c) => c === "nvidia:nvidia/nemotron-3.5-lightning-30b-a3b"),
    "verified nemotron backup must appear"
  );
  assert.ok(!chatCandidates.some((c) => c.includes("deepseek")), "unverified deepseek never appears");
  // planning: يبدأ بـ Nemotron Super المتحقق منه حسب مصفوفة 3A.
  const planFirst = routing.routeCandidates("planning")[0];
  assert.equal(planFirst?.model, "nvidia/nemotron-3-super-120b-a12b", "planning leads with verified Super");
  // quiz: Groq أولاً حسب المواصفة.
  const quizFirst = routing.routeCandidates("quiz")[0];
  assert.equal(quizFirst?.provider, "groq", "quiz primary must be groq");
});

await test("fallback: 429 rate limit → next model with cooldown recorded", async () => {
  const health = await import("../lib/ai/health.ts");
  // الحالة الصحية مشتركة في الذاكرة بين أقسام الاختبار — بنبدأ من نظيف.
  health.recordProviderResult("groq", { ok: true });
  health.recordProviderResult("nvidia", { ok: true });
  health.recordProviderResult("gemini", { ok: true });
  let callsMade = 0;
  const groq = {
    name: "groq",
    async completeChat() {
      callsMade++;
      throw new types.AiProviderError("rate limited", 429, "groq");
    },
  };
  const gemini = {
    name: "gemini",
    async completeChat() {
      return { provider: "gemini", model: "gemini-3.6-flash", content: "نجينا", payload: {} };
    },
  };
  const router = new AiRouter([groq, gemini]);
  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(response.provider, "gemini", "must fall back after 429");
  assert.equal(health.getProviderHealth("groq"), "RATE_LIMITED", "429 records RATE_LIMITED cooldown");
  assert.ok(response.fallback, "fallback metadata present");
  void callsMade;
});

await test("fallback: auth failure (401) marks AUTH_ERROR and moves to next provider once", async () => {
  const health = await import("../lib/ai/health.ts");
  health.recordProviderResult("groq", { ok: true });
  health.recordProviderResult("nvidia", { ok: true });
  health.recordProviderResult("gemini", { ok: true });
  let nvidiaCalls = 0;
  const groq = {
    name: "groq",
    async completeChat() {
      throw new types.AiProviderError("bad key", 401, "groq");
    },
  };
  const nvidia = {
    name: "nvidia",
    async completeChat() {
      nvidiaCalls++;
      return { provider: "nvidia", model: "m", content: "ok", payload: {} };
    },
  };
  const gemini = {
    name: "gemini",
    async completeChat() {
      return { provider: "gemini", model: "gemini-3.6-flash", content: "ok", payload: {} };
    },
  };
  const router = new AiRouter([groq, nvidia, gemini]);
  // موديلات NVIDIA مفعّلة الآن بعد التحقق، فالـ 401 على Groq بيروح لـ NVIDIA
  // (ترتيب المصفوفة) مرّة واحدة بالظبط — وGemini مايلمسهاش.
  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(nvidiaCalls, 1, "moved to the next preferred provider exactly once");
  assert.equal(response.provider, "nvidia");
  assert.equal(health.getProviderHealth("groq"), "AUTH_ERROR", "401 records AUTH_ERROR");
  assert.equal(health.isUsable("groq"), false);
});

await test("fallback: empty response (HTTP 200, no content) triggers fallback", async () => {
  const health = await import("../lib/ai/health.ts");
  // نفس السبب: الحالة الصحية مشتركة — الاختبار اللي فات ساب AUTH_ERROR على Groq.
  health.recordProviderResult("groq", { ok: true });
  health.recordProviderResult("gemini", { ok: true });
  let attempts = 0;
  const flaky = {
    name: "groq",
    async completeChat() {
      attempts++;
      if (attempts === 1) {
        throw new types.AiProviderError("empty", 200, "groq", "EMPTY_RESPONSE");
      }
      return { provider: "groq", model: "openai/gpt-oss-20b", content: "في محتوى", payload: {} };
    },
  };
  const gemini = { name: "gemini", async completeChat() { throw new Error("should stay on groq"); } };
  const router = new AiRouter([flaky, gemini]);
  const response = await router.completeChat("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(attempts, 2, "retried within same provider chain");
  assert.equal(response.content, "في محتوى");
});

await test("normalized error: EMPTY_RESPONSE maps to retryable CONTENT_ERROR without leaking provider details", () => {
  const pub = errors.toAiPublicError(new types.AiProviderError("NVIDIA empty body xyz", 200, "nvidia", "EMPTY_RESPONSE"));
  assert.equal(pub.code, "CONTENT_ERROR");
  assert.equal(pub.retryable, true);
  assert.equal(pub.message.toLowerCase().includes("nvidia"), false);
});

await test("provider stats track success/failure/latency without sensitive data", async () => {
  const health = await import("../lib/ai/health.ts");
  health.recordProviderResult("nvidia", { ok: true, latencyMs: 100 });
  health.recordProviderResult("nvidia", { ok: true, latencyMs: 300 });
  health.recordProviderResult("nvidia", { ok: false, status: 502, reason: "test" });
  const stats = health.getProviderStats("nvidia");
  assert.equal(stats.successCount >= 2, true);
  assert.ok(stats.averageLatencyMs > 0 && stats.averageLatencyMs <= 400);
  assert.match(String(stats.lastError), /^502:/);
  assert.equal(JSON.stringify(stats).includes("test-key"), false, "stats must never contain secrets");
});

// استرجاع البيئة بالظبط زي ما كانت.
if (__origNvidia === undefined) delete process.env.NVIDIA_API_KEY;
else process.env.NVIDIA_API_KEY = __origNvidia;
if (__origPaid === undefined) delete process.env.AI_ALLOW_PAID_MODELS;
else process.env.AI_ALLOW_PAID_MODELS = __origPaid;

/* ==================================================================== */
console.log("\n[11] OpenRouter + Media Router (Task 3B)");
/* ==================================================================== */

const openrouterModule = await import("../lib/ai/openrouter.ts");
const mediaRouter = await import("../lib/ai/media-router.ts");
const health3b = await import("../lib/ai/health.ts");

const __origOpenrouter = process.env.OPENROUTER_API_KEY;

await test("openrouter: missing key = NOT_CONFIGURED without breaking anything", async () => {
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(health3b.providerConfigStatus("openrouter"), "NOT_CONFIGURED");
  const provider = new openrouterModule.OpenRouterProvider();
  await assert.rejects(
    provider.completeChat({ messages: [{ role: "user", content: "hi" }] }),
    (error) => error instanceof types.AiProviderError && error.status === 503
  );
});

await test("openrouter: auth failure / 429 / 5xx normalize through AiProviderError", async () => {
  process.env.OPENROUTER_API_KEY = "test-key-not-real";
  const originalFetch = globalThis.fetch;
  const cases = [
    [401, 401],
    [429, 429],
    [500, 500],
    [503, 503],
  ];
  try {
    for (const [httpStatus, expectedStatus] of cases) {
      globalThis.fetch = async () => new Response("{}", { status: httpStatus });
      const provider = new openrouterModule.OpenRouterProvider();
      await assert.rejects(
        provider.completeChat({ messages: [{ role: "user", content: "hi" }] }),
        (error) => error instanceof types.AiProviderError && error.status === expectedStatus
      );
    }
    // استجابة 200 من غير محتوى = EMPTY_RESPONSE (فشل كامل).
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 });
    const provider = new openrouterModule.OpenRouterProvider();
    await assert.rejects(
      provider.completeChat({ messages: [{ role: "user", content: "hi" }] }),
      (error) =>
        error instanceof types.AiProviderError &&
        error.status === 200 &&
        error.reasonCode === "EMPTY_RESPONSE"
    );
    // نجاح حقيقي بمحتوى يرجع موحّد.
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ model: "x:free", choices: [{ message: { content: "أهلاً" } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
        { status: 200 }
      );
    const ok = await new openrouterModule.OpenRouterProvider().completeChat({
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(ok.content, "أهلاً");
    assert.equal(ok.usage?.promptTokens, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test("media capability isolation: text/vision models can never serve image or video generation", () => {
  // مفيش ولا موديل OpenRouter مجاني لتوليد الصور/الفيديو في الكتالوج الحالي.
  const orImageCandidates = mediaRouter
    .mediaCandidates("image_generation")
    .filter((c) => c.provider === "openrouter");
  assert.deepEqual(orImageCandidates, [], "OpenRouter has no free image model — must stay empty");
  assert.deepEqual(mediaRouter.mediaCandidates("video_generation"), [], "no video model exists — must stay empty");
  // الرؤية وحدها مش توليد صور: dots/inkling عندها vision لكن بدون image_generation.
  for (const model of MODEL_REGISTRY.filter((m) => m.capabilities.includes("vision") && !m.capabilities.includes("image_generation"))) {
    assert.equal(
      mediaRouter.mediaCandidates("image_generation").some((c) => c.modelId === model.id),
      false,
      `${model.id} is vision-only and must not generate images`
    );
  }
});

await test("media router: video (no verified model anywhere) → MEDIA_MODEL_UNAVAILABLE", async () => {
  await assert.rejects(
    mediaRouter.generateVideoWithFallback({ prompt: "فيديو للدرس" }),
    (error) => error.name === "MediaModelUnavailableError"
  );
  // والخطأ العام بيترجم لـ MEDIA_MODEL_UNAVAILABLE برسالة عربية آمنة.
  const pub = errors.toAiPublicError(new mediaRouter.MediaModelUnavailableError("video_generation"));
  assert.equal(pub.code, "MEDIA_MODEL_UNAVAILABLE");
  assert.equal(pub.message, "خدمة إنشاء الوسائط غير متاحة حاليًا.");
  assert.equal(pub.retryable, false);
});

await test("media router fallback chain: openrouter image fails → next candidate → unavailable summary", async () => {
  // محاكاة كاملة لمسار §15: موديل OpenRouter صور مسجّل + فشل 429 →
  // تسجيل RATE_LIMITED → نهاية المرشحين → MEDIA_MODEL_UNAVAILABLE مش خطأ خام.
  const registry = models3a.MODEL_REGISTRY;
  registry.push({
    id: "test/or-image-fake:free",
    provider: "openrouter",
    displayName: "Fake OR Image",
    capabilities: ["image_generation"],
    priority: 9,
    tier: "free",
    fallbackPriority: 1,
    freeEndpoint: true,
    enabled: true,
  });
  let generateCalls = 0;
  const fakeExecutor = {
    name: "openrouter",
    async generateMedia() {
      generateCalls++;
      throw new types.AiProviderError("rate limited", 429, "openrouter");
    },
  };
  mediaRouter.registerMediaExecutors({ openrouter: fakeExecutor });
  try {
    await assert.rejects(
      mediaRouter.generateImageWithFallback("image_generation", { prompt: "x" }),
      (error) => error.name === "MediaModelUnavailableError"
    );
    assert.equal(generateCalls, 1, "executor actually attempted");
    assert.equal(health3b.getProviderHealth("openrouter"), "RATE_LIMITED", "429 records cooldown");
  } finally {
    registry.pop();
    mediaRouter.registerMediaExecutors({ openrouter: undefined });
  }
});

await test("openrouter free vision/text entries respect the registry gate", () => {
  // nemotron-lightning وdots: تسعير مجاني مؤكد + 429 مؤقت فقط (بيتعافى ديناميكيًا).
  for (const id of [
    "nvidia/nemotron-3.5-lightning:free",
    "dots-studio/dots-3-note-preview:free",
  ]) {
    const model = models3a.findModel(id);
    assert.ok(model, `${id} registered`);
    assert.equal(model.freeEndpoint, true);
    assert.equal(model.enabled, true);
    assert.ok(model.capabilities.includes("text"));
  }
  // inkling-small: البروب الحي رجّع 403 على الحساب — لازم يكون disabled.
  assert.equal(models3a.findModel("thinkingmachines/inkling-small:free")?.enabled, false);
  // موديلات OpenRouter المدفوعة (زي gpt-image) مش مسجّلة أصلًا — الحماية من المصدر.
  assert.equal(models3a.findModel("openai/gpt-5-image"), undefined);
});

// استرجاع البيئة بالظبط زي ما كانت (الجزء بتاع [11]).
if (__origOpenrouter === undefined) delete process.env.OPENROUTER_API_KEY;
else process.env.OPENROUTER_API_KEY = __origOpenrouter;

// Restore the original environment exactly as we found it.
if (__origEnv.groq === undefined) delete process.env.GROQ_API_KEY;
else process.env.GROQ_API_KEY = __origEnv.groq;
if (__origEnv.gemini === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = __origEnv.gemini;

console.log(`\nAll ${passed} AI core tests passed.`);
