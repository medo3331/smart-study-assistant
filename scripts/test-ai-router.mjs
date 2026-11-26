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
  flashcards: "groq",
  study_plan: "groq",
  lesson_analysis: "groq",
  mind_map: "groq",
  data_analysis: "groq",
  planning: "groq",
  business_plan: "groq",
  marketing_plan: "groq",
  roadmap: "groq",
  file_analysis: "gemini",
  image_analysis: "gemini",
  image_generation: "gemini",
  image_edit: "gemini",
  video_generation: "gemini",
  rag_embeddings: "nvidia",
  exam_generation: "groq",
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
  flashcards: "groq",
  study_plan: "groq",
  lesson_analysis: "groq",
  mind_map: "groq",
  data_analysis: "groq",
  planning: "nvidia",
  business_plan: "groq",
  marketing_plan: "groq",
  roadmap: "groq",
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

// RAG: embed-1b القديم اختفى من حساب NVIDIA (تأكيد 2026-11-06) والبديل 3.5
// معطّل لحين بروب ناجح على /v1/embeddings — فيرجّع المرشّح العام للمزوّد
// (default عند nvidia.ts) وده السلوك الصح لحد التفعيل.
const ragCandidates = routeCandidates("rag_embeddings");
assert.equal(ragCandidates.length, 1);
assert.equal(ragCandidates[0].provider, "nvidia");
assert.equal(ragCandidates[0].model, undefined);

delete process.env.GROQ_API_KEY;
delete process.env.NVIDIA_API_KEY;
delete process.env.GEMINI_API_KEY;

console.log("AI router: OK");
