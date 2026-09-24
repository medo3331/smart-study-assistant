"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { getAdminRole, hasPermission, isOwnerEmail } from "@/lib/auth-roles";

export interface BanResult {
  ok: boolean;
  message: string;
  auditId?: string | null;
  error?: string | null;
}

/**
 * حظر مستخدم — Phase 4.4: كتابة حقيقية في profiles.is_banned (+banned_at/ban_reason).
 * الصلاحية: users.ban (Owner/Admin حسب ADMIN_PERMISSION_MAP) — فحص server-side
 * حقيقي هنا. أي رفض يُسجَّل BLOCKED.
 */
export async function banUser(userId: string, userCode: string | null, reason: string, adminUserId: string, adminEmail: string | null): Promise<BanResult> {
  try {
    const supabaseClient = createServiceClient();
    const allowed = await hasPermission(supabaseClient, adminUserId, adminEmail, "users.ban");
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!allowed && !isActualOwner) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "users.ban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, reason: reason, rejected_by: adminUserId, status: "blocked_attempt" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: حظر المستخدم يتطلب صلاحية users.ban (Owner/Admin)", error: "authorization_denied", auditId: null };
    }
    // Phase 4.4: كتابة حقيقية — الأعمدة مؤكدة في الـDB الحية (is_banned/banned_at/ban_reason)
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

/** فك حظر مستخدم — Phase 4.4: تصفير حقيقي للأعمدة. يتطلب users.unban. */
export async function unbanUser(userId: string, userCode: string | null, adminUserId: string, adminEmail: string | null): Promise<BanResult> {
  try {
    const supabaseClient = createServiceClient();
    const allowed = await hasPermission(supabaseClient, adminUserId, adminEmail, "users.unban");
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!allowed && !isActualOwner) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "users.unban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, rejected_by: adminUserId, status: "blocked_attempt" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: فك الحظر يتطلب صلاحية users.unban (Owner/Admin)", error: "authorization_denied", auditId: null };
    }
    // Phase 4.4: تصفير حقيقي لحالة الحظر
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
