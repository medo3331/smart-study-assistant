"use server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function recordPayment(input: { userId: string; amount: number; currency?: string; method?: string; note?: string }, adminUserId: string) {
  const db = createServiceClient();
  const { error } = await db.from("payments").insert({
    user_id: input.userId,
    amount: input.amount,
    currency: input.currency || "USD",
    method: input.method || null,
    note: input.note || null,
    recorded_by: adminUserId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "تم تسجيل الدفع" };
}
