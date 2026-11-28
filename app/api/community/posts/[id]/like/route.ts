// ===========================================================================
// MAGICLY — Community C2: Like API
// ===========================================================================
// POST /api/community/posts/[id]/like — تبديل الإعجاب + إشعار صاحب المنشور
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient, socialNotify } from "@/lib/community/handlers";

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

    const { data: postRow, error: postError } = await auth.client
      .rpc("get_post_details", { p_post_id: id });
    if (postError) {
      console.error("[community/like] details error:", postError);
      return NextResponse.json({ success: false, error: "Failed to like." }, { status: 500 });
    }
    const post = Array.isArray(postRow) ? postRow[0] : null;

    const { data, error } = await auth.client.rpc("toggle_post_like", { p_post_id: id });
    if (error) {
      console.error("[community/like] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to like." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string; liked?: boolean; like_count?: number };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }

    if (result.liked && post && post.author_id && post.author_id !== auth.user.id) {
      void socialNotify(
        auth.client,
        post.author_id,
        "إعجاب جديد بمنشورك",
        "في حد عجبه منشورك على مجتمع Magicly.",
        "/community",
      );
    }

    return NextResponse.json({
      success: true,
      liked: result.liked,
      likeCount: result.like_count,
    });
  } catch (e) {
    console.error("[community/like] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
