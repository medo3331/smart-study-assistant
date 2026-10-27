import { createServiceClient, isServiceKeyConfigured } from "@/lib/supabase/admin";

export type RuntimeErrorCategory =
  | "provider"
  | "auth"
  | "db"
  | "validation"
  | "upload"
  | "internal";

export type RuntimeErrorInput = {
  route: string;
  feature?: string | null;
  errorType?: string | null;
  category?: RuntimeErrorCategory | string | null;
  provider?: string | null;
  model?: string | null;
  traceId?: string | null;
  outcome?: string | null;
  message?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const SENSITIVE_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|session|email|prompt|response|content|file)/i;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}

export function createTraceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function") {
      return (crypto as { randomUUID: () => string }).randomUUID();
    }
  } catch {
    // fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeErrorMessage(input: unknown): string | null {
  try {
    if (input == null) return null;
    let text = input instanceof Error ? input.message : String(input);
    text = text.replace(/\s+/g, " ").trim();
    if (!text) return null;
    // Redact file paths (unix and windows)
    text = text.replace(/(?:[a-zA-Z]:)?[\\/][\w./\\-]+/g, "[path]");
    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    text = text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
    text = text.replace(/\b(sk|pk|rk|ghp|gho|xox[baprs])-?[A-Za-z0-9_-]{12,}\b/gi, "[redacted-key]");
    text = text.replace(/(authorization|cookie|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
    // Redact long opaque tokens
    text = text.replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
    return truncate(text, 500);
  } catch {
    return null;
  }
}

export function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    if (value == null || typeof value === "boolean" || typeof value === "number") {
      result[key] = value;
    } else if (typeof value === "string") {
      result[key] = truncate(value, 200);
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 10).map((v) => (typeof v === "string" ? truncate(v, 100) : null));
    } else {
      result[key] = "[object]";
    }
  }
  return result;
}

export function classifyError(error: unknown, fallback: string = "internal"): RuntimeErrorCategory {
  const name = error instanceof Error ? error.name : "";
  const message = sanitizeErrorMessage(error) ?? "";
  const lower = `${name} ${message}`.toLowerCase();
  if (lower.includes("provider") || lower.includes("groq") || lower.includes("openai") || lower.includes("429") || lower.includes("503")) return "provider";
  if (lower.includes("auth") || lower.includes("unauthorized") || lower.includes("forbidden")) return "auth";
  if (lower.includes("postgres") || lower.includes("supabase") || lower.includes("database") || lower.includes("pgrst")) return "db";
  if (lower.includes("validation") || lower.includes("invalid") || lower.includes("required")) return "validation";
  if (lower.includes("upload") || lower.includes("file")) return "upload";
  return (fallback as RuntimeErrorCategory) || "internal";
}

export async function recordRuntimeError(input: RuntimeErrorInput): Promise<void> {
  try {
    if (!isServiceKeyConfigured()) return;
    const client = createServiceClient();
    const traceId = input.traceId?.trim() || createTraceId();
    const row = {
      route: truncate(String(input.route || "unknown"), 200),
      feature: input.feature ? truncate(String(input.feature), 100) : null,
      error_type: truncate(String(input.errorType || "Error"), 100),
      category: String(input.category || "internal"),
      outcome: input.outcome ? truncate(String(input.outcome), 100) : null,
      provider: input.provider ? truncate(String(input.provider), 100) : null,
      model: input.model ? truncate(String(input.model), 100) : null,
      trace_id: traceId,
      message_sanitized: sanitizeErrorMessage(input.message),
      user_id: typeof input.userId === "string" && input.userId ? input.userId : null,
      metadata: sanitizeMetadata(input.metadata),
      created_at: new Date().toISOString(),
    };
    const { error } = await client.from("runtime_error_events").insert(row);
    if (error) {
      console.warn(`[runtime-errors] could not persist error [${error.code ?? "no-code"}]: ${error.message ?? ""}`);
    }
  } catch (error) {
    console.warn("[runtime-errors] unexpected failure while persisting error:", (error as Error)?.message ?? String(error));
  }
}
