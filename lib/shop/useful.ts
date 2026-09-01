/**
 * UsefulItemEffect — Backend abstraction for Useful Store products
 *
 * Phase E: المنتجات المفيدة أصبحت حقيقية (3 منتجات) — لكن لا AiRouter coupling
 * الـ effect يُقرأ من catalog.metadata.useful في السيرفر فقط
 */

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

export type UsefulItemGrant = {
  userId: string;
  itemId: string;
  effects: UsefulItemEffect[];
};

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

// ---------------------------------------------------------------------------
// Phase E — helpers لقراءة effect من ShopItem.metadata.useful
// ---------------------------------------------------------------------------
export const USEFUL_PRODUCT_IDS = [
  "useful.study-booster",
  "useful.ai-starter-pack",
  "useful.ai-power-pack",
] as const;

export type UsefulProductId = (typeof USEFUL_PRODUCT_IDS)[number];

export function isUsefulProductId(id: string): id is UsefulProductId {
  return (USEFUL_PRODUCT_IDS as readonly string[]).includes(id);
}

type RawUsefulMeta =
  | { type: "entitlement"; kind: string; value: string }
  | { type: "ai_credit"; amount: number }
  | { type: string; [k: string]: unknown };

export function getUsefulMeta(item: { metadata?: Record<string, unknown> }): RawUsefulMeta | null {
  const raw = (item.metadata as Record<string, unknown> | undefined)?.useful;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "entitlement" && typeof o.kind === "string" && typeof o.value === "string") {
    return { type: "entitlement", kind: o.kind, value: o.value };
  }
  if (o.type === "ai_credit" && typeof o.amount === "number") {
    return { type: "ai_credit", amount: o.amount };
  }
  if (typeof o.type === "string") return o as RawUsefulMeta;
  return null;
}

export function usefulEffectLabel(item: { metadata?: Record<string, unknown>; name: string }): string {
  const m = getUsefulMeta(item);
  if (!m) return "";
  if (m.type === "entitlement") return `يمنح: ${m.value}`;
  if (m.type === "ai_credit") return `يمنح: ${m.amount} AI Credits`;
  return "";
}

// ملاحظة Phase E:
// - 3 منتجات حقيقية في shop_catalog + lib/shop/catalog.ts
// - الشراء عبر purchase_item (server validates catalog metadata)
// - AiRouter غير موصول — Credits تُحفظ فقط
// - entitlement يُستخدم للعرض فقط، لا لفتح موديلات
