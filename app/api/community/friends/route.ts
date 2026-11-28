// ===========================================================================
// MAGICLY — Community C1: Friends API
// ===========================================================================
// GET  — قائمة الأصدقاء + الطلبات الواردة والصادرة
// POST — إجراءات الصداقة: request / accept / reject / cancel / remove
//
// كل الإجراءات تنفّذ عبر RPCs security definer بفرض الحظر والخصوصية —
// الراوت ده مجرد بوابة مصادقة + تنسيق، مش مصدر القواعد.
// ===========================================================================

import { NextResponse } from "next/server";

async function getAuthedClient() {
  const { createClient } = await import("@/lib/supabase/server");
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return { client, user };
}

export async function GET() {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const [friendsRes, requestsRes] = await Promise.all([
      auth.client.rpc("list_community_friends"),
      auth.client.rpc("list_pending_friend_requests"),
    ]);

    if (friendsRes.error || requestsRes.error) {
      console.error("[community/friends] RPC error:", friendsRes.error ?? requestsRes.error);
      return NextResponse.json({ success: false, error: "Failed to load relations." }, { status: 500 });
    }

    const requests = Array.isArray(requestsRes.data) ? requestsRes.data : [];

    return NextResponse.json({
      success: true,
      friends: friendsRes.data ?? [],
      incoming: requests.filter((r: any) => r.direction === "incoming"),
      outgoing: requests.filter((r: any) => r.direction === "outgoing"),
    });
  } catch (e) {
    console.error("[community/friends] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    const action = body.action as string;
    const target = typeof body.target === "string" ? body.target : null;
    const requestId = typeof body.requestId === "string" ? body.requestId : null;

    let result: { data: any; error: any };

    switch (action) {
      case "request":
        if (!target) return NextResponse.json({ success: false, error: "target required." }, { status: 400 });
        result = await auth.client.rpc("send_friend_request", { p_addressee: target });
        break;
      case "accept":
      case "reject":
        if (!requestId) return NextResponse.json({ success: false, error: "requestId required." }, { status: 400 });
        result = await auth.client.rpc("respond_friend_request", { p_request_id: requestId, p_action: action });
        break;
      case "cancel":
        if (!requestId) return NextResponse.json({ success: false, error: "requestId required." }, { status: 400 });
        result = await auth.client.rpc("cancel_friend_request", { p_request_id: requestId });
        break;
      case "remove":
        if (!target) return NextResponse.json({ success: false, error: "target required." }, { status: 400 });
        result = await auth.client.rpc("remove_friend", { p_friend: target });
        break;
      default:
        return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
    }

    if (result.error) {
      console.error("[community/friends] RPC error:", result.error);
      return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
    }

    const data = result.data as { ok: boolean; code?: string; status?: string; request_id?: string };

    // إشعارات التفاعل الاجتماعي
    if (data.ok) {
      const { socialNotify } = await import("@/lib/community/handlers");
      if (action === "request" && target) {
        void socialNotify(auth.client, target, "وصلك طلب صداقة", "لديك طلب صداقة جديد — افتح صفحة الأصدقاء للرد.", "/community/friends");
      } else if (action === "accept" && target) {
        void socialNotify(auth.client, target, "تم قبول طلب الصداقة", "أصبحتما صديقين الآن.", "/community/friends");
      }
    }

    return NextResponse.json({ success: true, ...data }, { status: data.ok ? 200 : 409 });
  } catch (e) {
    console.error("[community/friends] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
