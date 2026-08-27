import type { ProviderInterface, ProviderHealth } from "./types.ts";
import type { AgentInput } from "../types.ts";

/**
 * DeepSeek provider — STUB.
 *
 * Reason: no DeepSeek API key is configured and the NVIDIA-routed
 * `deepseek-v4-flash` returns 404 on this account (see MODEL_REGISTRY).
 * The interface is registered so the agent layer can know about DeepSeek
 * and pick it the moment a key + verified model exist. Until then, every
 * call throws and the health check reports NOT_CONFIGURED.
 *
 * To enable: (1) set DEEPSEEK_API_KEY in env, (2) implement the
 * fetch/streaming against https://api.deepseek.com, (3) flip
 * healthCheck to a real probe.
 */
export class DeepSeekProvider {
  readonly name = "deepseek";

  async generate(_input: AgentInput): Promise<never> {
    throw new Error(
      "DeepSeekProvider is a stub — no API key configured. " +
        "Set DEEPSEEK_API_KEY and replace lib/ai/agents/providers/deepseek.ts with a real client."
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      status: "NOT_CONFIGURED",
      detail: "DeepSeek API key missing (DEEPSEEK_API_KEY not set).",
      lastChecked: new Date().toISOString(),
    };
  }
}
