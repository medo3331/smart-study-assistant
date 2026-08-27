/**
 * Agent layer types — the contract every agent module fulfills.
 *
 * Everything above this layer (the router, the registry, every product feature)
 * talks in these terms. Provider SDKs and raw chat responses are STRICTLY below.
 */

/** Frozen list of agent ids shipped in Phase 1. Add new ids by extending this list. */
export const AGENT_IDS = [
  "study_tutor",
  "exam_solver",
  "quiz_generator",
  "research",
  "document_analyzer",
  "writing",
  "language",
  "planner",
  "career",
  "freelance",
  "image",
  "personal_assistant",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/** What the agent needs from the model. The router maps these to provider capabilities. */
export const AGENT_CAPABILITIES = [
  "chat",
  "reasoning",
  "coding",
  "long_context",
  "image_generation",
  "tool_calling",
  "document_ingest",
  "vision",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

/** Runtime type guard. Anything not in AGENT_IDS is rejected. */
export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

/** Per-agent static metadata. The router uses it to pick a provider. */
export type AgentDefinition = {
  id: AgentId;
  label: string;
  description: string;
  /** Ordered list of capabilities the agent needs. The router requires ALL of them. */
  capabilities: AgentCapability[];
  /** Lower = try first. Equal priority = first-registered wins. */
  priority: number;
  /** Where the agent implementation lives. Phase 1: all "stub". */
  status: "stub" | "active";
};

/** Optional context threaded through. Phase 1: best-effort, may all be undefined. */
export type AgentContext = {
  userId?: string;
  role?: string;
  language?: string;
  educationLevel?: string;
  preferences?: Record<string, string>;
};

/** Input to runAgent. Same shape the existing AIService.complete accepts. */
export type AgentInput = {
  prompt: string;
  context?: AgentContext;
  options?: Record<string, unknown>;
};

/** Output of runAgent. Wraps whatever the underlying provider returned. */
export type AgentResult =
  | { ok: true; agent: AgentId; provider: string; model: string; content: string; usage?: { promptTokens?: number; completionTokens?: number } }
  | { ok: false; agent: AgentId; code: string; message: string; retryable: boolean };
