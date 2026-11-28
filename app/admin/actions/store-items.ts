"use server";

/**
 * إجراءات عناصر المتجر المخصصة (/admin/store-items):
 *   - createStoreItem: إضافة عنصر جديد بالكوينز (أو هجين بكريدت) —
 *     بيتكتب في shop_catalog مع metadata.custom، والمتجر بيقراه تلقائي.
 *   - deleteStoreItem: حذف عنصر مخصوص — مرفوض لو حد اشتراه.
 * Owner فقط (rewards.manage)، وكل محاولة بتتسجل في admin_audit_log.
 */

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdminActor } from "@/lib/admin/action-guard";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { pgQuery } from "@/lib/admin/pg";
import { RARITIES, type Rarity } from "@/lib/shop/rarity";

export interface StoreItemActionResult {
  ok: boolean;
  message: string;
}

/** الأقسام اللي بتشتغل لعناصر مخصصة — قيمها إيموجي/نص فمتطلباتش CSS أو باكات.
 *  «posters» نوع خاص: slot=null في الجدول مع metadata.poster=true. */
const ALLOWED_SLOTS = ["avatar", "title", "companion", "posters"] as const;
type AllowedSlot = (typeof ALLOWED_SLOTS)[number];

function isRarity(v: string): v is Rarity {
  return (RARITIES as readonly string[]).includes(v);
}

function isAllowedSlot(v: string): v is AllowedSlot {
  return (ALLOWED_SLOTS as readonly string[]).includes(v);
}

export async function createStoreItem(input: {
  slot: string;
  name: string;
  desc: string;
  value: string;
  rarity: string;
  price: number;
  creditsPrice?: number | null;
}): Promise<StoreItemActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  const slot = (input.slot ?? "").trim();
  if (!isAllowedSlot(slot)) {
    return { ok: false, message: "القسم لازم يكون: صورة رمزية (avatar) أو لقب (title) أو رفيق (companion) أو بوستر (posters)." };
  }
  const name = (input.name ?? "").trim();
  if (!name || name.length > 60) return { ok: false, message: "الاسم مطلوب (حتى 60 حرف)." };
  const desc = (input.desc ?? "").trim();
  if (desc.length > 200) return { ok: false, message: "الوصف حتى 200 حرف." };
  const value = (input.value ?? "").trim();
  if (!value || value.length > 60) {
    return { ok: false, message: "المحتوى (إيموجي/نص) مطلوب — حتى 60 حرف." };
  }
  const rarity = (input.rarity ?? "").trim();
  if (!isRarity(rarity)) return { ok: false, message: "الندرة غير صالحة." };
  if (!Number.isInteger(input.price) || input.price < 0 || input.price > 100000) {
    return { ok: false, message: "السعر لازم رقم من 0 إلى 100000." };
  }
  const creditsPrice = input.creditsPrice ?? null;
  if (creditsPrice !== null && (!Number.isInteger(creditsPrice) || creditsPrice <= 0 || creditsPrice > 100000)) {
    return { ok: false, message: "سعر الكريدت (لو موجود) لازم رقم موجب." };
  }

  const id = slot === "posters" ? `poster.custom-${crypto.randomUUID().slice(0, 8)}` : `${slot}.custom-${crypto.randomUUID().slice(0, 8)}`;
  const metadata = slot === "posters"
    ? { custom: true, poster: true, name, desc, value, collection: "egyptian-vibes" }
    : { custom: true, name, desc, value };

  try {
    await pgQuery(
      `INSERT INTO shop_catalog (id, slot, price, unlock, rarity, metadata, credits_price)
       VALUES ($1, $2, $3, NULL, $4, $5::jsonb, $6)`,
      [id, slot === "posters" ? null : slot, input.price, rarity, JSON.stringify(metadata), creditsPrice],
    );
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "shop_catalog", resource_id: id,
      details: { op: "create", slot, name, desc, value, rarity, price: input.price, credits_price: creditsPrice },
      result: "PASS",
    });
    revalidatePath("/admin/store-items");
    revalidatePath("/shop");
    return { ok: true, message: `تمت إضافة «${name}» (${id}).` };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "shop_catalog", resource_id: id,
      details: { op: "create", reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: "فشلت الإضافة — راجع سجل العمليات." };
  }
}

export async function deleteStoreItem(itemId: string): Promise<StoreItemActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  const id = (itemId ?? "").trim();
  if (!id || id.length > 80) {
    return { ok: false, message: "معرّف العنصر غير صالح." };
  }

  const db = createServiceClient();
  try {
    const { count, error } = await db
      .from("shop_inventory")
      .select("item_id", { count: "exact", head: true })
      .eq("item_id", id);
    if (error) throw error;
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: `العنصر مملوك عند ${count ?? 0} مستخدم — مش بينفع يتحذف. خلّيه غير مفعّل بدل كده.`,
      };
    }
    const r = await pgQuery(
      `DELETE FROM shop_catalog WHERE id = $1 AND metadata->>'custom' = 'true' RETURNING id`,
      [id],
    );
    if (r.length === 0) return { ok: false, message: "العنصر غير موجود أو مش مخصوص." };
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "shop_catalog", resource_id: id,
      details: { op: "delete" }, result: "PASS",
    });
    revalidatePath("/admin/store-items");
    revalidatePath("/shop");
    return { ok: true, message: "تم حذف العنصر." };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "shop_catalog", resource_id: id,
      details: { op: "delete", reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: "فشل الحذف — راجع سجل العمليات." };
  }
}

/** تعديل عنصر مخصّص (اسم/وصف/محتوى/ندرة/أسعار) + إخفاء وإظهار.
 *  الإخفاء (active=false) بيخفيه من المتجر والمخزن للعملاء الجداد —
 *  اللي معاه العنصر فاضل معاه، والسجل محفوظ. */
export async function updateStoreItem(input: {
  itemId: string;
  name?: string;
  desc?: string;
  value?: string;
  rarity?: string;
  price?: number;
  creditsPrice?: number | null;
  active?: boolean;
}): Promise<StoreItemActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  const id = (input.itemId ?? "").trim();
  if (!id || id.length > 80) return { ok: false, message: "معرّف العنصر غير صالح." };

  const meta: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 60) return { ok: false, message: "الاسم مطلوب (حتى 60 حرف)." };
    meta.name = name;
  }
  if (input.desc !== undefined) {
    const desc = input.desc.trim();
    if (desc.length > 200) return { ok: false, message: "الوصف حتى 200 حرف." };
    meta.desc = desc;
  }
  if (input.value !== undefined) {
    const value = input.value.trim();
    if (!value || value.length > 60) return { ok: false, message: "المحتوى (إيموجي/نص) مطلوب — حتى 60 حرف." };
    meta.value = value;
  }
  if (input.rarity !== undefined) {
    if (!isRarity(input.rarity)) return { ok: false, message: "الندرة غير صالحة." };
  }
  if (input.price !== undefined) {
    if (!Number.isInteger(input.price) || input.price < 0 || input.price > 100000) {
      return { ok: false, message: "السعر لازم رقم من 0 إلى 100000." };
    }
  }
  if (input.creditsPrice !== undefined && input.creditsPrice !== null) {
    if (!Number.isInteger(input.creditsPrice) || input.creditsPrice <= 0 || input.creditsPrice > 100000) {
      return { ok: false, message: "سعر الكريدت لازم رقم موجب أو فاضي." };
    }
  }
  if (Object.keys(meta).length === 0 && input.rarity === undefined && input.price === undefined
      && input.creditsPrice === undefined && input.active === undefined) {
    return { ok: false, message: "مفيش تغييرات." };
  }

  try {
    // نقرا الميتاداتا الحالية ونركّب عليها — عشان منضيعش مفاتيح زي collection
    const rows = await pgQuery<{ metadata: Record<string, unknown> | null; rarity: string | null }>(
      `SELECT metadata, rarity FROM shop_catalog WHERE id = $1 AND metadata->>'custom' = 'true'`,
      [id],
    );
    if (rows.length === 0) return { ok: false, message: "العنصر غير موجود أو مش مخصوص." };
    const nextMeta = { ...(rows[0].metadata ?? {}), ...meta };
    if (input.active !== undefined) nextMeta.active = input.active;

    const params: unknown[] = [JSON.stringify(nextMeta)];
    const sqlSets: string[] = [`metadata = $1::jsonb`];
    if (input.rarity !== undefined) { params.push(input.rarity); sqlSets.push(`rarity = $${params.length}`); }
    if (input.price !== undefined) { params.push(input.price); sqlSets.push(`price = $${params.length}`); }
    if (input.creditsPrice !== undefined) { params.push(input.creditsPrice); sqlSets.push(`credits_price = $${params.length}`); }
    params.push(id);

    await pgQuery(
      `UPDATE shop_catalog SET ${sqlSets.join(", ")} WHERE id = $${params.length}`,
      params,
    );
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "shop_catalog", resource_id: id,
      details: { op: "update", changes: { ...meta, rarity: input.rarity, price: input.price, credits_price: input.creditsPrice, active: input.active } },
      result: "PASS",
    });
    revalidatePath("/admin/store-items");
    revalidatePath("/shop");
    return { ok: true, message: "تم حفظ التعديلات." };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "shop_catalog", resource_id: id,
      details: { op: "update", reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: "فشل التعديل — راجع سجل العمليات." };
  }
}
