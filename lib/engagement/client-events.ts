// lib/engagement/client-events.ts
//
// P1-B2 — مُبلِّغ الأحداث من جهة العميل (client-side).
//
// ⚠️ **الحدود المهمة**:
//   • الأحداث المرسلة من هنا تصنيفها `client_reported` في الـregistry ⇒
//     **مش صالح كإثبات مكافأة**، بس مفيد لـFeature Discovery وقياس الاستخدام.
//   • أي محاولة ترسل نوع `server` (زي exam_completed) بتترفض من الـAPI.
//   • كل نداء **best-effort**: فشل الإرسال مايرميش error للواجهة (الشاشة
//     الأصلية هي المهمة، والإحصاء مش جزء من الرحلة).
//   • المعدل: البوابة عندها rate limit على مستوى المستخدم (12/دقيقة).
//
// ⚠️ **ليه مش بنعمل event لكل ضغطة؟**
//   عشان نpollute الـledger. البتاعة هنا: "حفظ نوتة" / "فتح نوتة" — أحداث
//   نادرة نسبيًا وبتمثل سلوك حقيقي.

import { CLIENT_REPORTED_EVENT_TYPES, type EngagementEventType } from "./event-contract";

/** Types the browser is allowed to report (mirrors the API allowlist). */
const REPORTABLE: readonly EngagementEventType[] = CLIENT_REPORTED_EVENT_TYPES;

/**
 * يبعت حدث لـ /api/engagement/events.
 *
 * @returns true لو البوابة قبلت الطلب، false لو اتخطّى/فشل (مفيش exception).
 */
export async function reportClientEngagementEvent(
  type: EngagementEventType,
  sourceId: string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!REPORTABLE.includes(type)) return false;

  const id = typeof sourceId === "string" ? sourceId.trim() : "";
  if (!id || id.length > 200) return false;

  try {
    const response = await fetch("/api/engagement/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        sourceId: id,
        metadata: metadata ?? {},
      }),
      keepalive: true,
    });
    return response.ok;
  } catch {
    // فشل شبكة أو مزوّد — نتجاهله: الإحصاء مش جزء من الرحلة.
    return false;
  }
}
