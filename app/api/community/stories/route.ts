// ===========================================================================
// MAGICLY — Community Stories (الحالات) — GET نشطة / POST إنشاء / DELETE حذفي
// ===========================================================================
// GET    → RPC active_community_stories (تنتهي تلقائيًا بعد 24 ساعة)
// POST   → { media_url, media_type?, caption? } — الكابشن بيمر على فلتر الكلمات
// DELETE → ?id= (صاحب الحالة فقط — RLS)
// ===========================================================================

import { NextResponse } from "next/server";

const ALLOWED_MEDIA_TYPES = new Set(["image", "video"]);

export async function GET() {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const { data, error } = await serverClient.rpc("active_community_stories");
    if (error) {
      console.error("[community/stories] GET RPC:", error.message);
      return NextResponse.json({ success: false, error: "Failed to load stories." }, { status: 500 });
    }

    // تجميع الحالات حسب صاحبها (ستايل واتساب: دايرة لكل مستخدم)
    type Story = { id: string; user_id: string; display_name: string | null; handle: string | null; avatar_url: string | null; media_url: string; media_type: string; caption: string | null; created_at: string; expires_at: string };
    const rows = (data ?? []) as Story[];
    const byUser = new Map<string, { user_id: string; display_name: string | null; handle: string | null; avatar_url: string | null; stories: Story[] }>();
    for (const s of rows) {
      let g = byUser.get(s.user_id);
      if (!g) {
        g = { user_id: s.user_id, display_name: s.display_name, handle: s.handle, avatar_url: s.avatar_url, stories: [] };
        byUser.set(s.user_id, g);
      }
      g.stories.push(s);
    }
    const mine = byUser.get(user.id) ?? null;
    const others = [...byUser.values()].filter((g) => g.user_id !== user.id);

    return NextResponse.json({ success: true, mine, others });
  } catch (e) {
    console.error("[community/stories] GET unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    const { media_url, media_type, caption } = body as { media_url?: string; media_type?: string; caption?: string };
    if (!media_url || typeof media_url !== "string") {
      return NextResponse.json({ success: false, error: "صورة الحالة مطلوبة." }, { status: 400 });
    }
    const type = typeof media_type === "string" && ALLOWED_MEDIA_TYPES.has(media_type) ? media_type : "image";
    const cap = typeof caption === "string" && caption.trim() ? caption.trim().slice(0, 300) : null;

    if (cap) {
      const { data: hasBad } = await serverClient.rpc("community_text_has_blocked_word", { p_text: cap });
      if (hasBad) {
        return NextResponse.json({ success: false, error: "الكابشن فيه كلمة غير مسموحة — عدّله وحاول تاني." }, { status: 422 });
      }
    }

    const { data: story, error } = await serverClient
      .from("community_stories")
      .insert({ user_id: user.id, media_url, media_type: type, caption: cap })
      .select("id, created_at, expires_at")
      .single();

    if (error) {
      console.error("[community/stories] insert:", error.message);
      return NextResponse.json({ success: false, error: "تعذّر إنشاء الحالة." }, { status: 500 });
    }

    return NextResponse.json({ success: true, story }, { status: 201 });
  } catch (e) {
    console.error("[community/stories] POST unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "id مطلوب." }, { status: 400 });
    }

    const { error, count } = await serverClient
      .from("community_stories")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[community/stories] delete:", error.message);
      return NextResponse.json({ success: false, error: "تعذّر حذف الحالة." }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ success: false, error: "الحالة مش موجودة أو مش بتاعتك." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[community/stories] DELETE unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
