/**
 * fetchers كلاينت لطلبات الشراء — يستهلكها /store و /checkout/[plan].
 */

export type PurchaseRequestClientRow = {
  id: string;
  kind: "credits" | "plan" | "coins";
  credits: number | null;
  coin_pack_id: string | null;
  coins: number | null;
  plan_key: string | null;
  plan_duration_days: number | null;
  amount: number | null;
  currency: string;
  status: "awaiting_payment" | "payment_submitted" | "approved" | "rejected" | "cancelled";
  payment_method: string | null;
  payment_reference: string | null;
  admin_note: string | null;
  ticket_id: string | null;
  created_at: string;
};

export type PurchaseApiResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

async function callApi<T>(res: Response): Promise<PurchaseApiResult<T>> {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    return { ok: false, error: body?.error ?? "حدث خطأ غير متوقع. حاول مرة أخرى.", code: body?.code };
  }
  return { ok: true, data: body as T };
}

/** إنشاء طلب (كريدت / باقة اشتراك / باقة كوينز) — viaSupport يفتح محادثة دعم مرتبطة بالطلب. */
export async function createPurchaseRequest(
  input:
    | { kind: "credits"; packId: string }
    | { kind: "plan"; planKey: string; durationDays?: number; viaSupport?: boolean }
    | { kind: "coins"; packId: string }
): Promise<PurchaseApiResult<{ requestId: string; ticketId?: string | null; status: string }>> {
  const res = await fetch("/api/store/purchase-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return callApi<{ requestId: string; ticketId?: string | null; status: string }>(res);
}

/** تأكيد الدفع بمنهق + مرجع. */
export async function confirmPayment(
  requestId: string,
  payment: { method: string; reference: string; note?: string }
): Promise<PurchaseApiResult<{ status: string }>> {
  const res = await fetch(`/api/store/purchase-requests/${requestId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payment),
  });
  return callApi<{ status: string }>(res);
}

/** إلغاء طلب لم يُدفع بعد. */
export async function cancelPurchaseRequest(requestId: string): Promise<PurchaseApiResult<{ status: string }>> {
  const res = await fetch(`/api/store/purchase-requests/${requestId}/cancel`, { method: "POST" });
  return callApi<{ status: string }>(res);
}

/** طلبات المستخدم الحالية. */
export async function fetchMyRequests(): Promise<PurchaseApiResult<{ requests: PurchaseRequestClientRow[] }>> {
  const res = await fetch("/api/store/purchase-requests", { cache: "no-store" });
  return callApi<{ requests: PurchaseRequestClientRow[] }>(res);
}
