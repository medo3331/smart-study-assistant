// Phase 5 — AI Usage Tracking (read-only audit log, NO secrets, NO keys)
// Stores only: timestamp, agentId, provider, status, latencyMs, normalizedError
// No request/response content, no user identity, no API keys.
// Does NOT replace DB persistence (in-memory audit only for Phase 5 verification).

export interface AIUsageRecord {
  ts: string;
  agentId: string;
  provider: string;
  model: string;
  status: "PASS" | "FAIL" | "TIMEOUT" | "SKIPPED";
  latencyMs: number;
  normalizedError: string;
  userRole?: string; // only if explicitly passed; no PII
}

const store: AIUsageRecord[] = [];

export function logUsage(r: AIUsageRecord) {
  store.push({ ...r, ts: new Date().toISOString() });
  // In production, persist to DB; Phase 5 keeps in-memory for audit only.
}

export function getUsage() {
  return [...store];
}

export function clearUsage() {
  store.length = 0;
}
