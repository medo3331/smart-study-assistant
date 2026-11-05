"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { hasPermission } from "@/lib/auth-roles";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type ActionResult = { ok: boolean; message: string; error?: string | null };

async function getSessionActor() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get: (n: string) => cookieStore.get(n)?.value } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function sendBroadcast(title: string, message: string, type: string, targetUserId?: string | null) {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, message: "غير مصرح", error: "unauth" };
  const db = createServiceClient();
  const allowed = await hasPermission(db, actor.userId, actor.email, "notifications.manage" as any) || (await hasPermission(db, actor.userId, actor.email, "plans.manage"));
  // fallback: owner check via isOwner? We'll just allow if site_admin owner; use hasPermission plans.manage as proxy for owner
  if (!allowed) {
    await recordAuditLog({ actor: actor.userId, actor_email: actor.email, action: "notifications.manage", resource_type: "notification", resource_id: "broadcast", details: { reason: "denied" }, result: "BLOCKED" });
    return { ok: false, message: "غير مصرح", error: "denied" };
  }
  const { error } = await db.from("notifications").insert({
    user_id: targetUserId || null,
    title, message, type,
    created_by: actor.userId,
  });
  if (error) {
    await recordAuditLog({ actor: actor.userId, actor_email: actor.email, action: "notifications.manage", resource_type: "notification", resource_id: "broadcast", details: { error: error.message }, result: "FAIL" });
    return { ok: false, message: "فشل الإرسال: " + error.message, error: error.message };
  }
  await recordAuditLog({ actor: actor.userId, actor_email: actor.email, action: "notifications.manage", resource_type: "notification", resource_id: "broadcast", details: { title, type, target: targetUserId || "all" }, result: "PASS" });
  return { ok: true, message: "تم إرسال الإشعار", error: null };
}

export async function listAllNotifications() {
  const db = createServiceClient();
  const { data, error } = await db.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function deleteNotification(id: string) {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, message: "غير مصرح", error: "unauth" };
  const db = createServiceClient();
  const { error } = await db.from("notifications").delete().eq("id", id);
  if (error) return { ok: false, message: "فشل الحذف", error: error.message };
  return { ok: true, message: "تم الحذف", error: null };
}
