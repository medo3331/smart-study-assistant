import assert from "node:assert/strict";

const { buildAgentPrompt, parseAgentGenerationInput, suggestAgentFromText, taskForAgent } = await import("../lib/ai/agents.ts");

const marketing = parseAgentGenerationInput({ agent: "marketing", mode: "strategy", goal: "خطة إطلاق منتج" });
const research = parseAgentGenerationInput({ agent: "research", goal: "قارن بين فكرتين" });
const content = parseAgentGenerationInput({ agent: "content", goal: "اكتب منشورًا" });

assert.equal(taskForAgent(marketing), "marketing_plan");
assert.equal(taskForAgent(research), "data_analysis");
assert.equal(taskForAgent(content), "content");
assert.match(buildAgentPrompt(research).system, /لا تملك Web Search/);
assert.equal(suggestAgentFromText("اعمل حملة تسويق"), "marketing");
assert.equal(suggestAgentFromText("قارن المنافسين"), "research");
assert.equal(suggestAgentFromText("اكتب سكريبت فيديو"), "content");
assert.equal(suggestAgentFromText("اشرح الدرس"), null);
console.log("AI agents: OK");
