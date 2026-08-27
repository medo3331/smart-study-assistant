import type { ProviderInterface, ProviderHealth } from "./types.ts";
import type { AgentInput, AgentResult } from "../types.ts";

export const GroqProvider: ProviderInterface = {
  name: "groq",
  async generate(_input: AgentInput): Promise<AgentResult> {
    return { ok: false, agent: "personal_assistant" as const, code: "CONFIGURATION_ERROR", message: "Use AgentRouter.run() — providers are not called directly by agents.", retryable: false };
  },
  async healthCheck(): Promise<ProviderHealth> {
    return { status: "AVAILABLE", lastChecked: new Date().toISOString() };
  },
};
