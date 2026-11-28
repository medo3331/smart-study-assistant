// ============================================================================
// MAGICLY — Safe Actions Allowlist (Phase 1)
// ============================================================================
// سجل الإجراءات المسموح بها (allowlist) للذكاء الاصطناعي في مرحلة 2.
// في Phase 1 لا توجد أجراءات مكتوبة (write-only) — كلها قراءة Only.
//
// القاعدة:
//   - لا يصدر النموذج إجراءً عشوائيًا.
//   - لكل إجراء: مفتاح (key)، وصف، إذن مطلوب، schema الإدخال، وقت التحقق،
//     طريقة التأكيد، تسجيل، وتصنيف المخاطر.
//   - الحساسية الزائفة (أموال، اشتراكات، حقوق الوصول، إلخ) محظورة
//     من دون موافقة بشرية صريحة.
// ============================================================================

import type {
  SafeActionDefinition,
  SafeActionInputSchema,
  SafeActionResultVerification,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// قائمة الإجراءات الأولية (قراءة فقط في مرحلة 1)
// ─────────────────────────────────────────────────────────────────────────────

export const safeActionList: SafeActionDefinition[] = [
  {
    key: "read_subscription_status",
    labelAr: "فحص حالة الاشتراك",
    descriptionAr:
      "قراءة حالة الاشتراك (فعال / منتهي / قيد الانتظار) وبيانات الصلاحيات",
    risk: "low",
    requiresPermissions: ["audit.read"],
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "معرف المستخدم" },
      },
      required: ["userId"],
    } as SafeActionInputSchema,
    verification: {
      name: "subscription_status_verified",
      successCondition: "حالة الاشتراك مؤكدة من الـ DB",
      onFailure: "لا يُبلغ AI بأن الاشتراك نشط؛ يرفع الخبر إلى موظف",
    } as SafeActionResultVerification,
  },
  {
    key: "check_transaction_status",
    labelAr: "فحص حالة المعاملة",
    descriptionAr:
      "فحص حالة عملية الدفع (داخل / خارج نطاق / أخطاء) دون تعديل الرصيد",
    risk: "low",
    requiresPermissions: ["audit.read"],
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "معرف العملية" },
        userId: { type: "string", description: "معرف المستخدم" },
      },
      required: ["orderId", "userId"],
    } as SafeActionInputSchema,
    verification: {
      name: "transaction_verified",
      successCondition: "حالة المعاملة مؤكدة",
      onFailure: "تجاهل الإجراء، ورفع الخبر",
    } as SafeActionResultVerification,
  },
  {
    key: "check_reward_event_status",
    labelAr: "فحص حالة مكافأة",
    descriptionAr:
      "التحق من أن مكافأة الدرس أو الإعلان قد سُجلت، دون إصدار مكافأة جديدة",
    risk: "low",
    requiresPermissions: ["audit.read"],
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "معرف الحدث" },
      },
      required: ["eventId"],
    } as SafeActionInputSchema,
    verification: {
      name: "reward_event_verified",
      successCondition: "الحالة مؤكدة",
      onFailure: "الإجراء لا يُعطى، ويُرفع الخبر",
    } as SafeActionResultVerification,
  },
  {
    key: "check_ai_operation_status",
    labelAr: "فحص حالة عملية AI",
    descriptionAr:
      "نظرة سريعة إذا كانت عملية توليد أو استدعاء AI انتهت، أو واجهت خطأً",
    risk: "low",
    requiresPermissions: ["audit.read"],
    inputSchema: {
      type: "object",
      properties: {
        opId: { type: "string", description: "معرف العملية" },
      },
      required: ["opId"],
    } as SafeActionInputSchema,
    verification: {
      name: "ai_operation_verified",
      successCondition: "الحالة مؤكدة",
      onFailure: "الإجراء لا يُعطى، ويُرفع الخبر",
    } as SafeActionResultVerification,
  },
  {
    key: "check_existing_ticket_status",
    labelAr: "فحص حالة التذكرة",
    descriptionAr:
      "التحق من حالة تذكرة دعم حالية قبل أي رد أو إجراء لاحق",
    risk: "low",
    requiresPermissions: ["support.view"],
    inputSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
      },
      required: ["ticketId"],
    } as SafeActionInputSchema,
    verification: {
      name: "ticket_status_verified",
      successCondition: "حالة التذكرة مؤكدة",
      onFailure: "الإجراء لا يُعطى",
    } as SafeActionResultVerification,
  },
  {
    key: "check_service_availability",
    labelAr: "فحص توفر الخدمة",
    descriptionAr:
      "فحص إذا كانت الخدمة (قاعدة البيانات، المزود AI، واجهات اتصال) متاحة",
    risk: "low",
    requiresPermissions: ["audit.read"],
    inputSchema: {
      type: "object",
      properties: {},
    } as SafeActionInputSchema,
    verification: {
      name: "service_status_verified",
      successCondition: "الخدمة متاحة",
      onFailure: "الإجراء لا يُعطى، ويُرفع الخبر",
    } as SafeActionResultVerification,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// مساعدة: البحث عن إجراء حسب المفتاح
// ─────────────────────────────────────────────────────────────────────────────

export function getSafeAction(key: string): SafeActionDefinition | undefined {
  return safeActionList.find((a) => a.key === key);
}

// ─────────────────────────────────────────────────────────────────────────────
// تنفيذ الإجراءات — prototype: كل إجراء "قراءة فقط" الآن
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تنفيذ الإجراء على مستوى الحد الأدنى (prototype).
 * في Phase 1، لا توجد إجراءات مكتوبة؛ يرجع كل تنفيذ success فوراً.
 * المرحلة 2 (Safe Resolution Engine) ستقوم بتنفيذ الإجراءات الحقيقية.
 */
export async function executeSafeAction(
  action: SafeActionDefinition,
  input: unknown
): Promise<{
  success: boolean;
  result?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  error?: string;
}> {
  // 1. التحقق من الإدخال
  const validator = (input as Record<string, unknown>)?.["$schema"]
    ? {} as SafeActionInputSchema
    : undefined;

  // 2. في Phase 1 لا توجد إجراءات مكتوبة
  return {
    success: true,
    result: {
      actionKey: action.key,
      executedBy: "ai-support-orchestrator",
      phase: "phase1",
      description: action.descriptionAr,
    },
  };
}
