import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveActor, actorHasPermission } from "@/lib/policy";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/app/admin/actions/audit-log-record";

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: async (name) => (await cookieStore).get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const actor = await resolveActor(supabase, user?.id || null, user?.email ?? null);

  if (role !== "owner" && role !== "admin") {
    await recordAuditLog({
      actor: user?.id || null,
      actor_email: user?.email || null,
      action: "add_credits",
      resource_type: "user",
      resource_id: null,
      details: { reason: "unauthorized" },
      result: "BLOCKED",
    });
    return NextResponse.json({ error: "غير مصرح — للأدمن والمالك فقط" }, { status: 403 });
  if (!actorHasPermission(actor, "credits.manage")) {
    return NextResponse.json({ error: "غير مصرح — للمالك فقط (credits.manage)" }, { status: 403 });
  }

  const formData = await req.formData();
  const targetUserId = formData.get("targetUserId")?.toString().trim();
  const amountRaw = formData.get("amount")?.toString().trim();
  const idempotencyKeyRaw = formData.get("idempotencyKey")?.toString().trim();
  if (!idempotencyKeyRaw) {
    await recordAuditLog({
      actor: user?.id || null,
      actor_email: user?.email || null,
      action: "add_credits",
      resource_type: "user",
      resource_id: targetUserId || null,
      details: { reason: "missing_idempotency_key" },
      result: "FAIL",
    });
    return NextResponse.redirect(new URL("/admin?error=مفتاح+Idempotency+مطلوب", req.url));
  }
  const idempotencyKey = idempotencyKeyRaw;

  if (!targetUserId || !amountRaw) {
    await recordAuditLog({
      actor: user?.id || null,
      actor_email: user?.email || null,
      action: "add_credits",
      resource_type: "user",
      resource_id: targetUserId || null,
      details: { reason: "missing_fields", idempotency_key: idempotencyKey },
      result: "FAIL",
    });
    return NextResponse.redirect(new URL("/admin?error=البيانات+ناقصة", req.url));
  }

  const amount = parseInt(amountRaw, 10);
  if (!amount || amount <= 0 || amount > 10000) {
    await recordAuditLog({
      actor: user?.id || null,
      actor_email: user?.email || null,
      action: "add_credits",
      resource_type: "user",
      resource_id: targetUserId,
      details: { reason: "invalid_amount", amount_raw: amountRaw, idempotency_key: idempotencyKey },
      result: "FAIL",
    });
    return NextResponse.redirect(new URL("/admin?error=العدد+غير+صالح", req.url));
  }

  try {
    const service = createServiceClient();
    // Conflict check: existing ledger entry with same ref_id but different params.
    const { data: existing } = await service
      .from("ai_credits_ledger")
      .select("user_id, delta, reason, ref_id")
      .eq("user_id", targetUserId)
      .eq("reason", "admin_grant")
      .eq("ref_id", idempotencyKey)
      .maybeSingle();
    if (existing && Number(existing.delta) !== amount) {
      await recordAuditLog({
        actor: user?.id || null,
        actor_email: user?.email || null,
        action: "add_credits",
        resource_type: "user",
        resource_id: targetUserId,
        details: { reason: "idempotency_conflict", idempotency_key: idempotencyKey, existing_delta: existing.delta, requested_delta: amount },
        result: "FAIL",
      });
      return NextResponse.redirect(new URL("/admin?error=تعارض+في+مفتاح+Idempotency", req.url));
    }
    const refId = idempotencyKey;
    const { data, error } = await service.rpc("grant_ai_credits", {
      p_user_id: targetUserId,
      p_delta: amount,
      p_reason: "admin_grant",
      p_ref_id: refId,
      p_metadata: { granted_by: user?.id, role: actor.role },
    } as unknown as { p_user_id: string; p_delta: number; p_reason: string; p_ref_id: string });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const alreadyExisted = Boolean(row?.already_existed);

    await recordAuditLog({
      actor: user?.id || null,
      actor_email: user?.email || null,
      action: "add_credits",
      resource_type: "user",
      resource_id: targetUserId,
      details: {
        amount,
        idempotency_key: idempotencyKey,
        already_existed: alreadyExisted,
        role,
    // EPIC-2: Audit log for credit grants (sensitive operation)
    await recordAuditLog({
      actor: user?.id ?? null,
      actor_email: user?.email ?? null,
      action: "subscriptions.manage",
      resource_type: "ai_credits",
      resource_id: targetUserId,
      details: {
        operation: "grant",
        amount,
        ref_id: refId,
        granted_by: user?.id,
        actor_role: actor.role,
      },
      result: "PASS",
    });
  } catch (e) {
    const msg = (e as { message?: string })?.message || "فشل شحن الرصيد";
    await recordAuditLog({
      actor: user?.id || null,
      actor_email: user?.email || null,
      action: "add_credits",
      resource_type: "user",
      resource_id: targetUserId,
      details: { reason: "db_error", message: msg, idempotency_key: idempotencyKey, amount },
      result: "FAIL",
    });

    // EPIC-2: Audit log for failed credit grants
    await recordAuditLog({
      actor: user?.id ?? null,
      actor_email: user?.email ?? null,
      action: "subscriptions.manage",
      resource_type: "ai_credits",
      resource_id: targetUserId,
      details: {
        operation: "grant",
        amount,
        reason: "grant_failed",
        error: msg,
        granted_by: user?.id,
        actor_role: actor.role,
      },
      result: "FAIL",
    });

    return NextResponse.redirect(new URL(`/admin?error=${encodeURIComponent(msg)}`, req.url));
  }

  return NextResponse.redirect(new URL("/admin?success=1", req.url));
}
