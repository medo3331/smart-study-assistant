import assert from "node:assert/strict";

// The router filters NOT_CONFIGURED providers, so the test environment needs
// both providers marked configured. Values are obviously-fake test keys and
// are removed again at the end — real keys are never read here.
process.env.GROQ_API_KEY = "test-key-not-real";
process.env.GEMINI_API_KEY = "test-key-not-real";

const { AiRouter, AI_PROVIDER_BY_TASK } = await import("../lib/ai/routing.ts");

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

const calls = [];
const provider = (name) => ({
  name,
  async completeChat() {
    calls.push(name);
    return {
      provider: name,
      model: "test-model",
      content: "OK",
      payload: { choices: [{ message: { content: "OK" } }] },
    };
  },
});

const router = new AiRouter([provider("groq"), provider("gemini")]);
for (const [task, providerName] of Object.entries(expected)) {
  const response = await router.completeChat(task, {
    messages: [{ role: "user", content: "test" }],
  });
  assert.equal(response.provider, providerName);
}

assert.equal(calls.filter((name) => name === "groq").length, 4);
assert.equal(calls.filter((name) => name === "gemini").length, 8);

delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;

console.log("AI router: OK");
