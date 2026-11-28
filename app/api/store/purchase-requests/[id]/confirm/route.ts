/**
 * POST /api/store/purchase-requests/[id]/confirm — تأكيد الدفع يدويًا.
 * Body: { method: "vodafone_cash" | "instapay" | "visa" | ..., reference?: string, note?: string }
 * يستدعي RPC `request_purchase_confirm_payment` (security definer) — يتحقق من
 * الملكية والحالة (awaiting_payment فقط) ويحفظ بيانات الدفع + snapshot المبلغ.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/lib/store/purchase-requests";

export const dynamic = "force-dynamic";

const KNOWN_METHODS = ["vodafone_cash", "instapay", "visa", "mastercard", "other"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "سجّل الدخول الأول.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "معرّف الطلب مفقود.", code: "ID_REQUIRED" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const method = typeof (body as { method?: unknown })?.method === "string" ? (body as { method: string }).method.trim() : "";
  const reference = typeof (body as { reference?: unknown })?.reference === "string" ? (body as { reference: string }).reference.trim() : "";
  const note = typeof (body as { note?: unknown })?.note === "string" ? (body as { note: string }).note.trim() : "";

  if (!method) {
    return NextResponse.json({ ok: false, error: "اختر وسيلة الدفع.", code: "METHOD_REQUIRED" }, { status: 400 });
  }
  if (!KNOWN_METHODS.includes(method)) {
    return NextResponse.json({ ok: false, error: "وسيلة دفع غير معروفة.", code: "METHOD_INVALID" }, { status: 400 });
  }
  if (!reference && method !== "other") {
    return NextResponse.json({ ok: false, error: "اكتب رقم العملية أو المرجع من تطبيق الدفع.", code: "REFERENCE_REQUIRED" }, { status: 400 });
  }

  // ملكية الطلب قبل استدعاء الـ RPC (الرسائل بالعربي).
  const { data: owned } = await supabase
    .from("purchase_requests")
    .select("id, kind, amount, currency, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ ok: false, error: "الطلب غير موجود.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (owned.status !== "awaiting_payment") {
    return NextResponse.json({ ok: false, error: "لا يمكن تأكيد الدفع في هذه المرحلة.", code: "STATUS_INVALID" }, { status: 409 });
  }

  const { error: rpcError } = await supabase.rpc("request_purchase_confirm_payment", {
    p_request_id: id,
    p_method: method,
    p_reference: reference,
    p_note: note,
  });
  if (rpcError) {
    return NextResponse.json({ ok: false, error: "تعذر تسجيل تأكيد الدفع. حاول مرة أخرى.", code: "RPC_FAILED" }, { status: 500 });
  }

  void notifyAdmins({
    title: "تأكيد دفع — بانتظار المراجعة",
    message: `طلب ${owned.kind === "plan" ? "اشتراك" : "كريدت"} بمبلغ ${owned.amount} ${owned.currency} — المستخدم أكد الدفع (${method}${reference ? ` · مرجع: ${reference}` : ""}). راجع /admin/purchase-requests`,
    type: "warning",
  });

  return NextResponse.json({ ok: true, status: "payment_submitted" });
}
