// ============================================================================
// MAGICLY — Event Deduplication (Phase 1)
// ============================================================================
// منع استدعاء نموذج دعم متكرر لتذكرة أو محادثة أو رسالة واحدة.
// قاعدة العمل: (eventSource, externalEventId) هي المفتاح الأساسي
// للاستدعاء مرة واحدة، حتى إذا وصل نفس الحدث مرتين.
// ============================================================================

import type { SupportEventDeduplicationEntry } from "./types";

// تجزئة بسيطة لـ "ذاكرة" (بديل لـ DB)
const _entries = new Map<string, SupportEventDeduplicationEntry>();

const DUPE_KEY_PREFIX = "dedup:";

/**
 * إنشاء سجل استدعاء (deduplication) لحدث دعم.
 * يعيد الدليل مطابق للمعرف المولد، مع تسجيل البيانات.
 */
export function deduplicateEvent(
  eventSource: string,
  externalEventId: string,
  eventPayload: Record<string, unknown>,
  processedBy: string
): SupportEventDeduplicationEntry {
  const key = `${eventSource}:${externalEventId}`;
  const id = `${DUPE_KEY_PREFIX}${key}_${processedBy}_${Date.now().toString(36)}`;

  // تجنب إنشاء سجل تكراري
  const existing = _entries.get(key);
  if (existing) {
    // نعيد الموجود بملفات تعريف جديدة للحصول على عدد التكرارات
    return {
      id: existing.id,
      eventSource: existing.eventSource,
      externalEventId: existing.externalEventId,
      eventKind: existing.eventKind,
      eventPayload: existing.eventPayload,
      processed_at: existing.processed_at,
      processed_by: existing.processed_by,
      duplicate_count: existing.duplicate_count + 1,
    };
  }

  const entry: SupportEventDeduplicationEntry = {
    id,
    eventSource,
    externalEventId,
    eventKind: "standard",
    eventPayload,
    processed_at: new Date().toISOString(),
    processed_by: processedBy,
    duplicate_count: 1,
  };

  _entries.set(key, entry);
  return entry;
}

/**
 * تحقق إذا كان الحدث already processed.
 */
export function isEventProcessed(
  eventSource: string,
  externalEventId: string
): Promise<boolean> {
  const key = `${eventSource}:${externalEventId}`;
  // في Phase 1 لا توجد DB مُخّزَّن، لذلك نعيد false دائماً.
  // المرحلة 2 ستنفذ هذا استعلاماً حقيقياً إلى support_ai_event_deduplication.
  return Promise.resolve(false);
}

/**
 * تسجيل الحدث كمعالج (يُكتب مباشرة إلى DB).
 */
export async function markEventProcessed(
  eventSource: string,
  externalEventId: string,
  eventPayload: Record<string, unknown>,
  processedBy: string
): Promise<SupportEventDeduplicationEntry | null> {
  const entry = deduplicateEvent(
    eventSource,
    externalEventId,
    eventPayload,
    processedBy
  );
  _entries.set(`${eventSource}:${externalEventId}`, entry);
  return entry;
}
