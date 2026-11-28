// ===========================================================================
// MAGICLY — Community C1: حالة العلاقة مع مستخدم (لصفحة البروفايل)
// ===========================================================================
// GET /api/community/relation?target=<userId> → { state, requestId? }
// يستدعي get_relation_state (security definer) — الحظر يرجع "blocked" بدون
// أي تفاصيل إضافية.
// ===========================================================================

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const url = new URL(req.url);
    const target = url.searchParams.get("target");
    if (!target) {
      return NextResponse.json({ success: false, error: "target required." }, { status: 400 });
    }

    const { data, error: rpcError } = await client.rpc("get_relation_state", { p_user: target });
    if (rpcError) {
      console.error("[community/relation] RPC error:", rpcError);
      return NextResponse.json({ success: false, error: "Failed to load relation." }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...(data as object) });
  } catch (e) {
    console.error("[community/relation] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
