/**
 * UsefulItemEffect — Backend abstraction for future Useful Store products
 *
 * Phase D = infrastructure فقط — لا منتجات، لا catalog rows، لا أسعار، لا UI
 * الهدف: أن يكون backend قادراً مستقبلاً على تنفيذ:
 *   purchase → grant useful effect (entitlement / ai_credit / consumable)
 * بدون إعادة كتابة architecture.
 *
 * لا تُستخدم هذه الأنواع في أي runtime الآن — AiRouter و Store غير موصولين بها.
 */

// ---------------------------------------------------------------------------
// Effect kinds — الحد الأدنى المفيد
// ---------------------------------------------------------------------------
export type UsefulItemEffectKind = "entitlement" | "ai_credit" | "consumable";

export type UsefulItemEffect =
  | {
      kind: "entitlement";
      entitlementKind: string;
      entitlementValue: string;
      expiresAt?: string | null;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: "ai_credit";
      delta: number;
      reason: string;
      refId?: string | null;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: "consumable";
      consumableId: string;
      metadata?: Record<string, unknown>;
    };

// Grant descriptor — كيف سيبدو منح منتج Useful مستقبلاً (غير مستخدم الآن)
export type UsefulItemGrant = {
  userId: string;
  itemId: string; // ID المنتج المستقبلي (لا يوجد الآن)
  effects: UsefulItemEffect[];
};

// ---------------------------------------------------------------------------
// Helpers — للتوثيق والاختبار فقط، لا تُستدعى في runtime حالياً
// ---------------------------------------------------------------------------
export function isUsefulItemEffect(v: unknown): v is UsefulItemEffect {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.kind === "entitlement") {
    return typeof o.entitlementKind === "string" && typeof o.entitlementValue === "string";
  }
  if (o.kind === "ai_credit") {
    return typeof o.delta === "number" && typeof o.reason === "string";
  }
  if (o.kind === "consumable") {
    return typeof o.consumableId === "string";
  }
  return false;
}

// ملاحظة Phase D:
// - لا products حقيقية، لا prices، لا catalog
// - لا تنفيذ purchase_item → UsefulItemGrant
// - AiRouter لا يستدعي has_entitlement / ai_credit_balance
// - كل شيء هنا للـ type safety المستقبلية فقط
