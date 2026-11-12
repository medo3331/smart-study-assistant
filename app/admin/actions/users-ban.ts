"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";

export interface BanResult {
  ok: boolean;
  message: string;
  auditId?: string | null;
  error?: string | null;
}

/**
 * حظر / فك حظر مستخدم — Phase 4.4.
 *
 * ⚠️ أمان (P0، 2026-11):
 *   الدالتين كانوا بياخدوا `adminUserId` و`adminEmail` من المتصل ويبنوا عليهما
 *   قرار الصلاحية (`resolveActor`). أي حد يقرأ `site_admins` (كانت مقروءة
 *   للعامة) يجيب id المالك ويحظر/يفك حظر أي حد. دلوقتي الهوية من الجلسة فقط،
 *   وأي محاولة مرفوضة بتتسجل BLOCKED بهوية غير موثوقة (null).
 */

async function resolveBanActor(permission: "users.ban" | "users.unban") {
  try {
    const { actor } = await requireAdminActor(permission);
    return { actor, error: null as null };
  } catch (e) {
    if (e instanceof ActionAuthError) {
      return { actor: null, error: e };
    }
    throw e;
  }
}

export async function banUser(
  userId: string,
  userCode: string | null,
  reason: string
): Promise<BanResult> {
  try {
    const { actor, error: authError } = await resolveBanActor("users.ban");

    if (!actor) {
      await recordAuditLog({
        actor: null,
        actor_email: null,
        action: "users.ban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, reason, status: "blocked_attempt", cause: authError?.code },
        result: "BLOCKED",
      });
      return { ok: false, message: authError?.message ?? "غير مصرح", error: "authorization_denied", auditId: null };
    }

    const adminUserId = actor.userId!;
    const adminEmail = actor.userEmail;
    const supabaseClient = createServiceClient();

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ is_banned: true, banned_at: new Date().toISOString(), ban_reason: reason || null })
      .eq("id", userId);

    if (updateError) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "users.ban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, reason: reason, db_error: updateError.message },
        result: "FAIL",
      });
      return { ok: false, message: "فشل كتابة الحظر في الداتابيز: " + updateError.message, error: "db_error", auditId: null };
    }

    const auditRes = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "users.ban",
      resource_type: "user",
      resource_id: userId,
      details: { user_id: userId, user_code: userCode, reason: reason, status: "banned" },
      result: "PASS",
    });
    return { ok: true, message: "تم حظر المستخدم بنجاح (Audit: PASS)", auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "فشل في الحظر: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

/** فك حظر مستخدم — يتطلب users.unban. الهوية من الجلسة. */
export async function unbanUser(
  userId: string,
  userCode: string | null
): Promise<BanResult> {
  try {
    const { actor, error: authError } = await resolveBanActor("users.unban");

    if (!actor) {
      await recordAuditLog({
        actor: null,
        actor_email: null,
        action: "users.unban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, status: "blocked_attempt", cause: authError?.code },
        result: "BLOCKED",
      });
      return { ok: false, message: authError?.message ?? "غير مصرح", error: "authorization_denied", auditId: null };
    }

    const adminUserId = actor.userId!;
    const adminEmail = actor.userEmail;
    const supabaseClient = createServiceClient();

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ is_banned: false, banned_at: null, ban_reason: null })
      .eq("id", userId);

    if (updateError) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "users.unban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, db_error: updateError.message },
        result: "FAIL",
      });
      return { ok: false, message: "فشل كتابة فك الحظر في الداتابيز: " + updateError.message, error: "db_error", auditId: null };
    }

    const auditRes = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "users.unban",
      resource_type: "user",
      resource_id: userId,
      details: { user_id: userId, user_code: userCode, status: "unbanned" },
      result: "PASS",
    });
    return { ok: true, message: "تم فك حظر المستخدم (Audit: PASS)", auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "فشل في فك الحظر: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}
