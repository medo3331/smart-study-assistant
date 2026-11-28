// ===========================================================================
// MAGICLY — Community C2: Post item API
// ===========================================================================
// GET    /api/community/posts/[id] — تفاصيل منشور (خصوصية مفروضة بالـRPC)
// DELETE /api/community/posts/[id] — حذف ناعم (صاحب المنشور فقط)
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("get_post_details", { p_post_id: id });
    if (error) {
      console.error("[community/posts/[id]] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load post." }, { status: 500 });
    }
    const post = Array.isArray(data) ? data[0] : null;
    if (!post) {
      return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, post });
  } catch (e) {
    console.error("[community/posts/[id]] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("delete_community_post", { p_post_id: id });
    if (error) {
      console.error("[community/posts/[id]] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to delete post." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[community/posts/[id]] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
