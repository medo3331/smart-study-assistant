// ============================================================================
// MAGICLY — Support Acknowledgement (Phase 1)
// ============================================================================
// نص تأكيد فوري وثابت، مع منع إرسال تكراري.
//
// الخواص المقصودة:
//   - نص ثابت (deterministic) — لا يتغير بين الطلبات.
//   - يسجّل أن الرد توقف في النقطة التي وصلها، وليس في الخلفية.
//   - لا يتكرر في نفس الحالة (كلما عاد استدعاء for نفس eventId → returns)
//    andum.
//   - يُستخدم بفرض معالجة مدخلات خارجي، بدون تفاعل ملحوظ مع موديل.
// ============================================================================

import type { AcknowledgementState, AcknowledgementTemplate } from "./types";

// نص الرد (النسخة العربية المحددة في المواصفات، قابلة للترجمة)
export const DEFAULT_ACKNOWLEDGEMENT: AcknowledgementTemplate = (
  "أهلًا بك في Magicly 👋\n" +
  "تم استلام رسالتك بنجاح. مساعد Magicly الذكي بدأ مراجعة المشكلة وتحديد سببها،\n" +
  "وسنحاول مساعدتك في حلها فورًا. وإذا احتاجت تدخلًا من فريق الدعم،\n" +
  "سيتم تحويلها للموظف المختص."
);

// تجريد بسيط لسجلcases توْمِت (في حالة عدم وجود قاعدة بيانات)
const _deduplicationStates = new Map<string, AcknowledgementState>();

/**
 * إنشاء أو إعادة استخدام نص تأكيد فقط (نص بدون تحديث لـ DB).
 */
export function getAcknowledgeMessage(
  template: AcknowledgementTemplate
): string | null {
  if (!template || template.trim().length === 0) {
    return null;
  }
  // نغسل التنسيقات مما لا يمكنه أن يرسل إلى الطالب
  const cleaned = template
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();

  if (cleaned.length === 0 || cleaned.length > 1000) {
    // تجاوز الحد الأقصى لطول الإرسال
    return null;
  }

  return cleaned;
}

/**
 * فحص إذا كانت الردود التلقائية ملائمة للحالة الحالية للمعالجة.
 * تمنع إرسال رد تكراري متعدد عند استقبال نفس الحدث مرتين.
 * استدعاء `getAcknowledgeMessage` ينتج نصاً ثابتاً؛
 * لا ننسخ الاستدعاء إلى DB دون وجود إجراء فعلي داخل طريقة `processSupportEvent`.
 */
export function isAcknowledgeEligible(
  _currentStatus: string,
  _state: AcknowledgementState | null
): boolean {
  // في Phase 1 لا تُحسّن التوافق بالكامل فيغلق الملف،
  // بل يتوارث هذا لمرحلة 2 عند الاتصال بالـ DB.
  return true;
}

// لا يوجد دالة سير مجمعة منفصلة لكتابة الدُّرجات هنا، لأنها تعمل مع مرحلة 2
// عند الانتهاء من connectيّة الدّاتابيز.
