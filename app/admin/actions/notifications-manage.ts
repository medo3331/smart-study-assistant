"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";

/**
 * ⚠️ أمان (P0، 2026-11):
 *   - `listAllNotifications` كانت بتشتغل بـ service_role **بدون أي فحص** — أي
 *     زائر يقدر يقرأ إشعارات كل المستخدمين.
 *   - `deleteNotification` كانت بتفحص تسجيل الدخول بس (أي مستخدم عادي).
 *   - `sendBroadcast` كانت بتستخدم مفتاح غير موجود في ADMIN_PERMISSION_MAP
 *     ("notifications.manage" as any) → الفحص كان بيرجع false دايمًا أو يعدّي
 *     بشكل غير متوقع. دلوقتي المفتاح الرسمي: announcements.manage.
 */

type ActionResult = { ok: boolean; message: string; error?: string | null };

const ACTION = "announcements.manage" as const;

export async function sendBroadcast(title: string, message: string, type: string, targetUserId?: string | null): Promise<ActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor(ACTION));
  } catch (e) {
    if (e instanceof ActionAuthError) {
      await recordAuditLog({ actor: null, actor_email: null, action: ACTION, resource_type: "notification", resource_id: "broadcast", details: { reason: "denied", cause: e.code }, result: "BLOCKED" });
      return { ok: false, message: "غير مصرح", error: "denied" };
    }
    throw e;
  }

  const db = createServiceClient();
  const { error } = await db.from("notifications").insert({
    user_id: targetUserId || null,
    title, message, type,
    created_by: actor.userId,
  });
  if (error) {
    await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "notification", resource_id: "broadcast", details: { error: error.message }, result: "FAIL" });
    return { ok: false, message: "فشل الإرسال: " + error.message, error: error.message };
  }
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "notification", resource_id: "broadcast", details: { title, type, target: targetUserId || "all" }, result: "PASS" });
  return { ok: true, message: "تم إرسال الإشعار", error: null };
}

export async function listAllNotifications() {
  try {
    await requireAdminActor(ACTION);
  } catch (e) {
    if (e instanceof ActionAuthError) return { data: [], error: e.message };
    throw e;
  }
  const db = createServiceClient();
  const { data, error } = await db.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor(ACTION));
  } catch (e) {
    if (e instanceof ActionAuthError) return { ok: false, message: "غير مصرح", error: "denied" };
    throw e;
  }
  const db = createServiceClient();
  const { error } = await db.from("notifications").delete().eq("id", id);
  if (error) return { ok: false, message: "فشل الحذف", error: error.message };
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "notification", resource_id: id, details: { op: "delete" }, result: "PASS" });
  return { ok: true, message: "تم الحذف", error: null };
}
