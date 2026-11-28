"use server";

/**
 * 🎛️ إجراءات Economy Balancing (D-M-06) — تعديل المكافآت والأسعار من
 * اللوحة بدون كود. كل إجراء:
 *   - requireAdminActor("rewards.manage") = Owner فقط.
 *   - تحقق مدخلات صارم (الأرقام تُرسل للقاعدة كأرقام — لا نص).
 *   - recordAuditLog بعد كل تغيير (PASS/FAIL).
 */

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdminActor } from "@/lib/admin/action-guard";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { pgQuery } from "@/lib/admin/pg";
import { isUuid } from "@/lib/credits/grants";

export interface BalancingActionResult {
  ok: boolean;
  message: string;
}

const MAX_AMOUNT = 10000; // نفس حد add_coins_grant
const MAX_CAP = 1000;
const MAX_RATE = 1000;

function isPositiveInt(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0;
}

/** تعديل قاعدة مصدر مكافأة (المبلغ/السقف/التفعيل). */
export async function updateCoinSourceRule(input: {
  id: string;
  amount?: number;
  dailyCap?: number | null;
  isLive?: boolean;
}): Promise<BalancingActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  const id = (input.id ?? "").trim();
  if (!/^[a-z0-9_]{2,40}$/.test(id)) return { ok: false, message: "معرّف المصدر غير صالح." };

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.amount !== undefined) {
    if (!isPositiveInt(input.amount) || input.amount > MAX_AMOUNT) {
      return { ok: false, message: `المبلغ لازم رقم من 1 إلى ${MAX_AMOUNT}.` };
    }
    params.push(input.amount);
    sets.push(`amount = $${params.length}`);
  }
  if (input.dailyCap !== undefined) {
    if (input.dailyCap !== null && (!Number.isInteger(input.dailyCap) || input.dailyCap < 0 || input.dailyCap > MAX_CAP)) {
      return { ok: false, message: `السقف لازم رقم من 0 إلى ${MAX_CAP} أو فاضي (بدون سقف).` };
    }
    params.push(input.dailyCap);
    sets.push(`daily_cap = $${params.length}`);
  }
  if (input.isLive !== undefined) {
    params.push(input.isLive);
    sets.push(`is_live = $${params.length}`);
  }
  if (sets.length === 0) return { ok: false, message: "مفيش تغييرات." };

  params.push(id);
  try {
    const r = await pgQuery(`UPDATE coin_source_rules SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`, params);
    if (r.length === 0) return { ok: false, message: "المصدر غير موجود." };
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "coin_source_rule", resource_id: id,
      details: { changes: { amount: input.amount, daily_cap: input.dailyCap, is_live: input.isLive } }, result: "PASS",
    });
    revalidatePath("/admin/economy");
    return { ok: true, message: `تم تحديث قاعدة «${id}».` };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "coin_source_rule", resource_id: id,
      details: { reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: "فشل التحديث — راجع سجل العمليات." };
  }
}

/** تعديل إعدادات التبديل (الأسعار/السقوف/التفعيل). */
export async function updateExchangeSettings(input: {
  coinsToCreditsEnabled?: boolean;
  creditsToCoinsEnabled?: boolean;
  rateCoinsPerCredit?: number;
  rateCoinsPerCreditOut?: number;
  dailyCapCoins?: number;
  dailyCapCredits?: number;
}): Promise<BalancingActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  // نقرا الحالي ونركّب الصف الجديد كامل — عشان قيد rate_out < rate_in
  // يتحقق على القيم النهائية مش على كل حقل لوحده.
  const current = await pgQuery<{
    coins_to_credits_enabled: boolean;
    credits_to_coins_enabled: boolean;
    rate_coins_per_credit: number;
    rate_coins_per_credit_out: number;
    daily_cap_coins: number;
    daily_cap_credits: number;
  }>("SELECT * FROM economy_exchange_settings WHERE id = 1");
  if (current.length === 0) return { ok: false, message: "إعدادات التبديل غير موجودة." };
  const next = { ...current[0] };
  if (input.coinsToCreditsEnabled !== undefined) next.coins_to_credits_enabled = input.coinsToCreditsEnabled;
  if (input.creditsToCoinsEnabled !== undefined) next.credits_to_coins_enabled = input.creditsToCoinsEnabled;
  if (input.rateCoinsPerCredit !== undefined) {
    if (!isPositiveInt(input.rateCoinsPerCredit) || input.rateCoinsPerCredit > MAX_RATE) return { ok: false, message: "سعر الشراء غير صالح." };
    next.rate_coins_per_credit = input.rateCoinsPerCredit;
  }
  if (input.rateCoinsPerCreditOut !== undefined) {
    if (!isPositiveInt(input.rateCoinsPerCreditOut) || input.rateCoinsPerCreditOut > MAX_RATE) return { ok: false, message: "سعر البيع غير صالح." };
    next.rate_coins_per_credit_out = input.rateCoinsPerCreditOut;
  }
  if (next.rate_coins_per_credit_out >= next.rate_coins_per_credit) {
    return { ok: false, message: "سعر البيع لازم يكون أقل من سعر الشراء (منع الـ arbitrage)." };
  }
  if (input.dailyCapCoins !== undefined) {
    if (!Number.isInteger(input.dailyCapCoins) || input.dailyCapCoins < 0 || input.dailyCapCoins > 100000) return { ok: false, message: "سقف الكوينز غير صالح." };
    next.daily_cap_coins = input.dailyCapCoins;
  }
  if (input.dailyCapCredits !== undefined) {
    if (!Number.isInteger(input.dailyCapCredits) || input.dailyCapCredits < 0 || input.dailyCapCredits > 100000) return { ok: false, message: "سقف الكريدت غير صالح." };
    next.daily_cap_credits = input.dailyCapCredits;
  }

  try {
    await pgQuery(
      `UPDATE economy_exchange_settings SET
         coins_to_credits_enabled = $1, credits_to_coins_enabled = $2,
         rate_coins_per_credit = $3, rate_coins_per_credit_out = $4,
         daily_cap_coins = $5, daily_cap_credits = $6, updated_at = now()
       WHERE id = 1`,
      [next.coins_to_credits_enabled, next.credits_to_coins_enabled, next.rate_coins_per_credit,
       next.rate_coins_per_credit_out, next.daily_cap_coins, next.daily_cap_credits],
    );
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "economy_exchange_settings", resource_id: "1",
      details: { input, effective: next }, result: "PASS",
    });
    revalidatePath("/admin/economy");
    return { ok: true, message: "تم تحديث إعدادات التبديل." };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "economy_exchange_settings", resource_id: "1",
      details: { reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: "فشل التحديث — راجع سجل العمليات." };
  }
}

/** تعديل سعر/تفعيل باقة (كوينز أو كريدت). */
export async function updatePackPrice(input: {
  kind: "coins" | "credits";
  packId: string;
  price?: number;
  isActive?: boolean;
}): Promise<BalancingActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  if (!/^[0-9a-f-]{36}$/i.test(input.packId ?? "")) return { ok: false, message: "معرّف الحزمة غير صالح." };
  const table = input.kind === "coins" ? "coin_packs" : input.kind === "credits" ? "credit_packs" : null;
  if (!table) return { ok: false, message: "نوع الحزمة غير معروف." };

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price < 0 || input.price > 100000) {
      return { ok: false, message: "السعر غير صالح." };
    }
    params.push(input.price);
    sets.push(`price = $${params.length}`);
  }
  if (input.isActive !== undefined) {
    params.push(input.isActive);
    sets.push(`is_active = $${params.length}`);
  }
  if (sets.length === 0) return { ok: false, message: "مفيش تغييرات." };

  params.push(input.packId);
  try {
    const r = await pgQuery(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`, params);
    if (r.length === 0) return { ok: false, message: "الحزمة غير موجودة." };
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: table, resource_id: input.packId,
      details: { changes: { price: input.price, is_active: input.isActive } }, result: "PASS",
    });
    revalidatePath("/admin/economy");
    return { ok: true, message: "تم تحديث الحزمة." };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: table, resource_id: input.packId,
      details: { reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: "فشل التحديث — راجع سجل العمليات." };
  }
}

/** إضافة رصيد يدوي لمستخدم (Coins أو Credits) من /admin/economy.
 *  Coins → add_coins_grant (المسار المركزي الوحيد، source_class='admin').
 *  Credits → grant_credits (service-only، p_source='bonus').
 *  كل محاولة بتتسجل في admin_audit_log. */
export async function grantUserBalance(input: {
  userId: string;
  kind: "coins" | "credits";
  amount: number;
  note?: string;
}): Promise<BalancingActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("rewards.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح" };
  }

  const userId = (input.userId ?? "").trim();
  if (!isUuid(userId)) return { ok: false, message: "معرّف المستخدم غير صالح (لازم UUID)." };
  if (input.kind !== "coins" && input.kind !== "credits") {
    return { ok: false, message: "نوع الرصيد غير معروف." };
  }
  if (!isPositiveInt(input.amount) || input.amount > MAX_AMOUNT) {
    return { ok: false, message: `المبلغ لازم رقم من 1 إلى ${MAX_AMOUNT}.` };
  }
  const note = (input.note ?? "").trim().slice(0, 200);
  const refId = `admin:${actor.userId}:${crypto.randomUUID()}`;

  const db = createServiceClient();
  try {
    if (input.kind === "coins") {
      const { data: awarded, error } = await db.rpc("add_coins_grant", {
        p_user_id: userId,
        p_source: "admin_grant",
        p_source_class: "admin",
        p_ref_id: refId,
        p_amount: input.amount,
        p_metadata: { by: actor.userEmail ?? actor.userId, note: note || null },
      });
      if (error) throw error;
      if (!awarded || Number(awarded) !== input.amount) {
        await recordAuditLog({
          actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
          resource_type: "coin_grant", resource_id: userId,
          details: { reason: "add_coins_grant rejected (closed source or cap)", amount: input.amount }, result: "FAIL",
        });
        return { ok: false, message: "لم تُضف الكوينز (المصدر مقفول أو تجاوز السقف اليومي) — راجع قواعد المصادر." };
      }
    } else {
      const { error } = await db.rpc("grant_credits", {
        p_user_id: userId,
        p_amount: input.amount,
        p_expires_at: null,
        p_source: "bonus",
        p_notes: note || `منح إداري من ${actor.userEmail ?? actor.userId}`,
      });
      if (error) throw error;
    }

    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: input.kind === "coins" ? "coin_grant" : "credit_grant", resource_id: userId,
      details: { amount: input.amount, kind: input.kind, ref_id: refId, note: note || null }, result: "PASS",
    });
    revalidatePath("/admin/economy");
    return {
      ok: true,
      message: input.kind === "coins"
        ? `تمت إضافة ${input.amount} كوين للمستخدم.`
        : `تمت إضافة ${input.amount} كريدت للمستخدم.`,
    };
  } catch (e) {
    await recordAuditLog({
      actor: actor.userId, actor_email: actor.userEmail ?? null, action: "rewards.manage",
      resource_type: "balance_grant", resource_id: userId,
      details: { kind: input.kind, amount: input.amount, reason: e instanceof Error ? e.message : "unknown" }, result: "FAIL",
    });
    return { ok: false, message: e instanceof Error ? `فشل المنح: ${e.message}` : "فشل المنح — راجع سجل العمليات." };
  }
}
