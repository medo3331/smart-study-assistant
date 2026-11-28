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
  ticket_title: string | null;
  ticket_status: string | null;
};

export type PurchaseRequestsOverview = {
  total_requests: number;
  awaiting_payment: number;
  payment_submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
};

export async function listPurchaseRequests(limit = 200, kind?: "credits" | "plan" | "coins"): Promise<PurchaseRequestAdminView[]> {
  const db = createServiceClient();
  let query = db
    .from("purchase_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) query = query.eq("kind", kind);
  const { data: requests, error } = await query;
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

  const ticketIds = Array.from(new Set(rows.map((r) => r.ticket_id).filter((id): id is string => !!id)));
  const ticketMap = new Map<string, { title: string | null; status: string | null }>();
  if (ticketIds.length > 0) {
    const { data: tickets } = await db
      .from("support_tickets")
      .select("id, title, status")
      .in("id", ticketIds);
    for (const t of (tickets ?? []) as Array<{ id: string; title?: string | null; status?: string | null }>) {
      ticketMap.set(t.id, { title: t.title ?? null, status: t.status ?? null });
    }
  }

  return rows.map((r) => {
    const p = profileMap.get(r.user_id);
    const ticket = r.ticket_id ? ticketMap.get(r.ticket_id) : undefined;
    return {
      ...r,
      user_email: p?.email ?? null,
      user_name: p?.display_name ?? null,
      user_code: p?.public_user_code ?? null,
      ticket_title: ticket?.title ?? null,
      ticket_status: ticket?.status ?? null,
    };
  });
}

/** رسائل محادثة الدعم المرتبطة بطلب (لعرضها في لوحة المراجعة). */
export async function getTicketMessages(requestId: string): Promise<
  Array<{ id: string; author_role: string; body: string; created_at: string }>
> {
  const db = createServiceClient();
  const { data: request } = await db
    .from("purchase_requests")
    .select("ticket_id")
    .eq("id", requestId)
    .maybeSingle();
  const ticketId = (request as { ticket_id?: string | null } | null)?.ticket_id;
  if (!ticketId) return [];
  const { data: messages } = await db
    .from("support_messages")
    .select("id, author_role, body, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(100);
  return (messages ?? []) as Array<{ id: string; author_role: string; body: string; created_at: string }>;
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
