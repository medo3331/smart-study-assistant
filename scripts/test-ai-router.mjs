import assert from "node:assert/strict";

// The router filters NOT_CONFIGURED providers, so the test environment needs
// every provider marked configured. Values are obviously-fake test keys and
// are removed again at the end — real keys are never read here.
process.env.GROQ_API_KEY = "test-key-not-real";
process.env.NVIDIA_API_KEY = "test-key-not-real";
process.env.GEMINI_API_KEY = "test-key-not-real";

const { AiRouter, AI_PROVIDER_BY_TASK, TASK_MODEL_PREFERENCE, routeCandidates } = await import(
  "../lib/ai/routing.ts"
);
const { MODEL_REGISTRY } = await import("../lib/ai/models.ts");

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

/* مصفوفة التفضيلات: كل معرّف لازم يكون مسجّل في السجل المركزي. */
for (const [task, modelIds] of Object.entries(TASK_MODEL_PREFERENCE)) {
  for (const modelId of modelIds) {
    assert.ok(
      MODEL_REGISTRY.some((m) => m.id === modelId),
      `${task} preference "${modelId}" is not registered in MODEL_REGISTRY`
    );
  }
}

const calls = [];
const provider = (name) => ({
  name,
  async completeChat(input) {
    calls.push(`${name}:${input.model ?? "(default)"}`);
    return {
      provider: name,
      model: input.model ?? "test-model",
      content: "OK",
      payload: { choices: [{ message: { content: "OK" } }] },
    };
  },
});

const router = new AiRouter([provider("groq"), provider("nvidia"), provider("gemini")]);

/*
 * التوجيه الفعلي مع الوضع الافتراضي (موديلات NVIDIA موقوفة لحد التحقق):
 * المهام اللي أساسها موديل متاح بتروح لمزوّدها المعلن، والمهام اللي أساسها
 * NVIDIA الموقوف بتنزل ديناميكيًا لأفضل بديل متاح — التفضيل مش تصريح.
 */
const routablePrimary = {
  chat: "groq",
  explain: "groq",
  summarize: "groq",
  content: "groq",
  marketing_copy: "groq",
  quiz: "groq",
  flashcards: "gemini",
  study_plan: "gemini",
  lesson_analysis: "gemini",
  mind_map: "gemini",
  data_analysis: "gemini",
  planning: "nvidia",
  business_plan: "gemini",
  marketing_plan: "gemini",
  roadmap: "gemini",
};
for (const [task, providerName] of Object.entries(routablePrimary)) {
  const response = await router.completeChat(task, {
    messages: [{ role: "user", content: "test" }],
  });
  assert.equal(response.provider, providerName, `task ${task}`);
}

// مهام NVIDIA-الأساسية بتروح لموديلات NVIDIA المتحقق منها والمفعّلة.
for (const task of ["tutor", "agent", "coding"]) {
  const response = await router.completeChat(task, {
    messages: [{ role: "user", content: "test" }],
  });
  assert.equal(response.provider, "nvidia", `${task} routes to verified nvidia models`);
}

// DeepSeek V4 Flash غير مفعّل (404 حيًا) — مكانش في مرشحين أي مهمة.
for (const task of Object.keys(expected)) {
  const candidates = routeCandidates(task);
  for (const candidate of candidates) {
    assert.notEqual(candidate.model, "deepseek-ai/deepseek-v4-flash-0731", `${task}: disabled deepseek leaked`);
  }
}

// RAG بيمشي على موديل الـ embeddings المتحقق منه فقط.
const ragCandidates = routeCandidates("rag_embeddings");
assert.deepEqual(
  ragCandidates.map((c) => c.model),
  ["nvidia/nemotron-3-embed-1b"]
);

delete process.env.GROQ_API_KEY;
delete process.env.NVIDIA_API_KEY;
delete process.env.GEMINI_API_KEY;

console.log("AI router: OK");
