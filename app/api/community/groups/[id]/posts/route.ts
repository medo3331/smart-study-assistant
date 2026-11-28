// ===========================================================================
// MAGICLY — Community C3: Group feed API
// ===========================================================================
// GET  /api/community/groups/[id]/posts?before=ISO — فيد المجموعة (خصوصية
//      مفروضة بالـRPC: أعضاء المجموعات الخاصة فقط)
// POST /api/community/groups/[id]/posts — منشور داخل المجموعة (عضو معتمد)
//   { kind, body, imageUrl, options }
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
    const url = new URL(req.url);
    const before = url.searchParams.get("before");

    const { data, error } = await auth.client.rpc("get_group_feed", {
      p_group_id: id,
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: 20,
    });
    if (error) {
      console.error("[community/groups/[id]/posts] feed RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load feed." }, { status: 500 });
    }
    return NextResponse.json({ success: true, posts: data ?? [] });
  } catch (e) {
    console.error("[community/groups/[id]/posts] Unexpected:", e);
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
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    const { data, error } = await auth.client.rpc("create_community_post", {
      p_kind: typeof body.kind === "string" ? body.kind : "text",
      p_body: typeof body.body === "string" ? body.body : null,
      p_visibility: "public",
      p_image_url: typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null,
      p_options: Array.isArray(body.options) ? body.options.map((o: unknown) => String(o)) : null,
      p_quote_post_id: null,
      p_group_id: id,
    });
    if (error) {
      console.error("[community/groups/[id]/posts] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to create post." }, { status: 500 });
    }

    const result = data as { ok: boolean; code?: string; post_id?: string; mentioned?: string[] };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }

    for (const mentioned of result.mentioned ?? []) {
      if (mentioned === auth.user.id) continue;
      void socialNotify(
        auth.client,
        mentioned,
        "ذكروك في منشور",
        "في حد ذكرك في منشور داخل مجموعة على مجتمع Magicly.",
        "/community",
      );
    }

    return NextResponse.json({ success: true, postId: result.post_id });
  } catch (e) {
    console.error("[community/groups/[id]/posts] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
