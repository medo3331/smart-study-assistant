"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { recordAuditLog } from "@/lib/admin/audit-log-record";

export async function sendAdminMessage(input: {
  subject: string;
  body: string;
  targetUserId?: string | null;
  sendEmail?: boolean;
}): Promise<{ ok: boolean; error?: string; recipients?: number }> {
  const ctx = await requireAdminPermission("announcements.manage");
  const user = ctx.user;
  const supabase = ctx.supabase;
  // permission check
  const { hasPermission } = await import("@/lib/auth-roles");
  const allowed = await hasPermission(supabase, user.id, user.email ?? null, "announcements.manage");
  if (!allowed) return { ok: false, error: "غير مصرح" };

  const subject = (input.subject || "").trim();
  const body = (input.body || "").trim();
  if (!subject || !body) return { ok: false, error: "الموضوع والنص مطلوبان" };

  const service = createServiceClient();
  // create announcement
  const { data: ann, error: annErr } = await service
    .from("admin_announcements")
    .insert({
      author_id: user.id,
      subject,
      body,
      audience: input.targetUserId ? "user" : "all",
      target_user_id: input.targetUserId || null,
      send_email: !!input.sendEmail,
    })
    .select("id")
    .single();
  if (annErr || !ann) return { ok: false, error: annErr?.message || "فشل إنشاء الإعلان" };

  // determine recipients
  let recipientIds: string[] = [];
  if (input.targetUserId) {
    recipientIds = [input.targetUserId];
  } else {
    // كل المستخدمين — بلا حد 1000 (ترقيم صفحات auth)
    for (let page = 1; page <= 20; page++) {
      const { data: profiles } = await service.from("profiles").select("id").range((page - 1) * 1000, page * 1000 - 1);
      const rows = profiles || [];
      recipientIds.push(...rows.map((p: { id: string }) => p.id));
      if (rows.length < 1000) break;
    }
  }

  // insert inbox rows
  const inboxRows = recipientIds.map((uid) => ({
    user_id: uid,
    announcement_id: ann.id,
    subject,
    body,
  }));
  if (inboxRows.length) {
    await service.from("user_inbox").insert(inboxRows);
  }

  // email via Resend if requested — نفس مسار حملات إعلانات البريد (المُرسل: الإعدادات ← app_settings)
  if (input.sendEmail) {
    let settingsSender: string | null = null;
    try {
      const { data: setting } = await service
        .from("app_settings")
        .select("value")
        .eq("key", "email_sender_address")
        .maybeSingle();
      const value = (setting as { value?: string } | null)?.value;
      settingsSender = typeof value === "string" && value.includes("@") ? value.trim() : null;
    } catch {
      settingsSender = null;
    }
    // رسائل داخل المنصة دائمًا؛ البريد حسب الطلب. sendResendEmail تسجل الخطأ الواضح لو الإعدادات ناقصة.
    const { sendResendEmail } = await import("@/lib/email/resend");
    // fetch emails (دفعة واحدة بدل listUsers لكل مستخدم)
    const emailMap = new Map<string, string>();
    for (let page = 1; page <= 20; page++) {
      const { data: usersData } = await service.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of usersData?.users || []) {
        if (u.email) emailMap.set(u.id, u.email);
      }
      if ((usersData?.users || []).length < 1000) break;
    }
    for (const uid of recipientIds) {
      const to = emailMap.get(uid);
      if (!to) continue;
      const result = await sendResendEmail({
        to,
        subject,
        html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;">${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div>`,
        text: body,
        from: settingsSender,
      });
      await service.from("email_deliveries").insert({
        announcement_id: ann.id,
        user_id: uid,
        status: result.ok ? "sent" : "failed",
        provider_message_id: result.id,
        error: result.ok ? null : result.error,
        attempts: 1,
      });
    }
  }

  await recordAuditLog({
    actor: user.id,
    actor_email: user.email ?? null,
    action: "announcements.manage",
    resource_type: "announcement",
    resource_id: ann.id,
    result: "PASS",
    details: { recipients: recipientIds.length, sendEmail: !!input.sendEmail },
  });

  return { ok: true, recipients: recipientIds.length };
}
