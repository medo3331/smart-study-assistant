// ===========================================================================
// MAGICLY — Community C2: Comments API
// ===========================================================================
// GET  /api/community/posts/[id]/comments — تعليقات المنشور (خصوصية بالـRPC)
// POST /api/community/posts/[id]/comments — إضافة تعليق (+ إشعار صاحب المنشور)
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
    const before = new URL(req.url).searchParams.get("before");
    const { data, error } = await auth.client.rpc("get_post_comments", {
      p_post_id: id,
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: 50,
    });
    if (error) {
      console.error("[community/comments] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load comments." }, { status: 500 });
    }
    return NextResponse.json({ success: true, comments: data ?? [] });
  } catch (e) {
    console.error("[community/comments] Unexpected:", e);
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
    if (!body || typeof body.body !== "string") {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    const { data: postRow } = await auth.client.rpc("get_post_details", { p_post_id: id });
    const post = Array.isArray(postRow) ? postRow[0] : null;

    const { data, error } = await auth.client.rpc("add_post_comment", {
      p_post_id: id,
      p_body: body.body,
      p_parent_id: typeof body.parentId === "string" && UUID_RE.test(body.parentId) ? body.parentId : null,
    });
    if (error) {
      console.error("[community/comments] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to comment." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string; comment_id?: string };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }

    if (post && post.author_id && post.author_id !== auth.user.id) {
      void socialNotify(
        auth.client,
        post.author_id,
        "تعليق جديد على منشورك",
        "في حد علّق على منشورك على مجتمع Magicly.",
        "/community",
      );
    }

    return NextResponse.json({ success: true, commentId: result.comment_id });
  } catch (e) {
    console.error("[community/comments] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
