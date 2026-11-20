// lib/engagement/event-contract.ts
//
// P1-B2 — عقد الأحداث (Registry mirror) + تنظيف الـmetadata.
//
// ⚠️ **الملف ده بييجيب منه الأكواد البحتة (pure)**: مافيش Supabase، مافيش
//   server-only، عشان:
//     - الاختبارات (vitest) تقدر تستورده في node عادي،
//     - الأجزاء اللي محتاجة server (الكتابة الفعلية) في `events.ts`.
//
// الـDB يبقى **المرجع النهائي**: أي مخالفة هنا (مفتاح مش مسموح، حجم زيادة،
// نوع غير معروف) هتترفض هناك برضه — هنا احنا بنمنع الطلب الفاشل من الأساس.

/* ==========================================================================
   ١) أنواع الأحداث
   ========================================================================== */

/** مستوى الثقة — نفس تصنيف الـDB (public.engagement_event_types.trust_level). */
export type EngagementTrustLevel = "server" | "client_reported";

/** أنواع الأحداث المسموح تسجيلها. */
export const ENGAGEMENT_EVENT_TYPES = {
  /** امتحان اتسلّم وتصحيحه اتعمل على السيرفر. */
  EXAM_COMPLETED: "exam_completed",
  /** حفظ نوتة من local-first client ⇒ discovery فقط. */
  NOTES_SAVED: "notes_saved",
  /** محاضرة اتحفظت في `public.lectures` (من الجلسة). */
  LECTURE_SAVED: "lecture_saved",
  /** ظهور تعريف بميزة (يُصدر من السيرفر بعد عرض فعلي). */
  FEATURE_INTRODUCED: "feature_introduced",
  /** المستخدم جرّب الميزة (إثبات ضعيف حاليًا ⇒ discovery فقط). */
  FEATURE_TRIED: "feature_tried",
} as const;

export type EngagementEventType =
  (typeof ENGAGEMENT_EVENT_TYPES)[keyof typeof ENGAGEMENT_EVENT_TYPES];

export type EventSpec = {
  /** جدول المصدر — لازم يطابق سطر الـregistry بالضبط. */
  sourceTable: string;
  /** مستوى الثقة كما في الـDB. */
  trustLevel: EngagementTrustLevel;
  /** المفاتيح المسموحة في metadata. */
  allowedMetadataKeys: readonly string[];
  /** أقصى حجم للـmetadata (بـbytes بعد التسلسل). */
  maxMetadataBytes: number;
  /** أقصى عدد أحداث للساعة لكل مستخدم (مرآة للـDB). */
  maxEventsPerHour: number;
};

/**
 * مواصفات كل نوع حدث — مرآة لـpublic.engagement_event_types.
 * الـDB هو المرجع النهائي؛ لو اتغيّر، لازم يتظبط هنا.
 */
export const ENGAGEMENT_EVENT_SPECS: Record<EngagementEventType, EventSpec> = {
  [ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED]: {
    sourceTable: "exam_sessions",
    trustLevel: "server",
    allowedMetadataKeys: ["percent", "auto_correct", "auto_total", "has_essay"],
    maxMetadataBytes: 2048,
    maxEventsPerHour: 20,
  },
  [ENGAGEMENT_EVENT_TYPES.NOTES_SAVED]: {
    sourceTable: "client_notes",
    trustLevel: "client_reported",
    allowedMetadataKeys: ["page_count", "has_drawing", "has_image"],
    maxMetadataBytes: 2048,
    maxEventsPerHour: 120,
  },
  [ENGAGEMENT_EVENT_TYPES.LECTURE_SAVED]: {
    sourceTable: "lectures",
    trustLevel: "server",
    allowedMetadataKeys: ["has_subject", "source_type"],
    maxMetadataBytes: 2048,
    maxEventsPerHour: 40,
  },
  [ENGAGEMENT_EVENT_TYPES.FEATURE_INTRODUCED]: {
    sourceTable: "engagement_discovery",
    trustLevel: "server",
    allowedMetadataKeys: ["surface", "campaign"],
    maxMetadataBytes: 2048,
    maxEventsPerHour: 40,
  },
  [ENGAGEMENT_EVENT_TYPES.FEATURE_TRIED]: {
    sourceTable: "client_notes",
    trustLevel: "client_reported",
    allowedMetadataKeys: ["feature"],
    maxMetadataBytes: 2048,
    maxEventsPerHour: 60,
  },
};

/** أنواع مقبولة من المتصفح (client_reported) — للاستخدام discovery فقط. */
export const CLIENT_REPORTED_EVENT_TYPES: readonly EngagementEventType[] =
  Object.values(ENGAGEMENT_EVENT_TYPES).filter(
    (type) => ENGAGEMENT_EVENT_SPECS[type].trustLevel === "client_reported",
  );

/** أنواع مقبولة من السيرفر فقط (server) — هذه الوحيدة الصالحة كإثبات مهمة. */
export const SERVER_VERIFIED_EVENT_TYPES: readonly EngagementEventType[] =
  Object.values(ENGAGEMENT_EVENT_TYPES).filter(
    (type) => ENGAGEMENT_EVENT_SPECS[type].trustLevel === "server",
  );

/* ==========================================================================
   ٢) تنظيف الـmetadata
   ========================================================================== */

export type MetadataSanitizeResult =
  | { ok: true; value: Record<string, string | number | boolean | null> }
  | { ok: false; error: string };

/**
 * ينظّف الـmetadata حسب عقد النوع:
 *   - بيسقط أي مفتاح مش مسموح (أو مفتاح حساس/مش متوقع).
 *   - بيسقط أي قيمة مش JSON-safe (objects, arrays, NaN, Infinity).
 *   - بيتأكد إن الحجم النهائي ضمن الحد.
 *
 * السقوط (drop) مقصود: نتعامل مع اللي وصل كـ"أقل" بدل ما نرمي الطلب كله
 * ونخسر حدث شرعي بسبب مفتاح زيادة.
 */
export function sanitizeEngagementMetadata(
  type: EngagementEventType,
  metadata: Record<string, unknown> | null | undefined,
): MetadataSanitizeResult {
  const spec = ENGAGEMENT_EVENT_SPECS[type];
  if (!spec) return { ok: false, error: `unknown engagement event type: ${type}` };

  const source =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};

  const clean: Record<string, string | number | boolean | null> = {};
  for (const key of spec.allowedMetadataKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const raw = source[key];
    if (raw === null) {
      clean[key] = null;
      continue;
    }
    if (typeof raw === "string") {
      if (raw.length > 256) continue; // نص طويل = غالبًا محتوى/بيانات حساسة
      clean[key] = raw;
      continue;
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) continue;
      clean[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      clean[key] = raw;
    }
    // objects/arrays تُسقط: عقدنا scalar-only.
  }

  const serialized = JSON.stringify(clean);
  if (Buffer.byteLength(serialized, "utf8") > spec.maxMetadataBytes) {
    return { ok: false, error: "metadata exceeds allowed size" };
  }

  return { ok: true, value: clean };
}
