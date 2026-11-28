/**
 * بيانات عناصر المتجر المخصصة (الأدمن) — shop_catalog مع metadata.custom.
 * الصلاحية بتتفحص في الصفحة/الإجراء قبل النداء هنا.
 */

import { pgQuery } from "./pg";

export interface CustomStoreItem {
  id: string;
  slot: string | null;
  price: number;
  creditsPrice: number | null;
  rarity: string | null;
  name: string;
  desc: string;
  value: string;
  active: boolean;
}

export async function getCustomStoreItems(): Promise<CustomStoreItem[]> {
  const rows = await pgQuery<{
    id: string;
    slot: string | null;
    price: number;
    credits_price: number | null;
    rarity: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, slot, price, credits_price, rarity, metadata
       FROM shop_catalog
      WHERE metadata->>'custom' = 'true'
      ORDER BY id`,
  );
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      slot: r.slot,
      price: r.price,
      creditsPrice: r.credits_price,
      rarity: (r.rarity ?? (m.rarity as string | undefined)) ?? null,
      name: (m.name as string | undefined) ?? r.id,
      desc: (m.desc as string | undefined) ?? "",
      value: (m.value as string | undefined) ?? "",
      active: m.active !== false,
    };
  });
}

/** عدد الملكيات لعنصر — بيمنع حذف عنصر اتشترى (توثيق تاريخ الشرا). */
export async function getOwnedCount(itemId: string): Promise<number> {
  const rows = await pgQuery<{ n: string }>(
    `SELECT count(*)::text AS n FROM shop_inventory WHERE item_id = $1`,
    [itemId],
  );
  return Number(rows[0]?.n ?? 0);
}
