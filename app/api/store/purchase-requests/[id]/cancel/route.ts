/**
 * POST /api/store/purchase-requests/[id]/cancel — إلغاء طلب من المستخدم.
 * RPC `request_purchase_cancel` (security definer) — awaiting_payment فقط.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "سجّل الدخول الأول.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "معرّف الطلب مفقود.", code: "ID_REQUIRED" }, { status: 400 });
  }

  const { data: owned } = await supabase
    .from("purchase_requests")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ ok: false, error: "الطلب غير موجود.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (owned.status !== "awaiting_payment") {
    return NextResponse.json({ ok: false, error: "الطلب في مراجعة الإدارة ولا يمكن إلغاؤه الآن.", code: "STATUS_INVALID" }, { status: 409 });
  }

  const { error: rpcError } = await supabase.rpc("request_purchase_cancel", { p_request_id: id });
  if (rpcError) {
    return NextResponse.json({ ok: false, error: "تعذر إلغاء الطلب. حاول مرة أخرى.", code: "RPC_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: "cancelled" });
}
