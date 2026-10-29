"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveActor } from "@/lib/admin/auth-check";
import { recordAuditLog } from "@/lib/admin/audit-log-record";

export async function sendAdminMessage(input: {
  subject: string;
  body: string;
  targetUserId?: string | null;
  sendEmail?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, supabase } = await resolveActor();
  // permission check
  const { hasPermission } = await import("@/lib/auth-roles");
  const allowed = await hasPermission(supabase, user.id, user.email ?? null, "users.read");
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
    const { data: profiles } = await service.from("profiles").select("id").limit(1000);
    recipientIds = (profiles || []).map((p: any) => p.id);
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

  // email via Resend if configured and requested
  if (input.sendEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "noreply@example.com";
    if (!apiKey) {
      // record not_configured
      await service.from("email_deliveries").insert(
        recipientIds.map((uid) => ({
          announcement_id: ann.id,
          user_id: uid,
          status: "not_configured",
          error: "RESEND_API_KEY missing",
        }))
      );
    } else {
      // fetch emails
      const { data: usersData } = await service.auth.admin.listUsers();
      const emailMap = new Map((usersData?.users || []).map((u: any) => [u.id, u.email]));
      for (const uid of recipientIds) {
        const to = emailMap.get(uid);
        if (!to) continue;
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to, subject, text: body }),
          });
          const json = await res.json().catch(() => ({}));
          await service.from("email_deliveries").insert({
            announcement_id: ann.id,
            user_id: uid,
            status: res.ok ? "sent" : "failed",
            provider_message_id: json?.id || null,
            error: res.ok ? null : JSON.stringify(json),
            attempts: 1,
          });
        } catch (e: any) {
          await service.from("email_deliveries").insert({
            announcement_id: ann.id,
            user_id: uid,
            status: "failed",
            error: e?.message || "unknown",
            attempts: 1,
          });
        }
      }
    }
  }

  await recordAuditLog({
    actorId: user.id,
    action: "admin_message_send",
    resourceType: "announcement",
    resourceId: ann.id,
    result: "PASS",
    metadata: { recipients: recipientIds.length, sendEmail: !!input.sendEmail },
  });

  return { ok: true };
}
