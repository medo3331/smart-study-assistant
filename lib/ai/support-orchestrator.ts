// ============================================================================
// MAGICLY — AI Support Orchestrator (Phase 1)
// ============================================================================
// موجه العملية المسؤول عن:
//   1. استقبال حدث دعم معتمد
//   2. فحص تجانس الحدث
//   3. إرسال الرد التأكيد الفوري (بدون انتظار AI)
//   4. إرجاع نتيجة المعالجة
//
// التصميم: واجهة نصية بسيطة، لا توجد أوامر خارجية، مجرد نقطة دخول لـ
// Workflow. تنفيذ الحلول الآمنة (المرحلة 2) تخطى هنا.
// ============================================================================

import type { SupportDiagnosticQuestion, SupportEscalationSummary, SupportClassification } from "./types";
import { deduplicateEvent, isEventProcessed } from "./support-deduplication";
import { sanitizeInput } from "./support-sanitization";

export type SupportEventSource =
  | "support_message"
  | "admin_message"
  | "support_reply"
  | "admin_reply";

const ACKNOWLEDGEMENT_TEMPLATE =
  "أهلًا بك في Magicly 👋\n" +
  "تم استلام رسالتك بنجاح. مساعد Magicly الذكي بدأ مراجعة المشكلة وتحديد سببها،\n" +
  "وسنحاول مساعدتك في حلها فورًا. وإذا احتاجت تدخلًا من فريق الدعم،\n" +
  "سيتم تحويلها للموظف المختص.";

/**
 * تحقق إن الحدث يُعدّ مؤهلاً للمعالجة عبر AI Support.
 */
export async function isEventEligibleForSupport(
  eventSource: SupportEventSource,
  _authenticatedUserId: string | null,
  _originalUserIds: string[],
  _recipientUserId: string | null,
  _conversationType?: string
): Promise<boolean> {
  // مرحلة 1: مجرد تمرير بسيط — معالجة الحقيقي لاحقًا.
  // لا يزال هذا يرفض محادثات طالب مع طالب (شيء تم فعله).
  return eventSource === "support_message" || eventSource === "admin_message";
}

export interface SupportEventInput {
  eventSource: SupportEventSource;
  externalEventId: string;
  messageText: string;
  userId: string | null;
  relatedUserIds: string[];
  implicitRef?: string;
  role?: "admin" | "student";
}

export interface SupportOrchestratorResult {
  outcome: "acknowledged" | "classified" | "diagnosing" | "escalated" | "noop";
  acknowledgement?: string;
  diagnosis?: Record<string, unknown>;
  questions?: Array<{ key: string; question: string; options: string[] }>;
  escalation?: Record<string, unknown>;
  note?: string;
  runId?: string;
  caseId?: string;
}

export async function processSupportEvent(
  input: SupportEventInput
): Promise<SupportOrchestratorResult> {
  const { eventSource, externalEventId, messageText, userId, relatedUserIds } = input;

  if (!userId) {
    return { outcome: "noop", note: "Authentication required for support event processing." };
  }

  // فحص تجانس الحدث (منعه من المعالجة مرتين)
  const alreadyProcessed = await isEventProcessed(eventSource, externalEventId);
  if (alreadyProcessed) {
    return { outcome: "noop", note: "This support event has already been processed." };
  }

  // نص الرد التأكيد الفوري (بدون انتظار AI)
  const acknowledgement = getAcknowledgeMessage();
  if (!acknowledgement) {
    return { outcome: "noop", note: "Could not generate acknowledgement template." };
  }

  // تسجيل التجانس (deduplication)
  const eventPayload = {
    messageText: sanitizeInput(messageText),
    externalEventId: sanitizeInput(externalEventId),
    eventSource: sanitizeInput(eventSource),
    relatedUserIds: relatedUserIds.slice(0, 5),
  };

  const dedupRecord = deduplicateEvent(
    eventSource,
    externalEventId,
    eventPayload,
    String(sanitizeInput(userId) ?? "")
  );

  return {
    outcome: "acknowledged",
    acknowledgement,
    note: "Support acknowledgement sent. AI classification and diagnosis will follow asynchronously.",
    runId: dedupRecord.id,
    caseId: dedupRecord.id,
  };
}

function getAcknowledgeMessage(): string | null {
  const template = ACKNOWLEDGEMENT_TEMPLATE;
  const cleaned = template
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
  if (cleaned.length === 0 || cleaned.length > 1000) {
    return null;
  }
  return cleaned;
}
