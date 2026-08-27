import type { ProviderInterface, ProviderHealth } from "./types.ts";
import type { AgentInput, AgentContext, AgentResult } from "../types.ts";

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
export class DeepSeekProvider implements ProviderInterface {
  readonly name = "deepseek";
  private readonly endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";

  async generate(input: { prompt: string; context?: unknown; options?: Record<string, unknown> }): Promise<AgentResult> {
    const apiKey = process.env.HERMES_CUSTOM_NVIDIA_CODING_API_KEY || process.env.NVIDIA_API_KEY || "";
    if (!apiKey) {
      return { ok: false, agent: (input.options?.agent as string) ?? "personal_assistant", provider: this.name, code: "CONFIGURATION_ERROR", message: "NVIDIA key missing (HERMES_CUSTOM_NVIDIA_CODING_API_KEY).", retryable: true } as AgentResult;
    }
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{ role: "user", content: input.prompt }] }),
      });
      if (res.status === 404) {
        return { ok: false, agent: (input.options?.agent as string) ?? "personal_assistant", provider: this.name, code: "MODEL_404", message: "deepseek-v4-flash returns 404 on this account (models.ts:78). Retry via NVIDIA fallback or different model.", retryable: true } as AgentResult;
      }
      if (!res.ok) return { ok: false, agent: (input.options?.agent as string) ?? "personal_assistant", provider: this.name, code: `NVIDIA_${res.status}`, message: `NVIDIA endpoint ${res.status}`, retryable: true } as AgentResult;
      const data = await res.json();
      return { ok: true, agent: (input.options?.agent as string) ?? "personal_assistant", provider: this.name, model: "deepseek-v4-flash", content: (data.choices?.[0]?.message?.content) ?? JSON.stringify(data) } as AgentResult;
    } catch (e: any) {
      return { ok: false, agent: (input.options?.agent as string) ?? "personal_assistant", provider: this.name, code: "NW_ERROR", message: `NVIDIA error: ${e?.message ?? e}`, retryable: true } as AgentResult;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const key = process.env.HERMES_CUSTOM_NVIDIA_CODING_API_KEY || process.env.NVIDIA_API_KEY || "";
    return {
      status: key ? "AVAILABLE" : "NOT_CONFIGURED",
      detail: key ? "NVIDIA endpoint configured (deepseek-v4-flash 404 noted)." : "NVIDIA key missing.",
      lastChecked: new Date().toISOString(),
    };
  }
}
