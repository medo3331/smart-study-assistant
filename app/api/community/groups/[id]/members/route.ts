// ===========================================================================
// MAGICLY — Community C3: Group members API
// ===========================================================================
// GET  /api/community/groups/[id]/members — الأعضاء (+طلبات الانضمام للمشرفين)
// POST /api/community/groups/[id]/members — إجراء مشرف:
//   { action: "approve"|"reject"|"remove", userId }
//   { action: "role", userId, role: "moderator"|"member" }
// قبول العضو يولّد إشعارًا له.
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient, socialNotify } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }

    const [membersRes, requestsRes] = await Promise.all([
      auth.client.rpc("get_group_members", { p_group_id: id, p_limit: 100 }),
      auth.client.rpc("get_group_join_requests", { p_group_id: id }),
    ]);
    if (membersRes.error) {
      console.error("[community/groups/[id]/members] RPC error:", membersRes.error);
      return NextResponse.json({ success: false, error: "Failed to load members." }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      members: membersRes.data ?? [],
      // طلبات الانضمام بترجع فاضية تلقائيًا لو مش مشرف (الـRPC بيفلتر)
      requests: requestsRes.error ? [] : (requestsRes.data ?? []),
    });
  } catch (e) {
    console.error("[community/groups/[id]/members] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

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
    const userId = typeof body?.userId === "string" && UUID_RE.test(body.userId) ? body.userId : null;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    let rpc: string;
    let args: Record<string, unknown>;
    if (action === "approve" || action === "reject") {
      rpc = "approve_group_member";
      args = { p_group_id: id, p_user_id: userId, p_approve: action === "approve" };
    } else if (action === "remove") {
      rpc = "remove_group_member";
      args = { p_group_id: id, p_user_id: userId };
    } else if (action === "role" && (body?.role === "moderator" || body?.role === "member")) {
      rpc = "set_group_member_role";
      args = { p_group_id: id, p_user_id: userId, p_role: body.role };
    } else {
      return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
    }

    const { data, error } = await auth.client.rpc(rpc, args);
    if (error) {
      console.error("[community/groups/[id]/members] RPC error:", error);
      return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string; approved?: boolean };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }

    // إشعار الطالب بقبول طلبه (خارج المسار الحرج)
    if (action === "approve" && result.approved) {
      void socialNotify(
        auth.client,
        userId,
        "تم قبولك في المجموعة",
        "إدارة المجموعة وافقت على طلب انضمامك — منشورات المجموعة متاحة لك دلوقتي.",
        "/community/groups",
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[community/groups/[id]/members] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
