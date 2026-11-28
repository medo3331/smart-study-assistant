/**
 * قراءة طلبات الشراء للوحة الأدمن — service_role فقط (الجدول RLS بلا سياسة
 * كتابة للمستخدم)، وتُعرض في /admin/purchase-requests.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { PurchaseRequestRow } from "@/lib/store/purchase-requests";

export type PurchaseRequestAdminView = PurchaseRequestRow & {
  user_email: string | null;
  user_name: string | null;
  user_code: string | null;
};

export type PurchaseRequestsOverview = {
  total_requests: number;
  awaiting_payment: number;
  payment_submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
};

export async function listPurchaseRequests(limit = 200): Promise<PurchaseRequestAdminView[]> {
  const db = createServiceClient();
  const { data: requests, error } = await db
    .from("purchase_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (requests ?? []) as PurchaseRequestRow[];
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, display_name, public_user_code")
    .in("id", userIds);
  const profileMap = new Map(
    ((profiles ?? []) as Array<{ id: string; email?: string | null; display_name?: string | null; public_user_code?: string | null }>).map((p) => [p.id, p])
  );

  return rows.map((r) => {
    const p = profileMap.get(r.user_id);
    return {
      ...r,
      user_email: p?.email ?? null,
      user_name: p?.display_name ?? null,
      user_code: p?.public_user_code ?? null,
    };
  });
}

export async function getPurchaseRequestsOverview(): Promise<PurchaseRequestsOverview> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("purchase_requests")
    .select("status");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ status: PurchaseRequestRow["status"] }>;
  return {
    total_requests: rows.length,
    awaiting_payment: rows.filter((r) => r.status === "awaiting_payment").length,
    payment_submitted: rows.filter((r) => r.status === "payment_submitted").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
  };
}
