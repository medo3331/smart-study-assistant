// lib/engagement/events.ts
//
// P1-B2 — Trusted engagement event ingestion (server-side writer).
//
// ── القاعدة الذهبية ────────────────────────────────────────────────────────
//   Events متكتوبتش من العميل مباشرة. الكتابة بتتم من السيرفر فقط، عن طريق
//   دالة DB موثوقة (public.record_engagement_event) — وهي المسموح الوحيد
//   بالـINSERT على public.engagement_events. الـDB هي اللي بتكتب verified_by
//   بنفسها ('service_role')، يعني محدش يقدر يدّعي إن حدث معيّن "موثّق" بإيده.
//
// ── إيه اللي بيعمله الملف ده ───────────────────────────────────────────────
//   1) تعريف أنواع الأحداث + عقد الـmetadata (من `event-contract.ts`).
//   2) استدعاء دالة الـDB الموثوقة بشكل idempotent (repeated call = نفس النتيجة).
//
// ── إيه اللي الملف ده مش بيعمله ────────────────────────────────────────────
//   ❌ منح Coins أو XP (مقفول لحد ما مراجعة الاقتصاد تخلص).
//   ❌ إنشاء مهمات أو إسناد (P1-C).
//   ❌ إشعارات (P1-D / P4).
//   ❌ أي قراءة لـactivity_log أو جداول client-writable كإثبات.
//
// ── محل الوحدة (module boundary) ───────────────────────────────────────────
//   `event-contract.ts` = منطق خالص (اختبارات في node عادي).
//   `events.ts` = الكتابة (server-only، محتاج service client).
// ────────────────────────────────────────────────────────────────────────────

import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

import {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  sanitizeEngagementMetadata,
  type EngagementEventType,
  type EngagementTrustLevel,
} from "./event-contract";

export {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
  sanitizeEngagementMetadata,
  type EngagementEventType,
  type EngagementTrustLevel,
} from "./event-contract";

/* ==========================================================================
   الكتابة الموثوقة
   ========================================================================== */

export type RecordEngagementEventInput = {
  type: EngagementEventType;
  /** معرّف المصدر (نص). لازم يكون ثابت وقابل للتكرار للـidempotency. */
  sourceId: string;
  /** معرّف المستخدم (من الجلسة، مش من العميل). */
  userId: string;
  metadata?: Record<string, unknown> | null;
  /** وقت الحدوث — default = now(). */
  occurredAt?: string;
};

export type RecordEngagementEventResult = {
  /** true = الحدث اتسجّل دلوقتي، false = كان موجود أصلًا (replay). */
  recorded: boolean;
  eventId: string | null;
  trustLevel: EngagementTrustLevel | null;
  /** سبب الرفض لو حصل (للوج/التشخيص) — مش بيthrow. */
  error?: string;
};

/**
 * يسجّل حدث Engagement واحد.
 *
 * ⚠️ **مش بتـthrow أبدًا**: فشل تسجيل الحدث لازم ما يوقفش الرحلة الأساسية
 *    للطالب (إنهاء امتحان، حفظ نوتة...). بنرجع نتيجة بدل exception.
 *
 * ⚠️ **مفيش Coins/XP**: هذا مسار إثبات فقط.
 */
export async function recordEngagementEvent(
  input: RecordEngagementEventInput,
): Promise<RecordEngagementEventResult> {
  const spec = ENGAGEMENT_EVENT_SPECS[input.type];
  if (!spec) {
    return { recorded: false, eventId: null, trustLevel: null, error: "unknown event type" };
  }

  const sourceId = typeof input.sourceId === "string" ? input.sourceId.trim() : "";
  if (!sourceId || sourceId.length > 255) {
    return { recorded: false, eventId: null, trustLevel: null, error: "invalid source id" };
  }

  const sanitized = sanitizeEngagementMetadata(input.type, input.metadata);
  if (!sanitized.ok) {
    return { recorded: false, eventId: null, trustLevel: null, error: sanitized.error };
  }

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId) {
    return { recorded: false, eventId: null, trustLevel: null, error: "missing user id" };
  }

  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc("record_engagement_event", {
      p_event_type: input.type,
      p_source_table: spec.sourceTable,
      p_source_id: sourceId,
      p_user_id: userId,
      p_metadata: sanitized.value,
      p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    });

    if (error) {
      return { recorded: false, eventId: null, trustLevel: null, error: error.message };
    }

    const payload = (data ?? {}) as {
      inserted?: boolean;
      id?: string | null;
      trust_level?: string | null;
    };

    return {
      recorded: payload.inserted === true,
      eventId: payload.id ?? null,
      trustLevel:
        payload.trust_level === "server" || payload.trust_level === "client_reported"
          ? payload.trust_level
          : null,
    };
  } catch (error) {
    return {
      recorded: false,
      eventId: null,
      trustLevel: null,
      error: error instanceof Error ? error.message : "event recording failed",
    };
  }
}

/**
 * تسجيل حدث معروف إنه client_reported (من المتصفح).
 * بيستخدم نفس المسار الموثوق — بس النوع نفسه مصنّف client_reported في الـDB،
 * يعني مش صالح كإثبات مكافأة (P1-C لازم يتقيّد بـtrust_level='server').
 */
export async function recordClientReportedEvent(
  input: Omit<RecordEngagementEventInput, "type"> & { type: EngagementEventType },
): Promise<RecordEngagementEventResult> {
  if (!CLIENT_REPORTED_EVENT_TYPES.includes(input.type)) {
    return {
      recorded: false,
      eventId: null,
      trustLevel: null,
      error: "event type is not client-reportable",
    };
  }
  return recordEngagementEvent(input);
}
