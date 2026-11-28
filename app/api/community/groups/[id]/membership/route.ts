// ===========================================================================
// MAGICLY — Community C3: Group membership API
// ===========================================================================
// POST /api/community/groups/[id]/membership
//   { action: "join" | "leave" | "cancel" }
// الانضمام لمجموعة خاصة يولّد إشعارًا للمشرفين (notify_user_ids من الـRPC).
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient, socialNotify } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== "join" && action !== "leave" && action !== "cancel") {
      return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
    }

    const rpc =
      action === "join"
        ? "join_community_group"
        : action === "leave"
          ? "leave_community_group"
          : "cancel_group_request";

    const { data, error } = await auth.client.rpc(rpc, { p_group_id: id });
    if (error) {
      console.error("[community/groups/[id]/membership] RPC error:", error);
      return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string; status?: string; notify_user_ids?: string[] };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }

    // إشعار المشرفين بطلب انضمام جديد (خارج المسار الحرج)
    if (action === "join" && result.status === "pending") {
      for (const moderatorId of result.notify_user_ids ?? []) {
        if (moderatorId === auth.user.id) continue;
        void socialNotify(
          auth.client,
          moderatorId,
          "طلب انضمام لمجموعتك",
          "في طالب طلب الانضمام لمجموعة من مجموعاتك — راجع طلبات العضوية.",
          "/community/groups",
        );
      }
    }

    return NextResponse.json({ success: true, status: result.status ?? null });
  } catch (e) {
    console.error("[community/groups/[id]/membership] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
