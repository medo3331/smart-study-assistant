"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
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

export async function sendBroadcast(title: string, message: string, type: string, targetUserId?: string | null, audience: string = "all"): Promise<ActionResult> {
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

  const normalizedTitle = title.trim();
  const normalizedMessage = message.trim();
  const allowedTypes = new Set(["info", "warning", "feature"]);
  const allowedAudiences = new Set(["all", "student", "graduate", "freelancer"]);
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (!normalizedTitle || normalizedTitle.length > 200 || !normalizedMessage || normalizedMessage.length > 10000 || !allowedTypes.has(type) || !allowedAudiences.has(audience)) {
    return { ok: false, message: "بيانات الإشعار غير صالحة.", error: "invalid_input" };
  }
  if (targetUserId && !isUuid(targetUserId)) return { ok: false, message: "معرّف المستخدم يجب أن يكون UUID صحيحًا.", error: "invalid_user_id" };

  const db = createServiceClient();
  const recipients: Array<{ id: string; persona: string | null }> = [];
  if (targetUserId) {
    const { data, error } = await db.from("profiles").select("id, persona").eq("id", targetUserId).maybeSingle();
    if (error || !data) return { ok: false, message: "المستخدم غير موجود في ملفات الحسابات.", error: "user_not_found" };
    recipients.push(data);
  } else {
    for (let page = 0; page < 100; page++) {
      const { data, error } = await db.from("profiles").select("id, persona").order("id", { ascending: true }).range(page * 500, page * 500 + 499);
      if (error) return { ok: false, message: "تعذر قراءة ملفات المستخدمين.", error: "profiles_lookup_failed" };
      const rows = data ?? [];
      recipients.push(...rows.filter((row) => audience === "all" || (audience === "student" && row.persona === "student") || (audience === "graduate" && row.persona === "grad") || (audience === "freelancer" && row.persona === "freelancer")));
      if (rows.length < 500) break;
      if (page === 99) return { ok: false, message: "تجاوز دليل المستخدمين حد المسح الآمن؛ استخدم الاستهداف المفلتر.", error: "directory_scan_limit" };
    }
  }
  if (!recipients.length) return { ok: false, message: "لا يوجد مستلمون مطابقون للجمهور المحدد.", error: "no_recipients" };
  let sent = 0;
  const insertBatch = async (batch: Array<{ id: string; persona: string | null }>) => {
    const rows = batch.map((recipient) => ({ recipient_id: recipient.id, user_id: recipient.id, title: normalizedTitle, body: normalizedMessage, message: normalizedMessage, type, created_by: actor.userId }));
    let { error } = await db.from("notifications").insert(rows);
    if (error && /recipient_id|body|message|is_read|column/i.test(error.message)) {
      const legacyRows = batch.map((recipient) => ({ user_id: recipient.id, title: normalizedTitle, message: normalizedMessage, type, created_by: actor.userId }));
      const legacyInsert = await db.from("notifications").insert(legacyRows);
      error = legacyInsert.error;
    }
    if (error) {
      await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "notification", resource_id: "broadcast", details: { title: normalizedTitle, sent, requested: recipients.length, audience, error: error.message }, result: "FAIL" });
      return { ok: false, message: `تعذر إكمال الإرسال: وصل إلى ${sent} من ${recipients.length} مستلم. ${error.message}`, error: error.message };
    }
    sent += batch.length;
    return null;
  };
  for (let start = 0; start < recipients.length; start += 500) {
    const error = await insertBatch(recipients.slice(start, start + 500));
    if (error) return error;
  }
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "notification", resource_id: "broadcast", details: { title: normalizedTitle, type, audience: targetUserId ? "selected_user" : audience, target_user_id: targetUserId ?? null, recipient_count: sent }, result: "PASS" });
  return { ok: true, message: `تم إرسال الإشعار إلى ${sent} حساب.`, error: null };
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
