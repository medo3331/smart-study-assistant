// ===========================================================================
// MAGICLY — Community C2: Save API
// ===========================================================================
// POST /api/community/posts/[id]/save — تبديل حفظ المنشور
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("toggle_saved_post", { p_post_id: id });
    if (error) {
      console.error("[community/save] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to save." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string; saved?: boolean };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }
    return NextResponse.json({ success: true, saved: result.saved });
  } catch (e) {
    console.error("[community/save] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

