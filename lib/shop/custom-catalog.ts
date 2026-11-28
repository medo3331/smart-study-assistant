import type { SupabaseClient } from "@supabase/supabase-js";
import { RARITIES, type Rarity } from "./rarity";
import type { Category, ShopItem } from "./types";

/**
 * عناصر المتجر اللي بتتضاف من لوحة الأدمن (/admin/store-items).
 *
 * بتتعمل في جدول `shop_catalog` (السيرفر هو اللي بيشتري منه — `purchase_item`
 * بيقرا السعر من الجدول) وبيانات العرض (الاسم/الوصف/القيمة) بتتعامل في
 * `metadata` تحت مفتاح `custom`. الأقسام المسموح بيها: avatar / title /
 * companion — قيمها إيموجي ونص فبتشتغل من غير CSS أو باكات جاهزة.
 */

export type CustomCatalogRow = {
  id: string;
  slot: string | null;
  price: number;
  credits_price: number | null;
  rarity: string | null;
  metadata: {
    custom?: boolean;
    active?: boolean;
    name?: string;
    desc?: string;
    value?: string;
  } | null;
};

function isRarity(v: string | null | undefined): v is Rarity {
  return (RARITIES as readonly string[]).includes(v ?? "");
}

/** تحويل صف الجدول لعنصر متجر — ولو الصف مش مكتمل بيرجع null. */
export function customRowToItem(row: CustomCatalogRow): ShopItem | null {
  const m = row.metadata ?? {};
  if (!m.custom || m.active === false) return null;
  if (!m.name || !m.value) return null;
  if (!(row.slot === "avatar" || row.slot === "title" || row.slot === "companion")) return null;
  return {
    id: row.id,
    category: row.slot as Category,
    name: m.name,
    desc: m.desc ?? "",
    rarity: isRarity(row.rarity ?? undefined) ? (row.rarity as Rarity) : "common",
    price: row.price,
    creditsPrice: row.credits_price ?? undefined,
    value: m.value,
    unlock: null,
    metadata: { custom: true },
  };
}

/** جلب عناصر الأدمن من الجدول — فشلها مش بيوقف المتجر (فاضي = كتالوج ثابت). */
export async function fetchCustomCatalogItems(
  supabase: SupabaseClient,
): Promise<ShopItem[]> {
  const { data, error } = await supabase
    .from("shop_catalog")
    .select("id, slot, price, credits_price, rarity, metadata");
  if (error) return [];
  return ((data ?? []) as CustomCatalogRow[])
    .map(customRowToItem)
    .filter((i): i is ShopItem => i !== null);
}
