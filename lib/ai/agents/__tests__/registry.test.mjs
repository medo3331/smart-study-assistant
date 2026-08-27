import assert from "node:assert/strict";
import { ALL_AGENTS, getAgent, agentIds, isRegistered } from "../registry.ts";
import { AGENT_IDS } from "../types.ts";

// Every AGENT_ID has a definition
for (const id of AGENT_IDS) {
  assert.ok(isRegistered(id), `agent ${id} not registered`);
  const def = getAgent(id);
  assert.equal(def.id, id);
  assert.ok(def.label.length > 0, `${id} has empty label`);
  assert.ok(def.description.length > 0, `${id} has empty description`);
  assert.ok(def.capabilities.length > 0, `${id} has no capabilities`);
  assert.equal(def.status, "stub", `${id} should be stub in Phase 1`);
}

// agentIds returns the full list, in registration order
assert.equal(agentIds().length, AGENT_IDS.length);
assert.equal(agentIds()[0], "study_tutor");

// getAgent throws on unknown ids (do not return undefined — caller bugs)
assert.throws(() => getAgent("not_a_real_agent"), /Unknown agent/);

// study_tutor is chat+reasoning+long_context, priority 1
const tutor = getAgent("study_tutor");
assert.equal(tutor.priority, 1);
assert.deepEqual([...tutor.capabilities].sort(), ["chat", "long_context", "reasoning"].sort());

// image agent is image_generation only
const img = getAgent("image");
assert.deepEqual([...img.capabilities], ["image_generation"]);

// ALL_AGENTS is frozen / readonly
assert.throws(() => { ALL_AGENTS["foo"] = {}; });

console.log("registry: ok");
