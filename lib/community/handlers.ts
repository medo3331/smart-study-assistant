// ===========================================================================
// MAGICLY — Community C1: Follow / Block / Suggestions / Profile APIs
// ===========================================================================
// POST /api/community/follow   — { target, action: "follow" | "unfollow" }
// POST /api/community/block    — { target, action: "block" | "unblock" }
// GET  /api/community/suggestions — اقتراح أصدقاء حسب الجامعة/الكلية/التخصص
// GET/PATCH /api/community/profile — ملفي الاجتماعي (قراءة/تحديث)
// ===========================================================================

import { NextResponse } from "next/server";

async function getAuthedClient() {
  const { createClient } = await import("@/lib/supabase/server");
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return { client, user };
}

// ---------------------------------------------------------------- follow ---
export async function followHandler(req: Request) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const target = body?.target;
  const action = body?.action;
  if (typeof target !== "string" || (action !== "follow" && action !== "unfollow")) {
    return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
  }

  const rpc = action === "follow"
    ? auth.client.rpc("follow_user", { p_target: target })
    : auth.client.rpc("unfollow_user", { p_target: target });

  const { data, error } = await rpc;
  if (error) {
    console.error("[community/follow] RPC error:", error);
    return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
  }
  return NextResponse.json({ success: true, ...(data as object) }, { status: (data as any).ok ? 200 : 409 });
}

// ----------------------------------------------------------------- block ---
export async function blockHandler(req: Request) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const target = body?.target;
  const action = body?.action;
  if (typeof target !== "string" || (action !== "block" && action !== "unblock")) {
    return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
  }
  if (target === auth.user.id) {
    return NextResponse.json({ success: false, error: "Cannot block yourself." }, { status: 400 });
  }

  if (action === "block") {
    // الحظر ينظّف العلاقة: إزالة صداقة ومتابعة بالاتجاهين + الطلبات المعلّقة
    const { error: cleanupErr } = await auth.client.rpc("cleanup_relation_on_block", {
      p_a: auth.user.id,
      p_b: target,
    });
    if (cleanupErr) {
      console.error("[community/block] cleanup error:", cleanupErr);
      return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
    }
    const { error } = await auth.client
      .from("user_blocks")
      .insert({ blocker_id: auth.user.id, blocked_id: target });
    if (error) {
      console.error("[community/block] insert error:", error);
      return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
    }
    return NextResponse.json({ success: true, ok: true });
  }

  const { error } = await auth.client
    .from("user_blocks")
    .delete()
    .eq("blocker_id", auth.user.id)
    .eq("blocked_id", target);
  if (error) {
    console.error("[community/block] delete error:", error);
    return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
  }
  return NextResponse.json({ success: true, ok: true });
}

// ----------------------------------------------------------- suggestions ---
export async function suggestionsHandler() {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const { data, error } = await auth.client.rpc("suggest_community_friends", { p_limit: 12 });
  if (error) {
    console.error("[community/suggestions] RPC error:", error);
    return NextResponse.json({ success: false, error: "Failed to load suggestions." }, { status: 500 });
  }
  return NextResponse.json({ success: true, suggestions: data ?? [] });
}

// --------------------------------------------------------------- profile ---
export async function profileGetHandler() {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const { data, error } = await auth.client
    .from("social_profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    console.error("[community/profile] read error:", error);
    return NextResponse.json({ success: false, error: "Failed to load profile." }, { status: 500 });
  }
  return NextResponse.json({ success: true, profile: data });
}

const ALLOWED_PROFILE_FIELDS = [
  "display_name", "bio", "avatar_url", "cover_url",
  "university", "faculty", "major", "year", "interests",
  "account_privacy", "allow_friend_requests", "allow_messages", "show_academic_info",
] as const;

export async function profilePatchHandler(req: Request) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED_PROFILE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.display_name !== undefined && patch.display_name !== null) {
    const name = String(patch.display_name).trim();
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ success: false, error: "الاسم لازم يكون بين حرفين و60 حرف." }, { status: 400 });
    }
    patch.display_name = name;
  }
  if (patch.bio !== undefined && patch.bio !== null && String(patch.bio).length > 500) {
    return NextResponse.json({ success: false, error: "النبذة أطول من 500 حرف." }, { status: 400 });
  }
  if (patch.account_privacy !== undefined && !["public", "private"].includes(String(patch.account_privacy))) {
    return NextResponse.json({ success: false, error: "قيمة خصوصية غير صالحة." }, { status: 400 });
  }
  if (patch.interests !== undefined && !Array.isArray(patch.interests)) {
    return NextResponse.json({ success: false, error: "الاهتمامات لازم تكون قائمة." }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: "لا يوجد حقول للتحديث." }, { status: 400 });
  }

  const { error } = await auth.client
    .from("social_profiles")
    .upsert({ user_id: auth.user.id, ...patch, updated_at: new Date().toISOString() });
  if (error) {
    console.error("[community/profile] upsert error:", error);
    return NextResponse.json({ success: false, error: "Failed to save profile." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
