import type { AgentResult } from "../types.ts";

/** Minimal provider surface every agent-layer provider must satisfy. */
export type ProviderInterface = {
  readonly name: string;
  generate(input: { prompt: string; context?: unknown; options?: Record<string, unknown> }): Promise<AgentResult>;
  healthCheck(): Promise<ProviderHealth>;
};

export type ProviderHealth = {
  status:
    | "AVAILABLE"
    | "DEGRADED"
    | "RATE_LIMITED"
    | "COOLDOWN"
    | "AUTH_ERROR"
    | "TIMEOUT"
    | "UNAVAILABLE"
    | "NOT_CONFIGURED";
  detail?: string;
  lastChecked?: string;
};
