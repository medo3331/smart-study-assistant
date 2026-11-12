"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { pgQuery } from "@/lib/admin/pg";
import { guardAction, requireAdminActor } from "@/lib/admin/action-guard";

/**
 * 💳 سجل الدفعات اليدوية — Server Actions.
 *
 * ⚠️ أمان (P0، 2026-11):
 *   قبل كده كل الدوال دي كانت بدون فحص، وبتشتغل بـ service_role (تتجاوز RLS)،
 *   و`recordPayment` كانت بتاخد `adminUserId` من العميل وتكتبه في
 *   `recorded_by` — يعني أي حد يقدر يزوّر دفعة ويحطّ اسم أي أدمن.
 *
 *   دلوقتي:
 *     - القراءة: `users.read` (نفس صلاحية صفحة الدفعات).
 *     - الكتابة: `subscriptions.manage`.
 *     - `recorded_by` بقى `ctx.actor.userId` من الجلسة، والباراميتر اتشال.
 */

const READ_PERMISSION = "users.read" as const;
const WRITE_PERMISSION = "subscriptions.manage" as const;

type PaymentResult = { ok: boolean; message: string };

function safeIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const recordPayment = guardAction(
  WRITE_PERMISSION,
  async (ctx, input: {
    userId: string;
    payerName?: string;
    amount: number;
    currency?: string;
    method?: string;
    note?: string;
    paidAt?: string;
  }): Promise<PaymentResult> => {
    if (!input?.userId) return { ok: false, message: "مستخدم غير محدد" };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, message: "المبلغ غير صالح" };
    }

    const paidAt = input.paidAt ? safeIsoDate(input.paidAt) : null;
    if (input.paidAt && !paidAt) return { ok: false, message: "تاريخ الدفع غير صالح" };

    const db = createServiceClient();
    const { error } = await db.from("payments").insert({
      user_id: input.userId,
      payer_name: input.payerName || null,
      amount: input.amount,
      currency: input.currency || "EGP",
      method: input.method || null,
      note: input.note || null,
      paid_at: paidAt ?? new Date().toISOString(),
      // الهوية من الجلسة — مش من العميل.
      recorded_by: ctx.actor.userId,
    });
    if (error) {
      console.error("[payments] insert failed:", error.message);
      return { ok: false, message: "فشل تسجيل الدفعة" };
    }
    return { ok: true, message: "تم تسجيل الدفع" };
  }
);

export const updatePayment = guardAction(
  WRITE_PERMISSION,
  async (_ctx, input: {
    id: string;
    payerName?: string;
    amount?: number;
    currency?: string;
    method?: string;
    note?: string;
    paidAt?: string;
  }): Promise<PaymentResult> => {
    if (!input?.id) return { ok: false, message: "دفعة غير محددة" };
    if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
      return { ok: false, message: "المبلغ غير صالح" };
    }

    const patch: Record<string, unknown> = {};
    if (input.payerName !== undefined) patch.payer_name = input.payerName || null;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.method !== undefined) patch.method = input.method || null;
    if (input.note !== undefined) patch.note = input.note || null;
    if (input.paidAt !== undefined) {
      const iso = safeIsoDate(input.paidAt);
      if (!iso) return { ok: false, message: "تاريخ الدفع غير صالح" };
      patch.paid_at = iso;
    }

    if (Object.keys(patch).length === 0) return { ok: false, message: "مفيش تعديلات" };

    const db = createServiceClient();
    const { error } = await db.from("payments").update(patch).eq("id", input.id);
    if (error) {
      console.error("[payments] update failed:", error.message);
      return { ok: false, message: "فشل تعديل الدفعة" };
    }
    return { ok: true, message: "تم التعديل" };
  }
);

export const deletePayment = guardAction(
  WRITE_PERMISSION,
  async (_ctx, id: string): Promise<PaymentResult> => {
    if (!id) return { ok: false, message: "دفعة غير محددة" };
    const db = createServiceClient();
    const { error } = await db.from("payments").delete().eq("id", id);
    if (error) {
      console.error("[payments] delete failed:", error.message);
      return { ok: false, message: "فشل حذف الدفعة" };
    }
    return { ok: true, message: "تم الحذف" };
  }
);

export interface PaymentRow {
  id: string;
  user_id: string;
  payer_name: string | null;
  amount: string;
  currency: string;
  method: string | null;
  note: string | null;
  paid_at: string | null;
  created_at: string;
}

/**
 * قراءة آخر ٢٠٠ دفعة.
 * بتستخدم `requireAdminActor` مباشرة (مش `guardAction`) لأن نوع الإرجاع
 * مصفوفة مش `{ ok, message }` — والرفض بيرجّع `[]` بدل ما يكسر الصفحة.
 */
export async function fetchPayments(): Promise<PaymentRow[]> {
  try {
    await requireAdminActor(READ_PERMISSION);
  } catch {
    return [];
  }
  try {
    return await pgQuery<PaymentRow>(
      `SELECT id::text, user_id::text, payer_name, amount::text, currency, method, note, paid_at::text, created_at::text
         FROM public.payments
        ORDER BY paid_at DESC NULLS LAST
        LIMIT 200`
    );
  } catch (e: unknown) {
    console.error("[payments] fetch failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
