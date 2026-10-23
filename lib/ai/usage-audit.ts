// Phase 5 — AI Usage Tracking + Admin Action Audit (read-only audit log, NO secrets, NO keys)
// AI usage stores only: timestamp, agentId, provider, status, latencyMs, normalizedError
// No request/response content, no user identity, no API keys.
// Admin actions store: actor, targetUser, action, fromValue, toValue, timestamp, metadata
// No PII beyond actor/target user IDs (required for compliance traceability).
//
// ⚠️ In-memory store for Phase 5 verification. In production, persist to DB
// (ai_usage_events / admin_audit_log table) — in-memory data is lost on restart
// and is NOT suitable for compliance or cost auditing without DB persistence.

export type AIUsageStatus = "PASS" | "FAIL" | "TIMEOUT" | "SKIPPED";

export type AdminAction =
  | "subscription-activate"
  | "subscription-manage"
  | "manage-roles"
  | "users-ban"
  | "users-unban"
  | "rewards-issue"
  | "add-credits";

export interface AIUsageRecord {
  ts: string;
  agentId: string;
  provider: string;
  model: string;
  status: AIUsageStatus;
  latencyMs: number;
  normalizedError: string;
  userRole?: string; // only if explicitly passed; no PII
}

export interface AdminAuditRecord {
  ts: string;
  actorId: string;      // المستخدم المنفذ (من الجلسة)
  targetUserId?: string; // المستخدم المستهدف (إن وجد)
  action: AdminAction;
  fromValue?: string;    // القيمة قبل التعديل (مثلًا: الباقة القديمة)
  toValue?: string;      // القيمة بعد التعديل (مثلًا: الباقة الجديدة)
  metadata?: Record<string, string>; // تفاصيل إضافية غير حساسة
}

const aiStore: AIUsageRecord[] = [];
const adminStore: AdminAuditRecord[] = [];

export function logUsage(r: AIUsageRecord) {
  aiStore.push({ ...r, ts: new Date().toISOString() });
  // In production, persist to DB; Phase 5 keeps in-memory for audit only.
}

export function getUsage() {
  return [...aiStore];
}

export function clearUsage() {
  aiStore.length = 0;
}

/** تسجيل إجراء أدمن حساس للتدقيق (compliance). لا يُسمح بالتجاوز بدون تسجيل. */
export function logAdminAction(r: AdminAuditRecord) {
  adminStore.push({ ...r, ts: new Date().toISOString() });
  // In production, persist to admin_audit_log table; in-memory is Phase 5 only.
}

export function getAdminAudit() {
  return [...adminStore];
}

export function clearAdminAudit() {
  adminStore.length = 0;
}
