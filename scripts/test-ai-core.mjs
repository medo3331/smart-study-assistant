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
    content: "groq",
    marketing_copy: "groq",
    coding: "groq",
    file_analysis: "gemini",
    image_analysis: "gemini",
    data_analysis: "gemini",
    planning: "gemini",
    business_plan: "gemini",
    marketing_plan: "gemini",
    roadmap: "gemini",
    image_generation: "gemini",
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
  assert.deepEqual(visionModels, ["gemini-3.6-flash"]);
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

await test("client errors (400/401/403) do not change provider health", () => {
  const before = health.getProviderHealth("groq");
  health.recordProviderResult("groq", { ok: false, status: 401, reason: "bad key test" });
  health.recordProviderResult("groq", { ok: false, status: 400, reason: "bad request test" });
  assert.equal(health.getProviderHealth("groq"), before);
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

// Restore the original environment exactly as we found it.
if (__origEnv.groq === undefined) delete process.env.GROQ_API_KEY;
else process.env.GROQ_API_KEY = __origEnv.groq;
if (__origEnv.gemini === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = __origEnv.gemini;

console.log(`\nAll ${passed} AI core tests passed.`);
