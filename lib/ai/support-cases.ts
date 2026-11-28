// ============================================================================
// MAGICLY — AI Case Tracking (Phase 1)
// ============================================================================
// سجل الحالات لخطوة دعم الذكاء الاصطناعي، لكل رسالة تحفيز.
// واجهة برمجية: إنشاء حالة، البحث، التحديث، التصعيد، الإغلاق.
// بدون عبء SQL، مما يسمح لنا بوصف السير근무 في مرحلة 2.
// ============================================================================

import type { SupportAiCase, SupportAiCaseStatus } from "./types";

// تجزئة بسيطة لـ "ذاكرة" (بديل لـ DB)
const _cases = new Map<string, SupportAiCase>();

/**
 * إنشاء سجل حالة معالجة لحدث دعم.
 */
export function createAiCase(
  input: {
    eventSource: string;
    externalEventId: string;
    userId: string;
    relatedUserIds: string[];
    eventPayload?: Record<string, unknown>;
  } & Partial<Pick<SupportAiCase, "status" | "currentStep" | "aiRunId">>
): SupportAiCase {
  const now = new Date().toISOString();
  const id = `ai_case_${input.eventSource}_${input.externalEventId}_${input.userId}`;

  const record: SupportAiCase = {
    id,
    eventSource: input.eventSource,
    externalEventId: input.externalEventId,
    status: input.status ?? "received",
    currentStep: input.currentStep ?? "received",
    aiRunId: input.aiRunId ?? null,
    humanEscalationSummary: null,
    aiVerificationResult: null,
    created_at: now,
    updated_at: now,
    createdBy: input.userId,
    ai_suggested_at: null,
    human_answered_at: null,
    _relatedUserIds: input.relatedUserIds,
    _eventPayload: input.eventPayload ?? {},
    _escalatedBy: null,
  };

  _cases.set(id, record);
  return record;
}

/**
 * العثور على حالة معالجة حسب معرف خارجي (IDs المستخدم أو externalEventId).
 */
export function findAiCase(
  externalEventId: string,
  eventSource: string
): SupportAiCase | null {
  for (const [id, c] of _cases.entries()) {
    if (c.externalEventId === externalEventId && c.eventSource === eventSource) {
      return c;
    }
  }
  return null;
}

/**
 * قائمة الحالات المفتوحة أو المعلقة، مرتبة حسب تحديث أحدث.
 */
export function listOpenAiCases(): SupportAiCase[] {
  const openStatuses = new Set([
    "received",
    "acknowledged",
    "classifying",
    "diagnosing",
    "awaiting_student",
    "attempting_resolution",
    "resolved_pending_confirmation",
    "escalated",
  ]);
  return Array.from(_cases.values())
    .filter((c) => openStatuses.has(c.status))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/**
 * تحديث حالة الحالة وخطوة الوقت.
 */
export function updateAiCase(
  id: string,
  patch: Partial<Pick<SupportAiCase, "status" | "currentStep" | "aiRunId" | "humanEscalationSummary" | "aiVerificationResult" | "_escalatedBy">>
): SupportAiCase | null {
  const c = _cases.get(id);
  if (!c) return null;

  const updated: SupportAiCase = {
    ...c,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  _cases.set(id, updated);
  return updated;
}

/**
 * تصعيد حالة إلى موظف دعم.
 */
export function markAiCaseEscalated(
  id: string,
  summary: string,
  reason: string,
  escalatedBy: string
): SupportAiCase | null {
  const c = _cases.get(id);
  if (!c) return null;

  return updateAiCase(id, {
    status: "escalated",
    currentStep: "human_handling",
    humanEscalationSummary: summary,
    aiVerificationResult: `Escalated: ${reason}`,
    _escalatedBy: escalatedBy,
  });
}

/**
 * إغلاق حالة تم حلها (بعد تأكيد الطالب).
 */
export function markAiCaseResolved(id: string): SupportAiCase | null {
  const c = _cases.get(id);
  if (!c) return null;

  return updateAiCase(id, {
    status: "closed",
    currentStep: "closed",
  });
}
