"use server";
import { createServiceClient } from "@/lib/supabase/admin";
import { pgQuery } from "@/lib/admin/pg";

export async function recordPayment(input: { userId: string; payerName?: string; amount: number; currency?: string; method?: string; note?: string; paidAt?: string }, adminUserId: string) {
  const db = createServiceClient();
  const { error } = await db.from("payments").insert({
    user_id: input.userId,
    payer_name: input.payerName || null,
    amount: input.amount,
    currency: input.currency || "USD",
    method: input.method || null,
    note: input.note || null,
    paid_at: input.paidAt ? new Date(input.paidAt).toISOString() : new Date().toISOString(),
    recorded_by: adminUserId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "تم تسجيل الدفع" };
}

export async function updatePayment(input: { id: string; payerName?: string; amount?: number; currency?: string; method?: string; note?: string; paidAt?: string }) {
  const db = createServiceClient();
  const patch: any = {};
  if (input.payerName !== undefined) patch.payer_name = input.payerName || null;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.method !== undefined) patch.method = input.method || null;
  if (input.note !== undefined) patch.note = input.note || null;
  if (input.paidAt !== undefined) patch.paid_at = new Date(input.paidAt).toISOString();
  const { error } = await db.from("payments").update(patch).eq("id", input.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "تم التعديل" };
}

export async function deletePayment(id: string) {
  const db = createServiceClient();
  const { error } = await db.from("payments").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "تم الحذف" };
}

export async function fetchPayments() {
  try {
    const rows = await pgQuery<any>(`SELECT id::text, user_id::text, payer_name, amount::text, currency, method, note, paid_at::text, created_at::text FROM public.payments ORDER BY paid_at DESC NULLS LAST LIMIT 200`);
    return rows;
  } catch {
    return [];
  }
}

