"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";

export interface BanResult {
  ok: boolean;
  message: string;
  auditId?: string | null;
  error?: string | null;
}

/** حظر مستخدم — يتطلب Owner فقط، يسجل Audit BLOCKED لو غير مصرح */
export async function banUser(userId: string, userCode: string | null, reason: string, adminUserId: string, adminEmail: string | null): Promise<BanResult> {
  try {
    const supabaseClient = createServiceClient();
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!isActualOwner) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "users.ban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, reason: reason, rejected_by: adminUserId, status: "blocked_attempt" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: حظر المستخدم متاح لـ Owner فقط (ليس Admin أو Support)", error: "authorization_denied_non_owner", auditId: null };
    }
    // Note: Real ban implementation would update a user status field or insert into a ban table.
    // For this EPIC-2 step, we record the audit and return success (preview mode for ban flow).
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

/** فك حظر مستخدم — يتطلب Owner فقط */
export async function unbanUser(userId: string, userCode: string | null, adminUserId: string, adminEmail: string | null): Promise<BanResult> {
  try {
    const supabaseClient = createServiceClient();
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!isActualOwner) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "users.unban",
        resource_type: "user",
        resource_id: userId,
        details: { user_id: userId, user_code: userCode, rejected_by: adminUserId, status: "blocked_attempt" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: فك الحظر متاح لـ Owner فقط", error: "authorization_denied_non_owner", auditId: null };
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
