import assert from "node:assert/strict";
import {
  AGENT_IDS,
  AGENT_CAPABILITIES,
  isAgentId,
} from "../types.ts";

assert.deepEqual([...AGENT_IDS].sort(), [
  "career",
  "document_analyzer",
  "exam_solver",
  "freelance",
  "image",
  "language",
  "personal_assistant",
  "planner",
  "quiz_generator",
  "research",
  "study_tutor",
  "writing",
]);

assert.equal(isAgentId("study_tutor"), true);
assert.equal(isAgentId("Study_Tutor"), false);
assert.equal(isAgentId("study-tutor"), false);
assert.equal(isAgentId(null), false);
assert.equal(isAgentId(42), false);
assert.equal(isAgentId("not_an_agent"), false);

assert.ok(AGENT_CAPABILITIES.includes("chat"));
assert.ok(AGENT_CAPABILITIES.includes("image_generation"));
assert.ok(AGENT_CAPABILITIES.includes("long_context"));
assert.ok(AGENT_CAPABILITIES.includes("tool_calling"));
assert.ok(AGENT_CAPABILITIES.includes("document_ingest"));
console.log("types: ok");
