// ===========================================================================
// MAGICLY — Community C2: Posts API
// ===========================================================================
// POST /api/community/posts — إنشاء منشور { kind, body, visibility, imageUrl }
// GET  /api/community/posts?before=ISO — الفيد الهجين (سيرفر سايد cursor)
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient, socialNotify } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    const { data, error } = await auth.client.rpc("create_community_post", {
      p_kind: typeof body.kind === "string" ? body.kind : "text",
      p_body: typeof body.body === "string" ? body.body : null,
      p_visibility: typeof body.visibility === "string" ? body.visibility : "public",
      p_image_url: typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null,
      p_options: Array.isArray(body.options) ? body.options.map((o: unknown) => String(o)) : null,
      p_quote_post_id: typeof body.quotePostId === "string" && body.quotePostId ? body.quotePostId : null,
    });
    if (error) {
      console.error("[community/posts] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to create post." }, { status: 500 });
    }

    const result = data as { ok: boolean; code?: string; post_id?: string; mentioned?: string[] };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }

    // إشعار المنشَر إليهم (@MAG-XXX-XXXX) — خارج مسار النجاح الحرج
    for (const mentioned of result.mentioned ?? []) {
      if (mentioned === auth.user.id) continue;
      void socialNotify(
        auth.client,
        mentioned,
        "ذكروك في منشور",
        "في حد ذكرك في منشور على مجتمع Magicly.",
        "/community",
      );
    }

    return NextResponse.json({ success: true, postId: result.post_id });
  } catch (e) {
    console.error("[community/posts] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const url = new URL(req.url);
    const before = url.searchParams.get("before");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 30);

    const { data, error } = await auth.client.rpc("get_community_feed", {
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: limit,
    });
    if (error) {
      console.error("[community/posts] feed RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load feed." }, { status: 500 });
    }
    return NextResponse.json({ success: true, posts: data ?? [] });
  } catch (e) {
    console.error("[community/posts] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
