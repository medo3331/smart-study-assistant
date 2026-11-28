// ===========================================================================
// MAGICLY — Community C4: /api/admin/community/moderation
// ---------------------------------------------------------------------------
// GET  — طوابير الإشراف: تقارير / عقوبات / اعتراضات / سجل تدقيق
// POST — إجراء: resolve_report | issue_action | lift_action | resolve_appeal
// صلاحية الوصول: community.moderate (owner/admin/support)
// ===========================================================================

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveActor, actorHasPermission } from "@/lib/policy";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  const actor = await resolveActor(supabase, user.id, user.email ?? null);
  if (!actorHasPermission(actor, "community.moderate")) return null;
  return { userId: user.id, role: actor.role, service: createServiceClient() };
}

export async function GET(req: Request) {
  const g = await guard();
  if (!g) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") === "all" ? null : (url.searchParams.get("status") ?? "pending");

  const [reports, actions, appeals, audit, blockedWords, moderators] = await Promise.all([
    g.service.rpc("mod_list_reports", { p_status: status ?? "pending", p_limit: 100 }),
    g.service.rpc("mod_list_actions", { p_active_only: false, p_limit: 100 }),
    g.service.rpc("mod_list_appeals", { p_status: status ?? "pending", p_limit: 100 }),
    g.service.rpc("mod_list_audit", { p_limit: 80 }),
    g.service.from("moderation_blocked_words").select("id, word, created_at").order("created_at", { ascending: false }).limit(300),
    // إدارة الفريق للمالك/الأدمن فقط — المشرف العادي يشوف الفريق من غير إيميلات
    (g.role === "owner" || g.role === "admin")
      ? g.service.from("site_admins").select("user_id, role, permissions").eq("role", "moderator").order("user_id").limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // أسماء المشرفين للعرض
  const moderatorRows = ((moderators.data ?? []) as { user_id: string; role: string }[]);
  let moderatorProfiles: { user_id: string; display_name: string | null; email: string | null }[] = [];
  if (moderatorRows.length > 0) {
    const { data: profs } = await g.service
      .from("profiles")
      .select("id, display_name, email")
      .in("id", moderatorRows.map((m) => m.user_id));
    moderatorProfiles = ((profs ?? []) as { id: string; display_name: string | null; email: string | null }[])
      .map((p) => ({ user_id: p.id, display_name: p.display_name, email: g.role === "owner" || g.role === "admin" ? p.email : null }));
  }

  type ListPayload = { ok?: boolean; code?: string; reports?: unknown[]; actions?: unknown[]; appeals?: unknown[]; entries?: unknown[] };
  const pick = (r: { data?: unknown; error?: unknown }): ListPayload => {
    const d = (r.data ?? {}) as ListPayload;
    if (r.error || d.ok !== true) {
      console.error("[admin/moderation] list RPC error:", r.error ?? d.code);
      return {};
    }
    return d;
  };

  return NextResponse.json({
    success: true,
    reports: pick(reports).reports ?? [],
    actions: pick(actions).actions ?? [],
    appeals: pick(appeals).appeals ?? [],
    audit: pick(audit).entries ?? [],
    blockedWords: (blockedWords.data ?? []) as unknown[],
    moderators: moderatorProfiles,
    canManageTeam: g.role === "owner" || g.role === "admin",
  });}

export async function POST(req: Request) {
  const g = await guard();
  if (!g) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (typeof action !== "string") {
    return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
  }

  let rpcName: string;
  let args: Record<string, unknown>;
  switch (action) {
    case "resolve_report": {
      if (typeof body.reportId !== "string" || !UUID_RE.test(body.reportId) ||
          (body.status !== "reviewed" && body.status !== "dismissed")) {
        return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
      }
      rpcName = "mod_resolve_report";
      args = {
        p_report_id: body.reportId,
        p_new_status: body.status,
        p_notes: typeof body.notes === "string" ? body.notes : null,
      };
      break;
    }
    case "issue_action": {
      const actionType = body.actionType;
      const days = typeof body.days === "number" && Number.isFinite(body.days) ? Math.floor(body.days) : null;
      if (
        (actionType !== "warning" && actionType !== "restrict" && actionType !== "suspend") ||
        typeof body.userId !== "string" || !UUID_RE.test(body.userId) ||
        typeof body.reason !== "string" || !body.reason.trim()
      ) {
        return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
      }
      rpcName = "mod_issue_action";
      args = {
        p_user_id: body.userId,
        p_action_type: actionType,
        p_reason: body.reason.trim(),
        p_days: days,
        p_report_id: typeof body.reportId === "string" && UUID_RE.test(body.reportId) ? body.reportId : null,
      };
      break;
    }
    case "lift_action": {
      if (typeof body.actionId !== "string" || !UUID_RE.test(body.actionId)) {
        return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
      }
      rpcName = "mod_lift_action";
      args = {
        p_action_id: body.actionId,
        p_notes: typeof body.notes === "string" ? body.notes : null,
      };
      break;
    }
    case "resolve_appeal": {
      if (
        typeof body.appealId !== "string" || !UUID_RE.test(body.appealId) ||
        typeof body.approve !== "boolean"
      ) {
        return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
      }
      rpcName = "mod_resolve_appeal";
      args = {
        p_appeal_id: body.appealId,
        p_approve: body.approve,
        p_notes: typeof body.notes === "string" ? body.notes : null,
      };
      break;
    }
    case "add_blocked_word": {
      const word = typeof body.word === "string" ? body.word.trim().toLowerCase() : "";
      if (!word || word.length > 100) {
        return NextResponse.json({ success: false, error: "Invalid word." }, { status: 400 });
      }
      const { error: insErr } = await g.service
        .from("moderation_blocked_words")
        .upsert({ word, added_by: g.userId }, { onConflict: "word", ignoreDuplicates: true });
      if (insErr) {
        console.error("[admin/moderation] add_blocked_word error:", insErr);
        return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }
    case "remove_blocked_word": {
      if (typeof body.wordId !== "string" || !UUID_RE.test(body.wordId)) {
        return NextResponse.json({ success: false, error: "Invalid wordId." }, { status: 400 });
      }
      const { error: delErr } = await g.service
        .from("moderation_blocked_words")
        .delete()
        .eq("id", body.wordId);
      if (delErr) {
        console.error("[admin/moderation] remove_blocked_word error:", delErr);
        return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }
    case "add_moderator": {
      // المالك/الأدمن فقط — مشرف المجتمع جديد ياخد دور moderator بصلاحية community.moderate
      if (g.role !== "owner" && g.role !== "admin") {
        return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
      }
      const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
      if (!identifier || identifier.length > 200) {
        return NextResponse.json({ success: false, error: "اكتب إيميل الطالب أو كود MAG أو الـUUID." }, { status: 400 });
      }
      let targetId: string | null = null;
      if (UUID_RE.test(identifier)) {
        targetId = identifier;
      } else if (/^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/i.test(identifier)) {
        const { data } = await g.service.from("profiles").select("id").eq("public_user_code", identifier.toUpperCase()).maybeSingle();
        targetId = (data?.id as string) ?? null;
      } else {
        const { data } = await g.service.from("profiles").select("id").eq("email", identifier.toLowerCase()).maybeSingle();
        targetId = (data?.id as string) ?? null;
      }
      if (!targetId) {
        return NextResponse.json({ success: false, error: "مفيش حساب بالمعرّف ده." }, { status: 404 });
      }
      // منع ترقية أدوار موجودة — المودريتور دور مستقل
      const { data: existing } = await g.service.from("site_admins").select("role").eq("user_id", targetId).maybeSingle();
      if (existing?.role === "owner" || existing?.role === "admin" || existing?.role === "support") {
        return NextResponse.json({ success: false, error: "الحساب ده له دور إداري بالفعل." }, { status: 409 });
      }
      const { error: upErr } = await g.service
        .from("site_admins")
        .upsert({ user_id: targetId, role: "moderator", permissions: ["community.moderate"] }, { onConflict: "user_id" });
      if (upErr) {
        console.error("[admin/moderation] add_moderator error:", upErr);
        return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
      }
      const { socialNotify } = await import("@/lib/community/handlers");
      void socialNotify(g.service, targetId, "تم تعيينك مشرفًا في المجتمع", "دخول لوحة الإشراف: /admin/community/moderation", "/admin/community/moderation");
      return NextResponse.json({ success: true });
    }
    case "remove_moderator": {
      if (g.role !== "owner" && g.role !== "admin") {
        return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
      }
      if (typeof body.userId !== "string" || !UUID_RE.test(body.userId)) {
        return NextResponse.json({ success: false, error: "Invalid userId." }, { status: 400 });
      }
      const { error: rmErr } = await g.service
        .from("site_admins")
        .delete()
        .eq("user_id", body.userId)
        .eq("role", "moderator");
      if (rmErr) {
        console.error("[admin/moderation] remove_moderator error:", rmErr);
        return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }
    default:
      return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  }

  const { data, error } = await g.service.rpc(rpcName, args);
  if (error) {
    console.error(`[admin/moderation] ${rpcName} RPC error:`, error);
    return NextResponse.json({ success: false, error: "Action failed." }, { status: 500 });
  }
  const result = data as { ok: boolean; code?: string };
  if (!result.ok) {
    return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
  }
  return NextResponse.json({ success: true, ...(result as object) });
}
