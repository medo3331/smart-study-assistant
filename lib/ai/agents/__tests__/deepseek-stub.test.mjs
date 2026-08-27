import assert from "node:assert/strict";
import { DeepSeekProvider, INTERFACES } from "../providers/index.ts";

// Provider exists in the interface map
assert.equal(INTERFACES.deepseek.name, "deepseek");

// healthCheck returns NOT_CONFIGURED (matches health.ts AiHealthStatus)
const h = await INTERFACES.deepseek.healthCheck();
assert.equal(h.status, "NOT_CONFIGURED");
assert.match(h.detail, /API key/);

// generate always throws AiProviderError-shaped error
await assert.rejects(
  () => INTERFACES.deepseek.generate({ prompt: "hi" }),
  /DeepSeek/,
);

// Direct class is also exported
assert.equal(DeepSeekProvider.name, "DeepSeekProvider");
console.log("deepseek-stub: ok");
