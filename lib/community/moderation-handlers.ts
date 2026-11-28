// ===========================================================================
// MAGICLY — Community C4: الإشراف من جهة الطالب
// ---------------------------------------------------------------------------
// POST /api/community/report        — إبلاغ عن منشور/تعليق/حساب
// GET  /api/community/moderation    — حالتي الإشرافية (عقوبة نشطة + اعتراضاتي)
// POST /api/community/moderation    — تقديم اعتراض على عقوبة نشطة
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- report ---
export async function reportHandler(req: Request) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const targetType = body?.targetType;
  const targetId = body?.targetId;
  const reason = body?.reason;
  if (
    (targetType !== "post" && targetType !== "comment" && targetType !== "user") ||
    typeof targetId !== "string" || !UUID_RE.test(targetId) ||
    typeof reason !== "string"
  ) {
    return NextResponse.json({ success: false, code: "invalid_target_type", error: "Invalid body." }, { status: 400 });
  }
  const details = typeof body.details === "string" ? body.details : null;

  const { data, error } = await auth.client.rpc("report_content", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details,
  });
  if (error) {
    console.error("[community/report] RPC error:", error);
    return NextResponse.json({ success: false, error: "Failed to submit report." }, { status: 500 });
  }
  const result = data as { ok: boolean; code?: string };
  if (!result.ok) {
    return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}

// ------------------------------------------------------------- moderation ---
export async function moderationGetHandler() {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const { data, error } = await auth.client.rpc("community_my_moderation_status");
  if (error) {
    console.error("[community/moderation] RPC error:", error);
    return NextResponse.json({ success: false, error: "Failed to load status." }, { status: 500 });
  }
  return NextResponse.json({ success: true, status: data });
}

export async function moderationAppealHandler(req: Request) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const actionId = body?.actionId;
  const message = body?.message;
  if (typeof actionId !== "string" || !UUID_RE.test(actionId) || typeof message !== "string") {
    return NextResponse.json({ success: false, code: "invalid_message", error: "Invalid body." }, { status: 400 });
  }

  const { data, error } = await auth.client.rpc("submit_moderation_appeal", {
    p_action_id: actionId,
    p_message: message,
  });
  if (error) {
    console.error("[community/moderation] appeal RPC error:", error);
    return NextResponse.json({ success: false, error: "Failed to submit appeal." }, { status: 500 });
  }
  const result = data as { ok: boolean; code?: string };
  if (!result.ok) {
    return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
