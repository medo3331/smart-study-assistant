// ===========================================================================
// MAGICLY — Community C2b: Repost API
// ===========================================================================
// POST /api/community/posts/[id]/repost — إعادة نشر (مرة واحدة لكل أصل)
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
    const { data, error } = await auth.client.rpc("repost_community_post", { p_post_id: id });
    if (error) {
      console.error("[community/repost] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to repost." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[community/repost] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
